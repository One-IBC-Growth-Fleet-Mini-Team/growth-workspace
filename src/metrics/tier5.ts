// Tầng 5 "Kênh và ngân sách" (spec mục 8; D-45). Tính bằng code, không do LLM.
//   campaign_net_usd = gross margin (đã lọc khách cuối của reseller) trừ chi tiêu quảng cáo, chỉ khi đủ chu kỳ bán.
//   tier5_flag: đủ chu kỳ bán và campaign_net_usd âm. Hành động spec: nháp draft_budget_change, Mark và anh Jimmy duyệt.
export function tier5Flag(c: { spendUsd: number; grossMarginUsd: number; cycleComplete: boolean }): { flag: boolean; netUsd: number | null } {
  if (!c.cycleComplete) return { flag: false, netUsd: null };
  const netUsd = Math.round((c.grossMarginUsd - c.spendUsd) * 100) / 100;
  return { flag: netUsd < 0, netUsd };
}
