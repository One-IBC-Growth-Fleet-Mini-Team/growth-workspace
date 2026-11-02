// Truy vấn đọc snapshot CRM. Luôn đọc snapshot succeeded mới nhất (design doc mục 5.2).
// Dùng bởi crm-read-mcp (kết nối chỉ đọc) và bởi sa-01 cho các trường bổ sung của NBA.
import type { Database } from "bun:sqlite";
import type { ClientRow, ClientServiceRow, LeadRow, OpportunityRow } from "./types.ts";

export type SnapshotRef = { etl_run_id: string; snapshot_at: string };

export class NoSnapshotError extends Error {
  readonly code = "NO_SNAPSHOT";
  constructor() {
    super("NO_SNAPSHOT");
  }
}

export function latestSucceededSnapshot(db: Database): SnapshotRef | null {
  const row = db
    .query(
      `SELECT s.etl_run_id AS etl_run_id, s.finished_at AS snapshot_at
       FROM etl_run_status s
       WHERE s.status = 'succeeded'
       ORDER BY s.finished_at DESC, s.etl_run_id DESC
       LIMIT 1`,
    )
    .get() as SnapshotRef | null;
  return row ?? null;
}

export function requireSnapshot(db: Database): SnapshotRef {
  const s = latestSucceededSnapshot(db);
  if (!s) throw new NoSnapshotError();
  return s;
}

export function snapshotOpportunities(db: Database, etlRunId: string): OpportunityRow[] {
  return db
    .query(
      `SELECT opportunity_id, client_id, owner_rm_id, stage, close_date, last_modified_at, has_next_step,
              jurisdiction_code, service_family, industry_code, rejection_reason_code
       FROM crm_opportunities WHERE etl_run_id = ? ORDER BY opportunity_id`,
    )
    .all(etlRunId) as OpportunityRow[];
}

export function snapshotClient(db: Database, etlRunId: string, clientId: string): ClientRow | null {
  return (
    (db
      .query(
        `SELECT client_id, is_reseller_end_client, industry_code, first_won_at
         FROM crm_clients WHERE etl_run_id = ? AND client_id = ?`,
      )
      .get(etlRunId, clientId) as ClientRow | null) ?? null
  );
}

export function snapshotClients(db: Database, etlRunId: string): ClientRow[] {
  return db
    .query(
      `SELECT client_id, is_reseller_end_client, industry_code, first_won_at
       FROM crm_clients WHERE etl_run_id = ? ORDER BY client_id`,
    )
    .all(etlRunId) as ClientRow[];
}

export function snapshotClientServices(db: Database, etlRunId: string): ClientServiceRow[] {
  return db
    .query("SELECT client_id, product_family FROM crm_client_services WHERE etl_run_id = ? ORDER BY client_id, product_family")
    .all(etlRunId) as ClientServiceRow[];
}

export function snapshotLeads(db: Database, etlRunId: string): LeadRow[] {
  return db
    .query(
      `SELECT lead_id, owner_rm_id, created_at, status, email_hash, phone_hash
       FROM crm_leads WHERE etl_run_id = ? ORDER BY lead_id`,
    )
    .all(etlRunId) as LeadRow[];
}
