// Điểm ưu tiên của một mục NBA (design doc mục 5.5, xếp hạng). Đặt ở metrics vì là phép tính số có test.
//   base  = trọng số Stage × 10 + độ gần Close Date (0 tới 3) + 2 nếu RM không chăm deal (nhắc trước)
//   score = base × factor, factor trong (0, 1]: luật 3 chỉ được hạ, không bao giờ nâng (T-NBA-R3b).
// Trọng số Stage là giá trị tạm, chờ Amy (Q-09).
export type PriorityArgs = {
  stageWeight: number;
  daysToClose: number | null; // âm nếu Close Date đã qua
  rmActive: boolean | null;
  factor: number;
};

export function nbaPriorityScore(a: PriorityArgs): number {
  if (!(a.factor > 0 && a.factor <= 1)) throw new RangeError("nba_priority: factor must be in (0, 1]");
  if (!Number.isFinite(a.stageWeight) || a.stageWeight < 0) throw new RangeError("nba_priority: stageWeight");
  const closeness = a.daysToClose === null ? 0 : (Math.max(0, 30 - Math.max(0, a.daysToClose)) / 30) * 3;
  const inactivity = a.rmActive === false ? 2 : 0;
  return (a.stageWeight * 10 + closeness + inactivity) * a.factor;
}

// Số ngày từ hôm nay tới Close Date (ngày YYYY-MM-DD).
export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}
