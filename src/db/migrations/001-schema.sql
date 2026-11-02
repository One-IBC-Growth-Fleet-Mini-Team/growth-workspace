-- Schema Growth DB lát cắt 01 (design doc mục 4). SQLite, D-02.
-- Thời gian: chuỗi ISO 8601 UTC. Ngày nghiệp vụ: YYYY-MM-DD.
-- Bảng đánh dấu (chỉ thêm) có trigger chặn UPDATE và DELETE ở cuối file.
-- Xoá có kiểm soát (D-12, mục 7.5) chỉ qua script chạy tay, không qua ứng dụng.

-- 4.1 Snapshot CRM. Mọi cột crm_* là [ĐỐI CHIẾU SCHEMA]: tên tạm, chờ tài liệu API CRM (Q-01).
-- Danh sách cột là allowlist: trường không có ở đây thì không bao giờ được lưu.

CREATE TABLE etl_runs (            -- (chỉ thêm; trạng thái kết thúc ghi bằng dòng etl_run_status)
  id            TEXT PRIMARY KEY,  -- UUIDv7 (sắp theo thời gian, thay cho ulid)
  source        TEXT NOT NULL,     -- 'crm'
  started_at    TEXT NOT NULL
);

CREATE TABLE etl_run_status (      -- (chỉ thêm)
  etl_run_id    TEXT NOT NULL REFERENCES etl_runs(id),
  status        TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  finished_at   TEXT NOT NULL,
  row_counts    TEXT NOT NULL,     -- JSON {opportunity: n, ...}
  error_code    TEXT               -- mã lỗi, không có nội dung bản ghi
);

CREATE TABLE crm_opportunities (
  etl_run_id        TEXT NOT NULL REFERENCES etl_runs(id),
  opportunity_id    TEXT NOT NULL,
  client_id         TEXT,          -- NULL nếu chưa gắn Client
  owner_rm_id       TEXT,
  stage             TEXT NOT NULL,
  close_date        TEXT,          -- dùng cho pipeline_in_period
  last_modified_at  TEXT,          -- dùng cho rm_active_on_deal
  has_next_step     INTEGER,       -- 0/1; KHÔNG lưu nội dung NextStep (có thể chứa tên khách)
  jurisdiction_code TEXT,
  service_family    TEXT,          -- IBC01/IBC11/IBC13/IBC14 nếu suy được từ sản phẩm
  industry_code     TEXT,          -- dùng cho luật 3; [ĐỐI CHIẾU SCHEMA] có trường này không
  rejection_reason_code TEXT,      -- trường A4, NULL khi CRM chưa có
  PRIMARY KEY (etl_run_id, opportunity_id)
);
-- KHÔNG lưu: Opportunity.Name (thường chứa tên khách), Description, NextStep text, số tiền.

CREATE TABLE crm_clients (
  etl_run_id              TEXT NOT NULL REFERENCES etl_runs(id),
  client_id               TEXT NOT NULL,
  is_reseller_end_client  INTEGER,  -- 1/0/NULL; NULL = CRM chưa có trường A4 hoặc chưa điền
  industry_code           TEXT,
  first_won_at            TEXT,     -- xác định "khách cũ" (luật 1); [ĐỐI CHIẾU SCHEMA]
  PRIMARY KEY (etl_run_id, client_id)
);
-- KHÔNG lưu: tên Client, địa chỉ, người đại diện, UBO, mọi trường KYC.

CREATE TABLE crm_client_services (  -- nguồn của services_purchased
  etl_run_id     TEXT NOT NULL REFERENCES etl_runs(id),
  client_id      TEXT NOT NULL,
  product_family TEXT NOT NULL,     -- OrderItem → Product2.Family; không dùng WorkOrder.Work_Order_Team__c
  PRIMARY KEY (etl_run_id, client_id, product_family)
);

CREATE TABLE crm_leads (
  etl_run_id   TEXT NOT NULL REFERENCES etl_runs(id),
  lead_id      TEXT NOT NULL,
  owner_rm_id  TEXT,
  created_at   TEXT,
  status       TEXT,
  email_hash   TEXT,                -- hex HMAC-SHA256 (D-05) của email đã chuẩn hoá
  phone_hash   TEXT,                -- như trên, SĐT đã chuẩn hoá
  PRIMARY KEY (etl_run_id, lead_id)
);
CREATE INDEX crm_leads_email ON crm_leads(etl_run_id, email_hash);
CREATE INDEX crm_leads_phone ON crm_leads(etl_run_id, phone_hash);

-- 4.2 Danh bạ RM
CREATE TABLE rm_directory (
  rm_id          TEXT PRIMARY KEY,   -- = owner id trên CRM [ĐỐI CHIẾU SCHEMA]
  display_name   TEXT NOT NULL,      -- tên nhân viên, không phải khách
  teams_user_id  TEXT UNIQUE,        -- AAD object id, để nối tác giả reply với RM
  active         INTEGER NOT NULL DEFAULT 1
);

-- 4.5 Nhật ký phiên chạy agent (đặt trước rm_reports vì rm_reports tham chiếu)
CREATE TABLE agent_runs (           -- (chỉ thêm) spec mục 6, quy tắc vận hành 2
  id              TEXT PRIMARY KEY,
  agent           TEXT NOT NULL,    -- 'mi1-sa-01'
  trigger         TEXT NOT NULL,    -- 'cron-05', 'manual'
  prompt_version  TEXT NOT NULL,
  eval_version    TEXT NOT NULL,    -- bộ eval đã pass gần nhất của prompt này
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cost_usd        REAL NOT NULL,    -- tính bằng hàm từ bảng giá cấu hình, không do LLM
  status          TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  finished_at     TEXT NOT NULL
);

-- 4.3 Tự báo RM đã ẩn danh
CREATE TABLE rm_reports (           -- (chỉ thêm)
  id                  TEXT PRIMARY KEY,
  report_date         TEXT NOT NULL,     -- ngày D-1 theo giờ Việt Nam
  rm_id               TEXT REFERENCES rm_directory(rm_id),  -- NULL nếu chưa map được tác giả
  source_message_ref  TEXT NOT NULL,     -- SHA-256 của (team, channel, message id); không lưu nội dung
  source_link         TEXT NOT NULL,     -- deep link Teams để Amy mở bản gốc
  source_version      TEXT NOT NULL,     -- lastModifiedDateTime của tin; tin sửa thì tạo dòng mới
  parsed              TEXT,              -- JSON đã ẩn danh theo schema mục 5.4; NULL nếu bị chặn
  pii_check           TEXT NOT NULL CHECK (pii_check IN ('passed','blocked')),
  redaction_stats     TEXT NOT NULL,     -- JSON đếm số chỗ đã xoá theo loại, không có giá trị
  parser_version      TEXT NOT NULL,
  agent_run_id        TEXT NOT NULL REFERENCES agent_runs(id),
  created_at          TEXT NOT NULL,
  UNIQUE (source_message_ref, source_version)
);

-- 4.4 Hàng chờ và nhật ký
CREATE TABLE queue_items (          -- (chỉ thêm) nội dung đề xuất là bất biến
  id              TEXT PRIMARY KEY,
  item_type       TEXT NOT NULL CHECK (item_type IN ('self_report','reason_code','nba','system_notice')),
  queue_date      TEXT NOT NULL,     -- ngày D hiển thị trên Hàng chờ
  dedupe_key      TEXT NOT NULL UNIQUE,  -- chạy lại job không sinh mục trùng
  subject_ref     TEXT,              -- opportunity_id, client_id hoặc rm_reports.id
  payload         TEXT NOT NULL,     -- JSON đề xuất, đã ẩn danh
  rules_fired     TEXT NOT NULL,     -- JSON mảng mã luật, ví dụ ["NBA_R1","NBA_R5"]
  confidence      REAL NOT NULL,     -- từ hàm compute_confidence, 0..1
  confidence_inputs TEXT NOT NULL,   -- JSON các thành phần của điểm, để giải thích
  assignee        TEXT NOT NULL,     -- 'amy'
  default_action  TEXT NOT NULL,     -- phương án mặc định (spec mục 6); lát này chỉ hiển thị
  due_at          TEXT NOT NULL,
  etl_run_id      TEXT REFERENCES etl_runs(id),
  agent_run_id    TEXT NOT NULL REFERENCES agent_runs(id),
  created_at      TEXT NOT NULL
);

CREATE TABLE queue_events (         -- (chỉ thêm) mọi thao tác của Amy và Mark
  id          TEXT PRIMARY KEY,
  item_id     TEXT REFERENCES queue_items(id),  -- NULL với queue_opened
  actor       TEXT NOT NULL,        -- id người dùng đã xác thực, không lấy từ form
  action      TEXT NOT NULL CHECK (action IN
              ('queue_opened','confirm','edit','reject','escalate','rm_outcome','pii_flag')),
  payload     TEXT,                 -- edit: bản đã sửa đầy đủ; reject: lý do; rm_outcome: kết quả
  created_at  TEXT NOT NULL
);

CREATE VIEW queue_item_state AS     -- một mục chỉ có một trạng thái
  SELECT i.id,
         COALESCE((SELECT e.action FROM queue_events e
                   WHERE e.item_id = i.id AND e.action IN ('confirm','edit','reject','escalate','pii_flag')
                   ORDER BY e.created_at DESC, e.id DESC LIMIT 1), 'pending') AS state
  FROM queue_items i;

-- Trigger chỉ thêm. Thông điệp lỗi cố định 'append_only:<bảng>' để test và log nhận diện.
CREATE TRIGGER etl_runs_no_update BEFORE UPDATE ON etl_runs
  BEGIN SELECT RAISE(ABORT, 'append_only:etl_runs'); END;
CREATE TRIGGER etl_runs_no_delete BEFORE DELETE ON etl_runs
  BEGIN SELECT RAISE(ABORT, 'append_only:etl_runs'); END;

CREATE TRIGGER etl_run_status_no_update BEFORE UPDATE ON etl_run_status
  BEGIN SELECT RAISE(ABORT, 'append_only:etl_run_status'); END;
CREATE TRIGGER etl_run_status_no_delete BEFORE DELETE ON etl_run_status
  BEGIN SELECT RAISE(ABORT, 'append_only:etl_run_status'); END;

CREATE TRIGGER agent_runs_no_update BEFORE UPDATE ON agent_runs
  BEGIN SELECT RAISE(ABORT, 'append_only:agent_runs'); END;
CREATE TRIGGER agent_runs_no_delete BEFORE DELETE ON agent_runs
  BEGIN SELECT RAISE(ABORT, 'append_only:agent_runs'); END;

CREATE TRIGGER rm_reports_no_update BEFORE UPDATE ON rm_reports
  BEGIN SELECT RAISE(ABORT, 'append_only:rm_reports'); END;
CREATE TRIGGER rm_reports_no_delete BEFORE DELETE ON rm_reports
  BEGIN SELECT RAISE(ABORT, 'append_only:rm_reports'); END;

CREATE TRIGGER queue_items_no_update BEFORE UPDATE ON queue_items
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_items'); END;
CREATE TRIGGER queue_items_no_delete BEFORE DELETE ON queue_items
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_items'); END;

CREATE TRIGGER queue_events_no_update BEFORE UPDATE ON queue_events
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_events'); END;
CREATE TRIGGER queue_events_no_delete BEFORE DELETE ON queue_events
  BEGIN SELECT RAISE(ABORT, 'append_only:queue_events'); END;
