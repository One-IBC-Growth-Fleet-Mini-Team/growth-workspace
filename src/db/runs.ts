// Nhật ký phiên chạy của fleet nghiệp vụ (spec mục 6 quy tắc 2; D-50): Mi1 gọi ai, mỗi agent trả bao nhiêu đề xuất,
// tốn bao nhiêu token và tiền, người giám sát đã xem chưa. Chi phí tháng so với trần 100 USD (spec mục 10).
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { monthToDateCostUsd } from "../metrics/cost.ts";

// Người giám sát theo spec mục 6: Amy giữ Mi1-sa-01 và Mi1-ptn-01, Mark giữ Mi1 và các thuyền viên còn lại.
export function supervisorOf(agent: string): "amy" | "mark" {
  return agent === "mi1-sa-01" || agent === "mi1-ptn-01" ? "amy" : "mark";
}

export type RunRow = { id: string; agent: string; trigger: string; model: string; status: string; startedAt: string; inputTokens: number; outputTokens: number; costUsd: number; items: number; supervisor: string; seenBy: string | null };

export function buildRunLog(db: Database, now: Date, limit = 200) {
  const rows = db.query(`SELECT r.id, r.agent, r.trigger, r.model, r.status, r.started_at AS startedAt, r.input_tokens AS inputTokens, r.output_tokens AS outputTokens,
      r.cost_usd AS costUsd, (SELECT COUNT(*) FROM queue_items q WHERE q.agent_run_id = r.id) AS items, v.actor AS seenBy
    FROM agent_runs r LEFT JOIN agent_run_reviews v ON v.agent_run_id = r.id ORDER BY r.started_at DESC, r.id DESC LIMIT ?`).all(limit) as Omit<RunRow, "supervisor">[];
  const costs = db.query("SELECT cost_usd, started_at FROM agent_runs").all() as { cost_usd: number; started_at: string }[];
  const runs: RunRow[] = rows.map((r) => ({ ...r, supervisor: supervisorOf(r.agent) }));
  return { runs, month: now.toISOString().slice(0, 7), monthCostUsd: monthToDateCostUsd(costs, now), capUsd: LLM_MONTHLY_CAP_USD, unseen: runs.filter((r) => !r.seenBy).length };
}

export function markRunSeen(db: Database, runId: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "NOT_SUPERVISOR" {
  const r = db.query("SELECT agent FROM agent_runs WHERE id = ?").get(runId) as { agent: string } | null;
  if (!r) return "NOT_FOUND";
  if (supervisorOf(r.agent) !== opts.actor) return "NOT_SUPERVISOR";
  db.run("INSERT OR IGNORE INTO agent_run_reviews (agent_run_id, seen_at, actor) VALUES (?, ?, ?)", [runId, opts.now.toISOString(), opts.actor]);
  return "ok";
}
