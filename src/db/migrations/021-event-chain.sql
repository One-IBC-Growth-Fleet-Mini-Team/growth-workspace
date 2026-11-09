-- Chuỗi 12 ID (spec mục 5; D-52): với mỗi sự kiện đã nạp, chỉ lưu TÊN các trường ID của chuỗi có giá trị, không lưu giá trị.
CREATE TABLE data_event_chain (
  import_id  TEXT NOT NULL,
  row_no     INTEGER NOT NULL,
  ids        TEXT NOT NULL,      -- tên trường cách nhau dấu phẩy, ví dụ "session_id,asset_id"; rỗng khi không có
  PRIMARY KEY (import_id, row_no),
  FOREIGN KEY (import_id, row_no) REFERENCES data_events(import_id, row_no)
);
CREATE TRIGGER data_event_chain_no_update BEFORE UPDATE ON data_event_chain BEGIN SELECT RAISE(ABORT, 'append_only:data_event_chain'); END;
CREATE TRIGGER data_event_chain_no_delete BEFORE DELETE ON data_event_chain BEGIN SELECT RAISE(ABORT, 'append_only:data_event_chain'); END;
