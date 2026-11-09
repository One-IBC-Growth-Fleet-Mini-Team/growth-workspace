// T-MS-01 tới T-MS-04: cổng market-scan-mcp (spec mục 9; Mi1-mkt-03, mkt-04; D-46). Dữ liệu tổng hợp; server MCP giả.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { importMarketCsv, pullMarketScan } from "../../src/crm/market-import.ts";
import { buildMarketBoard } from "../../src/db/market.ts";
import { buildCompetitorBoard } from "../../src/db/competitors.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const REG = ["jurisdiction,title,summary,effective_date,source_url", "Hong Kong,Sửa luật công ty,Thêm nghĩa vụ báo cáo,01/01/2027,https://gov.example.invalid/hk"].join("\n");
const REV = ["source,jurisdiction,theme,rating,text", "google,Hong Kong,eKYC,2,Liên hệ canary.reviewer@example.com hoặc +84 912 345 678 để hỏi thêm", "trustpilot,,giá,5,Giá rõ ràng"].join("\n");

function fakeScan() {
  const s = new McpServer({ name: "market-scan-fake", version: "0" });
  const ok = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });
  s.registerTool("scan_competitor_packages", { description: "giả" }, async () => ok({ packages: [{ competitor: "Rival A", jurisdiction: "Hong Kong", tier: "starter", price_usd: 1500, source_url: "https://rival.example.invalid", collected_on: "2026-11-08" }] }));
  s.registerTool("watch_regulation", { description: "giả" }, async () => ok({ items: [{ jurisdiction: "Singapore", title: "ACRA đổi phí", summary: "Phí mới", effective_date: "2027-02-01", source_url: null }] }));
  s.registerTool("collect_reviews_anonymized", { description: "giả" }, async () => ok({ reviews: [{ source: "google", jurisdiction: null, theme: "hỗ trợ", rating: 4, text: "Phản hồi nhanh" }] }));
  return s;
}

describe("T-MS market-scan", () => {
  test("T-MS-01 file quy định và tiếng khách; tiếng khách qua lọc R1 trước khi lưu", () => {
    const db = freshDb();
    expect(importMarketCsv(db, "regulation", REG, { now: NOW, actor: "mark" })).toMatchObject({ status: "succeeded", items: 1 });
    expect(importMarketCsv(db, "reviews", REV, { now: NOW, actor: "mark" })).toMatchObject({ status: "succeeded", items: 2 });
    const b = buildMarketBoard(db);
    expect(b.regulation).toMatchObject([{ jurisdiction: "Hong Kong", title: "Sửa luật công ty", effectiveDate: "2027-01-01" }]);
    expect(b.reviewThemes).toEqual([{ theme: "eKYC", count: 1, avgRating: 2 }, { theme: "giá", count: 1, avgRating: 5 }]);
    const dump = new TextDecoder().decode(db.serialize());
    expect(dump).not.toContain("canary.reviewer");
    expect(dump).not.toContain("912 345 678");
    expect(importMarketCsv(db, "reviews", "a,b\n1,2", { now: NOW, actor: "mark" }).errorCode).toBe("MARKET_HEADER_NOT_FOUND");
  });

  test("T-MS-02 kéo cả ba tool qua MCP; giá đối thủ vào cùng bảng /competitors", async () => {
    const db = freshDb();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await fakeScan().connect(a);
    expect(await pullMarketScan(db, { transport: b }, { now: NOW, actor: "mark" })).toEqual({ status: "succeeded", packages: 1, regulation: 1, reviews: 1 });
    expect(buildMarketBoard(db).regulation[0]).toMatchObject({ jurisdiction: "Singapore" });
    expect(buildCompetitorBoard(db).importedAt).not.toBeNull();
    expect(() => db.run("DELETE FROM market_items")).toThrow("append_only:market_items");
  });

  test("T-MS-03 trang /market: nạp file có CSRF; chưa cấu hình MCP thì không có nút kéo", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("kind", "regulation");
    fd.append("file", new File([REG], "r.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/market`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 1 mục.");
    expect(page).toContain("Sửa luật công ty");
    expect(page).not.toContain('name="pull"');
  });

  test("T-MS-04 Hàng chờ có link /market", async () => {
    const { app } = makeApp(freshDb());
    expect(await (await get(app, "/queue", session(MARK).cookie)).text()).toContain('href="/market"');
  });
});
