// T-MI1-01 tới T-MI1-07: Mi1 phần lõi (spec mục 6, CRON-06, CRON-08; D-27). Chỉ dữ liệu tổng hợp, không LLM.
import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { applyDefaults, buildBrief, buildDigest, mondayOf } from "../../src/mi1/core.ts";
import { decisionAgeHours, decisionRate, gate2Week, loadForecast, median } from "../../src/metrics/queue-health.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

let db: Database;
beforeEach(() => {
  db = freshDb();
  db.run(`INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens, cost_usd, status, started_at, finished_at)
          VALUES ('run_t', 'mi1-sa-01', 'manual', 'p', 'e', 'm', 0, 0, 0.25, 'succeeded', '2026-11-02T01:00:00Z', '2026-11-02T01:01:00Z')`);
});

// Mục tổng hợp: queue_date là ngày giờ VN; tạo lúc 08:00 giờ VN; hạn 17:59:59 giờ VN cùng ngày.
function item(id: string, queueDate: string, type = "nba", confidence = 0.9) {
  db.run(
    `INSERT INTO queue_items (id, item_type, queue_date, dedupe_key, subject_ref, payload, rules_fired, confidence, confidence_inputs,
       assignee, default_action, due_at, etl_run_id, agent_run_id, created_at)
     VALUES (?, ?, ?, ?, 'O1', '{}', '[]', ?, '{}', 'amy', 'giữ nháp', ?, NULL, 'run_t', ?)`,
    [id, type, queueDate, `dk-${id}`, confidence, `${queueDate}T10:59:59.000Z`, `${queueDate}T01:00:00.000Z`],
  );
}
function act(itemId: string | null, action: string, at: string, actor = "amy", payload: string | null = null) {
  db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), itemId, actor, action, payload, at]);
}
const state = (id: string) => (db.query("SELECT state FROM queue_item_state WHERE id = ?").get(id) as { state: string }).state;

describe("T-MI1-01 hàm chỉ số sức khoẻ Hàng chờ", () => {
  test("T-MI1-01 tuổi quyết định, trung vị, tỷ lệ quyết, Cổng 2, dự báo tải", () => {
    expect(decisionAgeHours("2026-11-02T01:00:00Z", "2026-11-02T04:30:00Z", new Date())).toBe(3.5);
    expect(decisionAgeHours("2026-11-02T01:00:00Z", null, new Date("2026-11-03T01:00:00Z"))).toBe(24);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(decisionRate(10, 8)).toBe(0.8);
    expect(decisionRate(0, 0)).toBeNull();
    expect(() => decisionRate(2, 3)).toThrow(RangeError);
    expect([gate2Week(3, 0.8), gate2Week(2, 1), gate2Week(5, 0.79), gate2Week(5, null)]).toEqual([true, false, false, false]);
    expect(loadForecast([10, 0, 5, 5, 6, 4])).toBe(5);
    expect(loadForecast([])).toBe(0);
  });
});

describe("T-MI1-02 áp phương án mặc định khi quá hạn", () => {
  test("T-MI1-02 chỉ mục còn chờ và đã quá hạn; chạy lại không áp trùng; ghi một phiên Mi1 tốn 0 USD", () => {
    item("a", "2026-11-02");
    item("b", "2026-11-02");
    item("c", "2026-11-03");
    item("n", "2026-11-02", "system_notice");
    act("b", "confirm", "2026-11-02T03:00:00Z");
    const r = applyDefaults(db, new Date("2026-11-03T01:15:00Z"));
    expect(r.applied).toBe(1);
    expect([state("a"), state("b"), state("c"), state("n")]).toEqual(["default_applied", "confirm", "pending", "pending"]);
    expect(applyDefaults(db, new Date("2026-11-03T02:00:00Z")).applied).toBe(0);
    expect(db.query("SELECT agent, cost_usd, input_tokens FROM agent_runs WHERE id = ?").get(r.agentRunId)).toEqual({ agent: "mi1", cost_usd: 0, input_tokens: 0 });
  });

  test("T-MI1-02 quyết định của Amy đến sau vẫn thắng mặc định; bảng mặc định chỉ thêm", () => {
    item("a", "2026-11-02");
    applyDefaults(db, new Date("2026-11-03T01:15:00Z"));
    act("a", "reject", "2026-11-03T02:00:00Z", "amy", '{"reason":"x"}');
    expect(state("a")).toBe("reject");
    expect(() => db.run("DELETE FROM queue_defaults")).toThrow("append_only:queue_defaults");
    expect(() => db.run("UPDATE queue_defaults SET default_action = 'gửi'")).toThrow("append_only:queue_defaults");
  });
});

describe("T-MI1-03 brief sáng", () => {
  test("T-MI1-03 đếm mục hôm nay, mục còn chờ từ hôm trước, mặc định vừa áp, escalate chờ Mark, chi phí, dự báo", () => {
    for (const d of ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) for (const k of [1, 2]) item(`${d}-${k}`, d);
    item("old", "2026-11-01"); // Chủ nhật, vẫn còn chờ
    item("t1", "2026-11-02");
    item("t2", "2026-11-02", "self_report");
    act("t1", "confirm", "2026-11-02T02:00:00Z");
    act("2026-10-31-1", "escalate", "2026-10-31T03:00:00Z");
    applyDefaults(db, new Date("2026-11-02T00:30:00Z"));
    const b = buildBrief(db, new Date("2026-11-02T03:00:00Z"));
    expect(b.date).toBe("2026-11-02");
    expect(b.today).toEqual([{ type: "nba", total: 1, pending: 0 }, { type: "self_report", total: 1, pending: 1 }]);
    expect(b.carryover.count).toBe(0); // mọi mục cũ còn chờ đã được áp mặc định
    expect(b.defaultsLast24h).toBe(10); // 9 mục cũ còn chờ + mục Chủ nhật
    expect(b.escalatedWaiting).toBe(1);
    expect(b.monthCostUsd).toBe(0.25);
    expect(b.forecastItems).toBe(2); // 6 ngày làm việc gần nhất: 0,2,2,2,2,2 → trung bình 1,67 làm tròn 2
  });

  test("T-MI1-03 mục quá hạn chưa tới lượt áp vẫn hiện là còn chờ từ hôm trước, kèm tuổi lâu nhất", () => {
    item("old", "2026-10-31");
    const b = buildBrief(db, new Date("2026-11-02T01:00:00Z"));
    expect(b.carryover).toEqual({ count: 1, oldestHours: 48 });
  });
});

describe("T-MI1-05 Digest tuần", () => {
  test("T-MI1-05 tuần thứ Hai tới Chủ nhật; quyết định đầu tiên của người; mặc định không tính là quyết; Cổng 2", () => {
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
    for (const k of [1, 2, 3, 4, 5]) item(`w${k}`, "2026-10-27");
    item("x", "2026-11-02"); // tuần sau, không tính
    act("w1", "confirm", "2026-10-27T03:00:00Z");
    act("w1", "edit", "2026-10-27T04:00:00Z", "amy", "{}");
    act("w2", "reject", "2026-10-27T05:00:00Z", "amy", '{"reason":"x"}');
    act("w3", "confirm", "2026-10-28T01:00:00Z");
    act("w3", "rm_outcome", "2026-10-29T01:00:00Z", "amy", '{"outcome":"rm_already_handled"}');
    act("w4", "confirm", "2026-10-27T09:00:00Z");
    for (const at of ["2026-10-27T01:00:00Z", "2026-10-27T05:00:00Z", "2026-10-28T01:00:00Z", "2026-10-29T01:00:00Z"]) act(null, "queue_opened", at);
    act(null, "queue_opened", "2026-10-30T01:00:00Z", "mark");
    applyDefaults(db, new Date("2026-10-28T01:15:00Z"));
    const d = buildDigest(db, "2026-10-26", new Date("2026-11-02T01:30:00Z"));
    expect(d.weekEnd).toBe("2026-11-01");
    expect(d.created).toEqual([{ type: "nba", count: 5 }]);
    expect(d.decisions).toEqual([{ action: "confirm", count: 3 }, { action: "reject", count: 1 }]);
    expect(d.defaultsApplied).toBe(1);
    expect(d.decisionRate).toBe(0.8);
    expect(d.openDays).toBe(3);
    expect(d.gate2).toBe(true);
    expect(d.medianAgeHours).toBe(8); // đã quyết: 2, 4, 8, 24 giờ; w5 chưa ai quyết, tính tới lúc lập digest: 144,5 giờ
    expect(d.longest[0]).toMatchObject({ id: "w5", state: "default_applied", ageHours: 144.5 });
    expect(d.nbaOutcomes).toEqual([{ outcome: "rm_already_handled", count: 1 }]);
  });
});

describe("T-MI1-06 trang /brief và /digest", () => {
  test("T-MI1-06 Amy và Mark đều xem được; chưa đăng nhập thì về trang đăng nhập; Hàng chờ có link", async () => {
    item("t1", "2026-11-02");
    const { app } = makeApp(db);
    for (const u of [AMY, MARK]) {
      const s = session(u);
      const brief = await (await get(app, "/brief", s.cookie)).text();
      expect(brief).toContain("Brief sáng");
      expect(await (await get(app, "/digest?week=2026-10-26", s.cookie)).text()).toContain("Digest tuần 26/10");
    }
    expect((await get(app, "/brief")).status).toBe(302);
    expect((await get(app, "/digest?week=khong-hop-le", session(AMY).cookie)).status).toBe(200);
    const q = await (await get(app, "/queue", session(AMY).cookie)).text();
    expect(q).toContain('href="/brief"');
    expect(q).toContain('href="/digest"');
  });

  test("T-MI1-07 mục đã áp mặc định hiện 'quá hạn, giữ nháp' và Amy vẫn quyết được", async () => {
    item("a", "2026-11-01");
    applyDefaults(db, new Date("2026-11-02T00:30:00Z"));
    const { app } = makeApp(db);
    const s = session(AMY);
    expect(await (await get(app, "/queue?date=2026-11-01", s.cookie)).text()).toContain("quá hạn, giữ nháp");
    expect((await post(app, "/queue/items/a/confirm", { csrf: s.csrf }, s.cookie)).status).toBe(303);
    expect(state("a")).toBe("confirm");
  });
});

