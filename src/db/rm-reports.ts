// Truy vấn ghi bảng rm_reports (chỉ thêm). Tin sửa có source_version mới thì thành dòng mới;
// cùng (source_message_ref, source_version) thì bỏ qua, không đè (T-PARSE-05).
import type { Database } from "bun:sqlite";

export type RmReportInsert = {
  id: string;
  report_date: string;
  rm_id: string | null;
  source_message_ref: string;
  source_link: string;
  source_version: string;
  parsed: string | null;
  pii_check: "passed" | "blocked";
  redaction_stats: string;
  parser_version: string;
  agent_run_id: string;
  created_at: string;
};

// Trả true nếu đã thêm dòng mới, false nếu phiên bản này đã có.
export function insertRmReport(db: Database, r: RmReportInsert): boolean {
  const res = db
    .query(
      `INSERT INTO rm_reports (id, report_date, rm_id, source_message_ref, source_link, source_version, parsed,
         pii_check, redaction_stats, parser_version, agent_run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source_message_ref, source_version) DO NOTHING`,
    )
    .run(
      r.id,
      r.report_date,
      r.rm_id,
      r.source_message_ref,
      r.source_link,
      r.source_version,
      r.parsed,
      r.pii_check,
      r.redaction_stats,
      r.parser_version,
      r.agent_run_id,
      r.created_at,
    );
  return res.changes > 0;
}
