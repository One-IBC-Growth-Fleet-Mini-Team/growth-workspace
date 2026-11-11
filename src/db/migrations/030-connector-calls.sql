-- Nhật ký gọi adapter thật (D-96): mỗi lần gọi một ổ cắm ghi thành công hay mã lỗi, để /settings hiện lần gọi thành công
-- gần nhất. Không lưu tham số, nội dung phản hồi hay credential. Chỉ thêm.
CREATE TABLE connector_calls (
  id          TEXT PRIMARY KEY,
  connector   TEXT NOT NULL,
  ok          INTEGER NOT NULL CHECK (ok IN (0,1)),
  error_code  TEXT,
  at          TEXT NOT NULL
);
CREATE TRIGGER connector_calls_no_update BEFORE UPDATE ON connector_calls BEGIN SELECT RAISE(ABORT, 'append_only:connector_calls'); END;
CREATE TRIGGER connector_calls_no_delete BEFORE DELETE ON connector_calls BEGIN SELECT RAISE(ABORT, 'append_only:connector_calls'); END;
