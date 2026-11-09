// repeated_rejection_reasons (spec mục 8 tầng 4, metric-definitions.md; D-54): mã lý do từ chối lặp lại từ minCount lần
// trong kỳ, chỉ tính mã sửa được bằng nội dung (câu 2 tới 3 của copy). Bỏ nhóm STALL, giảm giá, vận hành chậm, khách
// reseller, KYC (tầng 3B) và OTHER: không phải lỗi nội dung.
const NOT_CONTENT = new Set(["UNRESPONSIVE", "PAYMENT_PENDING", "PRICE_DISCOUNT_ASK", "SLOW_TURNAROUND", "RESELLER_CHANNEL", "KYC_NOT_COMPLETED", "OTHER"]);

export function repeatedReasons(codes: readonly string[], p: { minCount: number }): { code: string; count: number }[] {
  const n = new Map<string, number>();
  for (const c of codes) if (!NOT_CONTENT.has(c)) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n].filter(([, k]) => k >= p.minCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, count]) => ({ code, count }));
}
