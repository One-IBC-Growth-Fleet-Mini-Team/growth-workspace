// T-HOOK-01 tới T-HOOK-04: Mi1-mkt-02 chấm Hook 25/25/20/15/15 (D-43). Điểm từng tiêu chí do nguồn ngoài gửi
// (file hoặc MCP của hệ thống SEO/AIO); code chỉ áp trọng số. Dữ liệu tổng hợp; server MCP giả trong bộ nhớ.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { importHookCsv, importHooksFromMcp } from "../../src/crm/hook-import.ts";
import { buildHookBoard } from "../../src/db/hooks.ts";
import { hookScore } from "../../src/metrics/hook-score.ts";
import { getRemoteSource } from "../../src/config.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const W = [25, 25, 20, 15, 15];
const CSV = [
  "hook_id,text,jurisdiction,score_1,score_2,score_3,score_4,score_5",
  "H1,Hong Kong company in 2 days. Fully online.,Hong Kong,90,80,70,60,50",
  "H2,Zero tax offshore setup.,,100,100,100,100,100",
  "H3,Open a business banking account fast.,,60,60,60,60,60",
  "H4,Missing one score.,,50,50,50,50,",
].join("\n");

function fakeSeoServer() {
  const s = new McpServer({ name: "seo-aio-fake", version: "0.0.1" });
  s.registerTool("get_hook_scores", { description: "giả" }, async () => ({
    content: [{ type: "text", text: JSON.stringify({
      criteria: [{ key: "intent", label: "Khớp ý định tìm kiếm" }, { key: "clarity", label: "Rõ ràng" }, { key: "proof", label: "Bằng chứng" }, { key: "aio", label: "Trích dẫn được bởi AI" }, { key: "local", label: "Hợp thị trường" }],
      hooks: [{ hook_id: "S1", text: "Singapore company with local director.", jurisdiction: "Singapore", scores: { intent: 80, clarity: 80, proof: 80, aio: 80, local: 80 } }],
    }) }],
  }));
  return s;
}

describe("T-HOOK chấm Hook", () => {
  test("T-HOOK-01 hàm: tổng có trọng số trên thang 100; thiếu điểm hoặc ngoài 0 tới 100 thì không chấm", () => {
    expect(hookScore([90, 80, 70, 60, 50], W)).toBe(73);
    expect(hookScore([100, 100, 100, 100, 100], W)).toBe(100);
    expect(hookScore([50, 50, 50, 50, null], W)).toBeNull();
    expect(hookScore([120, 0, 0, 0, 0], W)).toBeNull();
  });

  test("T-HOOK-02 bảng: xếp theo điểm, kèm kết quả cổng tuân thủ; đề xuất Hook card chỉ lấy mẫu đạt hoặc cần duyệt", () => {
    const db = freshDb();
    expect(importHookCsv(db, CSV, { now: NOW, actor: "mark" })).toMatchObject({ status: "succeeded", hooks: 4 });
    const b = buildHookBoard(db);
    expect(b.hooks.map((h) => [h.hookId, h.score === null ? null : Math.round(h.score * 10) / 10, h.verdict])).toEqual([
      ["H2", 100, "fail"], ["H1", 73, "hold"], ["H3", 60, "review"], ["H4", null, "pass"],
    ]);
    expect(b.proposed.map((h) => h.hookId)).toEqual(["H3"]); // H1 bị giữ vì Hong Kong chưa có giá chốt trong DB này
    expect(b.labels).toEqual(["Tiêu chí 1", "Tiêu chí 2", "Tiêu chí 3", "Tiêu chí 4", "Tiêu chí 5"]);
    expect(importHookCsv(db, "a,b\n1,2", { now: NOW, actor: "mark" }).errorCode).toBe("HOOK_HEADER_NOT_FOUND");
  });

  test("T-HOOK-03 adapter MCP: kéo get_hook_scores từ hệ thống SEO/AIO, giữ nhãn tiêu chí của nguồn; trả sai hợp đồng thì báo lỗi", async () => {
    const db = freshDb();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await fakeSeoServer().connect(a);
    const r = await importHooksFromMcp(db, { transport: b }, { now: NOW, actor: "mark" });
    expect(r).toMatchObject({ status: "succeeded", hooks: 1 });
    const board = buildHookBoard(db);
    expect(board.labels[3]).toBe("Trích dẫn được bởi AI");
    expect(board.hooks[0]).toMatchObject({ hookId: "S1", score: 80, source: "mcp" });
    const bad = new McpServer({ name: "bad", version: "0" });
    bad.registerTool("get_hook_scores", { description: "sai" }, async () => ({ content: [{ type: "text", text: "{\"hooks\":[]}" }] }));
    const [c, d] = InMemoryTransport.createLinkedPair();
    await bad.connect(c);
    expect((await importHooksFromMcp(db, { transport: d }, { now: NOW, actor: "mark" })).errorCode).toBe("HOOK_MCP_CONTRACT");
    expect(getRemoteSource("HOOK", {})).toEqual({ mode: "file" });
    expect(getRemoteSource("HOOK", { HOOK_SOURCE: "mcp", HOOK_MCP_URL: "https://seo.example.invalid/mcp" })).toEqual({ mode: "mcp", url: "https://seo.example.invalid/mcp" });
    expect(() => getRemoteSource("HOOK", { HOOK_SOURCE: "mcp" })).toThrow();
  });

  test("T-HOOK-04 trang /hooks: nạp file có CSRF; chưa cấu hình MCP thì không có nút kéo; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("file", new File([CSV], "h.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/hooks`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 4 Hook.");
    expect(page).toContain("73.0");
    expect(page).not.toContain('name="pull"');
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/hooks"');
  });
});
