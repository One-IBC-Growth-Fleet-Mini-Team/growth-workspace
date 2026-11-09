-- Hook và điểm tiêu chí cho Mi1-mkt-02 (spec mục 6; D-43). Mọi bảng chỉ thêm.
-- Nguồn: file Team MKT tải lên hoặc tool MCP get_hook_scores của hệ thống SEO/AIO (cổng "Điểm Hook").
CREATE TABLE hook_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('file','mcp')),
  labels       TEXT NOT NULL     -- JSON: nhãn 5 tiêu chí theo thứ tự trọng số
);
CREATE TABLE hook_candidates (
  import_id     TEXT NOT NULL REFERENCES hook_imports(id),
  hook_id       TEXT NOT NULL,
  text          TEXT NOT NULL,
  jurisdiction  TEXT,
  s1 REAL, s2 REAL, s3 REAL, s4 REAL, s5 REAL,
  PRIMARY KEY (import_id, hook_id)
);
CREATE TRIGGER hook_imports_no_update BEFORE UPDATE ON hook_imports BEGIN SELECT RAISE(ABORT, 'append_only:hook_imports'); END;
CREATE TRIGGER hook_imports_no_delete BEFORE DELETE ON hook_imports BEGIN SELECT RAISE(ABORT, 'append_only:hook_imports'); END;
CREATE TRIGGER hook_candidates_no_update BEFORE UPDATE ON hook_candidates BEGIN SELECT RAISE(ABORT, 'append_only:hook_candidates'); END;
CREATE TRIGGER hook_candidates_no_delete BEFORE DELETE ON hook_candidates BEGIN SELECT RAISE(ABORT, 'append_only:hook_candidates'); END;
