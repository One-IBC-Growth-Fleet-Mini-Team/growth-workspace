// T-ROLE-01 tới T-ROLE-03: phân quyền theo vai trò (D-63, Mark 09/11/2026). Team MKT chỉ thấy persona và số tổng hợp,
// không thấy mã khách, mã deal; Mark, Amy, BOD thấy được. MKT không duyệt việc tốn tiền.
import { describe, expect, test } from "bun:test";
import { getAuthConfig } from "../../src/config.ts";
import { createSessionCookie, type QueueUser } from "../../src/queue/auth.ts";
import { canPost, canSee, MKT_PATHS } from "../../src/queue/roles.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET } from "../helpers/queue.ts";

const MKT: QueueUser = { id: "mkt", role: "mkt" };
const BOD: QueueUser = { id: "bod", role: "viewer" };
const NOW = new Date("2026-11-02T02:00:00Z");
const cookie = (u: QueueUser) => createSessionCookie(SECRET, { sub: u.id, csrf: "k", exp: Date.parse("2026-11-03T00:00:00Z") });

describe("T-ROLE phân quyền", () => {
  test("T-ROLE-01 MKT chỉ vào trang số tổng hợp; trang có mã khách, mã deal bị chặn; BOD xem như Mark", () => {
    for (const p of ["/hooks", "/creative", "/ads-overview", "/competitors", "/channels", "/jurisdictions", "/data", "/market", "/ask", "/tasks"]) expect(canSee(MKT, p)).toBe(true);
    for (const p of ["/queue", "/leads", "/partners", "/billing", "/wo", "/import", "/paste", "/budget", "/brief", "/digest", "/monthly", "/runs", "/tuning", "/hooksx"]) expect(canSee(MKT, p)).toBe(false);
    for (const p of ["/queue", "/leads", "/partners", "/billing"]) expect(canSee(BOD, p)).toBe(true);
    expect(MKT_PATHS.has("/queue")).toBe(false);
    // D-66: MKT chỉ POST việc không tốn tiền, không đổi dữ liệu dùng chung; đăng xuất luôn được.
    for (const p of ["/logout", "/ads-check", "/ask", "/creative/compile", "/creative/analyze", "/lessons"]) expect(canPost(MKT, p)).toBe(true);
    for (const p of ["/jurisdictions", "/channels", "/hooks", "/market", "/creative/decide", "/creative/run", "/creative/export", "/import"]) expect(canPost(MKT, p)).toBe(false);
    for (const p of ["/jurisdictions", "/logout"]) expect(canPost(BOD, p)).toBe(true);
  });

  test("T-ROLE-02 qua HTTP: MKT mở /queue thì sang /overview, mở /leads thì 403; không duyệt được Storyboard; BOD mở được Hàng chờ", async () => {
    const { app } = makeApp(freshDb(), { now: () => NOW });
    const get = (u: QueueUser, p: string) => app.fetch(new Request(`${BASE}${p}`, { headers: { cookie: cookie(u) } }));
    const q = await get(MKT, "/queue");
    expect(q.status).toBe(302);
    expect(q.headers.get("location")).toBe("/overview");
    expect((await get(MKT, "/leads")).status).toBe(403);
    expect((await get(MKT, "/hooks")).status).toBe(200);
    const decide = await app.fetch(new Request(`${BASE}/creative/decide`, { method: "POST", headers: { cookie: cookie(MKT), origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: "csrf=k&id=IR-1&decision=approve" }));
    expect(decide.status).toBe(403);
    expect((await get(BOD, "/queue")).status).toBe(200);
    // D-66: trang của MKT không hiện form nạp; form kiểm quảng cáo vẫn hiện.
    const jur = await (await get(MKT, "/jurisdictions")).text();
    expect(jur).not.toContain('action="/jurisdictions"');
    expect(await (await get(MKT, "/ads-check")).text()).toContain('action="/ads-check"');
    expect(await (await get(BOD, "/jurisdictions")).text()).toContain('action="/jurisdictions"');
  });

  test("T-ROLE-03 mật khẩu MKT, BOD tuỳ chọn: đặt thì đăng nhập được, không đặt thì chỉ Amy, Mark", () => {
    const base = { AMY_PASSWORD_HASH: "$argon2id$a", MARK_PASSWORD_HASH: "$argon2id$m" };
    const two = getAuthConfig(base);
    expect(two.mode === "password" && [...two.hashes.keys()]).toEqual(["amy", "mark"]);
    const four = getAuthConfig({ ...base, MKT_PASSWORD_HASH: "$argon2id$k", BOD_PASSWORD_HASH: "$argon2id$b" });
    expect(four.mode === "password" && [...four.hashes.keys()]).toEqual(["amy", "mark", "mkt", "bod"]);
    expect(() => getAuthConfig({ ...base, MKT_PASSWORD_HASH: "plain" })).toThrow();
  });
});
