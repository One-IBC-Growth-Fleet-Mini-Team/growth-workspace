-- Nhật ký bài học và quyết định (spec mục 1 câu 5, mục 9 growth-mcp log_lesson, log_decision; D-48). Chỉ thêm.
-- Mỗi mục gắn bằng chứng truy vấn lại được (đường dẫn trang Growth kèm tham số, ví dụ /ads-overview?week=2026-11-02).
CREATE TABLE knowledge_log (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('lesson','decision')),
  created_at  TEXT NOT NULL,
  actor       TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,      -- đã qua lọc R1
  evidence    TEXT NOT NULL,      -- đường dẫn tương đối trong Growth, bắt đầu bằng /
  tags        TEXT
);
CREATE TRIGGER knowledge_log_no_update BEFORE UPDATE ON knowledge_log BEGIN SELECT RAISE(ABORT, 'append_only:knowledge_log'); END;
CREATE TRIGGER knowledge_log_no_delete BEFORE DELETE ON knowledge_log BEGIN SELECT RAISE(ABORT, 'append_only:knowledge_log'); END;
