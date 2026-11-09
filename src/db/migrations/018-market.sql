-- Quy định và tiếng khách cho Mi1-mkt-03 (spec mục 9 market-scan-mcp; D-46). Chỉ thêm.
-- Tiếng khách đã ẩn danh ở nguồn và chạy lại lớp lọc R1 trước khi lưu; không lưu tên người viết.
CREATE TABLE market_imports (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, imported_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('regulation','reviews')), source TEXT NOT NULL CHECK (source IN ('file','mcp'))
);
CREATE TABLE market_items (
  import_id      TEXT NOT NULL REFERENCES market_imports(id),
  row_no         INTEGER NOT NULL,
  jurisdiction   TEXT,
  title          TEXT,            -- quy định
  summary        TEXT,            -- quy định: tóm tắt; tiếng khách: đoạn đã lọc R1
  effective_date TEXT,            -- quy định, YYYY-MM-DD
  source         TEXT,            -- tiếng khách: nền tảng; quy định: URL nguồn
  theme          TEXT,            -- tiếng khách
  rating         REAL,            -- tiếng khách, 1 tới 5
  PRIMARY KEY (import_id, row_no)
);
CREATE TRIGGER market_imports_no_update BEFORE UPDATE ON market_imports BEGIN SELECT RAISE(ABORT, 'append_only:market_imports'); END;
CREATE TRIGGER market_imports_no_delete BEFORE DELETE ON market_imports BEGIN SELECT RAISE(ABORT, 'append_only:market_imports'); END;
CREATE TRIGGER market_items_no_update BEFORE UPDATE ON market_items BEGIN SELECT RAISE(ABORT, 'append_only:market_items'); END;
CREATE TRIGGER market_items_no_delete BEFORE DELETE ON market_items BEGIN SELECT RAISE(ABORT, 'append_only:market_items'); END;
