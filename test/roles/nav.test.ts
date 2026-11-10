// T-NAV-01, T-NAV-02: điểm vào theo vai trò, thanh điều hướng nhóm theo việc, dòng mô tả, trang trống (D-77).
import { describe, expect, test } from "bun:test";
import { createSessionCookie, type QueueUser } from "../../src/queue/auth.ts";
import { homeFor, navHtml } from "../../src/queue/nav.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET } from "../helpers/queue.ts";

const U = (id: QueueUser["id"], role: QueueUser["role"]): QueueUser => ({ id, role });
const cookie = (u: QueueUser) => createSessionCookie(SECRET, { sub: u.id, csrf: "k", exp: Date.parse("2026-11-03T00:00:00Z") });

describe("T-NAV điểm vào và điều hướng", () => {
  test("T-NAV-01 trang chính theo vai trò; thanh điều hướng chỉ có trang được xem, nhóm theo việc", async () => {
    expect([homeFor(U("amy", "approver")), homeFor(U("mkt", "mkt")), homeFor(U("mark", "viewer")), homeFor(U("bod", "viewer"))]).toEqual(["/queue", "/overview", "/overview", "/overview"]);
    const mkt = navHtml(U("mkt", "mkt"), "/overview");
    for (const g of ["Hằng ngày:", "Nạp dữ liệu:", "Theo dõi:"]) expect(mkt).toContain(g);
    for (const p of ["/queue", "/leads", "/partners", "/billing", "/paste", "/tuning"]) expect(mkt).not.toContain(`href="${p}"`);
    expect(navHtml(U("mark", "viewer"), "/x")).not.toContain('href="/paste"');
    expect(navHtml(U("amy", "approver"), "/x")).toContain('href="/paste"');
    const { app } = makeApp(freshDb());
    const r = await app.fetch(new Request(`${BASE}/`, { headers: { cookie: cookie(U("mark", "viewer")) } }));
    expect(r.headers.get("location")).toBe("/overview");
  });

  test("T-NAV-02 mỗi trang có dòng mô tả; trang chưa có dữ liệu nói cần nạp gì, kèm file mẫu", async () => {
    const { app } = makeApp(freshDb());
    const html = await (await app.fetch(new Request(`${BASE}/hooks`, { headers: { cookie: cookie(U("mark", "viewer")) } }))).text();
    expect(html).toContain("Chấm Hook và đề xuất Hook card tuần. Số lấy từ: file điểm Hook hoặc hệ thống SEO/AIO. Cập nhật lần cuối: chưa nạp.");
    expect(html).toContain('Trang chưa có dữ liệu. Nạp file điểm Hook hoặc hệ thống SEO/AIO ở ô "Nạp" cuối trang này. File mẫu: <a href="/samples/hooks.csv" download>hooks.csv</a>');
    expect(html).toContain("<b>Hook</b>");
  });
});
