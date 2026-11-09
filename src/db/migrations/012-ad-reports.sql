-- Báo cáo quảng cáo theo tuần cho Mi1-mkt-01 (spec mục 6, mục 8 tầng 2; D-39). Mọi bảng chỉ thêm.
-- Nguồn: CSV xuất từ Meta Ads Manager hoặc Google Ads (cổng "Meta Ads, Google Ads", adapter tải file).
-- Allowlist: tên chiến dịch, tên quảng cáo, impressions, clicks, chi tiêu, frequency. Không có dữ liệu khách.
CREATE TABLE ad_imports (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('meta','google')),
  week_start  TEXT NOT NULL      -- thứ Hai, YYYY-MM-DD
);
CREATE TABLE ad_rows (
  import_id    TEXT NOT NULL REFERENCES ad_imports(id),
  row_no       INTEGER NOT NULL,
  campaign     TEXT,
  ad           TEXT NOT NULL,
  impressions  INTEGER NOT NULL,
  clicks       INTEGER NOT NULL,
  spend        REAL NOT NULL,
  frequency    REAL,             -- Google Ads không có
  PRIMARY KEY (import_id, row_no)
);
CREATE TRIGGER ad_imports_no_update BEFORE UPDATE ON ad_imports BEGIN SELECT RAISE(ABORT, 'append_only:ad_imports'); END;
CREATE TRIGGER ad_imports_no_delete BEFORE DELETE ON ad_imports BEGIN SELECT RAISE(ABORT, 'append_only:ad_imports'); END;
CREATE TRIGGER ad_rows_no_update BEFORE UPDATE ON ad_rows BEGIN SELECT RAISE(ABORT, 'append_only:ad_rows'); END;
CREATE TRIGGER ad_rows_no_delete BEFORE DELETE ON ad_rows BEGIN SELECT RAISE(ABORT, 'append_only:ad_rows'); END;
