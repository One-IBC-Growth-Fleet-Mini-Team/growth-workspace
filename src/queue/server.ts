// Server Hàng chờ (design doc mục 5.7, 9). Bun.serve, HTML render phía server, không framework.
// Mọi route trừ /health và luồng đăng nhập cần phiên hợp lệ; mọi POST cần CSRF token và Origin đúng.
import type { Database } from "bun:sqlite";
import {
  getAuthConfig,
  getCrmColumnsPath,
  getCrmSource,
  getDbPath,
  getPhoneDefaultCountryCode,
  getPiiHashKey,
  getEntraConfig,
  getEvalResultsDir,
  getLlmPricing,
  getQueueConfig,
  getReportSource,
  getTeamsWebhooks,
  BILLING_PARAMS,
  isLocalBaseUrl,
  WO_PARAMS,
} from "../config.ts";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { readEvalStats } from "../agents/sa-01/eval/runner.ts";
import { runSa01 } from "../agents/sa-01/run.ts";
import { directCrmReadTools } from "../mcp/crm-read/client.ts";
import { latestSucceededSnapshot } from "../db/crm-read.ts";
import { latestEditPayload, listItemEvents, listQueueItems, listRmDirectory } from "../db/queue.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { log } from "../log.ts";
import { escalationMessage, postTeams } from "../teams/notify.ts";
import { vnDate } from "../time.ts";
import {
  clearCookie,
  cookieValue,
  createEntraOidc,
  csrfMatches,
  newOidcPending,
  newSession,
  OIDC_COOKIE,
  oidcSetCookie,
  pkceChallenge,
  readSession,
  sessionSetCookie,
  unsealValue,
  type OidcPending,
  type OidcProvider,
  type QueueUser,
  type Session,
} from "./auth.ts";
import { ITEM_ACTIONS, recordItemAction, recordQueueOpened, type ItemAction } from "./items.ts";
import { renderImportPage, renderLoginPage, renderPastePage, renderQueuePage, renderWoPage, type SourceStatus } from "./views/page.ts";
import { buildWoBoard, recordWoTouch, reminderTexts } from "../db/wo.ts";
import { importWorkOrders, woImportMessage } from "../crm/wo-import.ts";
import { importCrmCsv, importMessage, loadColumnMap, type ColumnMap, type CsvResource } from "../crm/csv-import.ts";
import { billingImportMessage, importBilling, type BillingFiles } from "../crm/billing-import.ts";
import { buildBillingBoard, invoiceReminderTexts } from "../db/billing.ts";
import { renderBillingPage } from "./views/billing.ts";
import { createPiiHasher } from "../pii/hash.ts";
import { previousWorkingDay } from "../time.ts";

export type QueueAppDeps = {
  db: Database;
  sessionSecret: string;
  baseUrl: string; // https://..., dùng cho link và kiểm Origin
  users: Map<string, QueueUser>; // AAD object id → người dùng (chế độ Entra)
  oidc: OidcProvider;
  // Chế độ mật khẩu tạm (D-24) khi chưa có app Entra: mã băm argon2 theo id người dùng ("amy", "mark").
  passwordHashes?: Map<string, string>;
  // Xử lý văn bản tự báo Amy dán (D-24); trả số mục mới.
  onPaste?: (text: string, reportDate: string) => Promise<{ created: number }>;
  // Nạp file CSV xuất từ CRM (D-24); trả câu báo kết quả cho Amy (không chứa giá trị ô).
  onImport?: (files: Partial<Record<CsvResource, string>>) => Promise<{ ok: boolean; message: string }>;
  // Nạp file Work Order và file ghép PIC cho BK-08 (D-25); có hàm này thì bật trang /wo.
  onWoImport?: (files: { WorkOrder?: string; WorkOrderPic?: string }, actor: string) => Promise<{ ok: boolean; message: string }>;
  // Bảng ghép cột cho file đơn hàng (D-30); thiếu thì dùng tên cột mặc định.
  columns?: ColumnMap;
  now?: () => Date;
  notifyEscalation?: (itemLink: string) => Promise<unknown>;
};

const MAX_BODY = 16 * 1024;
const MAX_PASTE_BODY = 128 * 1024;
const MAX_IMPORT_BODY = 25 * 1024 * 1024;
const IMPORT_FIELDS: Record<string, CsvResource> = { opportunity: "Opportunity", client: "Client", lead: "Lead", orderitem: "OrderItem" };
const WO_IMPORT_FIELDS = { workorder: "WorkOrder", wopic: "WorkOrderPic" } as const;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const PASSWORD_USERS: Record<string, QueueUser> = { amy: { id: "amy", role: "approver" }, mark: { id: "mark", role: "viewer" } };
const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; script-src 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  // same-origin, không dùng no-referrer: với no-referrer trình duyệt gửi Origin: null khi POST form và kiểm Origin chặn mọi nút.
  "referrer-policy": "same-origin",
  "cache-control": "no-store",
};

function respond(body: string | null, status: number, extra: Record<string, string> = {}, cookies: string[] = []): Response {
  const headers = new Headers({ ...SECURITY_HEADERS, ...extra });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(body, { status, headers });
}

const text = (status: number, msg: string) => respond(msg, status, { "content-type": "text/plain; charset=utf-8" });
const redirect = (location: string, cookies: string[] = [], status = 302) => respond(null, status, { location }, cookies);

function sourceStatus(db: Database, queueDate: string, now: Date): { status: SourceStatus; snapshotAt: string | null } {
  const snap = latestSucceededSnapshot(db);
  const missing = listQueueItems(db, queueDate).some(
    (i) => i.item_type === "system_notice" && /"kind":"(teams_unavailable|crm_snapshot_missing)"/.test(i.payload),
  );
  if (!snap || missing) return { status: "red", snapshotAt: snap?.snapshot_at ?? null };
  const stale = now.getTime() - Date.parse(snap.snapshot_at) > 24 * 3600 * 1000;
  return { status: stale ? "yellow" : "green", snapshotAt: snap.snapshot_at };
}

export function createQueueApp(deps: QueueAppDeps): { fetch(req: Request): Promise<Response> } {
  const now = deps.now ?? (() => new Date());
  const origin = new URL(deps.baseUrl).origin;
  const secure = !isLocalBaseUrl(deps.baseUrl);
  const userOf = (s: Session): QueueUser =>
    PASSWORD_USERS[s.sub] ?? [...deps.users.values()].find((u) => u.id === s.sub)!;
  // Đếm lần đăng nhập sai theo người dùng, trong bộ nhớ (khởi động lại thì xoá, chấp nhận được với 2 người dùng).
  const fails = new Map<string, { count: number; until: number }>();

  function billingPage(session: Session, message: string | null): string {
    const board = buildBillingBoard(deps.db, now());
    return renderBillingPage({ board, reminders: invoiceReminderTexts(board.remind), escalateDays: BILLING_PARAMS.escalateOverdueDays, csrf: session.csrf, canImport: userOf(session).role === "approver", message });
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") return text(200, "ok");

    if (deps.passwordHashes && path === "/login") {
      if (req.method === "GET") return respond(renderLoginPage(null), 200, { "content-type": "text/html; charset=utf-8" });
      if (req.method !== "POST") return text(405, "Không hỗ trợ.");
      if (req.headers.get("origin") !== origin) return text(403, "Origin không hợp lệ.");
      if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) return text(413, "Quá lớn.");
      const form = await req.formData();
      const who = String(form.get("user") ?? "");
      const pw = String(form.get("password") ?? "");
      const f = fails.get(who);
      if (f && f.until > now().getTime()) {
        return respond(renderLoginPage("Đăng nhập sai quá nhiều lần, thử lại sau 15 phút."), 429, { "content-type": "text/html; charset=utf-8" });
      }
      const hash = deps.passwordHashes.get(who);
      const ok = hash !== undefined && PASSWORD_USERS[who] !== undefined && (await Bun.password.verify(pw, hash));
      if (!ok) {
        if (PASSWORD_USERS[who]) {
          const count = (f && f.until <= now().getTime() && f.count >= LOGIN_MAX_FAILS ? 0 : (f?.count ?? 0)) + 1;
          fails.set(who, { count, until: count >= LOGIN_MAX_FAILS ? now().getTime() + LOGIN_LOCK_MS : 0 });
        }
        log({ event: "queue.login_failed", error_code: "PASSWORD_INVALID" });
        return respond(renderLoginPage("Sai tên hoặc mật khẩu."), 401, { "content-type": "text/html; charset=utf-8" });
      }
      fails.delete(who);
      return redirect("/queue", [sessionSetCookie(deps.sessionSecret, newSession(PASSWORD_USERS[who]!, now()), secure)], 303);
    }

    if (req.method === "GET" && path === "/login") {
      const p = newOidcPending(now());
      const target = deps.oidc.authorizationUrl({ state: p.state, nonce: p.nonce, codeChallenge: pkceChallenge(p.verifier) });
      return redirect(target, [oidcSetCookie(deps.sessionSecret, p)]);
    }

    if (req.method === "GET" && path === "/auth/callback") {
      const pending = unsealValue<OidcPending>(deps.sessionSecret, cookieValue(req, OIDC_COOKIE));
      const code = url.searchParams.get("code");
      if (!pending || pending.exp <= now().getTime() || !code || url.searchParams.get("state") !== pending.state) {
        return text(400, "Phiên đăng nhập không hợp lệ, vui lòng thử lại.");
      }
      let oid: string;
      try {
        oid = (await deps.oidc.exchange(code, pending.verifier, pending.nonce)).oid;
      } catch {
        log({ event: "queue.login_failed", error_code: "OIDC_EXCHANGE_FAILED" });
        return text(400, "Không đăng nhập được.");
      }
      const user = deps.users.get(oid);
      if (!user) {
        log({ event: "queue.login_denied", error_code: "USER_NOT_ALLOWED" });
        return text(403, "Tài khoản không có quyền vào Hàng chờ.");
      }
      // Trả một trang cùng site rồi mới sang /queue: chuỗi chuyển hướng bắt đầu từ Entra là khác site,
      // nên cookie phiên Strict chỉ được gửi ở lượt điều hướng mới khởi phát từ chính trang này.
      return respond(
        '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/queue"><a href="/queue">Vào Hàng chờ</a>',
        200,
        { "content-type": "text/html; charset=utf-8" },
        [sessionSetCookie(deps.sessionSecret, newSession(user, now())), clearCookie(OIDC_COOKIE, "/auth")],
      );
    }

    const session = readSession(req, deps.sessionSecret, now());
    if (req.method === "GET" && (path === "/" || path === "/queue")) {
      if (!session) return redirect("/login");
      const user = userOf(session);
      const dateParam = url.searchParams.get("date");
      const queueDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : vnDate(now());
      recordQueueOpened(deps.db, user, queueDate, now());
      const items = listQueueItems(deps.db, queueDate).map((i) => ({
        ...i,
        events: listItemEvents(deps.db, i.id),
        effectivePayload: latestEditPayload(deps.db, i.id) ?? i.payload,
      }));
      const src = sourceStatus(deps.db, queueDate, now());
      const page = renderQueuePage({ queueDate, items, user, csrf: session.csrf, now: now(), canPaste: Boolean(deps.onPaste), canImport: Boolean(deps.onImport || deps.onWoImport), canWo: Boolean(deps.onWoImport), ...src });
      return respond(page, 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/paste") {
      if (!session) return redirect("/login");
      if (userOf(session).role !== "approver" || !deps.onPaste) return text(403, "Không có quyền.");
      const page = renderPastePage({ csrf: session.csrf, reportDate: previousWorkingDay(vnDate(now())), message: null });
      return respond(page, 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/import") {
      if (!session) return redirect("/login");
      if (userOf(session).role !== "approver" || !(deps.onImport || deps.onWoImport)) return text(403, "Không có quyền.");
      return respond(renderImportPage({ csrf: session.csrf, message: null, crm: Boolean(deps.onImport), wo: Boolean(deps.onWoImport) }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/billing") {
      if (!session) return redirect("/login");
      return respond(billingPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/wo") {
      if (!session) return redirect("/login");
      if (!deps.onWoImport) return text(404, "Không tìm thấy.");
      const board = buildWoBoard(deps.db, now());
      const page = renderWoPage({
        csrf: session.csrf,
        canAct: userOf(session).role === "approver",
        ...board,
        reminders: reminderTexts(board.remind),
        remindAfterDays: WO_PARAMS.remindAfterDays,
        escalateAfterDays: WO_PARAMS.escalateAfterDays,
      });
      return respond(page, 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "POST") {
      if (!session) return text(401, "Cần đăng nhập.");
      if (req.headers.get("origin") !== origin) return text(403, "Origin không hợp lệ.");
      const limit = path === "/paste" ? MAX_PASTE_BODY : path === "/import" || path === "/billing" ? MAX_IMPORT_BODY : MAX_BODY;
      if (Number(req.headers.get("content-length") ?? "0") > limit) return text(413, "Quá lớn.");
      const form = await req.formData();
      if (!csrfMatches(session, form.get("csrf") as string | null)) return text(403, "CSRF token không hợp lệ.");
      if (path === "/logout") return redirect("/login", [clearCookie("gw_session", "/", secure)], 303);

      if (path === "/import") {
        if (userOf(session).role !== "approver" || !(deps.onImport || deps.onWoImport)) return text(403, "Không có quyền.");
        const files: Partial<Record<CsvResource, string>> = {};
        for (const [field, resource] of Object.entries(IMPORT_FIELDS)) {
          const f = form.get(field);
          if (f instanceof File && f.size > 0) files[resource] = await f.text();
        }
        const woFiles: { WorkOrder?: string; WorkOrderPic?: string } = {};
        if (deps.onWoImport) {
          for (const [field, resource] of Object.entries(WO_IMPORT_FIELDS)) {
            const f = form.get(field);
            if (f instanceof File && f.size > 0) woFiles[resource] = await f.text();
          }
        }
        // Nội dung file chỉ đi qua hàm xử lý trong bộ nhớ, không ghi DB nguyên văn hay ghi log.
        // Chỉ có file WO thì không chạy nhóm NBA (không báo thiếu Opportunity).
        const results: { ok: boolean; message: string }[] = [];
        const hasWo = Object.keys(woFiles).length > 0;
        if (deps.onImport && (Object.keys(files).length > 0 || !hasWo)) results.push(await deps.onImport(files));
        if (deps.onWoImport && (hasWo || !deps.onImport)) results.push(await deps.onWoImport(woFiles, userOf(session).id));
        const ok = results.every((r) => r.ok);
        const page = renderImportPage({ csrf: session.csrf, message: results.map((r) => r.message).join(" "), crm: Boolean(deps.onImport), wo: Boolean(deps.onWoImport) });
        return respond(page, ok ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/billing") {
        if (userOf(session).role !== "approver") return text(403, "Không có quyền.");
        const files: BillingFiles = {};
        for (const [field, resource] of [["salesorder", "SalesOrder"], ["purchaseorder", "PurchaseOrder"], ["invoice", "Invoice"]] as const) {
          const f = form.get(field);
          if (f instanceof File && f.size > 0) files[resource] = await f.text();
        }
        const r = importBilling(deps.db, files, { columns: deps.columns ?? {}, now: now(), actor: userOf(session).id });
        return respond(billingPage(session, billingImportMessage(r)), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/wo/touch") {
        if (userOf(session).role !== "approver" || !deps.onWoImport) return text(403, "Không có quyền.");
        const wo = String(form.get("wo") ?? "");
        const r = recordWoTouch(deps.db, { workOrderNumber: wo, reason: String(form.get("reason") ?? ""), actor: userOf(session).id, now: now() });
        if (!r.ok) return text(r.status, r.error);
        return redirect("/wo", [], 303);
      }

      if (path === "/paste") {
        if (userOf(session).role !== "approver" || !deps.onPaste) return text(403, "Không có quyền.");
        const reportDate = String(form.get("report_date") ?? "");
        const body = String(form.get("text") ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || body.trim() === "" || body.length > 100_000) {
          return text(422, "Ngày hoặc nội dung dán không hợp lệ.");
        }
        // Văn bản thô chỉ đi qua hàm xử lý trong bộ nhớ, không ghi DB hay log.
        await deps.onPaste(body, reportDate);
        return redirect(`/queue?date=${vnDate(now())}`, [], 303);
      }

      const m = /^\/queue\/items\/([A-Za-z0-9-]{1,64})\/([a-z_]+)$/.exec(path);
      if (!m || !(ITEM_ACTIONS as readonly string[]).includes(m[2]!)) return text(404, "Không tìm thấy.");
      const user = userOf(session);
      const rmNames = listRmDirectory(deps.db).map((d) => d.display_name);
      const r = recordItemAction(deps.db, { itemId: m[1]!, action: m[2] as ItemAction, user, form, now: now(), rmNames });
      if (!r.ok) return text(r.status, r.error);
      const back = `/queue?date=${r.item.queue_date}#item-${r.item.id}`;
      // Gửi tin cho Mark ở nền: webhook chậm không được giữ trang của Amy.
      if (m[2] === "escalate" && deps.notifyEscalation) void deps.notifyEscalation(`${deps.baseUrl}${back}`).catch(() => {});
      return redirect(back, [], 303);
    }

    return text(404, "Không tìm thấy.");
  }

  return {
    async fetch(req) {
      try {
        return await handle(req);
      } catch {
        log({ event: "queue.error", error_code: "UNHANDLED" });
        return text(500, "Lỗi hệ thống.");
      }
    },
  };
}

if (import.meta.main) {
  const cfg = getQueueConfig();
  const auth = getAuthConfig();
  const hooks = getTeamsWebhooks();
  const db = openReadWrite(getDbPath());
  migrate(db);
  const root = new URL("../../", import.meta.url).pathname;
  // Lượt dán (D-24): chỉ làm phần tự báo và mã lý do; NBA do cron 08:00 làm.
  const onPaste = async (text: string, reportDate: string) => {
    const pricing = getLlmPricing();
    const { stats, evalVersion } = readEvalStats(getEvalResultsDir(root));
    const r = await runSa01(vnDate(new Date()), {
      db,
      crm: directCrmReadTools(db),
      graph: null,
      pasted: { text, reportDate },
      parts: { selfReports: true, nba: false },
      llm: createAnthropicLlm({ model: pricing.model }),
      pricing,
      evalStats: stats,
      evalVersion,
      trigger: "paste",
    });
    return { created: r.itemsCreated };
  };
  // Nạp CSV (D-24): ghi snapshot mới rồi sinh lại NBA cho hôm nay từ snapshot đó.
  const columns = loadColumnMap(getCrmColumnsPath());
  const cc = getPhoneDefaultCountryCode();
  const hasher = createPiiHasher(getPiiHashKey(), cc ? { defaultCountryCode: cc } : {});
  const onImport = async (files: Partial<Record<CsvResource, string>>) => {
    const r = importCrmCsv(db, files, { hasher, columns, now: new Date() });
    if (r.status !== "succeeded") return { ok: false, message: importMessage(r) };
    const pricing = getLlmPricing();
    const { stats, evalVersion } = readEvalStats(getEvalResultsDir(root));
    const run = await runSa01(vnDate(new Date()), {
      db,
      crm: directCrmReadTools(db),
      graph: null,
      parts: { selfReports: false, nba: true },
      llm: null,
      pricing,
      evalStats: stats,
      evalVersion,
      trigger: "csv-import",
    });
    return { ok: true, message: `${importMessage(r)} NBA: ${run.itemsCreated} mục mới.` };
  };
  const onWoImport = async (files: { WorkOrder?: string; WorkOrderPic?: string }, actor: string) => {
    const r = importWorkOrders(db, files, { columns, now: new Date(), actor });
    return { ok: r.status === "succeeded", message: woImportMessage(r) };
  };
  const app = createQueueApp({
    db,
    sessionSecret: cfg.sessionSecret,
    baseUrl: cfg.baseUrl,
    users:
      auth.mode === "entra"
        ? new Map([
            [auth.amyOid, { id: "amy", role: "approver" }],
            [auth.markOid, { id: "mark", role: "viewer" }],
          ])
        : new Map(),
    oidc:
      auth.mode === "entra"
        ? createEntraOidc({ ...getEntraConfig(), redirectUri: `${cfg.baseUrl}/auth/callback` })
        : { authorizationUrl: () => "/login", exchange: async () => { throw new Error("OIDC_DISABLED"); } },
    passwordHashes: auth.mode === "password" ? auth.hashes : undefined,
    onPaste: getReportSource() === "paste" ? onPaste : undefined,
    onImport: getCrmSource() === "csv" ? onImport : undefined,
    onWoImport,
    columns,
    notifyEscalation: hooks.mark ? (link) => postTeams(hooks.mark!, escalationMessage(link)) : undefined,
  });
  Bun.serve({ hostname: cfg.host, port: cfg.port, fetch: app.fetch, maxRequestBodySize: MAX_IMPORT_BODY });
  log({ event: "queue.listening", count: cfg.port });
}
