// Gọi một tool trên server MCP bên ngoài (Streamable HTTP), dùng chung cho các cổng có adapter MCP (D-43).
// Chỉ gọi tool đọc; kết quả lấy từ structuredContent, nếu không có thì JSON trong nội dung text đầu tiên.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type RemoteTarget = { url: string; token?: string } | { transport: Transport };

export class RemoteToolError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function callRemoteTool(target: RemoteTarget, tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const transport = "transport" in target ? target.transport
    : new StreamableHTTPClientTransport(new URL(target.url), target.token ? { requestInit: { headers: { Authorization: `Bearer ${target.token}` } } } : undefined);
  const client = new Client({ name: "growth-workspace", version: "0.1.0" });
  try {
    await client.connect(transport);
    const r = await client.callTool({ name: tool, arguments: args });
    if (r.isError) throw new RemoteToolError("REMOTE_TOOL_ERROR");
    if (r.structuredContent) return r.structuredContent;
    const first = (r.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === "text");
    if (!first?.text) throw new RemoteToolError("REMOTE_EMPTY");
    return JSON.parse(first.text);
  } catch (e) {
    if (e instanceof RemoteToolError) throw e;
    throw new RemoteToolError(e instanceof SyntaxError ? "REMOTE_BAD_JSON" : "REMOTE_UNREACHABLE");
  } finally {
    await client.close().catch(() => {});
  }
}
