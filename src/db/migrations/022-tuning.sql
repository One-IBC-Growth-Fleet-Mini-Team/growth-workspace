-- Đổi ngưỡng escalate 0,8 và trọng số chấm Hook (spec mục 6 "Quyền chỉnh ngưỡng"; D-53). Chỉ thêm.
-- Chỉ Mark đề xuất và kích hoạt; giá trị mới có hiệu lực khi bộ eval đã chạy lại sau lúc đề xuất và pass.
CREATE TABLE tuning_changes (
  id           TEXT PRIMARY KEY,
  param        TEXT NOT NULL CHECK (param IN ('confidence_escalate_below','hook_weights')),
  value        TEXT NOT NULL,     -- JSON: số hoặc mảng 5 số
  proposed_at  TEXT NOT NULL,
  actor        TEXT NOT NULL
);
CREATE TABLE tuning_activations (
  change_id     TEXT PRIMARY KEY REFERENCES tuning_changes(id),
  activated_at  TEXT NOT NULL,
  eval_ran_at   TEXT NOT NULL,    -- lượt eval đã pass sau lúc đề xuất
  actor         TEXT NOT NULL
);
CREATE TRIGGER tuning_changes_no_update BEFORE UPDATE ON tuning_changes BEGIN SELECT RAISE(ABORT, 'append_only:tuning_changes'); END;
CREATE TRIGGER tuning_changes_no_delete BEFORE DELETE ON tuning_changes BEGIN SELECT RAISE(ABORT, 'append_only:tuning_changes'); END;
CREATE TRIGGER tuning_activations_no_update BEFORE UPDATE ON tuning_activations BEGIN SELECT RAISE(ABORT, 'append_only:tuning_activations'); END;
CREATE TRIGGER tuning_activations_no_delete BEFORE DELETE ON tuning_activations BEGIN SELECT RAISE(ABORT, 'append_only:tuning_activations'); END;
