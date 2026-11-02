// Tiện ích test cho trang Hàng chờ: app với OIDC giả, phiên đăng nhập, form có CSRF.
import type { Database } from "bun:sqlite";
import { createQueueApp, type QueueAppDeps } from "../../src/queue/server.ts";
import { createSessionCookie, type QueueUser } from "../../src/queue/auth.ts";

export const SECRET = "test-only-session-secret-0123456789abcdef";
export const BASE = "https://queue.example.invalid";
export const AMY: QueueUser = { id: "amy", role: "approver" };
export const MARK: QueueUser = { id: "mark", role: "viewer" };

export function makeApp(db: Database, over: Partial<QueueAppDeps> = {}) {
  const escalations: string[] = [];
  const app = createQueueApp({
    db,
    sessionSecret: SECRET,
    baseUrl: BASE,
    users: new Map([["oid-amy", AMY], ["oid-mark", MARK]]),
    oidc: {
      authorizationUrl: ({ state, nonce }) => `https://idp.example.invalid/authorize?state=${state}&nonce=${nonce}`,
      exchange: async (code) => ({ oid: code === "code-amy" ? "oid-amy" : code === "code-mark" ? "oid-mark" : "oid-stranger", nonce: "n" }),
    },
    now: () => new Date("2026-11-02T02:00:00.000Z"),
    notifyEscalation: async (link) => { escalations.push(link); return true; },
    ...over,
  });
  return { app, escalations };
}

export function session(user: QueueUser, csrf = "csrf-test-token") {
  return { cookie: createSessionCookie(SECRET, { sub: user.id, csrf, exp: Date.parse("2026-11-03T00:00:00Z") }), csrf };
}

export function get(app: ReturnType<typeof makeApp>["app"], path: string, cookie?: string) {
  return app.fetch(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }));
}

export function post(
  app: ReturnType<typeof makeApp>["app"],
  path: string,
  fields: Record<string, string>,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, ...(cookie ? { cookie } : {}), ...headers },
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

export function seedItem(
  db: Database,
  over: Partial<{ id: string; item_type: string; payload: string; confidence: number; queue_date: string; subject_ref: string }> = {},
): string {
  const id = over.id ?? Bun.randomUUIDv7();
  if (!db.query("SELECT 1 FROM agent_runs WHERE id = 'run_seed'").get()) {
    db.run(`INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens, cost_usd, status, started_at, finished_at)
            VALUES ('run_seed', 'mi1-sa-01', 'manual', 'p', 'e', 'm', 0, 0, 0, 'succeeded', '2026-11-02T01:00:00Z', '2026-11-02T01:01:00Z')`);
  }
  db.query(`INSERT INTO queue_items (id, item_type, queue_date, dedupe_key, subject_ref, payload, rules_fired, confidence, confidence_inputs,
              assignee, default_action, due_at, etl_run_id, agent_run_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, '["NBA_R5","NBA_R4"]', ?, '{"evalPassRate":1}', 'amy', 'giữ nháp', '2026-11-02T10:59:59Z', NULL, 'run_seed', '2026-11-02T01:00:00Z')`)
    .run(id, over.item_type ?? "nba", over.queue_date ?? "2026-11-02", `dk-${id}`, over.subject_ref ?? "O1",
      over.payload ?? JSON.stringify({ action: "follow_up", subject_ref: "O1", owner_rm_id: "RM_A", explanation: "RM theo tiếp", warnings: [] }),
      over.confidence ?? 0.9);
  return id;
}

export function events(db: Database, itemId?: string) {
  return db.query(`SELECT actor, action, payload FROM queue_events ${itemId ? "WHERE item_id = ?" : ""} ORDER BY created_at, id`).all(...(itemId ? [itemId] : [])) as {
    actor: string; action: string; payload: string | null;
  }[];
}
