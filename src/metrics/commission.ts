// commission_proposal (spec mục 9 partner-mcp calc_commission, mục 12; D-71): đề xuất hoa hồng theo loại đối tác, nhãn
// "chưa chi". Tỉ lệ và cơ sở tính là giá trị tạm (getProvisional("commission")). Không chi trả: chi trả đi qua cổng duyệt
// tiền của Amy và tài chính (CLAUDE.md quy tắc 4). Cơ sở = lợi nhuận ghi nhận (Internal Control) của deal chốt thắng.
export type CommissionDeal = { deal_id: string; partner_id: string; partner_type: string; profit_usd: number | null };
export type CommissionLine<T extends CommissionDeal = CommissionDeal> = T & { rate: number | null; amount_usd: number | null; status: "proposed" | "no_rate" | "no_profit" };

export function proposeCommission<T extends CommissionDeal>(deals: readonly T[], rates: Readonly<Record<string, number>>): CommissionLine<T>[] {
  return deals.map((d) => {
    const rate = rates[d.partner_type.trim().toLowerCase()] ?? null;
    if (rate === null) return { ...d, rate: null, amount_usd: null, status: "no_rate" };
    if (d.profit_usd === null) return { ...d, rate, amount_usd: null, status: "no_profit" };
    return { ...d, rate, amount_usd: Math.round(Math.max(0, d.profit_usd) * rate * 100) / 100, status: "proposed" };
  });
}

// Tổng hoa hồng đề xuất (chưa chi) của các dòng đã có số, cho ô trên /overview (D-76).
export function totalProposedUsd(lines: readonly { amount_usd: number | null }[]): number {
  let t = 0;
  for (const l of lines) if (l.amount_usd !== null) t += l.amount_usd;
  return Math.round(t * 100) / 100;
}
