// Dashboard /overview (D-76): chỉ gom số từ các module đã có, không tính chỉ số mới. Bốn hàng: hệ thống, vận hành,
// Growth, tiến độ dự án (docs/progress.json). Mỗi ô có link sang trang chi tiết. Vai trò nào thấy hàng nào: rowsFor().
import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { latestSucceededSnapshot } from "../db/crm-read.ts";
import { buildBillingBoard } from "../db/billing.ts";
import { buildBudgetBoard } from "../db/budget.ts";
import { buildDataBoard, tier3bWindow } from "../db/data01.ts";
import { buildJurisdictionBoard } from "../db/jurisdictions.ts";
import { buildPartnerBoard } from "../db/partners.ts";
import { repeatedRejections } from "../db/rejections.ts";
import { buildScheduleDraft } from "../creative/factory.ts";
import { buildAdsOverview } from "../db/ads-overview.ts";
import { findDuplicateLeads } from "../mcp/crm-read/tools.ts";
import { totalProposedUsd } from "../metrics/commission.ts";
import { tag } from "../provisional.ts";
import { monthPeriod, vnDate } from "../time.ts";
import { buildBrief, mondayOf } from "./core.ts";

export type Cell = { label: string; value: string; note?: string; href: string; warn?: boolean };
export type Row = { id: "system" | "ops" | "growth" | "progress"; title: string; cells: Cell[] };

const SOURCES: [string, string, string][] = [
  ["Sự kiện web, CRM", "SELECT MAX(imported_at) AS t FROM data_event_imports", "/data"], ["Quảng cáo tuần", "SELECT MAX(imported_at) AS t FROM ad_imports", "/ads-overview"],
  ["Kết quả chiến dịch", "SELECT MAX(imported_at) AS t FROM campaign_imports", "/budget"], ["Điểm Hook", "SELECT MAX(imported_at) AS t FROM hook_imports", "/hooks"],
  ["Giá đối thủ", "SELECT MAX(imported_at) AS t FROM competitor_imports", "/competitors"], ["Sheet giá FINAL", "SELECT MAX(imported_at) AS t FROM jurisdiction_imports", "/jurisdictions"], ["Sandbox8", "SELECT MAX(imported_at) AS t FROM sandbox_imports", "/jurisdictions"],
  ["Đối tác", "SELECT MAX(imported_at) AS t FROM partner_imports", "/partners"], ["Đơn hàng, invoice", "SELECT MAX(imported_at) AS t FROM billing_imports", "/billing"], ["Work Order", "SELECT MAX(imported_at) AS t FROM wo_imports", "/wo"],
];

function age(at: string | null, now: Date): string {
  if (!at) return "chưa nạp";
  const h = Math.floor((now.getTime() - Date.parse(at)) / 3_600_000);
  return h < 24 ? `${h} giờ trước` : `${Math.floor(h / 24)} ngày trước`;
}
const one = (db: Database, sql: string): string | null => { try { return (db.query(sql).get() as { t: string | null } | null)?.t ?? null; } catch { return null; } };

export function buildOverview(db: Database, now: Date, progressPath: string) {
  const brief = buildBrief(db, now);
  const snap = latestSucceededSnapshot(db);
  const failed = (db.query("SELECT COUNT(*) AS n FROM agent_runs WHERE status <> 'succeeded' AND started_at >= ?").get(new Date(now.getTime() - 7 * 86_400_000).toISOString()) as { n: number }).n;
  const system: Row = { id: "system", title: "Hệ thống", cells: [
    { label: "Snapshot CRM", value: age(snap?.snapshot_at ?? null, now), href: "/import", warn: !snap },
    ...SOURCES.map(([label, sql, href]) => { const t = one(db, sql); return { label, value: age(t, now), href, warn: !t }; }),
    { label: "Phiên agent lỗi 7 ngày", value: String(failed), href: "/runs", warn: failed > 0 },
    { label: "Chi phí LLM tháng", value: `${brief.monthCostUsd.toFixed(2)} / ${brief.monthCapUsd} USD`, href: "/runs", warn: brief.monthCostUsd >= brief.monthCapUsd * 0.8 },
  ] };
  let dupGroups = 0;
  try { dupGroups = findDuplicateLeads(db, {}).groups.length; } catch { dupGroups = 0; }
  const bill = buildBillingBoard(db, now);
  const ops: Row = { id: "ops", title: "Vận hành", cells: [
    { label: "Hàng chờ hôm nay", value: `${brief.todayTotal.pending} chờ / ${brief.todayTotal.total} mục`, href: "/queue" },
    { label: "Còn chờ từ trước", value: String(brief.carryover.count), note: brief.carryover.oldestHours !== null ? `lâu nhất ${brief.carryover.oldestHours} giờ` : undefined, href: "/queue", warn: brief.carryover.count > 0 },
    { label: "Áp mặc định 24 giờ qua", value: String(brief.defaultsLast24h), href: "/brief" },
    { label: "NBA hôm nay", value: String(brief.today.find((t) => t.type === "nba")?.total ?? 0), href: "/queue" },
    { label: "Lead trùng", value: `${dupGroups} nhóm`, href: "/leads", warn: dupGroups > 0 },
    { label: "Invoice quá hạn", value: `${bill.escalate.length} báo Amy, ${bill.remind.length} nhắc`, href: "/billing", warn: bill.escalate.length > 0 },
    { label: "SO thiếu PO", value: String(bill.soMissingPo.length), href: "/billing", warn: bill.soMissingPo.length > 0 },
    { label: "WO tồn đọng", value: `${brief.wo.escalate} báo Amy, ${brief.wo.remind} nhắc PIC`, href: "/wo", warn: brief.wo.escalate > 0 },
  ] };
  const data = buildDataBoard(db, now);
  const measured = data.chain.filter((l) => l.status === "measured").length;
  const jur = buildJurisdictionBoard(db);
  const ads = buildAdsOverview(db, mondayOf(vnDate(now)), now);
  const t3 = tier3bWindow(db, now);
  const budget = buildBudgetBoard(db, now);
  const wins = budget.win.filter((w) => w.status === "win").length;
  const sched = buildScheduleDraft(db, now);
  const partners = buildPartnerBoard(db, monthPeriod(vnDate(now)));
  const growth: Row = { id: "growth", title: "Growth", cells: [
    { label: "Chuỗi 12 ID", value: `${measured}/12 mắt nối đo được`, href: "/data" },
    { label: "Tầng 1B: tài phán chưa chốt giá", value: String(jur.summary.total - jur.summary.priceLocked), href: "/jurisdictions" },
    { label: "Tầng 2: quảng cáo có cờ", value: String(ads.flags.length), href: "/ads-overview", warn: ads.flags.length > 0 },
    { label: "Tầng 3A: tracking", value: data.window.degraded ? "TRACKING_DEGRADED" : data.window.rate === null ? "chưa có dữ liệu" : "ổn", href: "/data", warn: data.window.degraded },
    { label: `Tầng 3B: trang đích${tag("tier3b")}`, value: t3.status === "flag" ? "có cờ" : t3.status === "ok" ? "ổn" : t3.status === "insufficient_data" ? "thiếu mẫu" : "không xét", href: "/data", warn: t3.status === "flag" },
    { label: `Tầng 4: lý do từ chối lặp lại${tag("tier4_repeat")}`, value: String(repeatedRejections(db, now).length), href: "/creative" },
    { label: "Tầng 5: nháp ngân sách chờ duyệt", value: String(budget.drafts.filter((d) => d.status === "pending").length), href: "/budget" },
    { label: `Win gate${tag("win_gate")}`, value: `${wins} thắng / ${budget.win.length} chiến dịch`, href: "/budget" },
    { label: `Lịch kênh tuần tới${tag("channel_schedule")}`, value: `${sched.slots.length} bài nháp`, href: "/creative" },
    { label: `Hoa hồng đề xuất, chưa chi${tag("commission")}`, value: `${totalProposedUsd(partners.commissionReview).toLocaleString("en-US")} USD`, note: `${partners.commissionReview.length} deal`, href: "/partners" },
  ] };
  const prog = existsSync(progressPath) ? (JSON.parse(readFileSync(progressPath, "utf8")) as { overall_percent: number; phases: { id: string; name: string; percent: number }[]; blocked: { what: string; who: string }[] }) : null;
  const progress: Row = { id: "progress", title: "Tiến độ dự án", cells: prog ? [
    { label: "Toàn dự án", value: `${prog.overall_percent}%`, href: "/tuning" },
    ...prog.phases.map((p) => ({ label: `${p.id} ${p.name}`, value: `${p.percent}%`, href: "/tuning" })),
    ...prog.blocked.map((b) => ({ label: `Chặn: ${b.what}`, value: b.who, href: "/tuning", warn: true })),
  ] : [{ label: "Tiến độ", value: "chưa có docs/progress.json", href: "/tuning" }] };
  return [system, ops, growth, progress];
}

// Mark, BOD xem đủ; Amy hàng hệ thống và vận hành; Team MKT hàng Growth (bỏ ô hoa hồng) và tiến độ (D-76).
export function rowsFor(role: "approver" | "viewer" | "mkt", rows: Row[]): Row[] {
  if (role === "viewer") return rows;
  if (role === "approver") return rows.filter((r) => r.id === "system" || r.id === "ops");
  return rows.filter((r) => r.id === "growth" || r.id === "progress").map((r) => ({ ...r, cells: r.cells.filter((c) => c.href !== "/partners") }));
}
