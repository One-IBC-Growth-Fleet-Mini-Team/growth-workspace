// Truy vấn ghi của ETL CRM: etl_runs, etl_run_status (chỉ thêm) và các bảng snapshot crm_*.
import type { Database } from "bun:sqlite";
import type { ClientRow, ClientServiceRow, LeadRow, OpportunityRow } from "./types.ts";

export type CrmSnapshot = {
  opportunities: OpportunityRow[];
  clients: ClientRow[];
  leads: LeadRow[];
  clientServices: ClientServiceRow[];
};

export type SnapshotRowCounts = { opportunity: number; client: number; lead: number; client_service: number };

export function insertEtlRun(db: Database, id: string, source: "crm", startedAt: string): void {
  db.run("INSERT INTO etl_runs (id, source, started_at) VALUES (?, ?, ?)", [id, source, startedAt]);
}

export function insertEtlRunStatus(
  db: Database,
  etlRunId: string,
  status: "succeeded" | "failed",
  finishedAt: string,
  rowCounts: Partial<SnapshotRowCounts>,
  errorCode: string | null,
): void {
  db.run(
    "INSERT INTO etl_run_status (etl_run_id, status, finished_at, row_counts, error_code) VALUES (?, ?, ?, ?, ?)",
    [etlRunId, status, finishedAt, JSON.stringify(rowCounts), errorCode],
  );
}

// Ghi toàn bộ snapshot và trạng thái succeeded trong một transaction: lỗi thì không còn dòng dở.
export function insertSnapshotSucceeded(
  db: Database,
  etlRunId: string,
  snap: CrmSnapshot,
  finishedAt: string,
): SnapshotRowCounts {
  const counts: SnapshotRowCounts = {
    opportunity: snap.opportunities.length,
    client: snap.clients.length,
    lead: snap.leads.length,
    client_service: snap.clientServices.length,
  };
  db.transaction(() => {
    const opp = db.prepare(
      `INSERT INTO crm_opportunities (etl_run_id, opportunity_id, client_id, owner_rm_id, stage, close_date,
         last_modified_at, has_next_step, jurisdiction_code, service_family, industry_code, rejection_reason_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const o of snap.opportunities) {
      opp.run(
        etlRunId,
        o.opportunity_id,
        o.client_id,
        o.owner_rm_id,
        o.stage,
        o.close_date,
        o.last_modified_at,
        o.has_next_step,
        o.jurisdiction_code,
        o.service_family,
        o.industry_code,
        o.rejection_reason_code,
      );
    }
    const cli = db.prepare(
      `INSERT INTO crm_clients (etl_run_id, client_id, is_reseller_end_client, industry_code, first_won_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const c of snap.clients) cli.run(etlRunId, c.client_id, c.is_reseller_end_client, c.industry_code, c.first_won_at);
    const lead = db.prepare(
      `INSERT INTO crm_leads (etl_run_id, lead_id, owner_rm_id, created_at, status, email_hash, phone_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of snap.leads) {
      lead.run(etlRunId, l.lead_id, l.owner_rm_id, l.created_at, l.status, l.email_hash, l.phone_hash);
    }
    const svc = db.prepare(
      "INSERT INTO crm_client_services (etl_run_id, client_id, product_family) VALUES (?, ?, ?)",
    );
    for (const s of snap.clientServices) svc.run(etlRunId, s.client_id, s.product_family);
    insertEtlRunStatus(db, etlRunId, "succeeded", finishedAt, counts, null);
  })();
  return counts;
}
