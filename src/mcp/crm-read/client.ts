// Cách sa-01 gọi crm-read-mcp. Chạy thật: client MCP qua stdio tới server chỉ đọc (job sa01-morning).
// Test: gọi thẳng hàm tool trên kết nối DB cùng tiến trình, hoặc qua InMemoryTransport.
import type { Database } from "bun:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  checkResellerFlag,
  findDuplicateLeads,
  getPipelineByCloseDate,
  type DuplicateResult,
  type PipelineArgs,
  type PipelineResult,
  type ResellerResult,
} from "./tools.ts";

export type CrmReadTools = {
  getPipelineByCloseDate(args: PipelineArgs): Promise<PipelineResult>;
  checkResellerFlag(args: { client_id: string }): Promise<ResellerResult>;
  findDuplicateLeads(args: { lead_id?: string }): Promise<DuplicateResult>;
};

export class CrmToolError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function directCrmReadTools(db: Database): CrmReadTools {
  return {
    getPipelineByCloseDate: async (a) => getPipelineByCloseDate(db, a),
    checkResellerFlag: async (a) => checkResellerFlag(db, a),
    findDuplicateLeads: async (a) => findDuplicateLeads(db, a),
  };
}

export async function connectCrmReadMcp(transport: Transport): Promise<CrmReadTools & { close(): Promise<void> }> {
  const client = new Client({ name: "mi1-sa-01", version: "0.1.0" });
  await client.connect(transport);
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "{}";
    const body = JSON.parse(text) as T & { error_code?: string };
    if (res.isError) throw new CrmToolError(body.error_code ?? "TOOL_ERROR");
    return body;
  };
  return {
    getPipelineByCloseDate: (a) => call("get_pipeline_by_close_date", a),
    checkResellerFlag: (a) => call("check_reseller_flag", a),
    findDuplicateLeads: (a) => call("find_duplicate_leads", a),
    close: () => client.close(),
  };
}
