// T-CONN-01 tới T-CONN-05: cửa đọc chung, Internal Control, Graph, sổ ổ cắm và /settings (D-96). Phản hồi giả lập,
// không gọi mạng thật, không cần key.
import { describe, expect, test } from "bun:test";
import { connectorStatus, recordCall, socketReady } from "../../src/connectors/registry.ts";
import { googleRefreshToken, readJson, type ReadOptions, type TokenSource } from "../../src/connectors/read-http.ts";
import { icOptions, readIcOrders } from "../../src/connectors/internal-control.ts";
import { createGraphClient } from "../../src/teams/graph-read.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, session } from "../helpers/queue.ts";

type Call = { url: string; method: string; auth: string | null; body: string | null };
function fake(responses: Array<[number, unknown, Record<string, string>?]>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", auth: (init.headers as Record<string, string>).Authorization ?? null, body: (init.body as string) ?? null });
    const [status, body, headers] = responses.shift() ?? [500, {}];
    return new Response(body === null ? null : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
function tokens(): TokenSource & { forced: number } {
  const t = { forced: 0, n: 0, async get(force = false) { if (force) { t.forced += 1; t.n += 1; } return `tok-${t.n}`; } };
  return t;
}
const sleeps: number[] = [];
const opts = (impl: typeof fetch, extra: Partial<ReadOptions> = {}): ReadOptions => ({ connector: "x", hosts: ["api.example.com"], token: tokens(), fetchImpl: impl, sleep: async (ms) => { sleeps.push(ms); }, ...extra });

describe("T-CONN cửa đọc chung", () => {
  test("T-CONN-01 chỉ đọc: POST ngoài danh sách truy vấn đọc bị từ chối trước khi gọi; host lạ, chuyển hướng bị chặn", async () => {
    const f = fake([[302, null, { location: "https://evil.example" }]]);
    await expect(readJson({ url: "https://api.example.com/v1/campaigns:mutate", method: "POST", body: {} }, opts(f.impl, { readPost: [/:search$/] }))).rejects.toMatchObject({ code: "NOT_READ_ENDPOINT" });
    await expect(readJson({ url: "https://evil.example/x" }, opts(f.impl))).rejects.toMatchObject({ code: "HOST_NOT_ALLOWED" });
    expect(f.calls.length).toBe(0);
    await expect(readJson({ url: "https://api.example.com/x" }, opts(f.impl))).rejects.toMatchObject({ code: "REDIRECT" });
  });

  test("T-CONN-02 token hết hạn: lấy token mới một lần rồi gọi lại; vẫn 401 thì AUTH_EXPIRED; 403 không thử lại", async () => {
    const ok = fake([[401, { error: "expired" }], [200, { a: 1 }]]);
    const t = tokens();
    expect(await readJson({ url: "https://api.example.com/x" }, opts(ok.impl, { token: t }))).toEqual({ a: 1 });
    expect([t.forced, ok.calls.map((c) => c.auth)]).toEqual([1, ["Bearer tok-0", "Bearer tok-1"]]);
    const bad = fake([[401, {}], [401, {}]]);
    await expect(readJson({ url: "https://api.example.com/x" }, opts(bad.impl))).rejects.toMatchObject({ code: "AUTH_EXPIRED", status: 401 });
    const forb = fake([[403, {}]]);
    await expect(readJson({ url: "https://api.example.com/x" }, opts(forb.impl))).rejects.toMatchObject({ code: "AUTH" });
    expect(forb.calls.length).toBe(1);
  });

  test("T-CONN-03 giới hạn tần suất: chờ theo Retry-After rồi thử lại; quá 3 lần thì RATE_LIMITED; lỗi không chứa nội dung phản hồi", async () => {
    sleeps.length = 0;
    const f = fake([[429, {}, { "retry-after": "7" }], [503, {}], [200, { ok: true }]]);
    expect(await readJson({ url: "https://api.example.com/x" }, opts(f.impl))).toEqual({ ok: true });
    expect(sleeps).toEqual([7000, 2000]);
    const g = fake([[429, { error: "khách CANARY" }], [429, {}], [429, {}], [429, {}]]);
    const e = await readJson({ url: "https://api.example.com/x" }, opts(g.impl)).catch((x) => x as Error);
    expect(e).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(String((e as Error).message)).not.toContain("CANARY");
  });

  test("T-CONN-04 Internal Control (A5): GET có khoảng ngày, phân trang next_page_token, chỉ giữ trường A5; OAuth Google làm mới khi bị ép", async () => {
    const f = fake([
      [200, { data: [{ order_id: "SO-1", gross_order_value: 1000, net_revenue: 800, third_party_pass_through: 200, refund: 0, gross_margin: 500, Division: "01", Commission_Date: "2026-11-01", customer_name: "CANARY" }], next_page_token: "p2" }],
      [200, { data: [{ order_id: "SO-2", gross_order_value: null, net_revenue: null, third_party_pass_through: null, refund: null, gross_margin: null, Division: null, Commission_Date: null }] }],
    ]);
    const rows = await readIcOrders("https://ic.example.com/api", "2026-11-01", "2026-11-30", icOptions("https://ic.example.com/api", "t", { fetchImpl: f.impl }));
    expect(rows.map((r) => r.order_id)).toEqual(["SO-1", "SO-2"]);
    expect(JSON.stringify(rows)).not.toContain("CANARY");
    expect(f.calls.map((c) => [c.method, new URL(c.url).search])).toEqual([["GET", "?from=2026-11-01&to=2026-11-30"], ["GET", "?from=2026-11-01&to=2026-11-30&page_token=p2"]]);
    const o = fake([[200, { access_token: "a1", expires_in: 3600 }], [200, { access_token: "a2", expires_in: 3600 }]]);
    const src = googleRefreshToken({ clientId: "c", clientSecret: "s", refreshToken: "r" }, "ga4", o.impl, () => 0);
    expect([await src.get(), await src.get(), await src.get(true)]).toEqual(["a1", "a1", "a2"]);
    expect(o.calls[0]!.body).toContain("grant_type=refresh_token");
  });

  test("T-CONN-05 Graph: 401 thì lấy token mới một lần; 429 chờ Retry-After; phân trang nextLink vẫn chạy", async () => {
    const f = fake([[401, {}], [429, {}, { "retry-after": "2" }], [200, { value: [] }]]);
    let forced = 0;
    const waits: number[] = [];
    const c = createGraphClient({ getToken: async (force) => { if (force) forced += 1; return "t"; }, fetchImpl: f.impl, sleep: async (ms) => { waits.push(ms); } });
    expect(await c.get("https://graph.microsoft.com/v1.0/teams/T/channels/C/messages?$top=50")).toEqual({ value: [] });
    expect([forced, waits]).toEqual([1, [2000]]);
  });
});

describe("T-CONN sổ ổ cắm và /settings", () => {
  test("T-CONN-06 thiếu biến thì chưa nối, dùng adapter tải file; đủ biến thì đã nối; chỉ trả tên biến, không trả giá trị", () => {
    const env = { META_ACCESS_TOKEN: "SECRET-META-123", META_AD_ACCOUNT_ID: "act_1", CRM_API_BASE: "https://api-crm.oneibc.com", CRM_API_TOKEN: "SECRET-CRM" };
    const s = connectorStatus(null, env);
    const by = Object.fromEntries(s.map((x) => [x.id, x]));
    expect(by["meta-ads"]).toMatchObject({ state: "connected", missing: [] });
    expect(by["crm-api"]).toMatchObject({ state: "not_enabled", missing: ["CRM_SOURCE=api"], active: "Tải CSV ở /import" });
    expect(by["ga4"]).toMatchObject({ state: "not_connected", active: "Tải CSV sự kiện ở /data" });
    expect(by["ga4"]!.missing).toEqual(["GA4_PROPERTY_ID", "GA4_CLIENT_ID", "GA4_CLIENT_SECRET", "GA4_REFRESH_TOKEN"]);
    expect(JSON.stringify(s)).not.toMatch(/SECRET-META-123|SECRET-CRM|act_1/);
    expect([socketReady("meta-ads", env), socketReady("ga4", env), socketReady("crm-api", { ...env, CRM_SOURCE: "api" })]).toEqual([true, false, true]);
  });

  test("T-CONN-07 /settings chỉ Mark; không hiện giá trị key, không có ô nhập; hiện lần gọi thành công gần nhất", async () => {
    const db = freshDb();
    await recordCall(db, "graph-teams", new Date("2026-11-10T01:00:00Z"), async () => 1);
    await recordCall(db, "graph-teams", new Date("2026-11-10T02:00:00Z"), async () => { throw Object.assign(new Error("x"), { code: "GRAPH_AUTH" }); }).catch(() => {});
    process.env.META_ACCESS_TOKEN = "SECRET-META-VALUE";
    try {
      const { app } = makeApp(db);
      const page = await (await get(app, "/settings", session({ id: "mark", role: "viewer" }).cookie)).text();
      expect(page).toContain("Cài đặt kết nối");
      expect(page).toContain("2026-11-10 01:00 UTC");
      expect(page).toContain("lỗi gần nhất: GRAPH_AUTH");
      expect(page).toContain("META_AD_ACCOUNT_ID");
      expect(page).not.toContain("SECRET-META-VALUE");
      expect(page).not.toMatch(/<input[^>]*type="(text|password)"|<textarea|action="\/settings/);
      for (const u of [{ id: "bod", role: "viewer" }, { id: "amy", role: "approver" }, { id: "mkt", role: "mkt" }] as const) expect((await get(app, "/settings", session(u).cookie)).status).toBe(403);
    } finally { delete process.env.META_ACCESS_TOKEN; }
  });
});
