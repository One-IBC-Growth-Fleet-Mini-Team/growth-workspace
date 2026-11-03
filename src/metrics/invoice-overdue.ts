// invoice_overdue_days (Mi1-sa-01, D-30): số ngày lịch (giờ Việt Nam) invoice chưa thanh toán đã quá hạn.
// Chưa tới hạn hoặc không có hạn thì trả null. Không do LLM tính.
import { vnDate } from "../time.ts";
import { daysBetween } from "./nba-priority.ts";

export function invoiceOverdueDays(dueDate: string | null, now: Date): number | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const d = daysBetween(dueDate, vnDate(now));
  return d > 0 ? d : null;
}
