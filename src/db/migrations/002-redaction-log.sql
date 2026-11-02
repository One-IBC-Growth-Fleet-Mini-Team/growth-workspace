-- Nhật ký kiểm toán của xoá có kiểm soát (D-12, design doc mục 7.5). Chỉ thêm.
-- Chỉ ghi bảng, mã dòng, mã lý do, người vận hành; không ghi nội dung đã xoá.
CREATE TABLE redaction_log (
  id           TEXT PRIMARY KEY,
  table_name   TEXT NOT NULL CHECK (table_name IN ('queue_items','queue_events','rm_reports')),
  row_id       TEXT NOT NULL,
  reason_code  TEXT NOT NULL,
  operator     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE TRIGGER redaction_log_no_update BEFORE UPDATE ON redaction_log
  BEGIN SELECT RAISE(ABORT, 'append_only:redaction_log'); END;
CREATE TRIGGER redaction_log_no_delete BEFORE DELETE ON redaction_log
  BEGIN SELECT RAISE(ABORT, 'append_only:redaction_log'); END;
