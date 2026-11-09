-- Issue log nghiệm thu sandbox8 cho Mi1-mkt-05 (spec CRON-04; D-35). Mọi bảng chỉ thêm.
-- Nguồn: CSV xuất từ tab "Bug" và "Test Cases" của file test case sandbox8 do MobCEC giữ.
-- Allowlist: mã lỗi, mức độ, tiêu chí, trạng thái, tiêu đề, URL, ngày phát hiện; mã test case, tiêu chí, trạng thái.
-- KHÔNG lưu: người xử lý, tester, bước tái hiện, ảnh chụp, ghi chú.
CREATE TABLE sandbox_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE sandbox_bugs (
  import_id   TEXT NOT NULL REFERENCES sandbox_imports(id),
  bug_id      TEXT NOT NULL,
  severity    TEXT NOT NULL,
  criterion   TEXT,
  status      TEXT NOT NULL,
  title       TEXT,
  url         TEXT,
  found_date  TEXT,          -- YYYY-MM-DD
  PRIMARY KEY (import_id, bug_id)
);
CREATE TABLE sandbox_cases (
  import_id  TEXT NOT NULL REFERENCES sandbox_imports(id),
  case_id    TEXT NOT NULL,
  criterion  TEXT,
  status     TEXT NOT NULL,
  PRIMARY KEY (import_id, case_id)
);
CREATE TRIGGER sandbox_imports_no_update BEFORE UPDATE ON sandbox_imports BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_imports'); END;
CREATE TRIGGER sandbox_imports_no_delete BEFORE DELETE ON sandbox_imports BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_imports'); END;
CREATE TRIGGER sandbox_bugs_no_update BEFORE UPDATE ON sandbox_bugs BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_bugs'); END;
CREATE TRIGGER sandbox_bugs_no_delete BEFORE DELETE ON sandbox_bugs BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_bugs'); END;
CREATE TRIGGER sandbox_cases_no_update BEFORE UPDATE ON sandbox_cases BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_cases'); END;
CREATE TRIGGER sandbox_cases_no_delete BEFORE DELETE ON sandbox_cases BEGIN SELECT RAISE(ABORT, 'append_only:sandbox_cases'); END;
