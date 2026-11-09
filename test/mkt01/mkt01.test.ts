// T-MKT1-01 tới T-MKT1-04: Mi1-mkt-01 tổng quan quảng cáo theo tuần và chẩn đoán tầng 2 (spec mục 8; D-39). Dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { importAdReport } from "../../src/crm/ad-report-import.ts";
import { buildAdsOverview } from "../../src/db/ads-overview.ts";
import { importEvents } from "../../src/crm/event-import.ts";
import { tier2Flags } from "../../src/metrics/ads-tier2.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const WEEK = "2026-11-02";
const P = { minImpressions: 3000, maxFrequency: 2.5 };
const META = [
  "Campaign name,Ad name,Reporting starts,Reporting ends,Impressions,Link clicks,Amount spent (USD),Frequency",
  "C1,Hook HK A,2026-11-02,2026-11-08,10000,300,120.5,1.8",
  "C1,Hook HK B,2026-11-02,2026-11-08,8000,80,90,1.9",   // CTR 1% dưới trung vị
  "C1,Hook SG,2026-11-02,2026-11-08,5000,150,60,2.8",    // Frequency 2,8
  "C2,Hook nhỏ,2026-11-02,2026-11-08,1200,5,10,3.5",     // chưa đủ 3.000 impressions
].join("\n");
const GOOGLE = ["Campaign,Ad,Impr.,Clicks,Cost", "G1,RSA HK,4000,200,50"].join("\n");

function load() {
  const db = freshDb();
  importAdReport(db, META, { platform: "meta", weekStart: WEEK, now: NOW, actor: "mark" });
  importAdReport(db, GOOGLE, { platform: "google", weekStart: WEEK, now: NOW, actor: "mark" });
  return db;
}

describe("T-MKT1 tổng quan quảng cáo", () => {
  test("T-MKT1-01 hàm tầng 2: chỉ xét quảng cáo đủ 3.000 impressions; CTR dưới trung vị hoặc Frequency trên 2,5", () => {
    const ads = [
      { ad: "A", impressions: 10000, clicks: 300, frequency: 1.8 },
      { ad: "B", impressions: 8000, clicks: 80, frequency: 1.9 },
      { ad: "C", impressions: 5000, clicks: 150, frequency: 2.8 },
      { ad: "D", impressions: 1200, clicks: 5, frequency: 3.5 },
    ];
    expect(tier2Flags(ads, P)).toEqual({ medianCtr: 0.03, flags: [{ ad: "B", reasons: ["CTR 1.00% dưới trung vị 3.00%"] }, { ad: "C", reasons: ["Frequency 2.8 trên 2.5"] }] });
    expect(tier2Flags([{ ad: "G", impressions: 4000, clicks: 200, frequency: null }], P).flags).toEqual([]);
  });

  test("T-MKT1-02 tổng quan theo nền tảng, lượt nạp mới thay lượt cũ cùng tuần và nền tảng; tầng 2 xét theo từng nền tảng", () => {
    const db = load();
    importAdReport(db, GOOGLE.replace("4000,200,50", "4000,100,50"), { platform: "google", weekStart: WEEK, now: new Date("2026-11-09T03:00:00Z"), actor: "mark" });
    const o = buildAdsOverview(db, WEEK, NOW);
    expect(o.platforms).toEqual([
      { platform: "meta", ads: 4, impressions: 24200, clicks: 535, spend: 280.5, ctr: 535 / 24200, cpc: 280.5 / 535 },
      { platform: "google", ads: 1, impressions: 4000, clicks: 100, spend: 50, ctr: 0.025, cpc: 0.5 },
    ]);
    expect(o.flags.map((f) => [f.platform, f.ad])).toEqual([["meta", "Hook HK B"], ["meta", "Hook SG"]]);
    expect(o.frozen).toBe(false);
  });

  test("T-MKT1-03 khoá chéo: TRACKING_DEGRADED ở Mi1-data-01 thì đóng băng đánh giá xấu tầng 2; lỗi file", () => {
    const db = load();
    importEvents(db, ["event_id,event_name,event_time,session_id", "e1,asset_view,2026-11-08T01:00:00Z,s1"].join("\n"), { now: NOW, actor: "mark" });
    const o = buildAdsOverview(db, WEEK, NOW);
    expect(o.frozen).toBe(true);
    expect(o.flags.length).toBe(2); // vẫn liệt kê, nhưng trang ghi rõ đang đóng băng
    expect(importAdReport(db, "a,b\n1,2", { platform: "meta", weekStart: WEEK, now: NOW, actor: "mark" }).errorCode).toBe("AD_REPORT_HEADER_NOT_FOUND");
    expect(importAdReport(db, META, { platform: "meta", weekStart: "2026-11-03", now: NOW, actor: "mark" }).errorCode).toBe("AD_WEEK_NOT_MONDAY");
    expect(() => db.run("DELETE FROM ad_rows")).toThrow("append_only:ad_rows");
  });

  test("T-MKT1-04 trang /ads-overview: Mark nạp file theo tuần có CSRF; chưa có file thì không đề xuất gì", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    expect(await (await get(app, `/ads-overview?week=${WEEK}`, s.cookie)).text()).toContain("Chưa có file quảng cáo cho tuần này");
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("platform", "meta");
    fd.append("week", WEEK);
    fd.append("report", new File([META], "meta.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/ads-overview`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 4 quảng cáo Meta tuần 02/11.");
    expect(page).toContain("Hook HK B");
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/ads-overview"');
  });
});
