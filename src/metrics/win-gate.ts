// win_gate (Mi1-mkt-01, spec mục 6, 8; metric-definitions.md; D-69). Ngưỡng là giá trị tạm getProvisional("win_gate").
// Chiến dịch thiếu mẫu (impressions, contact_captured, chu kỳ bán, lọc reseller, độ tin cậy) trả insufficient_data và
// không xếp hạng. Chiến dịch đủ mẫu thắng khi CPL <= trung vị và tỷ lệ chốt >= trung vị của các chiến dịch đủ mẫu.
import { median } from "./queue-health.ts";

export type WinGateParams = { min_impressions: number; min_contact_captured: number; require_cycle_complete: boolean; require_reseller_filtered: boolean; min_confidence: number };
export type WinInput = { campaign: string; impressions: number | null; contacts: number | null; closedWon: number | null; spendUsd: number; cycleComplete: boolean; resellerFiltered: boolean; trackingDegraded: boolean };
export type WinResult = { campaign: string; status: "win" | "not_win" | "insufficient_data"; reasons: string[]; cpl: number | null; winRate: number | null; confidence: number };

// Độ tin cậy của cổng = tỷ lệ đầu vào đã biết và tracking không gãy (5 thành phần), giống "độ phủ trường" của compute_confidence.
function confidence(r: WinInput): number {
  return [r.impressions !== null, r.contacts !== null, r.closedWon !== null, r.cycleComplete, !r.trackingDegraded].filter(Boolean).length / 5;
}

export function winGate(rows: readonly WinInput[], p: WinGateParams): WinResult[] {
  const judged = rows.map((r) => {
    const reasons: string[] = [];
    if ((r.impressions ?? 0) < p.min_impressions) reasons.push("impressions");
    if ((r.contacts ?? 0) < p.min_contact_captured) reasons.push("contact_captured");
    if (p.require_cycle_complete && !r.cycleComplete) reasons.push("sales_cycle");
    if (p.require_reseller_filtered && !r.resellerFiltered) reasons.push("reseller_filter");
    const conf = confidence(r);
    if (conf < p.min_confidence) reasons.push("confidence");
    const cpl = r.contacts ? r.spendUsd / r.contacts : null;
    const winRate = r.contacts && r.closedWon !== null ? r.closedWon / r.contacts : null;
    return { r, reasons, cpl, winRate, conf };
  });
  const eligible = judged.filter((j) => j.reasons.length === 0);
  const medCpl = median(eligible.map((j) => j.cpl!));
  const medWin = median(eligible.map((j) => j.winRate!));
  return judged.map((j) => ({
    campaign: j.r.campaign,
    status: j.reasons.length ? "insufficient_data" : j.cpl! <= medCpl! && j.winRate! >= medWin! ? "win" : "not_win",
    reasons: j.reasons, cpl: j.cpl, winRate: j.winRate, confidence: j.conf,
  }));
}
