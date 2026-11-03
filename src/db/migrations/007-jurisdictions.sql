-- Tiến độ 45 tài phán và bộ SKD cho Mi1-mkt-05 (spec mục 6, CRON-04; D-32). Mọi bảng chỉ thêm.
-- Nguồn: file CSV tải lên (cổng "Bảng giá và SKD", adapter tải file). [ĐỐI CHIẾU SCHEMA] tên cột thật.
-- Allowlist: mã tài phán, trạng thái giá, version bảng giá, loại file SKD, trạng thái file. KHÔNG lưu số tiền hay ghi chú.
CREATE TABLE jurisdiction_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE jurisdiction_prices (
  import_id      TEXT NOT NULL REFERENCES jurisdiction_imports(id),
  code           TEXT NOT NULL,     -- mã tài phán, viết hoa
  price_status   TEXT NOT NULL,
  price_version  TEXT,
  PRIMARY KEY (import_id, code)
);
CREATE TABLE jurisdiction_skd (
  import_id  TEXT NOT NULL REFERENCES jurisdiction_imports(id),
  code       TEXT NOT NULL,
  file_type  TEXT NOT NULL,
  status     TEXT NOT NULL,
  PRIMARY KEY (import_id, code, file_type)
);
CREATE TRIGGER jurisdiction_imports_no_update BEFORE UPDATE ON jurisdiction_imports BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_imports'); END;
CREATE TRIGGER jurisdiction_imports_no_delete BEFORE DELETE ON jurisdiction_imports BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_imports'); END;
CREATE TRIGGER jurisdiction_prices_no_update BEFORE UPDATE ON jurisdiction_prices BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_prices'); END;
CREATE TRIGGER jurisdiction_prices_no_delete BEFORE DELETE ON jurisdiction_prices BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_prices'); END;
CREATE TRIGGER jurisdiction_skd_no_update BEFORE UPDATE ON jurisdiction_skd BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_skd'); END;
CREATE TRIGGER jurisdiction_skd_no_delete BEFORE DELETE ON jurisdiction_skd BEGIN SELECT RAISE(ABORT, 'append_only:jurisdiction_skd'); END;
