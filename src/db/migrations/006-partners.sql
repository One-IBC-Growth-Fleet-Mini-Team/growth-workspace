-- Đối tác và reseller cho Mi1-ptn-01 (spec mục 12; D-31). Mọi bảng chỉ thêm.
-- Nguồn: file CSV Amy tải lên (cổng "Đối tác", adapter tải file). [ĐỐI CHIẾU SCHEMA] tên cột thật.
-- Allowlist: mã đối tác, loại, mã deal, mã khách, Stage, Close Date, lợi nhuận ghi nhận. KHÔNG lưu tên đối tác hay khách.
CREATE TABLE partner_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE partner_rows (
  import_id     TEXT NOT NULL REFERENCES partner_imports(id),
  partner_id    TEXT NOT NULL,
  partner_type  TEXT NOT NULL CHECK (partner_type IN ('reseller','referrer')),
  PRIMARY KEY (import_id, partner_id)
);
CREATE TABLE partner_referrals (
  import_id    TEXT NOT NULL REFERENCES partner_imports(id),
  deal_id      TEXT NOT NULL,     -- Opportunity hoặc Order
  partner_id   TEXT NOT NULL,
  client_id    TEXT,
  stage        TEXT NOT NULL,
  close_date   TEXT,              -- YYYY-MM-DD
  profit_usd   REAL,              -- lợi nhuận ghi nhận (Internal Control), NULL nếu chưa có
  PRIMARY KEY (import_id, deal_id)
);
CREATE TRIGGER partner_imports_no_update BEFORE UPDATE ON partner_imports BEGIN SELECT RAISE(ABORT, 'append_only:partner_imports'); END;
CREATE TRIGGER partner_imports_no_delete BEFORE DELETE ON partner_imports BEGIN SELECT RAISE(ABORT, 'append_only:partner_imports'); END;
CREATE TRIGGER partner_rows_no_update BEFORE UPDATE ON partner_rows BEGIN SELECT RAISE(ABORT, 'append_only:partner_rows'); END;
CREATE TRIGGER partner_rows_no_delete BEFORE DELETE ON partner_rows BEGIN SELECT RAISE(ABORT, 'append_only:partner_rows'); END;
CREATE TRIGGER partner_referrals_no_update BEFORE UPDATE ON partner_referrals BEGIN SELECT RAISE(ABORT, 'append_only:partner_referrals'); END;
CREATE TRIGGER partner_referrals_no_delete BEFORE DELETE ON partner_referrals BEGIN SELECT RAISE(ABORT, 'append_only:partner_referrals'); END;
