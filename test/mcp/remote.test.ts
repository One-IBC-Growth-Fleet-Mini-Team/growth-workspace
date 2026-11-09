// T-REM-01: lỗi gọi MCP bên ngoài phân biệt sai token (401, 403) với không kết nối được (D-57).
import { describe, expect, test } from "bun:test";
import { callRemoteTool } from "../../src/mcp/remote.ts";

describe("T-REM gọi MCP bên ngoài", () => {
  test("T-REM-01 401 và 403 báo REMOTE_UNAUTHORIZED; lỗi khác báo REMOTE_UNREACHABLE", async () => {
    for (const status of [401, 403]) {
      const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null, { status }) });
      try {
        await expect(callRemoteTool({ url: `http://127.0.0.1:${s.port}/mcp`, token: "sai" }, "x")).rejects.toThrow("REMOTE_UNAUTHORIZED");
      } finally {
        s.stop(true);
      }
    }
    const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null, { status: 500 }) });
    try {
      await expect(callRemoteTool({ url: `http://127.0.0.1:${s.port}/mcp` }, "x")).rejects.toThrow("REMOTE_UNREACHABLE");
    } finally {
      s.stop(true);
    }
  });
});
