-- Bậc đối tác để tính hoa hồng theo bậc (D-71): referrer, partner, premier. partner_rows chỉ cho reseller hoặc referrer
-- (CHECK, migration 006), nên bậc lưu riêng. Chỉ thêm.
CREATE TABLE partner_tiers (
  import_id   TEXT NOT NULL REFERENCES partner_imports(id),
  partner_id  TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('referrer','partner','premier')),
  PRIMARY KEY (import_id, partner_id)
);
CREATE TRIGGER partner_tiers_no_update BEFORE UPDATE ON partner_tiers BEGIN SELECT RAISE(ABORT, 'append_only:partner_tiers'); END;
CREATE TRIGGER partner_tiers_no_delete BEFORE DELETE ON partner_tiers BEGIN SELECT RAISE(ABORT, 'append_only:partner_tiers'); END;
