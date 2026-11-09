// T-MON-01, T-MON-02: báo cáo tháng (CRON-09, spec mục 10; D-55). Gom số đã tính bằng hàm có test, không tự cộng bằng LLM.
import { describe, expect, test } from "bun:test";
import { logKnowledge } from "../../src/db/knowledge.ts";
import { insertAgentRun } from "../../src/db/queue.ts";
import { buildMonthly, previousMonth } from "../../src/mi1/monthly.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { monthlyReadyMessage } from "../../src/teams/notify.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, SECRET } from "../helpers/queue.ts";

const NOW = new Date("2026-11-01T00:30:00Z"); // 07:30 ngày 01/11 giờ VN
const run = (id: string, at: string, cost: number) => ({ id, agent: "mi1-sa-01", trigger: "cron-05", prompt_version: "p", eval_version: "e", model: "m", input_tokens: 1, output_tokens: 1, cost_usd: cost, status: "succeeded", started_at: at, finished_at: at });

function load() {
  const db = freshDb();
  insertAgentRun(db, run("a", "2026-10-05T01:00:00Z", 3));
  insertAgentRun(db, run("b", "2026-10-20T01:00:00Z", 4.5));
  insertAgentRun(db, run("c", "2026-11-01T00:10:00Z", 9));
  logKnowledge(db, { kind: "lesson", title: "Hook giá thắng", body: "b", evidence: "/ads-overview" }, { now: new Date("2026-10-12T02:00:00Z"), actor: "mark" });
  logKnowledge(db, { kind: "decision", title: "Tháng sau", body: "b", evidence: "/budget" }, { now: new Date("2026-11-01T00:20:00Z"), actor: "mark" });
  return db;
}

describe("T-MON báo cáo tháng", () => {
  test("T-MON-01 tháng trước theo giờ VN; các tuần bắt đầu trong tháng; chi phí tháng; bài học trong tháng; hoa hồng là đề xuất tạm, chưa chi", () => {
    expect(previousMonth(NOW)).toBe("2026-10");
    const m = buildMonthly(load(), "2026-10", NOW);
    expect(m.weeks.map((w) => w.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(m.weeks.every((w) => w.gate2 === false)).toBe(true);
    expect(m.costUsd).toBeCloseTo(7.5);
    expect(m.capUsd).toBe(100);
    expect(m.lessons.map((l) => l.title)).toEqual(["Hook giá thắng"]);
    expect(m.commission).toBe("provisional");
    expect(monthlyReadyMessage("2026-10", "http://localhost:3000")).toEqual({ text: "Báo cáo tháng 10/2026 đã sẵn sàng: http://localhost:3000/monthly?m=2026-10" });
    expect(() => monthlyReadyMessage("2026-13", "http://localhost:3000")).toThrow();
  });

  test("T-MON-02 trang /monthly mặc định tháng trước; Hàng chờ có link", async () => {
    const { app } = makeApp(load(), { now: () => NOW });
    const c = createSessionCookie(SECRET, { sub: "mark", csrf: "c", exp: Date.parse("2026-11-02T00:00:00Z") });
    const page = await (await get(app, "/monthly", c)).text();
    expect(page).toContain("Báo cáo tháng 10/2026");
    expect(page).toContain("Chi phí LLM: 7.50 / 100 USD");
    expect(page).toContain("Hook giá thắng");
    expect(page).toContain("(Tạm), chưa chi");
    expect(await (await get(app, "/queue", c)).text()).toContain('href="/monthly"');
  });
});
