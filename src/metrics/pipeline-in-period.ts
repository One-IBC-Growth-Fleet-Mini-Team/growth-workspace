// pipeline_in_period (metric-definitions.md): Opportunity có Close Date trong kỳ, kể cả deal
// tạo trước kỳ, nhóm theo Stage. Không lọc theo ngày tạo (luật 5, T-MET-02).
// Kỳ tính cả hai đầu. Việc chỉ lấy Opportunity mở thuộc về tool MCP (bước 5), không thuộc định nghĩa chỉ số.
import type { OpportunityRow } from "../db/types.ts";

export type PipelinePeriod = {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  ownerRmId?: string;
};

export type PipelineStageGroup = { stage: string; count: number; opportunity_ids: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_KEYS = new Set(["periodStart", "periodEnd", "ownerRmId"]);

function assertPeriod(period: PipelinePeriod): void {
  for (const key of Object.keys(period)) {
    if (!PERIOD_KEYS.has(key)) throw new TypeError(`pipeline_in_period: unknown parameter ${key}`);
  }
  if (!DATE_RE.test(period.periodStart) || !DATE_RE.test(period.periodEnd)) {
    throw new TypeError("pipeline_in_period: period must be YYYY-MM-DD");
  }
  if (period.periodStart > period.periodEnd) throw new RangeError("pipeline_in_period: periodStart > periodEnd");
}

export function pipelineInPeriod(
  opportunities: readonly OpportunityRow[],
  period: PipelinePeriod,
): PipelineStageGroup[] {
  assertPeriod(period);
  const groups = new Map<string, string[]>();
  for (const o of opportunities) {
    if (o.close_date === null || !DATE_RE.test(o.close_date)) continue;
    if (o.close_date < period.periodStart || o.close_date > period.periodEnd) continue;
    if (period.ownerRmId !== undefined && o.owner_rm_id !== period.ownerRmId) continue;
    const ids = groups.get(o.stage) ?? [];
    ids.push(o.opportunity_id);
    groups.set(o.stage, ids);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([stage, ids]) => {
      const sorted = [...ids].sort();
      return { stage, count: sorted.length, opportunity_ids: sorted };
    });
}
