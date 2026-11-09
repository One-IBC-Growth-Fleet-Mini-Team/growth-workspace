-- Sự kiện web, CRM cho Mi1-data-01: độ phủ ID và gãy tracking (spec mục 6, tầng 3A, Phụ lục A; D-36). Mọi bảng chỉ thêm.
-- Nguồn: CSV xuất sự kiện (GA4, log server hoặc file MobCEC gửi), cột theo tên trường ở Phụ lục A1, A2.
-- Allowlist: event_id, tên sự kiện, ngày (giờ VN), session_id, có contact_id hay không, danh sách trường thiếu.
-- KHÔNG lưu giá trị các tham số khác (utm, URL, contact_id, email lọt vào...): chỉ đếm.
CREATE TABLE data_event_imports (
  id                 TEXT PRIMARY KEY,
  actor              TEXT NOT NULL,
  imported_at        TEXT NOT NULL,
  email_cells        INTEGER NOT NULL,   -- số ô chứa email (vi phạm A1, A6.4)
  forbidden_columns  TEXT                -- tên cột cấm (email, phone, name...), cách nhau dấu phẩy
);
CREATE TABLE data_events (
  import_id   TEXT NOT NULL REFERENCES data_event_imports(id),
  row_no      INTEGER NOT NULL,
  event_key   TEXT NOT NULL,     -- event_id, hoặc import_id:row_no khi thiếu
  event_name  TEXT NOT NULL,
  event_date  TEXT,              -- YYYY-MM-DD giờ Việt Nam; NULL khi event_time sai dạng
  session_id  TEXT,
  linked      INTEGER NOT NULL CHECK (linked IN (0,1)),  -- contact_captured có contact_id
  missing     TEXT,              -- trường bắt buộc còn thiếu; NULL khi đủ hoặc sự kiện ngoài 15 sự kiện
  known       INTEGER NOT NULL CHECK (known IN (0,1)),   -- thuộc 15 sự kiện Phụ lục A2
  PRIMARY KEY (import_id, row_no)
);
CREATE TRIGGER data_event_imports_no_update BEFORE UPDATE ON data_event_imports BEGIN SELECT RAISE(ABORT, 'append_only:data_event_imports'); END;
CREATE TRIGGER data_event_imports_no_delete BEFORE DELETE ON data_event_imports BEGIN SELECT RAISE(ABORT, 'append_only:data_event_imports'); END;
CREATE TRIGGER data_events_no_update BEFORE UPDATE ON data_events BEGIN SELECT RAISE(ABORT, 'append_only:data_events'); END;
CREATE TRIGGER data_events_no_delete BEFORE DELETE ON data_events BEGIN SELECT RAISE(ABORT, 'append_only:data_events'); END;
