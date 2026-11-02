// Xoá có kiểm soát trên bảng chỉ thêm (D-12, design doc mục 7.5). CHỈ gọi từ scripts/redact-row.ts,
// do người vận hành chạy tay; web và agent không import được (có test tĩnh).
// Trong một transaction: tạm bỏ trigger chặn UPDATE của đúng bảng đó, thay nội dung của đúng một dòng
// bằng {"redacted":true}, dựng lại trigger từ định nghĩa gốc, ghi redaction_log. Lỗi thì rollback cả khối.
import type { Database } from "bun:sqlite";

const TARGETS = {
  queue_items: "payload",
  queue_events: "payload",
  rm_reports: "parsed",
} as const;

export type RedactTable = keyof typeof TARGETS;

export function redactRow(
  db: Database,
  args: { table: RedactTable; id: string; reasonCode: string; operator: string; now: Date },
): void {
  const column = TARGETS[args.table];
  if (!column) throw new Error("REDACT_TABLE_NOT_ALLOWED");
  if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(args.reasonCode)) throw new Error("REDACT_BAD_REASON");
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(args.operator)) throw new Error("REDACT_BAD_OPERATOR");
  const trigger = `${args.table}_no_update`;
  const def = db.query("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(trigger) as { sql: string } | null;
  if (!def) throw new Error("REDACT_TRIGGER_MISSING");

  db.transaction(() => {
    if (!db.query(`SELECT 1 FROM ${args.table} WHERE id = ?`).get(args.id)) throw new Error("REDACT_ROW_NOT_FOUND");
    db.run(`DROP TRIGGER ${trigger}`);
    db.run(`UPDATE ${args.table} SET ${column} = '{"redacted":true}' WHERE id = ?`, [args.id]);
    db.run(def.sql);
    db.run(
      "INSERT INTO redaction_log (id, table_name, row_id, reason_code, operator, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [Bun.randomUUIDv7(), args.table, args.id, args.reasonCode, args.operator, args.now.toISOString()],
    );
  })();
}
