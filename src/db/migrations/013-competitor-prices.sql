-- Giá gói của đối thủ cho Mi1-mkt-04 (spec mục 6, tầng 4; D-40). Chỉ thêm.
-- Nguồn: Team MKT thu từ web công khai của đối thủ, tải CSV ở /competitors (adapter tải file; market-scan-mcp để sau).
CREATE TABLE competitor_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE competitor_prices (
  import_id     TEXT NOT NULL REFERENCES competitor_imports(id),
  row_no        INTEGER NOT NULL,
  competitor    TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,   -- tên đã chuẩn hoá như sheet FINAL
  tier          TEXT NOT NULL CHECK (tier IN ('starter','grow','premium')),
  price_usd     REAL NOT NULL,
  source_url    TEXT,
  collected_on  TEXT,            -- YYYY-MM-DD
  PRIMARY KEY (import_id, row_no)
);
CREATE TRIGGER competitor_imports_no_update BEFORE UPDATE ON competitor_imports BEGIN SELECT RAISE(ABORT, 'append_only:competitor_imports'); END;
CREATE TRIGGER competitor_imports_no_delete BEFORE DELETE ON competitor_imports BEGIN SELECT RAISE(ABORT, 'append_only:competitor_imports'); END;
CREATE TRIGGER competitor_prices_no_update BEFORE UPDATE ON competitor_prices BEGIN SELECT RAISE(ABORT, 'append_only:competitor_prices'); END;
CREATE TRIGGER competitor_prices_no_delete BEFORE DELETE ON competitor_prices BEGIN SELECT RAISE(ABORT, 'append_only:competitor_prices'); END;
