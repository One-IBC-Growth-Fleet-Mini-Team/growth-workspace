// Server MCP growth (spec mục 9, GĐ0; D-48) qua stdio. READ_ONLY: search_knowledge, propose_hook_card.
// WRITE_INTERNAL: log_lesson, log_decision (chỉ thêm vào Growth DB, kèm bằng chứng). execute_approved_cypher để sau (chưa có Neo4j).
import type { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDbPath } from "../../config.ts";
import { buildHookBoard } from "../../db/hooks.ts";
import { logKnowledge, searchKnowledge } from "../../db/knowledge.ts";
import { openReadWrite } from "../../db/open.ts";

const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const bad = (code: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error_code: code }) }], isError: true });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const APPEND = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const Entry = z.strictObject({ title: z.string().min(1).max(200), body: z.string().min(1).max(2000), evidence: z.string().min(1).max(500), tags: z.string().max(200).optional() });

export function createGrowthServer(db: Database, opts: { now?: () => Date; actor?: string } = {}): McpServer {
  const now = opts.now ?? (() => new Date());
  const actor = opts.actor ?? "growth-mcp";
  const server = new McpServer({ name: "growth", version: "0.1.0" });
  server.registerTool("search_knowledge", { description: "Tìm bài học và quyết định đã ghi (tiêu đề, nội dung, thẻ).", inputSchema: z.strictObject({ query: z.string().max(200) }), annotations: READ_ONLY },
    async (a) => ok({ entries: searchKnowledge(db, a.query) }));
  server.registerTool("propose_hook_card", { description: "Đề xuất Hook card đầu tuần: Hook điểm cao nhất đạt cổng tuân thủ hoặc cần duyệt. Team MKT chọn.", annotations: READ_ONLY },
    async () => ok({ proposed: buildHookBoard(db).proposed.map((h) => ({ hook_id: h.hookId, text: h.text, score: h.score, verdict: h.verdict })) }));
  for (const kind of ["lesson", "decision"] as const) {
    server.registerTool(`log_${kind}`, { description: `Ghi một ${kind === "lesson" ? "bài học" : "quyết định"} kèm bằng chứng là đường dẫn trang Growth (bắt đầu bằng /). Chỉ thêm.`, inputSchema: Entry, annotations: APPEND },
      async (a) => {
        const r = logKnowledge(db, { kind, ...a }, { now: now(), actor });
        return r.status === "ok" ? ok({ id: r.id }) : bad(r.errorCode);
      });
  }
  return server;
}

if (import.meta.main) {
  const server = createGrowthServer(openReadWrite(getDbPath()));
  await server.connect(new StdioServerTransport());
}
