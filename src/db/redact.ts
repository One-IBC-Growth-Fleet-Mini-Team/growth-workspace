// Xoá có kiểm soát trên bảng chỉ thêm (D-12, design doc mục 7.5). CHỈ gọi từ scripts/redact-row.ts,
// do người vận hành chạy tay; web và agent không import được (có test tĩnh).
// Trong một transaction: tạm bỏ trigger chặn UPDATE, thay nội dung bằng {"redacted":true}, dựng lại
// trigger từ định nghĩa gốc, ghi redaction_log cho từng dòng. Lỗi thì rollback cả khối.
// Xoá một mục hàng chờ thì xoá luôn bản sửa của mục (sự kiện có payload, trang hiển thị bản sửa mới nhất)
// và rm_reports nguồn của mục tự báo và mã lý do, vì cùng một nội dung nằm ở cả ba chỗ.
import type { Database } from "bun:sqlite";

const TARGETS = {
  queue_items: "payload",
  queue_events: "payload",
  rm_reports: "parsed",
} as const;

export type RedactTable = keyof typeof TARGETS;
const REDACTED = '{"redacted":true}';

function rowsToRedact(db: Database, table: RedactTable, id: string): { table: RedactTable; id: string }[] {
  if (!db.query(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw new Error("REDACT_ROW_NOT_FOUND");
  const rows: { table: RedactTable; id: string }[] = [{ table, id }];
  if (table !== "queue_items") return rows;
  const item = db.query("SELECT item_type, subject_ref FROM queue_items WHERE id = ?").get(id) as { item_type: string; subject_ref: string | null };
  for (const e of db.query("SELECT id FROM queue_events WHERE item_id = ? AND payload IS NOT NULL").all(id) as { id: string }[]) {
    rows.push({ table: "queue_events", id: e.id });
  }
  if ((item.item_type === "self_report" || item.item_type === "reason_code") && item.subject_ref) {
    if (db.query("SELECT 1 FROM rm_reports WHERE id = ? AND parsed IS NOT NULL").get(item.subject_ref)) {
      rows.push({ table: "rm_reports", id: item.subject_ref });
    }
  }
  return rows;
}

export function redactRow(
  db: Database,
  args: { table: RedactTable; id: string; reasonCode: string; operator: string; now: Date },
): void {
  if (!Object.hasOwn(TARGETS, args.table)) throw new Error("REDACT_TABLE_NOT_ALLOWED");
  if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(args.reasonCode)) throw new Error("REDACT_BAD_REASON");
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(args.operator)) throw new Error("REDACT_BAD_OPERATOR");

  db.transaction(() => {
    const rows = rowsToRedact(db, args.table, args.id);
    for (const table of new Set(rows.map((r) => r.table))) {
      const trigger = `${table}_no_update`;
      const def = db.query("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(trigger) as { sql: string } | null;
      if (!def) throw new Error("REDACT_TRIGGER_MISSING");
      db.run(`DROP TRIGGER ${trigger}`);
      for (const r of rows.filter((x) => x.table === table)) {
        db.run(`UPDATE ${table} SET ${TARGETS[table]} = ? WHERE id = ?`, [REDACTED, r.id]);
      }
      db.run(def.sql);
    }
    for (const r of rows) {
      db.run(
        "INSERT INTO redaction_log (id, table_name, row_id, reason_code, operator, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [Bun.randomUUIDv7(), r.table, r.id, args.reasonCode, args.operator, args.now.toISOString()],
      );
    }
  })();
}
