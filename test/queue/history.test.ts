// T-HIST-01, T-HIST-02: lịch sử quyết định trên thẻ, đổi Xác nhận sang Bác bắt buộc lý do (D-74); Brief đếm từ Hàng chờ của ngày.
import { describe, expect, test } from "bun:test";
import { renderMarketPage } from "../../src/queue/views/market.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, post, seedItem, session } from "../helpers/queue.ts";

describe("T-HIST lịch sử quyết định", () => {
  test("T-HIST-01 Xác nhận rồi đổi sang Bác: thiếu lý do thì 422; có lý do thì thẻ hiện cả hai bước theo giờ VN, quyết định mới nhất thắng", async () => {
    const db = freshDb();
    const id = seedItem(db, { confidence: 0.9 });
    const { app } = makeApp(db);
    const s = session(AMY);
    expect((await post(app, `/queue/items/${id}/confirm`, { csrf: s.csrf }, s.cookie)).status).toBe(303);
    expect((await post(app, `/queue/items/${id}/reject`, { csrf: s.csrf, reason: "" }, s.cookie)).status).toBe(422);
    expect((await post(app, `/queue/items/${id}/reject`, { csrf: s.csrf, reason: "Khách đã tự làm" }, s.cookie)).status).toBe(303);
    const page = await (await get(app, "/queue?date=2026-11-02", s.cookie)).text();
    expect(page).toContain("Lịch sử: 02/11 09:00 amy Xác nhận; 02/11 09:00 amy Bác (Khách đã tự làm)");
    expect(page).toContain("đã bác");
  });

  test("T-HIST-02 Brief đếm từ Hàng chờ của ngày, không in dự báo 0 khi chưa có lịch sử; /market không còn option dài", async () => {
    const db = freshDb();
    seedItem(db, { queue_date: "2026-11-02" });
    seedItem(db, { queue_date: "2026-11-02" });
    const { app } = makeApp(db);
    const page = await (await get(app, "/brief", session(AMY).cookie)).text();
    expect(page).toContain("Hàng chờ hôm nay: 2 mục, 2 chờ duyệt.");
    expect(page).not.toContain("khoảng 0 mục");
    expect(renderMarketPage({ board: { importedAt: null, regulation: [], reviewThemes: [], reviews: [] } as any, canPull: false, csrf: "c", message: null })).toContain('<option value="regulation">Quy định</option>');
  });
});
