// Tổng quan quảng cáo một tuần (Mi1-mkt-01; D-39): theo nền tảng, cờ tầng 2, khoá chéo với Mi1-data-01. Chỉ đọc.
import type { Database } from "bun:sqlite";
import { ADS_TIER2_PARAMS, type AdsTier2Params } from "../config.ts";
import { tier2Flags } from "../metrics/ads-tier2.ts";
import { buildDataBoard } from "./data01.ts";

export type AdsOverview = {
  week: string;
  importedAt: string | null;
  platforms: { platform: string; ads: number; impressions: number; clicks: number; spend: number; ctr: number | null; cpc: number | null }[];
  flags: { platform: string; ad: string; reasons: string[] }[];
  frozen: boolean; // TRACKING_DEGRADED ở Mi1-data-01: đóng băng đánh giá xấu tầng 2
};

export function buildAdsOverview(db: Database, week: string, now: Date, p: AdsTier2Params = ADS_TIER2_PARAMS): AdsOverview {
  const out: AdsOverview = { week, importedAt: null, platforms: [], flags: [], frozen: buildDataBoard(db, now).window.degraded };
  for (const platform of ["meta", "google"]) {
    const imp = db.query("SELECT id, imported_at AS at FROM ad_imports WHERE platform = ? AND week_start = ? ORDER BY imported_at DESC, id DESC LIMIT 1").get(platform, week) as { id: string; at: string } | null;
    if (!imp) continue;
    if (!out.importedAt || imp.at > out.importedAt) out.importedAt = imp.at;
    const rows = db.query("SELECT ad, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(spend) AS spend, MAX(frequency) AS frequency FROM ad_rows WHERE import_id = ? GROUP BY ad ORDER BY ad").all(imp.id) as { ad: string; impressions: number; clicks: number; spend: number; frequency: number | null }[];
    const t = rows.reduce((a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, spend: a.spend + r.spend }), { impressions: 0, clicks: 0, spend: 0 });
    out.platforms.push({ platform, ads: rows.length, ...t, spend: Math.round(t.spend * 100) / 100, ctr: t.impressions ? t.clicks / t.impressions : null, cpc: t.clicks ? t.spend / t.clicks : null });
    out.flags.push(...tier2Flags(rows, p).flags.map((f) => ({ platform, ...f })));
  }
  return out;
}
