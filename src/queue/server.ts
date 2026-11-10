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
  DATA01_PARAMS,
  CHANNEL_PARAMS,
  adRules,
  getRemoteSource,
  type RemoteSource,
  isLocalBaseUrl,
  WO_PARAMS,
} from "../config.ts";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { latestEvalRun, readEvalStats } from "../agents/sa-01/eval/runner.ts";
import { runSa01, describeSa01 } from "../agents/sa-01/run.ts";
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
import { renderBriefPage, renderDigestPage, renderImportPage, renderLeadDupPage, renderLoginPage, renderPastePage, renderQueuePage, renderWoPage, shell, type SourceStatus } from "./views/page.ts";
import { SafeHtml } from "./views/html.ts";
import { buildBrief, buildDigest, mondayOf } from "../mi1/core.ts";
import { findDuplicateLeads } from "../mcp/crm-read/tools.ts";
import { buildWoBoard, recordWoTouch, reminderTexts } from "../db/wo.ts";
import { importWorkOrders, woImportMessage } from "../crm/wo-import.ts";
import { importCrmCsv, importMessage, loadColumnMap, type ColumnMap, type CsvResource } from "../crm/csv-import.ts";
import { billingImportMessage, importBilling, type BillingFiles } from "../crm/billing-import.ts";
import { buildBillingBoard, invoiceReminderTexts } from "../db/billing.ts";
import { renderBillingPage } from "./views/billing.ts";
import { importPriceSheet, importSkdList, jurisdictionImportMessage } from "../crm/jurisdiction-import.ts";
import { buildJurisdictionBoard } from "../db/jurisdictions.ts";
import { renderJurisdictionsPage } from "./views/jurisdictions.ts";
import { eventImportMessage, importEvents } from "../crm/event-import.ts";
import { buildDataBoard, tier3bWindow } from "../db/data01.ts";
import { renderDataPage } from "./views/data01.ts";
import { buildChannelBoard, recordChannelCheck } from "../db/channels.ts";
import { renderChannelsPage } from "./views/channels.ts";
import { latestCountryStatus, recordCountryVerification } from "../db/meta-verify.ts";
import { checkAdBatch, checkOne } from "../ads/check.ts";
import { renderAdsPage } from "./views/ads.ts";
import { importAdReport } from "../crm/ad-report-import.ts";
import { buildAdsOverview } from "../db/ads-overview.ts";
import { renderAdsOverviewPage } from "./views/ads-overview.ts";
import { importCompetitorPrices } from "../crm/competitor-import.ts";
import { buildCompetitorBoard } from "../db/competitors.ts";
import { renderCompetitorsPage } from "./views/competitors.ts";
import { importHookCsv, importHooksFromMcp } from "../crm/hook-import.ts";
import { buildHookBoard } from "../db/hooks.ts";
import { renderHooksPage } from "./views/hooks.ts";
import { compileFromHook, decideStoryboard, listStoryboards, runPipeline, exportBundles, analyzeCampaign, buildScheduleDraft } from "../creative/factory.ts";
import { renderCreativePage } from "./views/creative.ts";
import { importCampaignCsv, importCampaignsFromMcp } from "../crm/campaign-import.ts";
import { buildBudgetBoard, decideBudgetDraft, proposeBudgetDrafts } from "../db/budget.ts";
import { renderBudgetPage } from "./views/budget.ts";
import { importMarketCsv, pullMarketScan } from "../crm/market-import.ts";
import { buildMarketBoard } from "../db/market.ts";
import { renderMarketPage } from "./views/market.ts";
import { logKnowledge, searchKnowledge } from "../db/knowledge.ts";
import { renderLessonsPage } from "./views/lessons.ts";
import { renderRunsPage } from "./views/runs.ts";
import { renderTuningPage } from "./views/tuning.ts";
import { canPost, canSee, stripForbiddenForms } from "./roles.ts";
import { readSample } from "./samples.ts";
import { decorate, homeFor } from "./nav.ts";
import { guideFor, renderGuide } from "./guide.ts";
import { currentPassword, MIN_PASSWORD, sessionRevoked, setPassword } from "../db/users.ts";
import { renderOverviewPage } from "./views/overview.ts";
import { buildOverview, rowsFor } from "../mi1/overview.ts";
import { listProvisional, setProvisional } from "../provisional.ts";
import { renderMonthlyPage } from "./views/monthly.ts";
import { renderAskPage } from "./views/ask.ts";
import { renderTasksPage } from "./views/tasks.ts";
import { buildTaskDrafts } from "../mi1/task-drafts.ts";
import { askMi1 } from "../mi1/ask.ts";
import { buildCommandData } from "../fleet/command-data.ts";
import { readEvalScores } from "../fleet/eval-scores.ts";
import { parseDisabled } from "../fleet/registry.ts";
import { renderCommandPage } from "./views/command.ts";
import { renderPersonaPage } from "./views/persona.ts";
import { closedWonMessage, importClosedWon, latestClosedWon } from "../crm/closed-won-import.ts";
import { readAskEvalGate } from "../mi1/eval.ts";
import type { LlmClient } from "../agents/sa-01/llm.ts";
import type { TokenPrice } from "../metrics/cost.ts";
import { buildMonthly, previousMonth } from "../mi1/monthly.ts";
import { repeatedRejections } from "../db/rejections.ts";
import { activateTuning, currentTuning, type EvalRun, listTuning, proposeTuning } from "../db/tuning.ts";
import { buildRunLog, markRunSeen } from "../db/runs.ts";
import { importSandboxLog, sandboxImportMessage } from "../crm/sandbox-import.ts";
import { buildSandboxBoard } from "../db/sandbox.ts";
import { bankImportMessage, importBankFiles } from "../crm/bank-import.ts";
import { buildBankAdvice } from "../db/banks.ts";
import { renderBanksPage } from "./views/banks.ts";
import { importPartners, partnerImportMessage } from "../crm/partner-import.ts";
import { buildPartnerBoard } from "../db/partners.ts";
import { renderPartnersPage } from "./views/partners.ts";
import { monthPeriod } from "../time.ts";
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
  onPaste?: (text: string, reportDate: string) => Promise<{ created: number; message?: string }>;
  // Nạp file CSV xuất từ CRM (D-24); trả câu báo kết quả cho Amy (không chứa giá trị ô).
  onImport?: (files: Partial<Record<CsvResource, string>>) => Promise<{ ok: boolean; message: string }>;
  // Nạp file Work Order và file ghép PIC cho BK-08 (D-25); có hàm này thì bật trang /wo.
  onWoImport?: (files: { WorkOrder?: string; WorkOrderPic?: string }, actor: string) => Promise<{ ok: boolean; message: string }>;
  // Bảng ghép cột cho các file tải lên trên trang riêng (đơn hàng D-30, đối tác D-31); thiếu thì dùng tên cột mặc định.
  columns?: ColumnMap;
  // Nguồn điểm Hook (D-43): thiếu hoặc "file" thì chỉ tải file; "mcp" thì có nút kéo từ hệ thống SEO/AIO.
  hookSource?: RemoteSource;
  // Creative Factory (D-44): "mcp" thì bật tạo Storyboard và chạy pipeline; thiếu thì chỉ xem, duyệt.
  creativeSource?: RemoteSource;
  // Kết quả theo chiến dịch (D-45): "mcp" thì có nút kéo từ ads-mcp.
  adsSource?: RemoteSource;
  // market-scan-mcp (D-46): "mcp" thì có nút kéo quy định, tiếng khách, giá đối thủ.
  marketSource?: RemoteSource;
  now?: () => Date;
  notifyEscalation?: (itemLink: string) => Promise<unknown>;
  // Lượt eval gần nhất (D-53): trang /tuning chỉ kích hoạt giá trị mới khi eval đã chạy lại sau lúc đề xuất và pass.
  evalRun?: () => EvalRun;
  // Hỏi Mi1 (D-58): LLM chỉ chọn truy vấn mẫu; thiếu thì trang /ask báo chưa cấu hình.
  askLlm?: { llm: LlmClient; price: TokenPrice; evalGate: () => { passed: boolean; version: string } };
  // Điều phối Mi1 (D-82): thuyền viên đang tắt (FLEET_DISABLED) và điểm eval gần nhất cho /command.
  fleetDisabled?: ReadonlySet<string>;
  evalScores?: () => Record<string, number | null>;
};

const MAX_BODY = 16 * 1024;
const MAX_PASTE_BODY = 128 * 1024;
const MAX_IMPORT_BODY = 25 * 1024 * 1024;
const IMPORT_FIELDS: Record<string, CsvResource> = { opportunity: "Opportunity", client: "Client", lead: "Lead", orderitem: "OrderItem" };
const WO_IMPORT_FIELDS = { workorder: "WorkOrder", wopic: "WorkOrderPic" } as const;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const PASSWORD_USERS: Record<string, QueueUser> = { amy: { id: "amy", role: "approver" }, mark: { id: "mark", role: "viewer" }, mkt: { id: "mkt", role: "mkt" }, bod: { id: "bod", role: "viewer" } };
const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; script-src 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  // same-origin, không dùng no-referrer: với no-referrer trình duyệt gửi Origin: null khi POST form và kiểm Origin chặn mọi nút.
  "referrer-policy": "same-origin",
  "cache-control": "no-store",
};

// Trang đổi mật khẩu (D-79).
function renderPasswordPage(csrf: string, message: string | null, needCurrent = false): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Đổi mật khẩu</title></head><body style="font-family:system-ui,sans-serif;padding:16px;max-width:480px;margin:auto">
<h1>Đổi mật khẩu</h1><p>Đặt mật khẩu mới, ít nhất ${MIN_PASSWORD} ký tự. Mật khẩu tạm không dùng được nữa sau bước này.</p>${message ? `<p style="color:#9a5b00">${esc(message)}</p>` : ""}
<form method="post" action="/password"><input type="hidden" name="csrf" value="${esc(csrf)}">${needCurrent ? `<label style="display:block;margin:8px 0">Mật khẩu hiện tại <input type="password" name="current" required autocomplete="current-password"></label>` : ""}<label style="display:block;margin:8px 0">Mật khẩu mới <input type="password" name="password" required minlength="${MIN_PASSWORD}"></label>
<label style="display:block;margin:8px 0">Gõ lại <input type="password" name="password2" required minlength="${MIN_PASSWORD}"></label><button type="submit">Đổi</button></form></body></html>`;
}

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

  function tuningPage(session: Session, message: string | null): string {
    return renderTuningPage({ current: currentTuning(deps.db), changes: listTuning(deps.db), evalRun: deps.evalRun?.() ?? { ranAt: null, passed: false }, canTune: userOf(session).id === "mark", csrf: session.csrf, message });
  }

  function billingPage(session: Session, message: string | null): string {
    const board = buildBillingBoard(deps.db, now());
    return renderBillingPage({ board, reminders: invoiceReminderTexts(board.remind), escalateDays: BILLING_PARAMS.escalateOverdueDays, csrf: session.csrf, canImport: userOf(session).role === "approver", message });
  }

  function jurisdictionsPage(session: Session, message: string | null): string {
    return renderJurisdictionsPage({ board: buildJurisdictionBoard(deps.db), sandbox: buildSandboxBoard(deps.db), csrf: session.csrf, message });
  }

  function banksPage(session: Session, q: { jurisdiction: string | null; newCompany: boolean }, message: string | null): string {
    return renderBanksPage({ advice: buildBankAdvice(deps.db, q), ...q, csrf: session.csrf, canImport: userOf(session).role === "approver", message });
  }

  function dataPage(session: Session, message: string | null): string {
    return renderDataPage({ board: buildDataBoard(deps.db, now()), csrf: session.csrf, message, threshold: DATA01_PARAMS.degradedBelow, tier3b: tier3bWindow(deps.db, now()) });
  }

  function channelsPage(session: Session, message: string | null): string {
    return renderChannelsPage({ board: buildChannelBoard(deps.db, now()), verify: latestCountryStatus(deps.db), required: adRules().metaVerifyRequired ?? [], csrf: session.csrf, message, staleHours: CHANNEL_PARAMS.staleHours });
  }

  // Tuần mặc định: tuần đã trọn gần nhất (thứ Hai tuần trước, giờ Việt Nam).
  function adsOverviewPage(session: Session, week: string | null, message: string | null): string {
    const today = vnDate(now());
    const monday = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
    const w = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? monday(week) : monday(new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10));
    const shift = (k: number) => new Date(Date.parse(`${w}T00:00:00Z`) + k * 7 * 86_400_000).toISOString().slice(0, 10);
    return renderAdsOverviewPage({ o: buildAdsOverview(deps.db, w, now()), prevWeek: shift(-1), nextWeek: shift(1), csrf: session.csrf, message });
  }

  function hooksPage(session: Session, message: string | null): string {
    return renderHooksPage({ board: buildHookBoard(deps.db), weights: currentTuning(deps.db).hookWeights, canPull: deps.hookSource?.mode === "mcp", csrf: session.csrf, message });
  }

  function creativePage(session: Session, message: string | null): string {
    const hooks = buildHookBoard(deps.db).hooks.filter((h) => h.verdict === "pass" || h.verdict === "review").map((h) => ({ hookId: h.hookId, text: h.text }));
    return renderCreativePage({ storyboards: listStoryboards(deps.db), connected: deps.creativeSource?.mode === "mcp", hooks, schedule: buildScheduleDraft(deps.db, now()), rejections: repeatedRejections(deps.db, now()), csrf: session.csrf, message });
  }

  function budgetPage(session: Session, message: string | null): string {
    return renderBudgetPage({ board: buildBudgetBoard(deps.db, now()), canPull: deps.adsSource?.mode === "mcp", csrf: session.csrf, message });
  }

  function marketPage(session: Session, message: string | null): string {
    return renderMarketPage({ board: buildMarketBoard(deps.db), canPull: deps.marketSource?.mode === "mcp", csrf: session.csrf, message });
  }

  function partnersPage(session: Session, day: string, message: string | null): string {
    const period = monthPeriod(day);
    const shift = (k: number) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + k, 1)).toISOString().slice(0, 7);
    return renderPartnersPage({ board: buildPartnerBoard(deps.db, period), csrf: session.csrf, canImport: userOf(session).role === "approver", message, prevMonth: shift(-1), nextMonth: shift(1) });
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
      // Mật khẩu trong DB (add-user, /password; D-79) thắng mã băm trong biến môi trường.
      const stored = PASSWORD_USERS[who] ? currentPassword(deps.db, who) : null;
      const hash = stored?.hash ?? deps.passwordHashes.get(who);
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
      return redirect(stored?.mustChange ? "/password" : homeFor(PASSWORD_USERS[who]!), [sessionSetCookie(deps.sessionSecret, newSession(PASSWORD_USERS[who]!, now()), secure)], 303);
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
        `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${homeFor(user)}"><a href="${homeFor(user)}">Vào Growth Workspace</a>`,
        200,
        { "content-type": "text/html; charset=utf-8" },
        [sessionSetCookie(deps.sessionSecret, newSession(user, now())), clearCookie(OIDC_COOKIE, "/auth")],
      );
    }

    const raw = readSession(req, deps.sessionSecret, now());
    const session = raw && !sessionRevoked(deps.db, raw) ? raw : null;
    // Phân quyền theo vai trò (D-63): MKT về trang Hook thay cho Hàng chờ; trang có mã khách trả 403.
    if (session) {
      const u = userOf(session);
      // Mật khẩu tạm (D-79): phải đổi ở /password trước khi dùng trang khác.
      if (path !== "/password" && path !== "/logout" && currentPassword(deps.db, u.id)?.mustChange) return redirect("/password");
      if (path === "/password") {
        // Mật khẩu cũ bắt buộc, trừ lần đầu đổi mật khẩu tạm (D-85).
        const stored = currentPassword(deps.db, u.id);
        const oldHash = stored?.hash ?? deps.passwordHashes?.get(u.id);
        const needCurrent = oldHash !== undefined && !stored?.mustChange;
        const page = (msg: string | null, status: number) => respond(renderPasswordPage(session.csrf, msg, needCurrent), status, { "content-type": "text/html; charset=utf-8" });
        if (req.method === "GET") return page(null, 200);
        if (req.headers.get("origin") !== origin) return text(403, "Origin không hợp lệ.");
        const form = await req.formData();
        if (!csrfMatches(session, form.get("csrf") as string | null)) return text(403, "CSRF token không hợp lệ.");
        if (needCurrent && !(await Bun.password.verify(String(form.get("current") ?? ""), oldHash!))) return page("Mật khẩu hiện tại không đúng.", 422);
        const a = String(form.get("password") ?? "");
        if (a !== String(form.get("password2") ?? "")) return page("Hai lần gõ không khớp.", 422);
        if (a.length < MIN_PASSWORD) return page(`Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`, 422);
        // Cùng một thời điểm cho mật khẩu mới và phiên mới: mọi phiên khác bị huỷ, phiên này được cấp lại và giữ nguyên.
        const at = now();
        await setPassword(deps.db, u.id, a, { mustChange: false, now: at, actor: u.id });
        return redirect(homeFor(u), [sessionSetCookie(deps.sessionSecret, newSession(u, at), secure)], 303);
      }
      // Điểm vào theo vai trò (D-77): "/" về trang chính; MKT không có Hàng chờ nên về Tổng quan.
      if (req.method === "GET" && (path === "/" || (u.role === "mkt" && path === "/queue"))) return redirect(homeFor(u));
      if (!(req.method === "GET" ? canSee(u, path) : canPost(u, path))) return text(403, "Vai trò MKT chỉ xem số tổng hợp, không xem trang có mã khách hay duyệt việc tốn tiền.");
    }
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
      const page = renderQueuePage({ queueDate, items, user, csrf: session.csrf, now: now(), canPaste: Boolean(deps.onPaste), canImport: Boolean(deps.onImport || deps.onWoImport), canWo: Boolean(deps.onWoImport), threshold: currentTuning(deps.db).confidenceEscalateBelow, ...src });
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

    if (req.method === "GET" && (path === "/brief" || path === "/digest")) {
      if (!session) return redirect("/login");
      if (path === "/brief") return respond(renderBriefPage(buildBrief(deps.db, now())), 200, { "content-type": "text/html; charset=utf-8" });
      // Mặc định là tuần vừa xong (Digest đọc sáng thứ Hai, CRON-08).
      const w = url.searchParams.get("week");
      const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : mondayOf(vnDate(new Date(now().getTime() - 7 * 86_400_000)));
      return respond(renderDigestPage(buildDigest(deps.db, week, now())), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/jurisdictions") {
      if (!session) return redirect("/login");
      return respond(jurisdictionsPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/banks") {
      if (!session) return redirect("/login");
      const j = url.searchParams.get("j");
      return respond(banksPage(session, { jurisdiction: j ? j.slice(0, 64) : null, newCompany: url.searchParams.get("new") === "1" }, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/data") {
      if (!session) return redirect("/login");
      return respond(dataPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/channels") {
      if (!session) return redirect("/login");
      return respond(channelsPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/ads-check") {
      if (!session) return redirect("/login");
      return respond(renderAdsPage({ csrf: session.csrf, rows: null, message: null, rules: adRules() }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/ads-overview") {
      if (!session) return redirect("/login");
      return respond(adsOverviewPage(session, url.searchParams.get("week"), null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/competitors") {
      if (!session) return redirect("/login");
      return respond(renderCompetitorsPage({ board: buildCompetitorBoard(deps.db), csrf: session.csrf, message: null }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/hooks") {
      if (!session) return redirect("/login");
      return respond(hooksPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/creative") {
      if (!session) return redirect("/login");
      return respond(creativePage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/budget") {
      if (!session) return redirect("/login");
      return respond(budgetPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/market") {
      if (!session) return redirect("/login");
      return respond(marketPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && (path === "/huong-dan" || path.startsWith("/huong-dan/"))) {
      if (!session) return redirect("/login");
      const name = path === "/huong-dan" ? guideFor(userOf(session)) : path.slice("/huong-dan/".length);
      const body = renderGuide(name);
      if (body === null) return text(404, "Không có hướng dẫn này.");
      return respond(shell("Hướng dẫn", new SafeHtml(body + '<p class="meta">Hướng dẫn khác: <a href="/huong-dan/amy">Amy</a> · <a href="/huong-dan/mkt">Team MKT</a> · <a href="/huong-dan/mark">Mark</a> · <a href="/huong-dan/bod">BOD</a></p>')), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/overview") {
      if (!session) return redirect("/login");
      const progress = new URL("../../docs/progress.json", import.meta.url).pathname;
      return respond(renderOverviewPage(rowsFor(userOf(session).role, buildOverview(deps.db, now(), progress))), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path.startsWith("/samples/")) {
      if (!session) return redirect("/login");
      const name = path.slice("/samples/".length);
      const body = readSample(name);
      if (body === null) return text(404, "Không có file mẫu này.");
      return respond(body, 200, { "content-type": name.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${name}"` });
    }

    if (req.method === "GET" && path === "/tasks") {
      if (!session) return redirect("/login");
      return respond(renderTasksPage(buildTaskDrafts(deps.db, now())), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/command") {
      if (!session) return redirect("/login");
      if (userOf(session).role !== "viewer") return text(403, "Trang điều phối dành cho Mark và BOD.");
      const data = buildCommandData(deps.db, now(), deps.fleetDisabled ?? new Set(), deps.evalScores?.() ?? {});
      return respond(renderCommandPage(data), 200, { "content-type": "text/html; charset=utf-8", refresh: "5" });
    }

    if (req.method === "GET" && path === "/ask") {
      if (!session) return redirect("/login");
      return respond(renderAskPage({ configured: Boolean(deps.askLlm), q: "", result: null, csrf: session.csrf }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/monthly") {
      if (!session) return redirect("/login");
      const q = url.searchParams.get("m");
      const month = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : previousMonth(now());
      return respond(renderMonthlyPage(buildMonthly(deps.db, month, now())), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/tuning") {
      if (!session) return redirect("/login");
      return respond(tuningPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/runs") {
      if (!session) return redirect("/login");
      return respond(renderRunsPage({ log: buildRunLog(deps.db, now()), me: userOf(session).id, csrf: session.csrf, message: null }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/lessons") {
      if (!session) return redirect("/login");
      const q = (url.searchParams.get("q") ?? "").slice(0, 200);
      return respond(renderLessonsPage({ entries: searchKnowledge(deps.db, q), q, csrf: session.csrf, message: null }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/billing") {
      if (!session) return redirect("/login");
      return respond(billingPage(session, null), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/leads") {
      if (!session) return redirect("/login");
      const snap = latestSucceededSnapshot(deps.db);
      const groups = snap ? findDuplicateLeads(deps.db, {}).groups : [];
      return respond(renderLeadDupPage({ snapshotAt: snap?.snapshot_at ?? null, groups }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/persona") {
      if (!session) return redirect("/login");
      return respond(renderPersonaPage({ latest: latestClosedWon(deps.db), canImport: userOf(session).role === "approver", csrf: session.csrf, message: null }), 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "GET" && path === "/partners") {
      if (!session) return redirect("/login");
      const m = url.searchParams.get("month");
      return respond(partnersPage(session, m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : vnDate(now()), null), 200, { "content-type": "text/html; charset=utf-8" });
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
      const limit = path === "/paste" ? MAX_PASTE_BODY : path === "/import" || path === "/billing" || path === "/partners" || path === "/persona" || path === "/jurisdictions" || path === "/banks" || path === "/data" || path === "/ads-check" || path === "/ads-overview" || path === "/competitors" || path === "/hooks" || path === "/budget" || path === "/market" ? MAX_IMPORT_BODY : MAX_BODY;
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

      // Mark giám sát Mi1-mkt-05 (spec mục 6) nên cả hai người dùng nạp được file ở trang này (D-32).
      if (path === "/jurisdictions") {
        const f = form.get("price");
        const skdText = String(form.get("skd") ?? "");
        const by = { now: now(), actor: userOf(session).id };
        const price = f instanceof File && f.size > 0 ? importPriceSheet(deps.db, await f.text(), by) : null;
        const skd = skdText.trim() ? importSkdList(deps.db, skdText, by) : null;
        const sb: { bugs?: string; cases?: string } = {};
        for (const k of ["bugs", "cases"] as const) {
          const x = form.get(k);
          if (x instanceof File && x.size > 0) sb[k] = await x.text();
        }
        const sandbox = sb.bugs || sb.cases ? importSandboxLog(deps.db, sb, by) : null;
        const ok = (price || skd || sandbox) && price?.status !== "failed" && skd?.status !== "failed" && sandbox?.status !== "failed";
        const msg = [price || skd || !sandbox ? jurisdictionImportMessage(price, skd) : "", sandbox ? sandboxImportMessage(sandbox) : ""].filter(Boolean).join(" ");
        return respond(jurisdictionsPage(session, msg), ok ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/banks") {
        if (userOf(session).role !== "approver") return text(403, "Không có quyền.");
        const files: { matrix?: string; core?: string } = {};
        for (const k of ["matrix", "core"] as const) {
          const f = form.get(k);
          if (f instanceof File && f.size > 0) files[k] = await f.text();
        }
        const r = importBankFiles(deps.db, files, { now: now(), actor: userOf(session).id });
        return respond(banksPage(session, { jurisdiction: null, newCompany: true }, bankImportMessage(r)), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Mark giám sát Mi1-data-01 (spec mục 6) nên cả hai người dùng nạp được file sự kiện (D-36).
      if (path === "/data") {
        const f = form.get("events");
        const r = f instanceof File && f.size > 0 ? importEvents(deps.db, await f.text(), { now: now(), actor: userOf(session).id }) : { status: "failed" as const, events: 0, errorCode: "EVENT_FILE_REQUIRED" };
        return respond(dataPage(session, r.errorCode === "EVENT_FILE_REQUIRED" ? "Chưa nạp. Cần chọn file sự kiện." : eventImportMessage(r)), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Mark giám sát Mi1-data-01 và CRON-02 nên cả hai người dùng ghi được (D-37).
      if (path === "/channels/verify") {
        const v = { country: String(form.get("country") ?? ""), status: String(form.get("status") ?? ""), note: String(form.get("note") ?? "") };
        const r = recordCountryVerification(deps.db, v, { now: now(), actor: userOf(session).id });
        return respond(channelsPage(session, r === "ok" ? `Đã ghi trạng thái verify ${v.country.trim()}.` : "Chưa ghi. Cần quốc gia và trạng thái."), r === "ok" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/channels") {
        const c = { kind: String(form.get("kind") ?? ""), label: String(form.get("label") ?? ""), status: String(form.get("status") ?? ""), note: String(form.get("note") ?? "") };
        const r = recordChannelCheck(deps.db, c, { now: now(), actor: userOf(session).id });
        return respond(channelsPage(session, r === "ok" ? `Đã ghi lần kiểm ${c.label.trim()}.` : "Chưa ghi. Cần chọn loại, trạng thái và điền nhãn."), r === "ok" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Cổng tuân thủ (D-38): ai đăng nhập cũng kiểm được; không lưu nội dung, không đăng gì.
      if (path === "/ads-check") {
        const f = form.get("batch");
        let rows = null;
        let message: string | null = null;
        if (f instanceof File && f.size > 0) {
          const r = checkAdBatch(deps.db, await f.text(), adRules());
          rows = r.rows;
          if (r.status === "failed") message = r.errorCode === "ADS_HEADER_NOT_FOUND" ? "File cần cột primary_text hoặc headline." : "File không đúng dạng CSV.";
        } else {
          const copy = { primaryText: String(form.get("primary_text") ?? ""), headline: String(form.get("headline") ?? ""), description: String(form.get("description") ?? ""), jurisdiction: String(form.get("jurisdiction") ?? "").trim() || null, targetCountry: String(form.get("target_country") ?? "").trim() || null };
          rows = [{ id: "Mẫu vừa dán", jurisdiction: copy.jurisdiction, ...checkOne(deps.db, copy, adRules()) }];
        }
        return respond(renderAdsPage({ csrf: session.csrf, rows, message, rules: adRules() }), message ? 422 : 200, { "content-type": "text/html; charset=utf-8" });
      }

      // Mark giám sát Mi1-mkt-01 (spec mục 6) nên cả hai người dùng nạp được báo cáo (D-39).
      if (path === "/ads-overview") {
        const f = form.get("report");
        const platform = form.get("platform") === "google" ? "google" : "meta";
        const week = String(form.get("week") ?? "");
        const r = f instanceof File && f.size > 0 ? importAdReport(deps.db, await f.text(), { platform, weekStart: week, now: now(), actor: userOf(session).id }) : { status: "failed" as const, ads: 0, errorCode: "AD_FILE_REQUIRED" };
        const why: Record<string, string> = { AD_FILE_REQUIRED: "Cần chọn file.", AD_WEEK_NOT_MONDAY: "Tuần phải bắt đầu từ thứ Hai.", AD_REPORT_HEADER_NOT_FOUND: "File thiếu cột tên quảng cáo hoặc Impressions.", CSV_INVALID: "File không đúng dạng CSV." };
        const msg = r.status === "succeeded" ? `Đã nạp ${r.ads} quảng cáo ${platform === "meta" ? "Meta" : "Google Ads"} tuần ${week.slice(8, 10)}/${week.slice(5, 7)}.` : `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."}`;
        return respond(adsOverviewPage(session, /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null, msg), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Mark giám sát Mi1-mkt-04 (spec mục 6) nên cả hai người dùng nạp được (D-40).
      if (path === "/competitors") {
        const f = form.get("prices");
        const r = f instanceof File && f.size > 0 ? importCompetitorPrices(deps.db, await f.text(), { now: now(), actor: userOf(session).id }) : { status: "failed" as const, prices: 0, errorCode: "COMPETITOR_FILE_REQUIRED" };
        const why: Record<string, string> = { COMPETITOR_FILE_REQUIRED: "Cần chọn file.", COMPETITOR_HEADER_NOT_FOUND: "File cần cột competitor, jurisdiction, price_usd.", CSV_INVALID: "File không đúng dạng CSV." };
        const msg = r.status === "succeeded" ? `Đã nạp ${r.prices} giá đối thủ.` : `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."} Dữ liệu cũ vẫn giữ nguyên.`;
        return respond(renderCompetitorsPage({ board: buildCompetitorBoard(deps.db), csrf: session.csrf, message: msg }), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Mark giám sát Mi1-mkt-02 nên cả hai người dùng nạp được (D-43). Kéo MCP chỉ khi HOOK_SOURCE=mcp.
      if (path === "/hooks") {
        const by = { now: now(), actor: userOf(session).id };
        const f = form.get("file");
        const src = deps.hookSource;
        const r = form.get("pull") && src?.mode === "mcp" ? await importHooksFromMcp(deps.db, { url: src.url, token: src.token }, by)
          : f instanceof File && f.size > 0 ? importHookCsv(deps.db, await f.text(), by) : { status: "failed" as const, hooks: 0, errorCode: "HOOK_FILE_REQUIRED" };
        const why: Record<string, string> = { HOOK_FILE_REQUIRED: "Cần chọn file.", HOOK_HEADER_NOT_FOUND: "File cần cột hook_id, text, score_1 tới score_5.", HOOK_MCP_CONTRACT: "Hệ thống SEO/AIO trả dữ liệu sai hợp đồng get_hook_scores.", REMOTE_UNREACHABLE: "Không kết nối được hệ thống SEO/AIO.", REMOTE_UNAUTHORIZED: "Hệ thống SEO/AIO từ chối token (kiểm HOOK_MCP_TOKEN).", CSV_INVALID: "File không đúng dạng CSV." };
        const msg = r.status === "succeeded" ? `Đã nạp ${r.hooks} Hook.` : `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được."} Dữ liệu cũ vẫn giữ nguyên.`;
        return respond(hooksPage(session, msg), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Creative Factory (D-44): duyệt Storyboard là quyết định có tiền, ghi người duyệt; gọi ra ngoài chỉ khi CREATIVE_SOURCE=mcp.
      if (path === "/creative/decide" || path === "/creative/compile" || path === "/creative/run" || path === "/creative/export" || path === "/creative/analyze") {
        const by = { now: now(), actor: userOf(session).id };
        const src = deps.creativeSource;
        const target = src?.mode === "mcp" ? { url: src.url, token: src.token } : null;
        let msg: string;
        let ok = true;
        if (path === "/creative/decide") {
          const id = String(form.get("id") ?? "");
          const d = String(form.get("decision") ?? "");
          const r = decideStoryboard(deps.db, id, d, String(form.get("note") ?? ""), by);
          ok = r === "ok";
          msg = ok ? `Đã ${d === "approve" ? "duyệt" : "từ chối"} Storyboard ${id}.` : "Chưa ghi. Không thấy Storyboard hoặc quyết định không hợp lệ.";
        } else if (!target) {
          ok = false;
          msg = "Chưa nối Creative Factory.";
        } else if (path === "/creative/compile") {
          const h = buildHookBoard(deps.db).hooks.find((x) => x.hookId === String(form.get("hook") ?? ""));
          const r = h ? await compileFromHook(deps.db, target, { hookId: h.hookId, text: h.text, jurisdiction: h.jurisdiction }, by) : { status: "failed" as const, errorCode: "HOOK_NOT_FOUND" };
          ok = r.status === "succeeded";
          msg = r.status === "succeeded" ? `Đã tạo Storyboard ${r.creativeIrId}, chờ duyệt.` : `Chưa tạo được Storyboard (${r.errorCode}).`;
        } else if (path === "/creative/analyze") {
          const r = await analyzeCampaign(deps.db, target, String(form.get("id") ?? ""));
          ok = r.status === "succeeded";
          msg = r.status === "succeeded"
            ? `Phân tích (bước 7): ${r.generated} asset đã tạo, ${r.approved} đã duyệt, ${r.pending} chưa tạo; QA pass ${(r.passRate * 100).toFixed(0)}%. ${r.recommendations.map((x) => `[${x.severity}] ${x.message}`).join(" ")}`
            : `Chưa phân tích được (${r.errorCode}).`;
        } else if (path === "/creative/export") {
          const r = await exportBundles(deps.db, target, String(form.get("id") ?? ""), by);
          ok = r.status === "succeeded";
          msg = r.status === "succeeded" ? `Đã đóng gói chạy thử ${r.bundles} bundle (${r.packageId}); chưa đăng gì.` : r.errorCode === "QA_NOT_PASSED" ? "Lần chạy gần nhất chưa QA PASS nên chưa đóng gói." : `Chưa đóng gói (${r.errorCode}).`;
        } else {
          const r = await runPipeline(deps.db, target, String(form.get("id") ?? ""), by);
          ok = r.status === "succeeded";
          msg = r.status === "succeeded" ? `Đã chạy: QA ${r.qaStatus}, ${r.assets} asset.` : r.errorCode === "STORYBOARD_NOT_APPROVED" ? "Storyboard chưa được duyệt nên không chạy." : `Chạy lỗi (${r.errorCode}).`;
        }
        return respond(creativePage(session, msg), ok ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // Tầng 5 (D-45): nạp kết quả rồi tạo nháp bằng code; duyệt chỉ ghi quyết định, ghi người duyệt.
      if (path === "/budget" || path === "/budget/decide") {
        const by = { now: now(), actor: userOf(session).id };
        if (path === "/budget/decide") {
          const r = decideBudgetDraft(deps.db, String(form.get("id") ?? ""), String(form.get("decision") ?? ""), String(form.get("note") ?? ""), by);
          return respond(budgetPage(session, r === "ok" ? "Đã ghi quyết định." : "Chưa ghi. Không thấy nháp hoặc quyết định không hợp lệ."), r === "ok" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
        }
        const f = form.get("file");
        const src = deps.adsSource;
        const r = form.get("pull") && src?.mode === "mcp" ? await importCampaignsFromMcp(deps.db, { url: src.url, token: src.token }, by)
          : f instanceof File && f.size > 0 ? importCampaignCsv(deps.db, await f.text(), by) : { status: "failed" as const, campaigns: 0, errorCode: "CAMPAIGN_FILE_REQUIRED" };
        const made = r.status === "succeeded" ? proposeBudgetDrafts(deps.db, now()) : 0;
        const msg = r.status === "succeeded" ? `Đã nạp ${r.campaigns} chiến dịch, tạo ${made} nháp đổi ngân sách.` : `Chưa nạp (${r.errorCode}). Dữ liệu cũ vẫn giữ nguyên.`;
        return respond(budgetPage(session, msg), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      // market-scan (D-46): file hoặc kéo MCP khi MARKET_SOURCE=mcp. Cả hai người dùng nạp được.
      if (path === "/market") {
        const by = { now: now(), actor: userOf(session).id };
        const src = deps.marketSource;
        let msg: string;
        let ok: boolean;
        if (form.get("pull") && src?.mode === "mcp") {
          const r = await pullMarketScan(deps.db, { url: src.url, token: src.token }, by);
          ok = r.status === "succeeded";
          msg = r.status === "succeeded" ? `Đã kéo ${r.packages} giá đối thủ, ${r.regulation} quy định, ${r.reviews} ý kiến khách.` : `Chưa kéo được (${r.errorCode}).`;
        } else {
          const f = form.get("file");
          const kind = form.get("kind") === "reviews" ? "reviews" : "regulation";
          const r = f instanceof File && f.size > 0 ? importMarketCsv(deps.db, kind, await f.text(), by) : { status: "failed" as const, items: 0, errorCode: "MARKET_FILE_REQUIRED" };
          ok = r.status === "succeeded";
          msg = r.status === "succeeded" ? `Đã nạp ${r.items} mục.` : `Chưa nạp (${r.errorCode}). Dữ liệu cũ vẫn giữ nguyên.`;
        }
        return respond(marketPage(session, msg), ok ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/ask") {
        if (!deps.askLlm) return respond(renderAskPage({ configured: false, q: "", result: null, csrf: session.csrf }), 422, { "content-type": "text/html; charset=utf-8" });
        const q = String(form.get("q") ?? "").slice(0, 500);
        const r = await askMi1(deps.db, deps.askLlm.llm, q, { now: now(), actor: userOf(session).id, price: deps.askLlm.price, evalGate: deps.askLlm.evalGate(), disabled: deps.fleetDisabled });
        return respond(renderAskPage({ configured: true, q, result: r, csrf: session.csrf }), r.status === "failed" ? 422 : 200, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/tuning") {
        const actor = userOf(session).id;
        if (actor !== "mark") return text(403, "Chỉ Mark đổi ngưỡng và trọng số.");
        const by = { now: now(), actor };
        const why: Record<string, string> = { VALUE_INVALID: "Giá trị không hợp lệ (ngưỡng trong khoảng 0 tới 1; trọng số là 5 số nguyên, tổng 100).", PARAM_NOT_TUNABLE: "Tham số này không chỉnh được.", EVAL_NOT_RERUN: "Chưa chạy lại eval sau lúc đề xuất (bun run eval:sa01).", EVAL_FAILED: "Lượt eval gần nhất chưa pass.", ALREADY_ACTIVE: "Đã kích hoạt.", NOT_FOUND: "Không thấy đề xuất.", KEY_UNKNOWN: "Không có khoá này.", ONLY_MARK: "Chỉ Mark đổi." };
        let code: string;
        if (form.get("op") === "provisional") {
          const key = String(form.get("key") ?? "");
          const raw = String(form.get("value") ?? "").trim();
          const cur = listProvisional().find((p) => p.key === key);
          code = setProvisional(key, raw || JSON.stringify(cur?.value ?? null), form.get("status") === "FINAL" ? "FINAL" : "PROVISIONAL", by);
        } else if (form.get("op") === "activate") code = activateTuning(deps.db, String(form.get("id") ?? ""), deps.evalRun?.() ?? { ranAt: null, passed: false }, by);
        else { const r = proposeTuning(deps.db, String(form.get("param") ?? ""), String(form.get("value") ?? ""), by); code = r.status === "ok" ? "ok" : r.errorCode; }
        return respond(tuningPage(session, code === "ok" ? "Đã ghi." : `Chưa ghi. ${why[code] ?? ""}`), code === "ok" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/runs") {
        const r = markRunSeen(deps.db, String(form.get("run_id") ?? ""), { now: now(), actor: userOf(session).id });
        if (r === "NOT_SUPERVISOR") return text(403, "Chỉ người giám sát của agent này được đánh dấu.");
        return respond(renderRunsPage({ log: buildRunLog(deps.db, now()), me: userOf(session).id, csrf: session.csrf, message: r === "ok" ? "Đã đánh dấu đã xem." : "Không thấy phiên này." }), r === "ok" ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/lessons") {
        const r = logKnowledge(deps.db, { kind: String(form.get("kind") ?? ""), title: String(form.get("title") ?? ""), body: String(form.get("body") ?? ""), evidence: String(form.get("evidence") ?? ""), tags: String(form.get("tags") ?? "") }, { now: now(), actor: userOf(session).id });
        const why: Record<string, string> = { EVIDENCE_REQUIRED: "Cần bằng chứng là đường dẫn trang Growth, bắt đầu bằng /.", TEXT_REQUIRED: "Cần tiêu đề và nội dung.", KIND_INVALID: "Loại không hợp lệ." };
        return respond(renderLessonsPage({ entries: searchKnowledge(deps.db, ""), q: "", csrf: session.csrf, message: r.status === "ok" ? "Đã ghi." : `Chưa ghi. ${why[r.errorCode]}` }), r.status === "ok" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
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

      if (path === "/persona") {
        if (userOf(session).role !== "approver") return text(403, "Không có quyền.");
        const files: { opportunity?: string; account?: string } = {};
        for (const field of ["opportunity", "account"] as const) {
          const f = form.get(field);
          if (f instanceof File && f.size > 0) files[field] = await f.text();
        }
        const r = importClosedWon(deps.db, files, { now: now(), actor: userOf(session).id });
        return respond(renderPersonaPage({ latest: latestClosedWon(deps.db), canImport: true, csrf: session.csrf, message: closedWonMessage(r) }), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
      }

      if (path === "/partners") {
        if (userOf(session).role !== "approver") return text(403, "Không có quyền.");
        const files: { Partner?: string; Referral?: string } = {};
        for (const [field, resource] of [["partner", "Partner"], ["referral", "Referral"]] as const) {
          const f = form.get(field);
          if (f instanceof File && f.size > 0) files[resource] = await f.text();
        }
        const r = importPartners(deps.db, files, { columns: deps.columns ?? {}, now: now(), actor: userOf(session).id });
        return respond(partnersPage(session, vnDate(now()), partnerImportMessage(r)), r.status === "succeeded" ? 200 : 422, { "content-type": "text/html; charset=utf-8" });
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
        const r = await deps.onPaste(body, reportDate);
        // Ở lại trang dán, báo kết quả (D-73); Amy mở Hàng chờ bằng link trên trang.
        return respond(renderPastePage({ csrf: session.csrf, reportDate, message: r.message ?? `Đã tạo ${r.created} mục mới trên Hàng chờ.` }), 200, { "content-type": "text/html; charset=utf-8" });
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
        const res = await handle(req);
        // Trang HTML của người đã đăng nhập: thanh điều hướng, dòng mô tả (D-77); MKT ẩn form không được dùng (D-66).
        const r = readSession(req, deps.sessionSecret, now());
        const s = r && !sessionRevoked(deps.db, r) ? r : null;
        if (s && res.status === 200 && res.headers.get("content-type")?.startsWith("text/html")) {
          const u = userOf(s);
          const headers = new Headers();
          res.headers.forEach((v, k) => headers.append(k, v));
          const body = decorate(await res.text(), u, deps.db, new URL(req.url).pathname, s.csrf);
          return new Response(u.role === "mkt" ? stripForbiddenForms(u, body) : body, { status: res.status, headers });
        }
        return res;
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
    return { created: r.itemsCreated, message: describeSa01(r, "paste") };
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
    return { ok: true, message: `${importMessage(r)} ${describeSa01(run, "nba")}` };
  };
  const onWoImport = async (files: { WorkOrder?: string; WorkOrderPic?: string }, actor: string) => {
    const r = importWorkOrders(db, files, { columns, now: new Date(), actor });
    return { ok: r.status === "succeeded", message: woImportMessage(r) };
  };
  const app = createQueueApp({
    askLlm: (() => { try { const p = getLlmPricing(); return { llm: createAnthropicLlm({ model: p.model }), price: p, evalGate: () => readAskEvalGate(getEvalResultsDir(root)) }; } catch { return undefined; } })(),
    evalRun: () => latestEvalRun(getEvalResultsDir(root)),
    fleetDisabled: parseDisabled(process.env.FLEET_DISABLED),
    evalScores: () => readEvalScores(getEvalResultsDir(root)),
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
    hookSource: getRemoteSource("HOOK"),
    creativeSource: getRemoteSource("CREATIVE"),
    adsSource: getRemoteSource("ADS"),
    marketSource: getRemoteSource("MARKET"),
    notifyEscalation: hooks.mark ? (link) => postTeams(hooks.mark!, escalationMessage(link)) : undefined,
  });
  Bun.serve({ hostname: cfg.host, port: cfg.port, fetch: app.fetch, maxRequestBodySize: MAX_IMPORT_BODY });
  log({ event: "queue.listening", count: cfg.port });
}
