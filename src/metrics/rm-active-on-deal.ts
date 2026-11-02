// rm_active_on_deal (metric-definitions.md): RM đang thật sự chăm deal khi NextStep có nội dung,
// hoặc LastModifiedDate lẻ, riêng biệt. LastModifiedDate trùng hàng loạt tới từng giây không tính.
// "Hàng loạt" = số Opportunity trong cùng snapshot có last_modified_at trùng tới từng giây
// từ bulkThreshold trở lên. Ngưỡng là tham số; giá trị tạm ở METRIC_PARAMS, chờ Amy và Mark (Q-09).
// Đếm trên toàn snapshot, không theo từng RM, vì cập nhật hàng loạt thường do import hoặc admin.
import type { OpportunityRow } from "../db/types.ts";

export type RmActiveParams = { bulkThreshold: number };

function toSecond(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19);
}

// Bảng đếm số Opportunity theo giây, tính một lần cho mỗi mảng snapshot (tránh O(n²) khi gọi cho từng deal).
const secondCountsCache = new WeakMap<readonly OpportunityRow[], Map<string, number>>();

function secondCounts(snapshot: readonly OpportunityRow[]): Map<string, number> {
  let counts = secondCountsCache.get(snapshot);
  if (counts) return counts;
  counts = new Map();
  for (const o of snapshot) {
    const s = o.last_modified_at === null ? null : toSecond(o.last_modified_at);
    if (s !== null) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  secondCountsCache.set(snapshot, counts);
  return counts;
}

export function rmActiveOnDeal(
  opportunity: OpportunityRow,
  snapshot: readonly OpportunityRow[],
  params: RmActiveParams,
): boolean {
  if (!Number.isInteger(params.bulkThreshold) || params.bulkThreshold < 2) {
    throw new RangeError("rm_active_on_deal: bulkThreshold must be an integer >= 2");
  }
  if (opportunity.has_next_step === 1) return true;
  if (opportunity.last_modified_at === null) return false;
  const second = toSecond(opportunity.last_modified_at);
  if (second === null) return false;
  return (secondCounts(snapshot).get(second) ?? 0) < params.bulkThreshold;
}
