// T-CF-05, T-CF-06: Mi1-mkt-05 gọi bước 5 tới 6 (catalog, export) của creative-factory-v2 (spec mục 7; D-59).
// Chỉ đóng gói chạy thử: Growth từ chối mọi kết quả báo đã đăng. Chỉ đóng gói khi Storyboard đã duyệt và QA PASS.
import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compileFromHook, decideStoryboard, exportBundles, listStoryboards, runPipeline } from "../../src/creative/factory.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const by = { now: NOW, actor: "mark" };
function factory(calls: string[], opts: { qa?: string; published?: boolean } = {}) {
  const s = new McpServer({ name: "fake", version: "0" });
  const ok = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });
  s.registerTool("compile_creative_ir", { description: "x" }, async () => ok({ creative_ir_id: "IR-1", storyboard: { title: "t", scenes: ["s"] } }));
  s.registerTool("run_creative_pipeline", { inputSchema: { approved_by: z.string() } }, async () => ok({ run_id: "R", qa_status: opts.qa ?? "PASS", assets: [{ asset_id: "A", kind: "image" }] }));
  s.registerTool("export_channel_bundle", { inputSchema: { creative_ir_id: z.string() } }, async (a) => {
    calls.push(`export:${a.creative_ir_id}`);
    return ok({ package_id: "PKG-1", published: opts.published ?? false, bundles: [{ bundle_id: "B1", channel: "meta", aspect_ratio: "9:16", entries: 4 }, { bundle_id: "B2", channel: "google", aspect_ratio: "16:9", entries: 3 }] });
  });
  return s;
}
async function target(calls: string[], opts?: { qa?: string; published?: boolean }) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await factory(calls, opts).connect(a);
  return { transport: b };
}
async function ready(db: Database, calls: string[], opts?: { qa?: string; published?: boolean }) {
  await compileFromHook(db, await target(calls, opts), { hookId: "H1", text: "x", jurisdiction: null }, by);
  decideStoryboard(db, "IR-1", "approve", "", by);
  await runPipeline(db, await target(calls, opts), "IR-1", by);
}

describe("T-CF đóng gói theo kênh", () => {
  test("T-CF-05 QA PASS thì đóng gói chạy thử, ghi lượt đóng gói; chưa duyệt, chưa chạy hay QA FAIL thì chặn tại Growth", async () => {
    const db = freshDb();
    const calls: string[] = [];
    await compileFromHook(db, await target(calls), { hookId: "H1", text: "x", jurisdiction: null }, by);
    expect(await exportBundles(db, await target(calls), "IR-1", by)).toEqual({ status: "refused", errorCode: "STORYBOARD_NOT_APPROVED" });
    decideStoryboard(db, "IR-1", "approve", "", by);
    expect(await exportBundles(db, await target(calls), "IR-1", by)).toEqual({ status: "refused", errorCode: "QA_NOT_PASSED" }); // chưa chạy
    await runPipeline(db, await target(calls), "IR-1", by);
    expect(await exportBundles(db, await target(calls), "IR-1", by)).toEqual({ status: "succeeded", packageId: "PKG-1", bundles: 2 });
    expect(calls).toEqual(["export:IR-1"]);
    expect(listStoryboards(db)[0]!.lastExport).toMatchObject({ packageId: "PKG-1", bundles: [{ channel: "meta", aspectRatio: "9:16", entries: 4 }, { channel: "google", aspectRatio: "16:9", entries: 3 }] });
    expect(() => db.run("DELETE FROM creative_exports")).toThrow("append_only:creative_exports");
    const failDb = freshDb();
    await ready(failDb, calls, { qa: "FAIL" });
    expect(await exportBundles(failDb, await target(calls), "IR-1", by)).toEqual({ status: "refused", errorCode: "QA_NOT_PASSED" });
  });

  test("T-CF-06 kết quả báo đã đăng là sai hợp đồng: không ghi; Storyboard bị từ chối sau lần chạy thì chặn", async () => {
    const db = freshDb();
    const calls: string[] = [];
    await ready(db, calls, { published: true });
    expect(await exportBundles(db, await target(calls, { published: true }), "IR-1", by)).toEqual({ status: "failed", errorCode: "CREATIVE_MCP_CONTRACT" });
    expect(db.query("SELECT COUNT(*) AS n FROM creative_exports").get()).toEqual({ n: 0 });
    decideStoryboard(db, "IR-1", "reject", "đổi", { now: new Date("2026-11-09T03:00:00Z"), actor: "mark" });
    expect(await exportBundles(db, await target(calls), "IR-1", by)).toEqual({ status: "refused", errorCode: "STORYBOARD_NOT_APPROVED" });
  });
});

describe("T-CF-07 trang /creative có nút đóng gói khi QA PASS", () => {
  test("T-CF-07 nút đóng gói chỉ hiện khi Storyboard đã duyệt, đã chạy và QA PASS; kết quả đóng gói hiện trên thẻ", async () => {
    const { makeApp, MARK, session } = await import("../helpers/queue.ts");
    const db = freshDb();
    const calls: string[] = [];
    await ready(db, calls);
    await exportBundles(db, await target(calls), "IR-1", by);
    const { app } = makeApp(db, { creativeSource: { mode: "mcp", url: "http://127.0.0.1:1/mcp" } });
    const page = await (await app.fetch(new Request("https://queue.example.invalid/creative", { headers: { cookie: session(MARK).cookie } }))).text();
    expect(page).toContain('action="/creative/export"');
    expect(page).toContain("meta 9:16 (4), google 16:9 (3)");
    expect(page).toContain('action="/creative/analyze"');
  });
});

describe("T-CF-08 phân tích bước 7", () => {
  test("T-CF-08 gọi analyze_campaign, trả số asset, QA và khuyến nghị; sai hợp đồng thì báo lỗi", async () => {
    const { analyzeCampaign } = await import("../../src/creative/factory.ts");
    const db = freshDb();
    const s = new McpServer({ name: "fake", version: "0" });
    s.registerTool("analyze_campaign", { inputSchema: { creative_ir_id: z.string() } }, async () => ({ content: [{ type: "text" as const, text: JSON.stringify({
      report_id: "an-1", assets: { total: 33, generated: 26, approved: 26, rejected: 0, pending: 7 }, quality: { assessed: 26, passed: 26, failed: 0, pass_rate: 1 },
      recommendations: [{ severity: "warning", category: "lifecycle", message: "Campaign has not reached COMPLETED." }] }) }] }));
    const [x, y] = InMemoryTransport.createLinkedPair();
    await s.connect(x);
    expect(await analyzeCampaign(db, { transport: y }, "IR-1")).toEqual({ status: "succeeded", generated: 26, approved: 26, pending: 7, passRate: 1, recommendations: [{ severity: "warning", message: "Campaign has not reached COMPLETED." }] });
    const bad = new McpServer({ name: "fake", version: "0" });
    bad.registerTool("analyze_campaign", {}, async () => ({ content: [{ type: "text" as const, text: "{}" }] }));
    const [p, q] = InMemoryTransport.createLinkedPair();
    await bad.connect(p);
    expect(await analyzeCampaign(db, { transport: q }, "IR-1")).toEqual({ status: "failed", errorCode: "CREATIVE_MCP_CONTRACT" });
  });
});
