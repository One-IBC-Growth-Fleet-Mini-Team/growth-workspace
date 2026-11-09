// Mã lý do từ chối Amy đã xác nhận (hoặc đã sửa) trong kỳ, để đẩy về bước 1 của creative-factory-v2 (tầng 4; D-54).
import type { Database } from "bun:sqlite";
import { repeatedReasons } from "../metrics/repeated-reasons.ts";
import { addDays, vnDate } from "../time.ts";

export const TIER4_PARAMS = { minCount: 3, windowDays: 28 } as const; // giá trị tạm, chờ Amy và Mark chốt

export function repeatedRejections(db: Database, now: Date, p: { minCount: number; windowDays: number } = TIER4_PARAMS) {
  const from = addDays(vnDate(now), -(p.windowDays - 1));
  // Quyết định mới nhất của người trên mỗi mục; chỉ confirm hoặc edit mới tính.
  const rows = db.query(`SELECT i.payload, e.action, e.payload AS edited FROM queue_items i
    JOIN queue_events e ON e.id = (SELECT id FROM queue_events x WHERE x.item_id = i.id AND x.action IN ('confirm','edit','reject','pii_flag') ORDER BY x.created_at DESC, x.id DESC LIMIT 1)
    WHERE i.item_type = 'reason_code' AND i.queue_date >= ? AND e.action IN ('confirm','edit')`).all(from) as { payload: string; action: string; edited: string | null }[];
  const codes = rows.map((r) => String((JSON.parse(r.action === "edit" && r.edited ? r.edited : r.payload) as { proposal?: { primary?: string } }).proposal?.primary ?? ""));
  return repeatedReasons(codes.filter(Boolean), p);
}
