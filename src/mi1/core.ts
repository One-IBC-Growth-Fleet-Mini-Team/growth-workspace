// Mi1 phần lõi (spec mục 6, CRON-06, CRON-08; D-27): áp phương án mặc định cho mục quá hạn,
// brief sáng và Digest tuần. Toàn bộ là truy vấn và hàm tính, không gọi LLM ($0 token).
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { insertAgentRun } from "../db/queue.ts";
import { buildWoBoard } from "../db/wo.ts";
import { monthToDateCostUsd } from "../metrics/cost.ts";
import { decisionAgeHours, decisionRate, gate2Week, loadForecast, median } from "../metrics/queue-health.ts";
import { vnDate } from "../time.ts";

const HUMAN_DECISIONS = ["confirm", "edit", "reject", "escalate", "pii_flag"] as const;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Thứ Hai của tuần chứa ngày date (YYYY-MM-DD).
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

// Áp mặc định ("giữ nháp") cho mọi mục còn chờ đã quá hạn. Chạy lại không áp trùng. Ghi một agent_runs của Mi1.
export function applyDefaults(db: Database, now: Date, trigger = "cron-06"): { applied: number; agentRunId: string } {
  const at = now.toISOString();
  const due = db
    .query(
      `SELECT i.id, i.default_action FROM queue_items i JOIN queue_item_state s ON s.id = i.id
       WHERE s.state = 'pending' AND i.item_type <> 'system_notice' AND i.due_at < ?`,
    )
    .all(at) as { id: string; default_action: string }[];
  const agentRunId = Bun.randomUUIDv7();
  db.transaction(() => {
    insertAgentRun(db, {
      id: agentRunId, agent: "mi1", trigger, prompt_version: "none", eval_version: "none", model: "none",
      input_tokens: 0, output_tokens: 0, cost_usd: 0, status: "succeeded", started_at: at, finished_at: at,
    });
    const ins = db.prepare(
      "INSERT INTO queue_defaults (id, item_id, default_action, applied_at, agent_run_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT (item_id) DO NOTHING",
    );
    for (const d of due) ins.run(Bun.randomUUIDv7(), d.id, d.default_action, at, agentRunId);
  })();
  return { applied: due.length, agentRunId };
}

type ItemFacts = { id: string; item_type: string; queue_date: string; created_at: string; state: string; decided_at: string | null };

function itemFacts(db: Database, where: string, params: string[]): ItemFacts[] {
  return db
    .query(
      `SELECT i.id, i.item_type, i.queue_date, i.created_at, s.state,
         (SELECT MIN(e.created_at) FROM queue_events e WHERE e.item_id = i.id
            AND e.action IN (${HUMAN_DECISIONS.map(() => "?").join(",")})) AS decided_at
       FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE ${where}`,
    )
    .all(...HUMAN_DECISIONS, ...params) as ItemFacts[];
}

function costSince(db: Database, fromIso: string, toIso: string): number {
  return (db.query("SELECT COALESCE(SUM(cost_usd), 0) AS v FROM agent_runs WHERE started_at >= ? AND started_at < ?").get(fromIso, toIso) as { v: number }).v;
}

export type Brief = {
  date: string;
  today: { type: string; total: number; pending: number }[];
  todayTotal: { total: number; pending: number };
  carryover: { count: number; oldestHours: number | null };
  defaultsLast24h: number;
  escalatedWaiting: number;
  wo: { escalate: number; remind: number; backlog: number; importedAt: string | null };
  monthCostUsd: number;
  monthCapUsd: number;
  forecastItems: number;
};

export function buildBrief(db: Database, now: Date): Brief {
  const date = vnDate(now);
  const todays = itemFacts(db, "i.queue_date = ? AND i.item_type <> 'system_notice'", [date]);
  const types = [...new Set(todays.map((i) => i.item_type))].sort();
  const carry = itemFacts(db, "i.queue_date < ? AND i.item_type <> 'system_notice'", [date]).filter((i) => i.state === "pending");
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const wo = buildWoBoard(db, now);
  // Dự báo: 7 ngày lịch trước hôm nay, bỏ Chủ nhật (Amy làm thứ Hai tới thứ Bảy, A-06).
  const days = Array.from({ length: 7 }, (_, k) => addDays(date, -(k + 1))).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0);
  const perDay = days.map(
    (d) => (db.query("SELECT COUNT(*) AS n FROM queue_items WHERE queue_date = ? AND item_type <> 'system_notice'").get(d) as { n: number }).n,
  );
  return {
    date,
    today: types.map((t) => ({ type: t, total: todays.filter((i) => i.item_type === t).length, pending: todays.filter((i) => i.item_type === t && i.state === "pending").length })),
    todayTotal: { total: todays.length, pending: todays.filter((i) => i.state === "pending").length },
    carryover: { count: carry.length, oldestHours: carry.length ? Math.max(...carry.map((i) => decisionAgeHours(i.created_at, null, now))) : null },
    defaultsLast24h: (db.query("SELECT COUNT(*) AS n FROM queue_defaults WHERE applied_at >= ?").get(since) as { n: number }).n,
    // Mark chỉ xem (K-02) nên mục escalate không bao giờ tự đóng: chỉ đếm 7 ngày gần nhất.
    escalatedWaiting: (db.query(
      "SELECT COUNT(*) AS n FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE s.state = 'escalate' AND i.queue_date >= ?",
    ).get(addDays(date, -7)) as { n: number }).n,
    wo: { escalate: wo.escalate.length, remind: wo.remind.length, backlog: wo.backlog.length, importedAt: wo.importedAt },
    monthCostUsd: monthToDateCostUsd(db.query("SELECT cost_usd, started_at FROM agent_runs").all() as { cost_usd: number; started_at: string }[], now),
    monthCapUsd: LLM_MONTHLY_CAP_USD,
    forecastItems: loadForecast(perDay),
  };
}

export type Digest = {
  weekStart: string;
  weekEnd: string; // ngày cuối (Chủ nhật)
  prevWeek: string;
  created: { type: string; count: number }[];
  decisions: { action: string; count: number }[];
  defaultsApplied: number;
  decisionRate: number | null;
  openDays: number;
  gate2: boolean;
  medianAgeHours: number | null;
  maxAgeHours: number | null;
  longest: { id: string; type: string; queueDate: string; ageHours: number; state: string }[];
  nbaOutcomes: { outcome: string; count: number }[];
  woTouches: number;
  costUsd: number;
};

// Tuần tính theo queue_date (giờ Việt Nam), từ thứ Hai tới Chủ nhật.
export function buildDigest(db: Database, weekStart: string, now: Date): Digest {
  const weekEnd = addDays(weekStart, 6);
  const fromIso = new Date(Date.parse(`${weekStart}T00:00:00+07:00`)).toISOString();
  const toIso = new Date(Date.parse(`${addDays(weekStart, 7)}T00:00:00+07:00`)).toISOString();
  const items = itemFacts(db, "i.queue_date >= ? AND i.queue_date <= ? AND i.item_type <> 'system_notice'", [weekStart, weekEnd]);
  const count = <K extends string>(keys: K[]) => [...new Set(keys)].sort().map((k) => ({ k, n: keys.filter((x) => x === k).length }));
  const decided = items.filter((i) => i.decided_at !== null);
  const firstAction = decided.map((i) => (db.query(
    `SELECT action FROM queue_events WHERE item_id = ? AND action IN (${HUMAN_DECISIONS.map(() => "?").join(",")}) ORDER BY created_at, id LIMIT 1`,
  ).get(i.id, ...HUMAN_DECISIONS) as { action: string }).action);
  const rate = decisionRate(items.length, decided.length);
  const openDays = new Set(
    (db.query("SELECT created_at FROM queue_events WHERE action = 'queue_opened' AND actor = 'amy' AND created_at >= ? AND created_at < ?").all(fromIso, toIso) as { created_at: string }[])
      .map((e) => vnDate(new Date(e.created_at))),
  ).size;
  const ages = items.map((i) => ({ i, h: decisionAgeHours(i.created_at, i.decided_at, now) }));
  const ids = items.map((i) => i.id);
  const outcomes = ids.length
    ? (db.query(`SELECT payload FROM queue_events WHERE action = 'rm_outcome' AND item_id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { payload: string }[])
        .map((e) => String((JSON.parse(e.payload) as { outcome?: string }).outcome ?? "?"))
    : [];
  return {
    weekStart,
    weekEnd,
    prevWeek: addDays(weekStart, -7),
    created: count(items.map((i) => i.item_type)).map(({ k, n }) => ({ type: k, count: n })),
    decisions: count(firstAction).map(({ k, n }) => ({ action: k, count: n })),
    defaultsApplied: items.filter((i) => i.state === "default_applied").length,
    decisionRate: rate,
    openDays,
    gate2: gate2Week(openDays, rate),
    medianAgeHours: median(ages.map((a) => a.h)),
    maxAgeHours: ages.length ? Math.max(...ages.map((a) => a.h)) : null,
    longest: ages.sort((a, b) => b.h - a.h).slice(0, 5).map(({ i, h }) => ({ id: i.id, type: i.item_type, queueDate: i.queue_date, ageHours: h, state: i.state })),
    nbaOutcomes: count(outcomes).map(({ k, n }) => ({ outcome: k, count: n })),
    woTouches: (db.query("SELECT COUNT(*) AS n FROM wo_touches WHERE created_at >= ? AND created_at < ?").get(fromIso, toIso) as { n: number }).n,
    costUsd: costSince(db, fromIso, toIso),
  };
}
