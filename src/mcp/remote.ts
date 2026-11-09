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

// Gọi một hay nhiều tool trên cùng một kết nối (mở một lần, đóng sau lệnh cuối).
export async function callRemoteTools(target: RemoteTarget, calls: { tool: string; args?: Record<string, unknown> }[]): Promise<unknown[]> {
  const transport = "transport" in target ? target.transport
    : new StreamableHTTPClientTransport(new URL(target.url), target.token ? { requestInit: { headers: { Authorization: `Bearer ${target.token}` } } } : undefined);
  const client = new Client({ name: "growth-workspace", version: "0.1.0" });
  try {
    await client.connect(transport);
    const out: unknown[] = [];
    for (const c of calls) {
      const r = await client.callTool({ name: c.tool, arguments: c.args ?? {} });
      if (r.isError) throw new RemoteToolError("REMOTE_TOOL_ERROR");
      if (r.structuredContent) {
        out.push(r.structuredContent);
        continue;
      }
      const first = (r.content as { type: string; text?: string }[] | undefined)?.find((x) => x.type === "text");
      if (!first?.text) throw new RemoteToolError("REMOTE_EMPTY");
      out.push(JSON.parse(first.text));
    }
    return out;
  } catch (e) {
    if (e instanceof RemoteToolError) throw e;
    if (e instanceof SyntaxError) throw new RemoteToolError("REMOTE_BAD_JSON");
    // Server từ chối token (401, 403): báo riêng để người cài biết sửa <PREFIX>_MCP_TOKEN, không nhầm với mất kết nối.
    const status = (e as { code?: unknown } | null)?.code;
    throw new RemoteToolError(status === 401 || status === 403 ? "REMOTE_UNAUTHORIZED" : "REMOTE_UNREACHABLE");
  } finally {
    await client.close().catch(() => {});
  }
}

export async function callRemoteTool(target: RemoteTarget, tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return (await callRemoteTools(target, [{ tool, args }]))[0];
}
