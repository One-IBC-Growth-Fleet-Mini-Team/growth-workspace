// T-AQ-01, T-AQ-02: bộ truy vấn mẫu đã duyệt của growth-mcp (spec mục 4, mục 9 execute_approved_cypher; D-51).
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { importPriceSheet } from "../../src/crm/jurisdiction-import.ts";
import { logKnowledge } from "../../src/db/knowledge.ts";
import { insertAgentRun } from "../../src/db/queue.ts";
import { createGrowthServer } from "../../src/mcp/growth/server.ts";
import { callRemoteTools } from "../../src/mcp/remote.ts";
import { APPROVED_QUERIES, runApprovedQuery } from "../../src/mi1/approved-queries.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const SHEET = 'Jurisdiction,Loại hình công ty,Starter,Grow,Premium,Renewal per year,2 year Renewal Starter,3 year Renewal Starter\nAlpha,Ltd,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"';

function load() {
  const db = freshDb();
  importPriceSheet(db, SHEET, { now: NOW, actor: "mark" });
  logKnowledge(db, { kind: "lesson", title: "Hook giá thắng", body: "CTR gấp đôi", evidence: "/ads-overview" }, { now: NOW, actor: "mark" });
  insertAgentRun(db, { id: "r1", agent: "mi1-sa-01", trigger: "cron-05", prompt_version: "p", eval_version: "e", model: "m", input_tokens: 10, output_tokens: 5, cost_usd: 2.5, status: "succeeded", started_at: "2026-11-08T01:00:00Z", finished_at: "2026-11-08T01:00:00Z" });
  return db;
}

describe("T-AQ truy vấn mẫu đã duyệt", () => {
  test("T-AQ-01 mỗi mẫu gắn một câu hỏi đầu ra; trả kết quả đã tính bằng hàm; tham số sai bị từ chối", () => {
    const db = load();
    expect(Object.keys(APPROVED_QUERIES)).toEqual(["output_readiness", "hook_board", "lessons", "fleet_operations", "channel_health"]);
    expect(runApprovedQuery(db, "output_readiness", {}, NOW)).toMatchObject({ question: 3, verified: true, result: { prices: { listed: 1, priceLocked: 1 }, sandbox: { ready: null } } });
    expect(runApprovedQuery(db, "lessons", { query: "giá" }, NOW)).toMatchObject({ question: 5, result: { entries: [{ title: "Hook giá thắng", evidence: "/ads-overview" }] } });
    expect(runApprovedQuery(db, "fleet_operations", { week: "2026-11-02" }, NOW)).toMatchObject({ question: 7, result: { monthCostUsd: 2.5, capUsd: 100, unseenRuns: 1, queue: { weekStart: "2026-11-02" } } });
    expect(runApprovedQuery(db, "fleet_operations", { week: "02/11" }, NOW)).toEqual({ errorCode: "PARAMS_INVALID" });
    expect(runApprovedQuery(db, "khong_co", {}, NOW)).toEqual({ errorCode: "TEMPLATE_NOT_APPROVED" });
    expect(runApprovedQuery(db, "lessons", { query: "x", sql: "DROP TABLE knowledge_log" }, NOW)).toEqual({ errorCode: "PARAMS_INVALID" });
  });

  test("T-AQ-02 growth-mcp execute_approved_cypher: chỉ chạy mẫu có trong danh sách", async () => {
    const db = load();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createGrowthServer(db, { now: () => NOW }).connect(a);
    const [r] = await callRemoteTools({ transport: b }, [{ tool: "execute_approved_cypher", args: { template: "channel_health" } }]) as any[];
    expect(r).toMatchObject({ template: "channel_health", question: 3, verified: true });
    const [c, d] = InMemoryTransport.createLinkedPair();
    await createGrowthServer(db, { now: () => NOW }).connect(c);
    expect(callRemoteTools({ transport: d }, [{ tool: "execute_approved_cypher", args: { template: "MATCH (n) DETACH DELETE n" } }])).rejects.toThrow("REMOTE_TOOL_ERROR");
  });
});
