-- Mật khẩu theo tài khoản (D-79): scripts/add-user.ts tạo mật khẩu tạm (phải đổi ở lần đăng nhập đầu), trang /password
-- đổi mật khẩu. Chỉ thêm; dòng mới nhất của mỗi tài khoản thắng. Chưa có dòng thì dùng mã băm trong biến môi trường.
CREATE TABLE user_passwords (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL CHECK (user_id IN ('amy','mark','mkt','bod')),
  hash         TEXT NOT NULL,     -- argon2id
  must_change  INTEGER NOT NULL CHECK (must_change IN (0,1)),
  set_at       TEXT NOT NULL,
  set_by       TEXT NOT NULL
);
CREATE TRIGGER user_passwords_no_update BEFORE UPDATE ON user_passwords BEGIN SELECT RAISE(ABORT, 'append_only:user_passwords'); END;
CREATE TRIGGER user_passwords_no_delete BEFORE DELETE ON user_passwords BEGIN SELECT RAISE(ABORT, 'append_only:user_passwords'); END;
