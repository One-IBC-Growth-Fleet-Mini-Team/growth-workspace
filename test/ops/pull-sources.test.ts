// T-PULL-01: CRON-03 06:30 kéo các nguồn đã đặt chế độ MCP (spec mục 10; D-61). Nguồn chế độ file bỏ qua;
// một nguồn lỗi không chặn nguồn khác; mỗi lượt kéo dùng đúng hàm nạp của trang tương ứng.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pullSources } from "../../src/jobs/pull-sources.ts";
import { buildHookBoard } from "../../src/db/hooks.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T23:30:00Z");

describe("T-PULL kéo nguồn theo lịch", () => {
  test("T-PULL-01 file bỏ qua; MCP kéo được thì nạp; MCP lỗi thì ghi mã lỗi, nguồn khác vẫn chạy", async () => {
    const db = freshDb();
    const s = new McpServer({ name: "seo", version: "0" });
    s.registerTool("get_hook_scores", {}, async () => ({ content: [{ type: "text" as const, text: JSON.stringify({
      criteria: ["a", "b", "c", "d", "e"].map((k) => ({ key: k, label: k })),
      hooks: [{ hook_id: "H1", text: "Mở công ty HK", jurisdiction: "Hong Kong", scores: { a: 80, b: 80, c: 80, d: 80, e: 80 } }],
    }) }] }));
    const [x, y] = InMemoryTransport.createLinkedPair();
    await s.connect(x);
    const r = await pullSources(db, { hooks: { transport: y }, ads: { url: "http://127.0.0.1:1/mcp" }, market: null }, { now: NOW, actor: "cron-03" });
    expect(r).toEqual([
      { source: "hooks", status: "succeeded" },
      { source: "ads", status: "failed", errorCode: "REMOTE_UNREACHABLE" },
      { source: "market", status: "skipped" },
    ]);
    expect(buildHookBoard(db).hooks.map((h) => h.hookId)).toEqual(["H1"]);
  });
});
