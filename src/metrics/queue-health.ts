// Chỉ số sức khoẻ Hàng chờ cho Mi1 (spec mục 6 "tuổi hàng chờ", CRON-06, CRON-08; D-27). Không LLM.
//   queue_decision_age_hours: từ lúc mục được tạo tới quyết định đầu tiên của người; chưa quyết thì tới hiện tại.
//   decision_rate: số mục người đã quyết / số mục được tạo trong kỳ (mặc định áp tự động không tính là quyết).
//   gate2_week: Cổng 2 (D-10) trong một tuần: Amy mở Hàng chờ ít nhất 3 ngày và quyết ít nhất 80% mục.
//   load_forecast: số mục dự kiến cho một ngày làm việc = trung bình số mục mỗi ngày làm việc có mục trong 7 ngày qua.

export function decisionAgeHours(createdAt: string, decidedAt: string | null, now: Date): number {
  const end = decidedAt ? Date.parse(decidedAt) : now.getTime();
  return Math.max(0, (end - Date.parse(createdAt)) / 3_600_000);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function decisionRate(created: number, decidedByHuman: number): number | null {
  if (created < 0 || decidedByHuman < 0 || decidedByHuman > created) throw new RangeError("decision_rate: counts");
  return created === 0 ? null : decidedByHuman / created;
}

export const GATE2 = { minOpenDays: 3, minDecisionRate: 0.8 } as const;

export function gate2Week(openDays: number, rate: number | null): boolean {
  return openDays >= GATE2.minOpenDays && rate !== null && rate >= GATE2.minDecisionRate;
}

// itemsPerDay: số mục được tạo theo từng ngày làm việc trong 7 ngày qua (ngày không có mục vẫn tính là 0).
export function loadForecast(itemsPerDay: number[]): number {
  if (itemsPerDay.length === 0) return 0;
  return Math.round(itemsPerDay.reduce((a, b) => a + b, 0) / itemsPerDay.length);
}
