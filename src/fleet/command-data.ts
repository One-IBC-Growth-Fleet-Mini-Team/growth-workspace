// Gom số cho /command (D-82). Đếm bằng SQL và hàm trong src/metrics, không bằng LLM.
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { agentRunCosts } from "../db/queue.ts";
import { monthToDateCostUsd, sumCostUsd } from "../metrics/cost.ts";
import { loadForecast } from "../metrics/queue-health.ts";
import type { CommandData } from "../queue/views/command.ts";
import { latestSession } from "./orchestrate.ts";
import { crewStatus } from "./registry.ts";

export function buildCommandData(db: Database, now: Date, disabled: ReadonlySet<string>, evalScores: Record<string, number | null>): CommandData {
  const session = latestSession(db);
  const waiting = db.query(
    `SELECT i.id, i.item_type, (SELECT MAX(e.created_at) FROM queue_events e WHERE e.item_id = i.id AND e.action = 'escalate') AS at
     FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE s.state = 'escalate' ORDER BY at`,
  ).all() as { id: string; item_type: string; at: string }[];
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const perDay = db.query("SELECT COUNT(*) AS n FROM queue_items WHERE queue_date >= ? AND queue_date < ? GROUP BY queue_date").all(since, now.toISOString().slice(0, 10)) as { n: number }[];
  return {
    session,
    sessionCostUsd: sumCostUsd(session?.steps ?? []),
    crew: crewStatus(db, now, disabled, evalScores),
    waitingMark: waiting.map((w) => ({ id: w.id, itemType: w.item_type, ageHours: Math.floor((now.getTime() - Date.parse(w.at)) / 3_600_000) })),
    forecastPerDay: loadForecast(perDay.map((r) => r.n)),
    monthCostUsd: monthToDateCostUsd(agentRunCosts(db), now),
    capUsd: LLM_MONTHLY_CAP_USD,
  };
}
