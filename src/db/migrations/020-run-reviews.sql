-- Người giám sát đã xem phiên chạy (spec mục 6, quy tắc vận hành 2; D-50). Chỉ thêm; mỗi phiên tối đa một dòng.
CREATE TABLE agent_run_reviews (
  agent_run_id  TEXT PRIMARY KEY REFERENCES agent_runs(id),
  seen_at       TEXT NOT NULL,
  actor         TEXT NOT NULL
);
CREATE TRIGGER agent_run_reviews_no_update BEFORE UPDATE ON agent_run_reviews BEGIN SELECT RAISE(ABORT, 'append_only:agent_run_reviews'); END;
CREATE TRIGGER agent_run_reviews_no_delete BEFORE DELETE ON agent_run_reviews BEGIN SELECT RAISE(ABORT, 'append_only:agent_run_reviews'); END;
