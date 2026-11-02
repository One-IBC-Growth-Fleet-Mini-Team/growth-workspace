// Ba tool của crm-read-mcp (design doc mục 5.2). Hàm thuần trên kết nối DB chỉ đọc.
// Mọi kết quả kèm etl_run_id và snapshot_at. Không tool nào trả mã băm.
import type { Database } from "bun:sqlite";
import { NBA_PARAMS } from "../../config.ts";
import { requireSnapshot, snapshotClient, snapshotLeads, snapshotOpportunities, type SnapshotRef } from "../../db/crm-read.ts";
import { pipelineInPeriod, type PipelineStageGroup } from "../../metrics/pipeline-in-period.ts";
import { isResellerEndClient, type ResellerFlag } from "../../metrics/reseller-flag.ts";

export type PipelineArgs = { period_start: string; period_end: string; owner_rm_id?: string };
export type PipelineResult = SnapshotRef & { groups: PipelineStageGroup[] };

// Opportunity mở có Close Date trong kỳ, nhóm theo Stage (luật 5). Không có tham số ngày tạo.
export function getPipelineByCloseDate(db: Database, args: PipelineArgs): PipelineResult {
  const snap = requireSnapshot(db);
  const closed = new Set(NBA_PARAMS.closedStages);
  const open = snapshotOpportunities(db, snap.etl_run_id).filter((o) => !closed.has(o.stage));
  const period =
    args.owner_rm_id === undefined
      ? { periodStart: args.period_start, periodEnd: args.period_end }
      : { periodStart: args.period_start, periodEnd: args.period_end, ownerRmId: args.owner_rm_id };
  return { ...snap, groups: pipelineInPeriod(open, period) };
}

export type ResellerResult = SnapshotRef & {
  client_id: string;
  is_reseller_end_client: ResellerFlag;
  source: "crm_field" | "missing";
};

// Không suy đoán: trường trống hoặc client không có trong snapshot đều là "unknown".
export function checkResellerFlag(db: Database, args: { client_id: string }): ResellerResult {
  const snap = requireSnapshot(db);
  const row = snapshotClient(db, snap.etl_run_id, args.client_id);
  const flag = row === null ? "unknown" : isResellerEndClient(row.is_reseller_end_client);
  return { ...snap, client_id: args.client_id, is_reseller_end_client: flag, source: flag === "unknown" ? "missing" : "crm_field" };
}

export type DuplicateGroup = { match_on: "email" | "phone"; lead_ids: string[]; owner_rm_ids: string[] };
export type DuplicateResult = SnapshotRef & { groups: DuplicateGroup[] };

// Nhóm Lead chung email_hash hoặc phone_hash. Có lead_id thì chỉ trả nhóm chứa Lead đó.
// Tra theo client_id chưa làm được: snapshot chưa có liên kết Lead với Client ([ĐỐI CHIẾU SCHEMA]).
export function findDuplicateLeads(db: Database, args: { lead_id?: string }): DuplicateResult {
  const snap = requireSnapshot(db);
  const leads = snapshotLeads(db, snap.etl_run_id);
  const groups: DuplicateGroup[] = [];
  for (const matchOn of ["email", "phone"] as const) {
    const byHash = new Map<string, typeof leads>();
    for (const l of leads) {
      const h = matchOn === "email" ? l.email_hash : l.phone_hash;
      if (h === null) continue;
      const list = byHash.get(h) ?? [];
      list.push(l);
      byHash.set(h, list);
    }
    const sorted = [...byHash.values()]
      .filter((list) => list.length > 1)
      .map((list) => list.map((l) => l).sort((a, b) => a.lead_id.localeCompare(b.lead_id)))
      .sort((a, b) => a[0]!.lead_id.localeCompare(b[0]!.lead_id));
    for (const list of sorted) {
      if (args.lead_id !== undefined && !list.some((l) => l.lead_id === args.lead_id)) continue;
      groups.push({
        match_on: matchOn,
        lead_ids: list.map((l) => l.lead_id),
        owner_rm_ids: [...new Set(list.map((l) => l.owner_rm_id ?? "unknown"))].sort(),
      });
    }
  }
  return { ...snap, groups };
}
