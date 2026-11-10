-- Đề xuất chiến lược tuần (GĐ3 việc 2; D-91). Chỉ thêm. Nháp gồm gói số do code tính và lời dẫn đã qua bộ kiểm
-- (mỗi câu trỏ mã số liệu); Mark duyệt thì tóm tắt hiện trên Digest tuần. Không tự áp thay đổi nào.
CREATE TABLE strategy_drafts (
  id            TEXT PRIMARY KEY,
  week_start    TEXT NOT NULL,
  pack          TEXT NOT NULL,      -- JSON gói số
  statements    TEXT NOT NULL,      -- JSON câu đã qua bộ kiểm
  dropped       INTEGER NOT NULL,   -- số câu bị loại
  agent_run_id  TEXT REFERENCES agent_runs(id),
  created_at    TEXT NOT NULL,
  actor         TEXT NOT NULL
);
CREATE TABLE strategy_decisions (
  id          TEXT PRIMARY KEY,
  draft_id    TEXT NOT NULL REFERENCES strategy_drafts(id),
  decision    TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  note        TEXT,
  decided_at  TEXT NOT NULL,
  actor       TEXT NOT NULL
);
CREATE TRIGGER strategy_drafts_no_update BEFORE UPDATE ON strategy_drafts BEGIN SELECT RAISE(ABORT, 'append_only:strategy_drafts'); END;
CREATE TRIGGER strategy_drafts_no_delete BEFORE DELETE ON strategy_drafts BEGIN SELECT RAISE(ABORT, 'append_only:strategy_drafts'); END;
CREATE TRIGGER strategy_decisions_no_update BEFORE UPDATE ON strategy_decisions BEGIN SELECT RAISE(ABORT, 'append_only:strategy_decisions'); END;
CREATE TRIGGER strategy_decisions_no_delete BEFORE DELETE ON strategy_decisions BEGIN SELECT RAISE(ABORT, 'append_only:strategy_decisions'); END;
