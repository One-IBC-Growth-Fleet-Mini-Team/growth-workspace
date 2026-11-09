// Chẩn đoán tầng 2 "Thượng nguồn" (spec mục 8; D-39). Tính bằng code, không do LLM.
//   ad_ctr = clicks / impressions của một quảng cáo trong tuần.
//   tier2_flag: quảng cáo có từ minImpressions impressions trong tuần VÀ (CTR dưới trung vị CTR của các quảng cáo
//   đủ ngưỡng cùng nền tảng, cùng tuần HOẶC Frequency trên maxFrequency). Hành động spec: đổi pattern Hook hoặc
//   Scene 1, giữ nguyên offer. Khi Mi1-data-01 bật TRACKING_DEGRADED thì đóng băng (khoá chéo, spec mục 8).
import type { AdsTier2Params } from "../config.ts";
import { median } from "./queue-health.ts";

export type AdWeek = { ad: string; impressions: number; clicks: number; frequency: number | null };
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function tier2Flags(ads: AdWeek[], p: AdsTier2Params): { medianCtr: number | null; flags: { ad: string; reasons: string[] }[] } {
  const eligible = ads.filter((a) => a.impressions >= p.minImpressions);
  const m = eligible.length ? median(eligible.map((a) => a.clicks / a.impressions)) : null;
  const flags = eligible.flatMap((a) => {
    const reasons: string[] = [];
    const ctr = a.clicks / a.impressions;
    if (m !== null && ctr < m) reasons.push(`CTR ${pct(ctr)} dưới trung vị ${pct(m)}`);
    if (a.frequency !== null && a.frequency > p.maxFrequency) reasons.push(`Frequency ${a.frequency} trên ${p.maxFrequency}`);
    return reasons.length ? [{ ad: a.ad, reasons }] : [];
  });
  return { medianCtr: m, flags };
}
