// Tiện ích test: Growth DB trên file tạm, nạp snapshot CRM tổng hợp.
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Database } from "bun:sqlite";
import { openReadWrite } from "../../src/db/open.ts";
import { migrate } from "../../src/db/migrate.ts";
import { insertEtlRun, insertEtlRunStatus, insertSnapshotSucceeded, type CrmSnapshot } from "../../src/db/crm-snapshot.ts";
import type { ClientRow, OpportunityRow } from "../../src/db/types.ts";

export function tempDbPath(): { path: string; cleanup: () => void } {
  const path = `${tmpdir()}/gw-test-${crypto.randomUUID()}.sqlite`;
  return { path, cleanup: () => { for (const s of ["", "-wal", "-shm"]) rmSync(path + s, { force: true }); } };
}

export function freshDb(path = ":memory:"): Database {
  const db = openReadWrite(path);
  migrate(db);
  return db;
}

export function opp(id: string, over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    opportunity_id: id,
    client_id: null,
    owner_rm_id: "RM_A",
    stage: "Quotation",
    close_date: "2026-11-15",
    last_modified_at: null,
    has_next_step: 0,
    jurisdiction_code: null,
    service_family: null,
    industry_code: null,
    rejection_reason_code: null,
    ...over,
  };
}

export function client(id: string, over: Partial<ClientRow> = {}): ClientRow {
  return { client_id: id, is_reseller_end_client: 0, industry_code: null, first_won_at: null, ...over };
}

export function seedSnapshot(
  db: Database,
  snap: Partial<CrmSnapshot>,
  opts: { id?: string; at?: string; status?: "succeeded" | "failed" } = {},
): string {
  const id = opts.id ?? Bun.randomUUIDv7();
  const at = opts.at ?? "2026-11-02T06:30:00.000Z";
  insertEtlRun(db, id, "crm", at);
  if (opts.status === "failed") {
    insertEtlRunStatus(db, id, "failed", at, {}, "CRM_AUTH");
    return id;
  }
  insertSnapshotSucceeded(
    db,
    id,
    { opportunities: [], clients: [], leads: [], clientServices: [], ...snap },
    at,
  );
  return id;
}
