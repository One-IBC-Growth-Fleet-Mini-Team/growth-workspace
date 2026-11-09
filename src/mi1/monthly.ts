// Báo cáo tháng (CRON-09, spec mục 10; D-55): gom số đã tính bằng hàm có test cho một tháng dương lịch, không gọi LLM.
// Đề xuất hoa hồng chờ chính sách hoa hồng (partner-mcp calc_commission chưa định nghĩa), nên chỉ báo trạng thái chờ.
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { buildPartnerBoard } from "../db/partners.ts";
import { monthToDateCostUsd } from "../metrics/cost.ts";
import { addDays, vnDate } from "../time.ts";
import { buildDigest, mondayOf } from "./core.ts";

export function previousMonth(now: Date): string {
  const [y, m] = vnDate(now).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function buildMonthly(db: Database, month: string, now: Date) {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const end = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const weeks: { weekStart: string; decisionRate: number | null; gate2: boolean }[] = [];
  for (let w = mondayOf(start) < start ? addDays(mondayOf(start), 7) : start; w <= end; w = addDays(w, 7)) {
    const d = buildDigest(db, w, now);
    weeks.push({ weekStart: w, decisionRate: d.decisionRate, gate2: d.gate2 });
  }
  const costs = db.query("SELECT cost_usd, started_at FROM agent_runs").all() as { cost_usd: number; started_at: string }[];
  const partners = buildPartnerBoard(db, { start, end });
  const lessons = db.query("SELECT kind, title, evidence, created_at AS createdAt FROM knowledge_log WHERE created_at >= ? AND created_at < ? ORDER BY created_at, id")
    .all(new Date(Date.parse(`${start}T00:00:00+07:00`)).toISOString(), new Date(Date.parse(`${addDays(end, 1)}T00:00:00+07:00`)).toISOString()) as { kind: string; title: string; evidence: string; createdAt: string }[];
  return {
    month, start, end, weeks,
    costUsd: monthToDateCostUsd(costs, new Date(`${month}-15T00:00:00Z`)), capUsd: LLM_MONTHLY_CAP_USD,
    partners: { importedAt: partners.importedAt, stats: partners.stats.slice(0, 10), wonDeals: partners.commissionReview.length },
    lessons,
    commission: "pending_policy" as const,
  };
}
