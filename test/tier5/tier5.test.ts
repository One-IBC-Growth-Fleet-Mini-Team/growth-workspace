// T-T5-01 tới T-T5-04: tầng 5 kênh và ngân sách, nháp draft_budget_change (spec mục 8, 9; D-45). Dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { importCampaignCsv, importCampaignsFromMcp } from "../../src/crm/campaign-import.ts";
import { buildBudgetBoard, decideBudgetDraft, proposeBudgetDrafts } from "../../src/db/budget.ts";
import { importEvents } from "../../src/crm/event-import.ts";
import { tier5Flag } from "../../src/metrics/tier5.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const CSV = [
  "campaign,platform,period_start,period_end,spend_usd,leads,closed_won,gross_margin_usd,sales_cycle_complete",
  "C-HK,meta,2026-09-01,2026-10-31,1000,40,4,3000,yes",
  "C-SG,meta,2026-09-01,2026-10-31,2000,30,1,800,yes",   // biên trừ chi tiêu âm, đủ chu kỳ
  "C-UK,google,2026-10-15,2026-10-31,500,10,0,0,no",     // chưa đủ chu kỳ: không xét
].join("\n");

describe("T-T5 tầng 5", () => {
  test("T-T5-01 hàm: chỉ xét chiến dịch đủ chu kỳ bán; cờ khi biên trừ chi tiêu âm", () => {
    expect(tier5Flag({ spendUsd: 2000, grossMarginUsd: 800, cycleComplete: true })).toEqual({ flag: true, netUsd: -1200 });
    expect(tier5Flag({ spendUsd: 1000, grossMarginUsd: 3000, cycleComplete: true })).toEqual({ flag: false, netUsd: 2000 });
    expect(tier5Flag({ spendUsd: 500, grossMarginUsd: 0, cycleComplete: false })).toEqual({ flag: false, netUsd: null });
  });

  test("T-T5-02 nháp đổi ngân sách chờ duyệt; không tạo trùng; duyệt chỉ ghi quyết định; bảng chỉ thêm", () => {
    const db = freshDb();
    expect(importCampaignCsv(db, CSV, { now: NOW, actor: "mark" })).toMatchObject({ status: "succeeded", campaigns: 3 });
    expect(proposeBudgetDrafts(db, NOW)).toBe(1);
    expect(proposeBudgetDrafts(db, NOW)).toBe(0);
    const b = buildBudgetBoard(db, NOW);
    expect(b.campaigns.map((c) => [c.campaign, c.netUsd, c.flag])).toEqual([["C-HK", 2000, false], ["C-SG", -1200, true], ["C-UK", null, false]]);
    expect(b.drafts).toMatchObject([{ campaign: "C-SG", status: "pending" }]);
    expect(decideBudgetDraft(db, b.drafts[0]!.id, "approve", "giảm 50%", { now: NOW, actor: "mark" })).toBe("ok");
    expect(buildBudgetBoard(db, NOW).drafts[0]).toMatchObject({ status: "approved", decidedBy: "mark" });
    expect(() => db.run("DELETE FROM budget_drafts")).toThrow("append_only:budget_drafts");
  });

  test("T-T5-03 khoá chéo TRACKING_DEGRADED: không tạo nháp mới; adapter MCP get_campaign_stats", async () => {
    const db = freshDb();
    importCampaignCsv(db, CSV, { now: NOW, actor: "mark" });
    importEvents(db, ["event_id,event_name,event_time,session_id", "e1,asset_view,2026-11-08T01:00:00Z,s1"].join("\n"), { now: NOW, actor: "mark" });
    expect(buildBudgetBoard(db, NOW).frozen).toBe(true);
    expect(proposeBudgetDrafts(db, NOW)).toBe(0);
    const s = new McpServer({ name: "ads-fake", version: "0" });
    s.registerTool("get_campaign_stats", { description: "giả" }, async () => ({ content: [{ type: "text", text: JSON.stringify({ campaigns: [{ campaign: "C-X", platform: "meta", period_start: "2026-09-01", period_end: "2026-10-31", spend_usd: 10, leads: 1, closed_won: 0, gross_margin_usd: 0, sales_cycle_complete: true }] }) }] }));
    const [a, c] = InMemoryTransport.createLinkedPair();
    await s.connect(a);
    expect(await importCampaignsFromMcp(db, { transport: c }, { now: NOW, actor: "mark" })).toMatchObject({ status: "succeeded", campaigns: 1 });
  });

  test("T-T5-04 trang /budget: nạp file tạo nháp; duyệt có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("file", new File([CSV], "c.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/budget`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 3 chiến dịch, tạo 1 nháp đổi ngân sách.");
    expect(page).toContain("C-SG");
    expect((await post(app, "/budget/decide", { csrf: "sai", id: "x", decision: "approve" }, s.cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/budget"');
  });
});
