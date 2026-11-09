-- Tiến độ chốt giá 45 tài phán và bộ SKD eKYC cho Mi1-mkt-05 (spec mục 1 câu 3, CRON-04; D-32, D-33). Mọi bảng chỉ thêm.
-- Nguồn: file CSV xuất từ sheet "FINAL - Gói & Giá năm 2 & năm 3" và danh sách tên file SKD dán tay.
-- Chỉ lưu giá bán (đã công khai trên web). KHÔNG lưu giá vốn, ghi chú hay thời gian thực hiện.
CREATE TABLE jurisdiction_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE jurisdiction_prices (
  import_id     TEXT NOT NULL REFERENCES jurisdiction_imports(id),
  row_no        INTEGER NOT NULL,   -- số dòng trong file, giữ thứ tự
  jurisdiction  TEXT NOT NULL,      -- tên đã chuẩn hoá (UK, United Kingdom gộp một)
  company_type  TEXT NOT NULL,
  starter       REAL,               -- NULL khi ô là "Get a Quote" hoặc chữ
  grow          REAL,
  premium       REAL,
  renewal       REAL,               -- gia hạn mỗi năm
  renewal_2y    REAL,               -- Starter + 1 năm gia hạn
  renewal_3y    REAL,               -- Starter + 2 năm gia hạn
  PRIMARY KEY (import_id, row_no)
);
CREATE TABLE skd_files (
  import_id  TEXT NOT NULL REFERENCES jurisdiction_imports(id),
  file_name  TEXT NOT NULL,
  PRIMARY KEY (import_id, file_name)
);
CREATE TRIGGER jurisdiction_imports_no_update BEFORE UPDATE ON jurisdiction_imports BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_imports'); END;
CREATE TRIGGER jurisdiction_imports_no_delete BEFORE DELETE ON jurisdiction_imports BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_imports'); END;
CREATE TRIGGER jurisdiction_prices_no_update BEFORE UPDATE ON jurisdiction_prices BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_prices'); END;
CREATE TRIGGER jurisdiction_prices_no_delete BEFORE DELETE ON jurisdiction_prices BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_prices'); END;
CREATE TRIGGER skd_files_no_update BEFORE UPDATE ON skd_files BEGIN SELECT RAISE(ABORT, 'append_only:skd_files'); END;
CREATE TRIGGER skd_files_no_delete BEFORE DELETE ON skd_files BEGIN SELECT RAISE(ABORT, 'append_only:skd_files'); END;
