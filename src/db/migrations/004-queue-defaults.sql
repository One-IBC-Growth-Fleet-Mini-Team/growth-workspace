-- Mi1 áp phương án mặc định cho mục quá hạn (spec mục 6, CRON-06; D-27). Chỉ thêm.
-- Phương án mặc định hiện là "giữ nháp": không ghi đi đâu, không gửi ra ngoài, không có tiền.
-- Quyết định của người (confirm, edit, reject, escalate, pii_flag) luôn thắng mặc định, kể cả khi đến sau.
CREATE TABLE queue_defaults (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL UNIQUE REFERENCES queue_items(id),
  default_action  TEXT NOT NULL,
  applied_at      TEXT NOT NULL,
  agent_run_id    TEXT NOT NULL REFERENCES agent_runs(id)
);
CREATE TRIGGER queue_defaults_no_update BEFORE UPDATE ON queue_defaults
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_defaults'); END;
CREATE TRIGGER queue_defaults_no_delete BEFORE DELETE ON queue_defaults
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_defaults'); END;

DROP VIEW queue_item_state;
CREATE VIEW queue_item_state AS
  SELECT i.id,
         COALESCE((SELECT e.action FROM queue_events e
                   WHERE e.item_id = i.id AND e.action IN ('confirm','edit','reject','escalate','pii_flag')
                   ORDER BY e.created_at DESC, e.id DESC LIMIT 1),
                  (SELECT 'default_applied' FROM queue_defaults d WHERE d.item_id = i.id),
                  'pending') AS state
  FROM queue_items i;
