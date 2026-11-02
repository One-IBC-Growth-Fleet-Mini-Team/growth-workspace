// Server Hàng chờ (design doc mục 5.7, 9). Bun.serve, HTML render phía server, không framework.
// Mọi route trừ /health và luồng đăng nhập cần phiên hợp lệ; mọi POST cần CSRF token và Origin đúng.
import type { Database } from "bun:sqlite";
import { getDbPath, getEntraConfig, getQueueConfig, getTeamsWebhooks } from "../config.ts";
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
import { renderQueuePage, type SourceStatus } from "./views/page.ts";

export type QueueAppDeps = {
  db: Database;
  sessionSecret: string;
  baseUrl: string; // https://..., dùng cho link và kiểm Origin
  users: Map<string, QueueUser>; // AAD object id → người dùng
  oidc: OidcProvider;
  now?: () => Date;
  notifyEscalation?: (itemLink: string) => Promise<unknown>;
};

const MAX_BODY = 16 * 1024;
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
  const userOf = (s: Session): QueueUser => [...deps.users.values()].find((u) => u.id === s.sub)!;

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") return text(200, "ok");

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
      const page = renderQueuePage({ queueDate, items, user, csrf: session.csrf, now: now(), ...src });
      return respond(page, 200, { "content-type": "text/html; charset=utf-8" });
    }

    if (req.method === "POST") {
      if (!session) return text(401, "Cần đăng nhập.");
      if (req.headers.get("origin") !== origin) return text(403, "Origin không hợp lệ.");
      if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) return text(413, "Quá lớn.");
      const form = await req.formData();
      if (!csrfMatches(session, form.get("csrf") as string | null)) return text(403, "CSRF token không hợp lệ.");
      if (path === "/logout") return redirect("/login", [clearCookie("gw_session")], 303);

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
  const entra = getEntraConfig();
  const hooks = getTeamsWebhooks();
  const db = openReadWrite(getDbPath());
  migrate(db);
  const app = createQueueApp({
    db,
    sessionSecret: cfg.sessionSecret,
    baseUrl: cfg.baseUrl,
    users: new Map([
      [cfg.amyOid, { id: "amy", role: "approver" }],
      [cfg.markOid, { id: "mark", role: "viewer" }],
    ]),
    oidc: createEntraOidc({ ...entra, redirectUri: `${cfg.baseUrl}/auth/callback` }),
    notifyEscalation: hooks.mark ? (link) => postTeams(hooks.mark!, escalationMessage(link)) : undefined,
  });
  Bun.serve({ hostname: cfg.host, port: cfg.port, fetch: app.fetch, maxRequestBodySize: MAX_BODY });
  log({ event: "queue.listening", count: cfg.port });
}
