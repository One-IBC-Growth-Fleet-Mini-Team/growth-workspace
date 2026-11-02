// Server MCP crm-read qua stdio (design doc mục 5.2). Mở Growth DB ở chế độ chỉ đọc; đúng 3 tool.
import type { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDbPath } from "../../config.ts";
import { openReadOnly } from "../../db/open.ts";
import { checkResellerFlag, findDuplicateLeads, getPipelineByCloseDate } from "./tools.ts";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ID = z.string().min(1).max(64);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function openCrmReadDb(path: string): Database {
  return openReadOnly(path);
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(e: unknown) {
  const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "TOOL_ERROR";
  return { content: [{ type: "text" as const, text: JSON.stringify({ error_code: code }) }], isError: true };
}

export function createCrmReadServer(db: Database): McpServer {
  const server = new McpServer({ name: "crm-read", version: "0.1.0" });
  server.registerTool(
    "get_pipeline_by_close_date",
    {
      description: "Opportunity mở có Close Date trong kỳ, nhóm theo Stage, từ snapshot CRM mới nhất.",
      inputSchema: z.strictObject({ period_start: DATE, period_end: DATE, owner_rm_id: ID.optional() }),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return result(getPipelineByCloseDate(db, args));
      } catch (e) {
        return failure(e);
      }
    },
  );
  server.registerTool(
    "check_reseller_flag",
    {
      description: "Cờ khách cuối của reseller theo trường CRM; trống thì unknown, không suy đoán.",
      inputSchema: z.strictObject({ client_id: ID }),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return result(checkResellerFlag(db, args));
      } catch (e) {
        return failure(e);
      }
    },
  );
  server.registerTool(
    "find_duplicate_leads",
    {
      description: "Nhóm Lead trùng email hoặc SĐT (so mã băm); chỉ trả mã Lead.",
      inputSchema: z.strictObject({ lead_id: ID.optional() }),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return result(findDuplicateLeads(db, args));
      } catch (e) {
        return failure(e);
      }
    },
  );
  return server;
}

if (import.meta.main) {
  const server = createCrmReadServer(openCrmReadDb(getDbPath()));
  await server.connect(new StdioServerTransport());
}
