-- Khung quyết định Awareness/Conversion (docs/spec/khung-quyet-dinh-awareness-conversion.md; D-90). Chỉ thêm.
-- Mỗi tuần một kế hoạch nháp theo tổ hợp Kênh × Tài phán; Mark duyệt hoặc từ chối cả kế hoạch. Không có code nào áp
-- ngân sách lên nền tảng quảng cáo (CLAUDE.md quy tắc 4).
ALTER TABLE campaign_results ADD COLUMN jurisdiction TEXT;
CREATE TABLE budget_plans (
  id           TEXT PRIMARY KEY,
  week_start   TEXT NOT NULL UNIQUE,   -- thứ Hai, giờ Việt Nam
  total_old    REAL NOT NULL,
  total_new    REAL NOT NULL,
  needs_jimmy  INTEGER NOT NULL CHECK (needs_jimmy IN (0,1)),
  params       TEXT NOT NULL,          -- JSON tham số đã dùng (giá trị tạm budget_framework)
  created_at   TEXT NOT NULL,
  actor        TEXT NOT NULL
);
CREATE TABLE budget_plan_lines (
  plan_id        TEXT NOT NULL REFERENCES budget_plans(id),
  seq            INTEGER NOT NULL,
  channel        TEXT NOT NULL,
  jurisdiction   TEXT NOT NULL,
  objective_old  TEXT CHECK (objective_old IN ('A','C')),
  objective_new  TEXT NOT NULL CHECK (objective_new IN ('A','C')),
  budget_old     REAL NOT NULL,
  budget_new     REAL NOT NULL,
  rules          TEXT NOT NULL,        -- JSON: mã cổng và quy tắc đã áp (G1..G4, R1..R6)
  evidence       TEXT NOT NULL,        -- JSON: số dẫn chứng
  confidence     REAL NOT NULL,
  PRIMARY KEY (plan_id, seq)
);
CREATE TABLE budget_plan_decisions (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES budget_plans(id),
  decision    TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  note        TEXT,
  decided_at  TEXT NOT NULL,
  actor       TEXT NOT NULL
);
CREATE TRIGGER budget_plans_no_update BEFORE UPDATE ON budget_plans BEGIN SELECT RAISE(ABORT, 'append_only:budget_plans'); END;
CREATE TRIGGER budget_plans_no_delete BEFORE DELETE ON budget_plans BEGIN SELECT RAISE(ABORT, 'append_only:budget_plans'); END;
CREATE TRIGGER budget_plan_lines_no_update BEFORE UPDATE ON budget_plan_lines BEGIN SELECT RAISE(ABORT, 'append_only:budget_plan_lines'); END;
CREATE TRIGGER budget_plan_lines_no_delete BEFORE DELETE ON budget_plan_lines BEGIN SELECT RAISE(ABORT, 'append_only:budget_plan_lines'); END;
CREATE TRIGGER budget_plan_decisions_no_update BEFORE UPDATE ON budget_plan_decisions BEGIN SELECT RAISE(ABORT, 'append_only:budget_plan_decisions'); END;
CREATE TRIGGER budget_plan_decisions_no_delete BEFORE DELETE ON budget_plan_decisions BEGIN SELECT RAISE(ABORT, 'append_only:budget_plan_decisions'); END;
