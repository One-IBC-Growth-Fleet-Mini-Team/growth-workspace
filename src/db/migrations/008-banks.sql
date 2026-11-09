-- Ma trận ngân hàng của Bank Team cho gợi ý mở tài khoản (D-34). Mọi bảng chỉ thêm.
-- Nguồn: CSV xuất từ file "[One IBC] BANKING INSTRUCTION": sheet "Product Matrix - Bank Name X Support" (bắt buộc)
-- và sheet "Bank ( Core Information for Clients)" (không bắt buộc).
-- KHÔNG lưu: liên hệ đối tác, link referral, case study khách, danh sách quốc tịch.
CREATE TABLE bank_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE bank_support (
  import_id     TEXT NOT NULL REFERENCES bank_imports(id),
  bank          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('emi','traditional')),
  jurisdiction  TEXT NOT NULL,     -- nơi thành lập công ty, tên đã chuẩn hoá
  supported     INTEGER NOT NULL CHECK (supported IN (0,1)),
  PRIMARY KEY (import_id, bank, jurisdiction)
);
CREATE TABLE bank_info (
  import_id        TEXT NOT NULL REFERENCES bank_imports(id),
  bank             TEXT NOT NULL,
  complexity       TEXT,           -- LOW, MEDIUM, HIGH
  processing_time  TEXT,
  initial_deposit  TEXT,
  meeting          TEXT,
  PRIMARY KEY (import_id, bank)
);
CREATE TRIGGER bank_imports_no_update BEFORE UPDATE ON bank_imports BEGIN SELECT RAISE(ABORT, 'append_only:bank_imports'); END;
CREATE TRIGGER bank_imports_no_delete BEFORE DELETE ON bank_imports BEGIN SELECT RAISE(ABORT, 'append_only:bank_imports'); END;
CREATE TRIGGER bank_support_no_update BEFORE UPDATE ON bank_support BEGIN SELECT RAISE(ABORT, 'append_only:bank_support'); END;
CREATE TRIGGER bank_support_no_delete BEFORE DELETE ON bank_support BEGIN SELECT RAISE(ABORT, 'append_only:bank_support'); END;
CREATE TRIGGER bank_info_no_update BEFORE UPDATE ON bank_info BEGIN SELECT RAISE(ABORT, 'append_only:bank_info'); END;
CREATE TRIGGER bank_info_no_delete BEFORE DELETE ON bank_info BEGIN SELECT RAISE(ABORT, 'append_only:bank_info'); END;
