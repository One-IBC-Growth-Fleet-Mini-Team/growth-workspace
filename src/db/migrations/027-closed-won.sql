-- Deal Closed Won cho trang persona của Team MKT (D-86). Chỉ thêm.
-- Không lưu tên khách, email, số điện thoại, mã Account hay mã Opportunity: chỉ mã băm của Opportunity (để biết
-- dòng trùng) và các thuộc tính dùng để gom nhóm. Persona chỉ được dựng từ dữ liệu thật đã nạp, không từ dữ liệu mẫu.
CREATE TABLE closed_won_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL,
  deals        INTEGER NOT NULL,
  skipped      INTEGER NOT NULL
);
CREATE TABLE closed_won_deals (
  import_id       TEXT NOT NULL REFERENCES closed_won_imports(id),
  deal_ref        TEXT NOT NULL,     -- SHA-256 rút gọn của Opportunity ID
  close_date      TEXT,
  jurisdiction    TEXT,
  service_family  TEXT,
  industry        TEXT,
  country         TEXT,
  reseller        INTEGER,           -- 1, 0 hoặc NULL khi file không có
  amount_usd      REAL,
  PRIMARY KEY (import_id, deal_ref)
);
CREATE TRIGGER closed_won_imports_no_update BEFORE UPDATE ON closed_won_imports BEGIN SELECT RAISE(ABORT, 'append_only:closed_won_imports'); END;
CREATE TRIGGER closed_won_imports_no_delete BEFORE DELETE ON closed_won_imports BEGIN SELECT RAISE(ABORT, 'append_only:closed_won_imports'); END;
CREATE TRIGGER closed_won_deals_no_update BEFORE UPDATE ON closed_won_deals BEGIN SELECT RAISE(ABORT, 'append_only:closed_won_deals'); END;
CREATE TRIGGER closed_won_deals_no_delete BEFORE DELETE ON closed_won_deals BEGIN SELECT RAISE(ABORT, 'append_only:closed_won_deals'); END;
