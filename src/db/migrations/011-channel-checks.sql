-- Sức khoẻ tài khoản kênh cho CRON-02 (3 Business Manager, 3 số WhatsApp Business, 6 Fanpage; D-37). Chỉ thêm.
-- Nguồn: Mark hoặc Amy ghi tay ở trang /channels sau khi tự xem trên Meta (adapter nhập tay).
-- Nhãn là tên gọi nội bộ (ví dụ "WA SG 1"), không phải số điện thoại; ghi chú đã qua lớp lọc PII R1.
CREATE TABLE channel_checks (
  id          TEXT PRIMARY KEY,
  checked_at  TEXT NOT NULL,
  actor       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('bm','wa','fanpage')),
  label       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok','restricted','disabled')),
  note        TEXT
);
CREATE TRIGGER channel_checks_no_update BEFORE UPDATE ON channel_checks BEGIN SELECT RAISE(ABORT, 'append_only:channel_checks'); END;
CREATE TRIGGER channel_checks_no_delete BEFORE DELETE ON channel_checks BEGIN SELECT RAISE(ABORT, 'append_only:channel_checks'); END;
