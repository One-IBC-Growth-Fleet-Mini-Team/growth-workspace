-- Trạng thái verify quảng cáo Meta theo quốc gia (Mi1-mkt-03; spec tầng 1B; D-41). Chỉ thêm.
-- Nguồn: Mark ghi tay ở trang /channels sau khi xem trên Meta Business Suite.
CREATE TABLE meta_country_verifications (
  id          TEXT PRIMARY KEY,
  checked_at  TEXT NOT NULL,
  actor       TEXT NOT NULL,
  country     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('not_started','pending','verified','rejected')),
  note        TEXT
);
CREATE TRIGGER meta_country_verifications_no_update BEFORE UPDATE ON meta_country_verifications BEGIN SELECT RAISE(ABORT, 'append_only:meta_country_verifications'); END;
CREATE TRIGGER meta_country_verifications_no_delete BEFORE DELETE ON meta_country_verifications BEGIN SELECT RAISE(ABORT, 'append_only:meta_country_verifications'); END;
