// So giá với đối thủ (Mi1-mkt-04; D-40). Tính bằng code, không do LLM.
//   price_gap_to_min = (giá của mình − giá thấp nhất của đối thủ) / giá thấp nhất của đối thủ, cùng tài phán, cùng gói.
//   Dương: mình đắt hơn. Giá của mình là giá thấp nhất trong các loại hình công ty của tài phán (giá "từ") ở sheet FINAL.
import { median } from "./queue-health.ts";

export function priceGap(ours: number | null, competitors: number[]) {
  const competitorMin = competitors.length ? Math.min(...competitors) : null;
  return {
    competitorMin,
    competitorMedian: median(competitors),
    gapToMin: ours !== null && competitorMin ? (ours - competitorMin) / competitorMin : null,
  };
}
