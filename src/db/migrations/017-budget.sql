-- Kết quả theo chiến dịch và nháp đổi ngân sách, tầng 5 (spec mục 8, 9 draft_budget_change; D-45). Mọi bảng chỉ thêm.
-- Nháp chỉ ghi quyết định của người; không có code nào đổi ngân sách trên nền tảng quảng cáo (quy tắc 4).
CREATE TABLE campaign_imports (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, imported_at TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('file','mcp'))
);
CREATE TABLE campaign_results (
  import_id         TEXT NOT NULL REFERENCES campaign_imports(id),
  campaign          TEXT NOT NULL,
  platform          TEXT,
  period_start      TEXT,
  period_end        TEXT,
  spend_usd         REAL NOT NULL,
  leads             INTEGER,
  closed_won        INTEGER,
  gross_margin_usd  REAL NOT NULL,   -- đã lọc khách cuối của reseller (Internal Control)
  cycle_complete    INTEGER NOT NULL CHECK (cycle_complete IN (0,1)),
  PRIMARY KEY (import_id, campaign)
);
CREATE TABLE budget_drafts (
  id TEXT PRIMARY KEY, campaign TEXT NOT NULL, period_end TEXT, net_usd REAL NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (campaign, period_end)
);
CREATE TABLE budget_decisions (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES budget_drafts(id), decision TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  note TEXT, decided_at TEXT NOT NULL, actor TEXT NOT NULL
);
CREATE TRIGGER campaign_imports_no_update BEFORE UPDATE ON campaign_imports BEGIN SELECT RAISE(ABORT, 'append_only:campaign_imports'); END;
CREATE TRIGGER campaign_imports_no_delete BEFORE DELETE ON campaign_imports BEGIN SELECT RAISE(ABORT, 'append_only:campaign_imports'); END;
CREATE TRIGGER campaign_results_no_update BEFORE UPDATE ON campaign_results BEGIN SELECT RAISE(ABORT, 'append_only:campaign_results'); END;
CREATE TRIGGER campaign_results_no_delete BEFORE DELETE ON campaign_results BEGIN SELECT RAISE(ABORT, 'append_only:campaign_results'); END;
CREATE TRIGGER budget_drafts_no_update BEFORE UPDATE ON budget_drafts BEGIN SELECT RAISE(ABORT, 'append_only:budget_drafts'); END;
CREATE TRIGGER budget_drafts_no_delete BEFORE DELETE ON budget_drafts BEGIN SELECT RAISE(ABORT, 'append_only:budget_drafts'); END;
CREATE TRIGGER budget_decisions_no_update BEFORE UPDATE ON budget_decisions BEGIN SELECT RAISE(ABORT, 'append_only:budget_decisions'); END;
CREATE TRIGGER budget_decisions_no_delete BEFORE DELETE ON budget_decisions BEGIN SELECT RAISE(ABORT, 'append_only:budget_decisions'); END;
