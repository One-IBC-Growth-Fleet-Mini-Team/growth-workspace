-- Tài khoản theo người (D-97): mỗi người một mã (ví dụ mkt-01), gắn một vai trò amy, mkt, mark hoặc bod. Chỉ thêm;
-- khoá tài khoản là một dòng trong account_disabled (giữ lịch sử). Mật khẩu chuyển sang khoá ngoài tới accounts, không
-- còn giới hạn bốn mã cố định; expires_at là hạn của mật khẩu tạm (NULL với mật khẩu người dùng tự đặt).
CREATE TABLE accounts (
  id          TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 32),
  role        TEXT NOT NULL CHECK (role IN ('amy','mkt','mark','bod')),
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);
CREATE TRIGGER accounts_no_update BEFORE UPDATE ON accounts BEGIN SELECT RAISE(ABORT, 'append_only:accounts'); END;
CREATE TRIGGER accounts_no_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT, 'append_only:accounts'); END;

CREATE TABLE account_disabled (
  account_id   TEXT PRIMARY KEY REFERENCES accounts(id),
  disabled_at  TEXT NOT NULL,
  disabled_by  TEXT NOT NULL
);
CREATE TRIGGER account_disabled_no_update BEFORE UPDATE ON account_disabled BEGIN SELECT RAISE(ABORT, 'append_only:account_disabled'); END;
CREATE TRIGGER account_disabled_no_delete BEFORE DELETE ON account_disabled BEGIN SELECT RAISE(ABORT, 'append_only:account_disabled'); END;

-- Bản cài cũ: tài khoản amy, mark, mkt, bod đã có mật khẩu trong DB giữ nguyên mã, vai trò trùng mã.
INSERT INTO accounts (id, role, created_at, created_by)
  SELECT user_id, user_id, MIN(set_at), 'migration-031' FROM user_passwords GROUP BY user_id;

CREATE TABLE user_passwords_031 (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES accounts(id),
  hash         TEXT NOT NULL,     -- argon2id
  must_change  INTEGER NOT NULL CHECK (must_change IN (0,1)),
  set_at       TEXT NOT NULL,
  set_by       TEXT NOT NULL,
  expires_at   TEXT
);
INSERT INTO user_passwords_031 (id, user_id, hash, must_change, set_at, set_by, expires_at)
  SELECT id, user_id, hash, must_change, set_at, set_by, NULL FROM user_passwords;
DROP TABLE user_passwords;
ALTER TABLE user_passwords_031 RENAME TO user_passwords;
CREATE TRIGGER user_passwords_no_update BEFORE UPDATE ON user_passwords BEGIN SELECT RAISE(ABORT, 'append_only:user_passwords'); END;
CREATE TRIGGER user_passwords_no_delete BEFORE DELETE ON user_passwords BEGIN SELECT RAISE(ABORT, 'append_only:user_passwords'); END;

-- Sổ sự kiện bảo mật (D-97): đăng nhập được, sai, bị khoá, đổi mật khẩu, reset, khoá tài khoản. Chỉ mã tài khoản (có thể
-- là mã người gõ sai, đã cắt 32 ký tự) và loại sự kiện; không mật khẩu, không mã băm, không IP.
CREATE TABLE security_events (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('login_ok','login_failed','login_locked','login_rate_limited','password_changed','password_reset','password_expired','account_created','account_disabled')),
  actor       TEXT NOT NULL
);
CREATE INDEX security_events_at ON security_events (at);
CREATE TRIGGER security_events_no_update BEFORE UPDATE ON security_events BEGIN SELECT RAISE(ABORT, 'append_only:security_events'); END;
CREATE TRIGGER security_events_no_delete BEFORE DELETE ON security_events BEGIN SELECT RAISE(ABORT, 'append_only:security_events'); END;
