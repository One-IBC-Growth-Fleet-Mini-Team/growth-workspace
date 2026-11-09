// T-MKT4-01 tới T-MKT4-03: Mi1-mkt-04 giá đối thủ khớp 45 tài phán (spec mục 6, tầng 4; D-40). Dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { importCompetitorPrices } from "../../src/crm/competitor-import.ts";
import { importPriceSheet } from "../../src/crm/jurisdiction-import.ts";
import { buildCompetitorBoard } from "../../src/db/competitors.ts";
import { priceGap } from "../../src/metrics/price-gap.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const OURS = [
  "Jurisdiction,Loại hình công ty,Starter,Grow,Premium,Renewal,2y,3y",
  'Hong Kong,Ltd,"$2,000","$5,000","$6,000","$1,000","$3,000","$4,000"',
  'UK,Ltd,"$1,200","$4,000","$5,000",$500,"$1,700","$2,200"',
  "Switzerland,GmbH,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote",
].join("\n");
const COMP = [
  "competitor,jurisdiction,tier,price_usd,source_url,collected_on",
  "Rival A,Hong Kong,starter,1800,https://rival-a.example.invalid/hk,05/11/2026",
  "Rival B,Hong Kong,starter,\"2,500\",https://rival-b.example.invalid/hk,05/11/2026",
  "Rival A,United Kingdom,starter,900,https://rival-a.example.invalid/uk,05/11/2026",
  "Rival A,Switzerland,starter,4000,https://rival-a.example.invalid/ch,05/11/2026",
  "Rival A,Atlantis,starter,100,https://rival-a.example.invalid/x,05/11/2026",
  "Rival C,Hong Kong,premium,7000,,05/11/2026",
].join("\n");

function load() {
  const db = freshDb();
  importPriceSheet(db, OURS, { now: NOW, actor: "mark" });
  importCompetitorPrices(db, COMP, { now: NOW, actor: "mark" });
  return db;
}

describe("T-MKT4 giá đối thủ", () => {
  test("T-MKT4-01 hàm: chênh so với giá thấp nhất của đối thủ; thiếu số thì không tính", () => {
    expect(priceGap(2000, [1800, 2500])).toEqual({ competitorMin: 1800, competitorMedian: 2150, gapToMin: 200 / 1800 });
    expect(priceGap(null, [1800])).toEqual({ competitorMin: 1800, competitorMedian: 1800, gapToMin: null });
    expect(priceGap(1000, [])).toEqual({ competitorMin: null, competitorMedian: null, gapToMin: null });
  });

  test("T-MKT4-02 bảng: so theo tài phán và gói, lấy giá thấp nhất mọi loại hình của mình; tài phán chưa có giá đối thủ; tên lạ", () => {
    const b = buildCompetitorBoard(load());
    expect(b.rows.map((r) => [r.jurisdiction, r.tier, r.ours, r.competitorMin, r.competitors])).toEqual([
      ["Hong Kong", "premium", 6000, 7000, 1],
      ["Hong Kong", "starter", 2000, 1800, 2],
      ["Switzerland", "starter", null, 4000, 1],
      ["United Kingdom", "starter", 1200, 900, 1],
    ]);
    expect(b.rows.find((r) => r.jurisdiction === "United Kingdom")!.gapToMin).toBeCloseTo(1 / 3);
    expect(b.notInPriceSheet).toEqual(["Atlantis"]);
    expect(b.withoutCompetitor).toEqual([]);
    expect(importCompetitorPrices(load(), "a,b\n1,2", { now: NOW, actor: "mark" }).errorCode).toBe("COMPETITOR_HEADER_NOT_FOUND");
  });

  test("T-MKT4-03 trang /competitors: Mark nạp có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(load());
    const s = session(MARK);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("prices", new File([COMP], "c.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/competitors`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 6 giá đối thủ.");
    expect(page).toContain("+33.3%");
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/competitors"');
  });
});
