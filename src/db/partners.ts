// Bảng đối tác (Mi1-ptn-01, spec mục 12; D-31): đọc lượt nạp mới nhất, chỉ đọc. Không tự tính hoa hồng:
// chưa có chính sách thì chỉ liệt kê deal chốt thắng để người duyệt (CLAUDE.md quy tắc 4).
import type { Database } from "bun:sqlite";
import { PARTNER_PARAMS } from "../config.ts";
import { partnerPeriodStats } from "../metrics/partner.ts";
import { proposeCommission, type CommissionDeal, type CommissionLine } from "../metrics/commission.ts";
import { getProvisional } from "../provisional.ts";
import { latestSucceededSnapshot } from "./crm-read.ts";

export type PartnerStat = { partner_id: string; partner_type: string; referred: number; won: number; profitUsd: number; wonMissingProfit: number };
export type PartnerBoard = {
  importedAt: string | null;
  period: { start: string; end: string };
  stats: PartnerStat[];
  commissionReview: CommissionLine<CommissionDeal & { close_date: string }>[]; // đề xuất hoa hồng (Tạm, chưa chi; D-71)
  resellerFlagMissing: { client_id: string; partner_id: string }[]; // khách của reseller mà CRM chưa gắn cờ
};

function latest(db: Database, table: string): string | null {
  return (db.query(`SELECT i.id FROM partner_imports i WHERE EXISTS (SELECT 1 FROM ${table} t WHERE t.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1`).get() as { id: string } | null)?.id ?? null;
}

export function buildPartnerBoard(db: Database, period: { start: string; end: string }, p = PARTNER_PARAMS): PartnerBoard {
  const at = (db.query("SELECT MAX(imported_at) AS v FROM partner_imports").get() as { v: string | null }).v;
  const board: PartnerBoard = { importedAt: at, period, stats: [], commissionReview: [], resellerFlagMissing: [] };
  const pid = latest(db, "partner_rows");
  const rid = latest(db, "partner_referrals");
  // Bậc đối tác (D-71) thắng loại chung "referrer"; reseller giữ nguyên.
  const types = new Map(pid ? (db.query(`SELECT r.partner_id, COALESCE(t.tier, r.partner_type) AS partner_type FROM partner_rows r
    LEFT JOIN partner_tiers t ON t.import_id = r.import_id AND t.partner_id = r.partner_id WHERE r.import_id = ?`).all(pid) as { partner_id: string; partner_type: string }[]).map((r) => [r.partner_id, r.partner_type]) : []);
  if (!rid) return board;
  const refs = db.query("SELECT deal_id, partner_id, client_id, stage, close_date, profit_usd FROM partner_referrals WHERE import_id = ? ORDER BY deal_id").all(rid) as
    { deal_id: string; partner_id: string; client_id: string | null; stage: string; close_date: string | null; profit_usd: number | null }[];
  for (const id of [...new Set(refs.map((r) => r.partner_id))].sort()) {
    const s = partnerPeriodStats(refs.filter((r) => r.partner_id === id), period, p.wonStages);
    board.stats.push({ partner_id: id, partner_type: types.get(id) ?? "chưa rõ", ...s });
  }
  board.stats.sort((a, b) => b.profitUsd - a.profitUsd || b.won - a.won || a.partner_id.localeCompare(b.partner_id));
  board.commissionReview = proposeCommission(refs
    .filter((r) => r.close_date !== null && r.close_date >= period.start && r.close_date <= period.end && p.wonStages.includes(r.stage))
    .map((r) => ({ deal_id: r.deal_id, partner_id: r.partner_id, partner_type: types.get(r.partner_id) ?? "chưa rõ", close_date: r.close_date!, profit_usd: r.profit_usd })), getProvisional("commission").value.rates);
  // Cờ reseller (spec mục 12, D-06): khách đến từ đối tác loại reseller phải có is_reseller_end_client = 1 trên CRM.
  const snap = latestSucceededSnapshot(db);
  if (snap) {
    const flagged = new Set((db.query("SELECT client_id FROM crm_clients WHERE etl_run_id = ? AND is_reseller_end_client = 1").all(snap.etl_run_id) as { client_id: string }[]).map((r) => r.client_id));
    const seen = new Set<string>();
    for (const r of refs) {
      if (!r.client_id || types.get(r.partner_id) !== "reseller" || flagged.has(r.client_id) || seen.has(r.client_id)) continue;
      seen.add(r.client_id);
      board.resellerFlagMissing.push({ client_id: r.client_id, partner_id: r.partner_id });
    }
  }
  return board;
}
