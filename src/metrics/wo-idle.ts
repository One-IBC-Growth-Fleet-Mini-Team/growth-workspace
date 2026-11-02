// wo_idle_days (BK-08, D-25): số ngày một Work Order đang mở không có cập nhật.
// File xuất từ CRM không có ngày cập nhật cuối, nên mốc "cập nhật lần cuối" là mốc muộn nhất trong hai mốc:
//   1. lượt nạp đầu tiên của chuỗi lượt nạp liên tiếp gần nhất có cùng Status (Status đổi thì đồng hồ đếm lại;
//      WO mới xuất hiện thì tính từ lượt nạp đầu tiên thấy nó, kể cả WO cũ ở lượt nạp đầu tiên của hệ thống);
//   2. lần Amy ghi nhận "đã cập nhật" gần nhất trên Hàng chờ.
// Đếm theo ngày lịch giờ Việt Nam. Không bao giờ âm.
import { vnDate } from "../time.ts";
import { daysBetween } from "./nba-priority.ts";

export type WoObservation = { at: string; status: string }; // at: ISO UTC của lượt nạp

export function woIdleDays(a: { observations: WoObservation[]; lastTouchAt: string | null; now: Date }): number {
  const obs = [...a.observations].sort((x, y) => x.at.localeCompare(y.at));
  if (obs.length === 0) throw new RangeError("wo_idle_days: observations empty");
  const norm = (s: string) => s.trim().toLowerCase();
  const current = norm(obs.at(-1)!.status);
  let since = obs.at(-1)!.at;
  for (let i = obs.length - 1; i >= 0 && norm(obs[i]!.status) === current; i--) since = obs[i]!.at;
  const last = a.lastTouchAt && a.lastTouchAt > since ? a.lastTouchAt : since;
  return Math.max(0, daysBetween(vnDate(new Date(last)), vnDate(a.now)));
}

export type WoStage = "escalate" | "remind" | "ok";

export function woStage(idleDays: number, p: { remindAfterDays: number; escalateAfterDays: number }): WoStage {
  if (!(p.remindAfterDays > 0 && p.escalateAfterDays >= p.remindAfterDays)) throw new RangeError("wo_stage: thresholds");
  if (idleDays >= p.escalateAfterDays) return "escalate";
  if (idleDays >= p.remindAfterDays) return "remind";
  return "ok";
}
