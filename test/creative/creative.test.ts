// T-CF-01 tới T-CF-04: cổng creative-factory-mcp và cổng Storyboard (spec mục 7, 9; D-44). Server MCP giả trong bộ nhớ.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { compileFromHook, decideStoryboard, listStoryboards, runPipeline } from "../../src/creative/factory.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
function fakeFactory(calls: string[]) {
  const s = new McpServer({ name: "creative-factory-fake", version: "0" });
  const ok = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });
  s.registerTool("compile_creative_ir", { description: "giả" }, async () => {
    calls.push("compile");
    return ok({ creative_ir_id: "IR-1", storyboard: { title: "HK 2 ngày", scenes: ["Mở: hồ sơ online", "Giữa: 2 ngày", "Kết: bảng giá"] } });
  });
  s.registerTool("run_creative_pipeline", { description: "giả" }, async () => {
    calls.push("run");
    return ok({ run_id: "R-1", qa_status: "PASS", assets: [{ asset_id: "A-1", kind: "image" }] });
  });
  return s;
}
async function target(calls: string[]) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await fakeFactory(calls).connect(a);
  return { transport: b };
}

describe("T-CF Creative Factory", () => {
  test("T-CF-01 compile tạo Storyboard chờ duyệt; chưa duyệt thì bước generate bị chặn ngay tại Growth, không gọi ra ngoài", async () => {
    const db = freshDb();
    const calls: string[] = [];
    const c = await compileFromHook(db, await target(calls), { hookId: "H1", text: "HK company in 2 days.", jurisdiction: "Hong Kong" }, { now: NOW, actor: "mark" });
    expect(c).toEqual({ status: "succeeded", creativeIrId: "IR-1" });
    expect(listStoryboards(db)).toMatchObject([{ creativeIrId: "IR-1", hookId: "H1", status: "pending", scenes: ["Mở: hồ sơ online", "Giữa: 2 ngày", "Kết: bảng giá"] }]);
    const r = await runPipeline(db, await target(calls), "IR-1", { now: NOW, actor: "mark" });
    expect(r).toEqual({ status: "refused", errorCode: "STORYBOARD_NOT_APPROVED" });
    expect(calls).toEqual(["compile"]);
  });

  test("T-CF-02 duyệt rồi mới chạy generate ở chế độ STRICT; bị từ chối thì vẫn chặn; ghi lượt chạy", async () => {
    const db = freshDb();
    const calls: string[] = [];
    await compileFromHook(db, await target(calls), { hookId: "H1", text: "x", jurisdiction: null }, { now: NOW, actor: "mark" });
    expect(decideStoryboard(db, "IR-1", "approve", "", { now: NOW, actor: "mark" })).toBe("ok");
    expect(await runPipeline(db, await target(calls), "IR-1", { now: NOW, actor: "mark" })).toEqual({ status: "succeeded", qaStatus: "PASS", assets: 1 });
    expect(listStoryboards(db)[0]).toMatchObject({ status: "approved", lastRun: { qaStatus: "PASS", assets: 1 } });
    expect(decideStoryboard(db, "IR-1", "reject", "đổi cảnh 1", { now: new Date("2026-11-09T03:00:00Z"), actor: "mark" })).toBe("ok");
    expect((await runPipeline(db, await target(calls), "IR-1", { now: NOW, actor: "mark" })).errorCode).toBe("STORYBOARD_NOT_APPROVED");
    expect(decideStoryboard(db, "IR-404", "approve", "", { now: NOW, actor: "mark" })).toBe("NOT_FOUND");
    expect(() => db.run("DELETE FROM storyboard_decisions")).toThrow("append_only:storyboard_decisions");
  });

  test("T-CF-03 chưa cấu hình MCP thì trang báo chưa nối, không có nút tạo", async () => {
    const { app } = makeApp(freshDb());
    const page = await (await get(app, "/creative", session(MARK).cookie)).text();
    expect(page).toContain("Chưa nối Creative Factory");
    expect(page).not.toContain('name="run"');
  });

  test("T-CF-04 trang /creative: duyệt có CSRF; Hàng chờ có link", async () => {
    const db = freshDb();
    const calls: string[] = [];
    await compileFromHook(db, await target(calls), { hookId: "H1", text: "x", jurisdiction: null }, { now: NOW, actor: "mark" });
    const { app } = makeApp(db);
    const s = session(MARK);
    const res = await post(app, "/creative/decide", { csrf: s.csrf, id: "IR-1", decision: "approve", note: "" }, s.cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Đã duyệt Storyboard IR-1.");
    expect((await post(app, "/creative/decide", { csrf: "sai", id: "IR-1", decision: "approve" }, s.cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/creative"');
  });
});
