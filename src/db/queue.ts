// Truy vấn của hàng chờ và nhật ký phiên (design doc mục 4.4, 4.5). Mọi bảng ở đây là chỉ thêm.
import type { Database } from "bun:sqlite";

export type QueueItemType = "self_report" | "reason_code" | "nba" | "system_notice";
export type QueueAction = "queue_opened" | "confirm" | "edit" | "reject" | "escalate" | "rm_outcome" | "pii_flag";

export type QueueItemInsert = {
  id: string;
  item_type: QueueItemType;
  queue_date: string;
  dedupe_key: string;
  subject_ref: string | null;
  payload: string;
  rules_fired: string;
  confidence: number;
  confidence_inputs: string;
  assignee: string;
  default_action: string;
  due_at: string;
  etl_run_id: string | null;
  agent_run_id: string;
  created_at: string;
};

export type AgentRunInsert = {
  id: string;
  agent: string;
  trigger: string;
  prompt_version: string;
  eval_version: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  status: string;
  started_at: string;
  finished_at: string;
};

export function insertAgentRun(db: Database, r: AgentRunInsert): void {
  db.query(
    `INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens,
       cost_usd, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.agent, r.trigger, r.prompt_version, r.eval_version, r.model, r.input_tokens, r.output_tokens, r.cost_usd, r.status, r.started_at, r.finished_at);
}

// Chi phí mọi phiên của cả fleet: trần 100 USD/tháng là của cả fleet (spec mục 10), không riêng một agent (D-58).
export function agentRunCosts(db: Database): { cost_usd: number; started_at: string }[] {
  return db.query("SELECT cost_usd, started_at FROM agent_runs").all() as {
    cost_usd: number;
    started_at: string;
  }[];
}

// Trả true nếu thêm mục mới; dedupe_key trùng thì bỏ qua (chạy lại job không sinh mục trùng).
export function insertQueueItem(db: Database, i: QueueItemInsert): boolean {
  const res = db
    .query(
      `INSERT INTO queue_items (id, item_type, queue_date, dedupe_key, subject_ref, payload, rules_fired, confidence,
         confidence_inputs, assignee, default_action, due_at, etl_run_id, agent_run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING`,
    )
    .run(i.id, i.item_type, i.queue_date, i.dedupe_key, i.subject_ref, i.payload, i.rules_fired, i.confidence,
      i.confidence_inputs, i.assignee, i.default_action, i.due_at, i.etl_run_id, i.agent_run_id, i.created_at);
  return res.changes > 0;
}

export function rmReportExists(db: Database, sourceMessageRef: string, sourceVersion: string): boolean {
  return (
    db.query("SELECT 1 FROM rm_reports WHERE source_message_ref = ? AND source_version = ?").get(sourceMessageRef, sourceVersion) !== null
  );
}

export function listRmDirectory(db: Database): { rm_id: string; display_name: string; teams_user_id: string | null; active: number }[] {
  return db.query("SELECT rm_id, display_name, teams_user_id, active FROM rm_directory ORDER BY rm_id").all() as {
    rm_id: string;
    display_name: string;
    teams_user_id: string | null;
    active: number;
  }[];
}

export type QueueEventInsert = {
  id: string;
  item_id: string | null;
  actor: string;
  action: QueueAction;
  payload: string | null;
  created_at: string;
};

export function insertQueueEvent(db: Database, e: QueueEventInsert): void {
  db.query("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    e.id, e.item_id, e.actor, e.action, e.payload, e.created_at,
  );
}

export type QueueItemRow = QueueItemInsert & { state: string };

export function getQueueItem(db: Database, id: string): QueueItemRow | null {
  return (
    (db
      .query("SELECT i.*, s.state AS state FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE i.id = ?")
      .get(id) as QueueItemRow | null) ?? null
  );
}

export function listQueueItems(db: Database, queueDate: string): QueueItemRow[] {
  return db
    .query(
      `SELECT i.*, s.state AS state FROM queue_items i JOIN queue_item_state s ON s.id = i.id
       WHERE i.queue_date = ? ORDER BY i.item_type, i.confidence ASC, i.created_at, i.id`,
    )
    .all(queueDate) as QueueItemRow[];
}

export type QueueEventRow = QueueEventInsert;

export function listItemEvents(db: Database, itemId: string): QueueEventRow[] {
  return db.query("SELECT * FROM queue_events WHERE item_id = ? ORDER BY created_at, id").all(itemId) as QueueEventRow[];
}

// Bản có hiệu lực của mục: payload của sự kiện edit mới nhất, nếu có.
export function latestEditPayload(db: Database, itemId: string): string | null {
  const row = db
    .query("SELECT payload FROM queue_events WHERE item_id = ? AND action = 'edit' ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(itemId) as { payload: string | null } | null;
  return row?.payload ?? null;
}
