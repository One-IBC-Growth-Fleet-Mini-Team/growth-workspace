// T-KN-01 tới T-KN-03: nhật ký bài học, quyết định và server growth-mcp (spec mục 1 câu 5, mục 9; D-48).
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { logKnowledge, searchKnowledge } from "../../src/db/knowledge.ts";
import { createGrowthServer } from "../../src/mcp/growth/server.ts";
import { callRemoteTools } from "../../src/mcp/remote.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");

describe("T-KN bài học và growth-mcp", () => {
  test("T-KN-01 bắt buộc bằng chứng là đường dẫn trong Growth; nội dung qua lọc R1; tìm theo chữ; chỉ thêm", () => {
    const db = freshDb();
    const by = { now: NOW, actor: "mark" };
    expect(logKnowledge(db, { kind: "lesson", title: "Hook giá thắng", body: "CTR gấp đôi. Hỏi canary.person@example.com", evidence: "/ads-overview?week=2026-11-02" }, by).status).toBe("ok");
    expect(logKnowledge(db, { kind: "lesson", title: "x", body: "y", evidence: "https://evil.example.invalid" }, by)).toEqual({ status: "invalid", errorCode: "EVIDENCE_REQUIRED" });
    expect(logKnowledge(db, { kind: "lesson", title: "x", body: "y", evidence: "//evil.example.invalid" }, by)).toEqual({ status: "invalid", errorCode: "EVIDENCE_REQUIRED" });
    expect(searchKnowledge(db, "giá").map((e) => e.title)).toEqual(["Hook giá thắng"]);
    expect(searchKnowledge(db, "100%")).toEqual([]);
    expect(new TextDecoder().decode(db.serialize())).not.toContain("canary.person");
    expect(() => db.run("DELETE FROM knowledge_log")).toThrow("append_only:knowledge_log");
  });

  test("T-KN-02 growth-mcp: log_decision, search_knowledge, propose_hook_card", async () => {
    const db = freshDb();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createGrowthServer(db, { now: () => NOW, actor: "mi1" }).connect(a);
    const [logged, found, hooks] = await callRemoteTools({ transport: b }, [
      { tool: "log_decision", args: { title: "Giữ ngân sách HK", body: "Biên dương", evidence: "/budget" } },
      { tool: "search_knowledge", args: { query: "HK" } },
      { tool: "propose_hook_card" },
    ]) as any[];
    expect(logged.id).toBeString();
    expect(found.entries).toMatchObject([{ kind: "decision", actor: "mi1", evidence: "/budget" }]);
    expect(hooks).toEqual({ proposed: [] });
  });

  test("T-KN-03 trang /lessons: ghi có CSRF, thiếu bằng chứng thì 422; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    expect((await post(app, "/lessons", { csrf: s.csrf, kind: "lesson", title: "T", body: "B", evidence: "/hooks" }, s.cookie)).status).toBe(200);
    expect((await post(app, "/lessons", { csrf: s.csrf, kind: "lesson", title: "T", body: "B", evidence: "" }, s.cookie)).status).toBe(422);
    expect(await (await get(app, "/lessons?q=T", s.cookie)).text()).toContain('href="/hooks"');
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/lessons"');
  });
});
