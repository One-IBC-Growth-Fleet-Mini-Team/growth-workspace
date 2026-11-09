-- Storyboard và lượt chạy Creative Factory (spec mục 7, 9; D-44). Mọi bảng chỉ thêm.
-- Cổng Storyboard: chỉ gọi bước tạo ảnh, video sau khi người duyệt Storyboard (quyết định mới nhất là approve).
CREATE TABLE storyboards (
  creative_ir_id  TEXT PRIMARY KEY,
  hook_id         TEXT,
  jurisdiction    TEXT,
  title           TEXT NOT NULL,
  scenes          TEXT NOT NULL,   -- JSON mảng mô tả cảnh
  created_at      TEXT NOT NULL,
  actor           TEXT NOT NULL
);
CREATE TABLE storyboard_decisions (
  id              TEXT PRIMARY KEY,
  creative_ir_id  TEXT NOT NULL REFERENCES storyboards(creative_ir_id),
  decision        TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  note            TEXT,
  decided_at      TEXT NOT NULL,
  actor           TEXT NOT NULL
);
CREATE TABLE creative_runs (
  id              TEXT PRIMARY KEY,
  creative_ir_id  TEXT NOT NULL REFERENCES storyboards(creative_ir_id),
  run_at          TEXT NOT NULL,
  actor           TEXT NOT NULL,
  qa_status       TEXT,
  assets          INTEGER NOT NULL
);
CREATE TRIGGER storyboards_no_update BEFORE UPDATE ON storyboards BEGIN SELECT RAISE(ABORT, 'append_only:storyboards'); END;
CREATE TRIGGER storyboards_no_delete BEFORE DELETE ON storyboards BEGIN SELECT RAISE(ABORT, 'append_only:storyboards'); END;
CREATE TRIGGER storyboard_decisions_no_update BEFORE UPDATE ON storyboard_decisions BEGIN SELECT RAISE(ABORT, 'append_only:storyboard_decisions'); END;
CREATE TRIGGER storyboard_decisions_no_delete BEFORE DELETE ON storyboard_decisions BEGIN SELECT RAISE(ABORT, 'append_only:storyboard_decisions'); END;
CREATE TRIGGER creative_runs_no_update BEFORE UPDATE ON creative_runs BEGIN SELECT RAISE(ABORT, 'append_only:creative_runs'); END;
CREATE TRIGGER creative_runs_no_delete BEFORE DELETE ON creative_runs BEGIN SELECT RAISE(ABORT, 'append_only:creative_runs'); END;
