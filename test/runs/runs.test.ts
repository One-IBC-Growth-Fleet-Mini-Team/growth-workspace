// T-RUN-01 tới T-RUN-03: nhật ký phiên chạy của fleet nghiệp vụ (spec mục 6 quy tắc 2, mục 10 trần 100 USD/tháng; D-50).
import { describe, expect, test } from "bun:test";
import { insertAgentRun, insertQueueItem } from "../../src/db/queue.ts";
import { buildRunLog, markRunSeen, supervisorOf } from "../../src/db/runs.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const run = (id: string, agent: string, at: string, cost: number) => ({
  id, agent, trigger: "cron-05", prompt_version: "p1", eval_version: "e1", model: "m", input_tokens: 1000, output_tokens: 200,
  cost_usd: cost, status: "succeeded", started_at: at, finished_at: at,
});

function load() {
  const db = freshDb();
  insertAgentRun(db, run("r-old", "mi1-sa-01", "2026-10-30T01:00:00Z", 50));
  insertAgentRun(db, run("r-sa", "mi1-sa-01", "2026-11-08T01:00:00Z", 1.25));
  insertAgentRun(db, run("r-mi1", "mi1", "2026-11-09T01:15:00Z", 0));
  for (const k of ["a", "b"]) insertQueueItem(db, {
    id: `q-${k}`, item_type: "nba", queue_date: "2026-11-08", dedupe_key: `k-${k}`, subject_ref: null, payload: "{}", rules_fired: "[]",
    confidence: 0.9, confidence_inputs: "{}", assignee: "amy", default_action: "giữ", due_at: "2026-11-09T00:00:00Z", etl_run_id: null, agent_run_id: "r-sa", created_at: "2026-11-08T01:00:00Z",
  } as any);
  return db;
}

describe("T-RUN nhật ký phiên chạy", () => {
  test("T-RUN-01 bảng: mới nhất trước, số đề xuất mỗi phiên, người giám sát, chi phí tháng so với trần", () => {
    const db = load();
    const l = buildRunLog(db, NOW);
    expect(l.runs.map((r) => [r.id, r.items, r.supervisor, r.seenBy])).toEqual([["r-mi1", 0, "mark", null], ["r-sa", 2, "amy", null], ["r-old", 0, "amy", null]]);
    expect(l.monthCostUsd).toBeCloseTo(1.25);
    expect(l.capUsd).toBe(100);
    expect(l.unseen).toBe(3);
    expect(supervisorOf("mi1-ptn-01")).toBe("amy");
    expect(supervisorOf("mi1-mkt-02")).toBe("mark");
  });

  test("T-RUN-02 đánh dấu đã xem: chỉ người giám sát của agent đó; lặp lại không ghi trùng; chỉ thêm", () => {
    const db = load();
    expect(markRunSeen(db, "r-sa", { now: NOW, actor: "mark" })).toBe("NOT_SUPERVISOR");
    expect(markRunSeen(db, "r-sa", { now: NOW, actor: "amy" })).toBe("ok");
    expect(markRunSeen(db, "r-sa", { now: NOW, actor: "amy" })).toBe("ok");
    expect(markRunSeen(db, "khong-co", { now: NOW, actor: "amy" })).toBe("NOT_FOUND");
    const l = buildRunLog(db, NOW);
    expect(l.runs.find((r) => r.id === "r-sa")!.seenBy).toBe("amy");
    expect(l.unseen).toBe(2);
    expect(db.query("SELECT COUNT(*) AS n FROM agent_run_reviews").get()).toEqual({ n: 1 });
    expect(() => db.run("DELETE FROM agent_run_reviews")).toThrow("append_only:agent_run_reviews");
  });

  test("T-RUN-03 trang /runs: xem được khi đăng nhập; đánh dấu có CSRF; sai người 403; Hàng chờ có link", async () => {
    const { app } = makeApp(load());
    expect((await get(app, "/runs")).status).toBe(302);
    const page = await (await get(app, "/runs", session(MARK).cookie)).text();
    expect(page).toContain("Chi phí LLM tháng 2026-11: 1.25 / 100 USD");
    expect(page).toContain("3 phiên chưa có người giám sát xem");
    const a = session(AMY);
    expect((await post(app, "/runs", { csrf: a.csrf, run_id: "r-sa" }, a.cookie)).status).toBe(200);
    const m = session(MARK);
    expect((await post(app, "/runs", { csrf: m.csrf, run_id: "r-sa" }, m.cookie)).status).toBe(403);
    expect((await post(app, "/runs", { csrf: "sai", run_id: "r-mi1" }, m.cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", a.cookie)).text()).toContain('href="/runs"');
  });
});
