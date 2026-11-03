// Chỉ số đối tác (Mi1-ptn-01, spec mục 12; D-31). Tính bằng code, không do LLM.
//   partner_referred: số deal đối tác giới thiệu có Close Date trong kỳ (lọc theo Close Date, NBA luật 5).
//   partner_won: trong số đó, số deal ở Stage chốt thắng.
//   partner_profit_usd: tổng lợi nhuận ghi nhận (Internal Control) của deal chốt thắng trong kỳ; deal chưa có lợi nhuận không tính.
export type Referral = { stage: string; close_date: string | null; profit_usd: number | null };

export function partnerPeriodStats(rows: Referral[], period: { start: string; end: string }, wonStages: readonly string[]) {
  const inPeriod = rows.filter((r) => r.close_date !== null && r.close_date >= period.start && r.close_date <= period.end);
  const won = inPeriod.filter((r) => wonStages.includes(r.stage));
  let profit = 0;
  let missingProfit = 0;
  for (const r of won) {
    if (r.profit_usd === null) missingProfit++;
    else profit += r.profit_usd;
  }
  return { referred: inPeriod.length, won: won.length, profitUsd: Math.round(profit * 100) / 100, wonMissingProfit: missingProfit };
}
