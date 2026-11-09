// T-DATA-01 tới T-DATA-04: Mi1-data-01 độ phủ ID và gãy tracking (spec mục 6, tầng 3A; D-36). Dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { importEvents } from "../../src/crm/event-import.ts";
import { buildDataBoard, idCoverageWindow } from "../../src/db/data01.ts";
import { idCoverage, missingFields } from "../../src/metrics/id-coverage.ts";
import { buildBrief } from "../../src/mi1/core.ts";
import { renderBriefPage } from "../../src/queue/views/page.ts";
import { freshDb } from "../helpers/db.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { AMY, BASE, get, makeApp, MARK, SECRET } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const P = { degradedBelow: 0.19, windowDays: 7 };
// 08/11 (giờ VN): 4 phiên, 1 nối được Contact → 25%. 09/11: 3 phiên, 0 nối → 0%, dưới 19%.
const EVENTS = [
  "event_id,event_name,event_time,source,anonymous_id,session_id,conversation_id,contact_id,asset_id,utm_source,landing_url,email",
  "e1,asset_view,2026-11-08T01:00:00Z,web,a1,s1,,,as1,fb,https://x.invalid/hk,",
  "e2,ask_occ_started,2026-11-08T01:05:00Z,web,a1,s1,c1,,,,https://x.invalid/hk,",
  "e3,contact_captured,2026-11-08T01:10:00Z,web,a1,s1,c1,ct1,,,,canary.person@example.com",
  "e4,asset_view,2026-11-08T02:00:00Z,web,a2,s2,,,as1,fb,https://x.invalid/sg,",
  "e5,asset_view,2026-11-08T03:00:00Z,web,a3,s3,,,,fb,https://x.invalid/sg,", // thiếu asset_id
  "e6,contact_captured,2026-11-08T04:00:00Z,web,a4,s4,c4,,,,,", // thiếu contact_id: không tính nối
  "e7,asset_view,2026-11-08T18:00:00Z,web,a5,s5,,,as2,gg,https://x.invalid/uk,", // 01:00 ngày 09/11 giờ VN
  "e8,asset_view,2026-11-09T01:00:00Z,web,a6,s6,,,as2,gg,https://x.invalid/uk,",
  "e9,asset_view,2026-11-09T01:30:00Z,web,a7,s7,,,as2,gg,https://x.invalid/uk,",
  "e10,page_scroll,2026-11-09T01:31:00Z,web,a7,s7,,,,,,",
  "e11,asset_view,not-a-date,web,a8,s8,,,as2,gg,https://x.invalid/uk,",
].join("\n");

function load() {
  const db = freshDb();
  importEvents(db, EVENTS, { now: NOW, actor: "mark" });
  return db;
}

describe("T-DATA Mi1-data-01", () => {
  test("T-DATA-01 hàm: id_coverage theo phiên, chỉ contact_captured có contact_id mới tính nối; trường thiếu theo Phụ lục A1, A2", () => {
    const ev = (session_id: string, event_name: string, contact_id = "") => ({ session_id, event_name, contact_id });
    expect(idCoverage([ev("s1", "asset_view"), ev("s1", "contact_captured", "ct"), ev("s2", "asset_view"), ev("s3", "contact_captured")])).toEqual({ sessions: 3, linked: 1, rate: 1 / 3 });
    expect(idCoverage([ev("", "asset_view")])).toEqual({ sessions: 0, linked: 0, rate: null });
    expect(missingFields("asset_view", { event_id: "e", event_name: "asset_view", event_time: "t", source: "web", anonymous_id: "a", session_id: "s", landing_url: "u" }))
      .toEqual(["asset_id", "utm_source", "platform_campaign_id", "ad_id"]);
    expect(missingFields("page_scroll", {})).toBeNull(); // không thuộc 15 sự kiện
  });

  test("T-DATA-02 bảng: theo ngày giờ VN, cờ TRACKING_DEGRADED khi dưới 19%; sự kiện lạ; email lọt vào tham số; không lưu giá trị email", () => {
    const db = load();
    const b = buildDataBoard(db, NOW, P);
    expect(b.days).toEqual([
      { date: "2026-11-09", sessions: 3, linked: 0, rate: 0, degraded: true },
      { date: "2026-11-08", sessions: 4, linked: 1, rate: 0.25, degraded: false },
    ]);
    expect(b.window).toMatchObject({ sessions: 7, linked: 1, degraded: true });
    expect(b.badTime).toBe(1);
    expect(b.unknownEvents).toEqual([{ eventName: "page_scroll", count: 1 }]);
    expect(b.pii).toEqual({ emailCells: 1, forbiddenColumns: ["email"] });
    expect(b.missing.find((m) => m.eventName === "contact_captured")).toMatchObject({ total: 2, incomplete: 2 });
    expect(new TextDecoder().decode(db.serialize())).not.toContain("canary.person");
    expect(() => db.run("DELETE FROM data_events")).toThrow("append_only:data_events");
  });

  test("T-DATA-03 lỗi file và Brief sáng", () => {
    const db = load();
    expect(importEvents(db, "a,b\n1,2", { now: NOW, actor: "mark" }).errorCode).toBe("EVENT_HEADER_NOT_FOUND");
    expect(renderBriefPage(buildBrief(db, NOW))).toContain("Mi1-data-01: độ phủ ID 7 ngày 14.3% (1/7 phiên), TRACKING_DEGRADED");
    expect(renderBriefPage(buildBrief(freshDb(), NOW))).toContain("Mi1-data-01: chưa nạp file sự kiện");
  });

  test("T-DATA-04 trang /data: Mark và Amy nạp được có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb(), { now: () => NOW });
    // Phiên mẫu của helper hết hạn 03/11; tạo phiên còn hạn tới ngày của dữ liệu.
    const live = (who: typeof AMY) => ({ cookie: createSessionCookie(SECRET, { sub: who.id, csrf: "c", exp: Date.parse("2026-11-10T00:00:00Z") }), csrf: "c" });
    for (const who of [MARK, AMY]) {
      const s = live(who);
      const fd = new FormData();
      fd.append("csrf", s.csrf);
      fd.append("events", new File([EVENTS], "ev.csv", { type: "text/csv" }));
      const res = await app.fetch(new Request(`${BASE}/data`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Đã nạp 11 sự kiện.");
    }
    expect((await get(app, "/data")).status).toBe(302);
    expect(await (await get(app, "/data", live(MARK).cookie)).text()).toContain("TRACKING_DEGRADED");
    expect(await (await get(app, "/queue", live(AMY).cookie)).text()).toContain('href="/data"');
  });
});

describe("T-DATA-05 chuỗi 12 ID", () => {
  test("T-DATA-05 mắt nối đo trên sự kiện mang cả hai ID; mắt chưa có sự kiện báo no_event; không lưu giá trị ID; trang /data hiện chuỗi", async () => {
    const db = load();
    const c = buildDataBoard(db, NOW, P).chain;
    expect(c).toHaveLength(12);
    const by = (from: string) => c.find((l) => l.from === from)!;
    expect(by("asset_id")).toMatchObject({ event: "asset_view", status: "measured", total: 7, linked: 6 });
    expect(by("session_id")).toMatchObject({ status: "measured", total: 1, linked: 1, rate: 1 });
    expect(by("conversation_id")).toMatchObject({ total: 2, linked: 1, rate: 0.5 });
    expect(by("contact_id")).toMatchObject({ event: "lead_verified", status: "no_data", rate: null });
    expect(c.filter((l) => l.status === "no_event").map((l) => `${l.from}>${l.to}`)).toEqual(["channel_account_id>platform_campaign_id", "platform_campaign_id>hook_id", "quote_id>order_id"]);
    expect(new TextDecoder().decode(db.serialize())).not.toContain("ct1");
    expect(() => db.run("DELETE FROM data_event_chain")).toThrow("append_only:data_event_chain");
    const { app } = makeApp(db);
    const page = await (await get(app, "/data", createSessionCookie(SECRET, { sub: MARK.id, csrf: "c", exp: Date.parse("2026-11-03T00:00:00Z") }))).text();
    expect(page).toContain("conversation_id → contact_id");
    expect(page).toContain("1/2 contact_captured: 50.0%");
  });
});

describe("T-DATA-06 độ phủ 7 ngày tính riêng", () => {
  test("T-DATA-06 idCoverageWindow bằng đúng cửa sổ của buildDataBoard, kể cả khi nạp lại sự kiện trùng event_id", () => {
    const db = load();
    importEvents(db, EVENTS.replace("e6,contact_captured,2026-11-08T04:00:00Z,web,a4,s4,c4,,", "e6,contact_captured,2026-11-08T04:00:00Z,web,a4,s4,c4,ct4,"), { now: new Date("2026-11-09T03:00:00Z"), actor: "mark" });
    expect(idCoverageWindow(db, NOW, P)).toEqual(buildDataBoard(db, NOW, P).window);
    expect(idCoverageWindow(db, NOW, P).linked).toBe(2);
  });
});
