// Bảng tầng 5 và nháp draft_budget_change (D-45). Nháp tạo bằng code khi tier5_flag; người duyệt chỉ ghi quyết định,
// không có code nào gọi nền tảng quảng cáo. Khoá chéo: TRACKING_DEGRADED thì đóng băng, không tạo nháp mới (spec mục 8).
import type { Database } from "bun:sqlite";
import { tier5Flag } from "../metrics/tier5.ts";
import { winGate } from "../metrics/win-gate.ts";
import { getProvisional } from "../provisional.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { buildDataBoard } from "./data01.ts";

function latestCampaigns(db: Database) {
  const imp = db.query("SELECT id, imported_at AS at FROM campaign_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { id: string; at: string } | null;
  const rows = imp ? (db.query("SELECT campaign, platform, period_start AS periodStart, period_end AS periodEnd, spend_usd AS spendUsd, leads, closed_won AS closedWon, gross_margin_usd AS grossMarginUsd, cycle_complete AS cycle FROM campaign_results WHERE import_id = ? ORDER BY campaign").all(imp.id) as
    { campaign: string; platform: string | null; periodStart: string | null; periodEnd: string | null; spendUsd: number; leads: number | null; closedWon: number | null; grossMarginUsd: number; cycle: number }[]) : [];
  return { importedAt: imp?.at ?? null, campaigns: rows.map((r) => ({ ...r, ...tier5Flag({ spendUsd: r.spendUsd, grossMarginUsd: r.grossMarginUsd, cycleComplete: r.cycle === 1 }) })) };
}

export function proposeBudgetDrafts(db: Database, now: Date): number {
  if (buildDataBoard(db, now).window.degraded) return 0;
  let n = 0;
  const q = db.prepare("INSERT OR IGNORE INTO budget_drafts (id, campaign, period_end, net_usd, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const c of latestCampaigns(db).campaigns) if (c.flag && q.run(Bun.randomUUIDv7(), c.campaign, c.periodEnd ?? "", c.netUsd!, now.toISOString()).changes) n++;
  return n;
}

export function decideBudgetDraft(db: Database, id: string, decision: string, note: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "INVALID" {
  if (decision !== "approve" && decision !== "reject") return "INVALID";
  if (!db.query("SELECT 1 FROM budget_drafts WHERE id = ?").get(id)) return "NOT_FOUND";
  db.run("INSERT INTO budget_decisions (id, draft_id, decision, note, decided_at, actor) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), id, decision, redactR1(note.trim().slice(0, 300)).text || null, opts.now.toISOString(), opts.actor]);
  return "ok";
}

// Impressions của chiến dịch: cộng các dòng báo cáo tuần (ad_rows, D-39) cùng tên chiến dịch, trong kỳ nếu có kỳ.
function impressionsOf(db: Database, campaign: string, start: string | null, end: string | null): number | null {
  const r = db.query(`SELECT SUM(a.impressions) AS n FROM ad_rows a JOIN ad_imports i ON i.id = a.import_id WHERE a.campaign = ?
    AND (? IS NULL OR i.week_start >= ?) AND (? IS NULL OR i.week_start <= ?)`).get(campaign, start, start, end, end) as { n: number | null };
  return r.n;
}

// Win gate Mi1-mkt-01 (D-69) trên kết quả chiến dịch mới nhất; gross_margin trong file đã lọc reseller (hợp đồng D-45).
export function buildWinGate(db: Database, now: Date) {
  const degraded = buildDataBoard(db, now).window.degraded;
  return winGate(latestCampaigns(db).campaigns.map((c) => ({ campaign: c.campaign, impressions: impressionsOf(db, c.campaign, c.periodStart, c.periodEnd), contacts: c.leads, closedWon: c.closedWon,
    spendUsd: c.spendUsd, cycleComplete: c.cycle === 1, resellerFiltered: true, trackingDegraded: degraded })), getProvisional("win_gate").value);
}

export function buildBudgetBoard(db: Database, now: Date) {
  const drafts = (db.query("SELECT id, campaign, period_end AS periodEnd, net_usd AS netUsd, created_at AS createdAt FROM budget_drafts ORDER BY created_at DESC, campaign").all() as { id: string; campaign: string; periodEnd: string; netUsd: number; createdAt: string }[]).map((d) => {
    const x = db.query("SELECT decision, actor, note FROM budget_decisions WHERE draft_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(d.id) as { decision: string; actor: string; note: string | null } | null;
    return { ...d, status: x ? (x.decision === "approve" ? "approved" : "rejected") : "pending", decidedBy: x?.actor ?? null, note: x?.note ?? null };
  });
  return { ...latestCampaigns(db), drafts, frozen: buildDataBoard(db, now).window.degraded, win: buildWinGate(db, now) };
}
