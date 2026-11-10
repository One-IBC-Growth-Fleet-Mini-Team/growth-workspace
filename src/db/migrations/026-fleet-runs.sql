-- Vết điều phối của Mi1 (PHẦN 7B, D-82). Chỉ thêm.
-- Mỗi yêu cầu tới Mi1 (/ask, CRON-06) là một lượt chạy cha (fleet_sessions); mỗi lần gọi thuyền viên là một lượt
-- chạy con (fleet_steps). Không lưu câu hỏi gốc hay dữ liệu khách: chỉ bản tóm tắt đã qua lọc R1 và số đếm.
CREATE TABLE fleet_sessions (
  id             TEXT PRIMARY KEY,
  trigger        TEXT NOT NULL,         -- 'ask', 'cron-06'
  actor          TEXT NOT NULL,
  input_summary  TEXT NOT NULL,
  started_at     TEXT NOT NULL
);
CREATE TABLE fleet_steps (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES fleet_sessions(id),
  seq             INTEGER NOT NULL,
  crew_id         TEXT NOT NULL,
  tool            TEXT NOT NULL,
  input_summary   TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('succeeded','failed','blocked')),
  result_summary  TEXT NOT NULL,
  confidence      REAL,
  gates           TEXT NOT NULL,        -- JSON: các cổng đã qua
  cost_usd        REAL NOT NULL,
  agent_run_id    TEXT REFERENCES agent_runs(id),
  started_at      TEXT NOT NULL,
  finished_at     TEXT NOT NULL,
  UNIQUE (session_id, seq)
);
CREATE TABLE fleet_session_ends (
  session_id   TEXT PRIMARY KEY REFERENCES fleet_sessions(id),
  status       TEXT NOT NULL CHECK (status IN ('succeeded','failed','blocked')),
  reason       TEXT,
  finished_at  TEXT NOT NULL
);
CREATE TRIGGER fleet_sessions_no_update BEFORE UPDATE ON fleet_sessions BEGIN SELECT RAISE(ABORT, 'append_only:fleet_sessions'); END;
CREATE TRIGGER fleet_sessions_no_delete BEFORE DELETE ON fleet_sessions BEGIN SELECT RAISE(ABORT, 'append_only:fleet_sessions'); END;
CREATE TRIGGER fleet_steps_no_update BEFORE UPDATE ON fleet_steps BEGIN SELECT RAISE(ABORT, 'append_only:fleet_steps'); END;
CREATE TRIGGER fleet_steps_no_delete BEFORE DELETE ON fleet_steps BEGIN SELECT RAISE(ABORT, 'append_only:fleet_steps'); END;
CREATE TRIGGER fleet_session_ends_no_update BEFORE UPDATE ON fleet_session_ends BEGIN SELECT RAISE(ABORT, 'append_only:fleet_session_ends'); END;
CREATE TRIGGER fleet_session_ends_no_delete BEFORE DELETE ON fleet_session_ends BEGIN SELECT RAISE(ABORT, 'append_only:fleet_session_ends'); END;
