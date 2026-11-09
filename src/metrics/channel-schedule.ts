// channel_schedule_draft (spec mục 9 schedule_channel_post DRAFT_ONLY; D-70): nháp lịch đăng một tuần, chỉ từ Creative đã
// đủ điều kiện. Nhịp đăng theo kênh là giá trị tạm (getProvisional("channel_schedule")). Không gọi API đăng.
import { addDays } from "../time.ts";

export type ScheduleItem = { creativeIrId: string; hookId: string | null; jurisdiction: string | null };
export type ScheduleSlot = { date: string; channel: string; creativeIrId: string; hookId: string | null; jurisdiction: string | null };

// n bài mỗi tuần cho một kênh: rải đều 7 ngày từ thứ Hai (ngày thứ floor(i * 7 / n)); Creative xoay vòng theo thứ tự.
export function draftSchedule(items: readonly ScheduleItem[], postsPerWeek: Readonly<Record<string, number>>, weekStart: string): ScheduleSlot[] {
  if (!items.length) return [];
  const out: ScheduleSlot[] = [];
  let k = 0;
  for (const [channel, n] of Object.entries(postsPerWeek).sort((a, b) => a[0].localeCompare(b[0]))) {
    const count = Math.min(Math.floor(n), 7 * 3);
    for (let i = 0; i < count; i++) {
      const it = items[k++ % items.length]!;
      out.push({ date: addDays(weekStart, Math.floor((i * 7) / count)), channel, ...it });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
}
