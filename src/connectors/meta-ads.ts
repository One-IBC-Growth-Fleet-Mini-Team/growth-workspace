// Adapter Meta Ads (D-96): Marketing API Insights, chỉ đọc (GET /act_{id}/insights, level=ad). Phân trang paging.next.
// Token hết hạn: lỗi OAuthException code 190. Giới hạn tần suất: code 4, 17, 32, 613, 80000 tới 80014 (tài liệu Meta
// "Rate Limiting"). Token dài hạn không tự làm mới được: hết hạn thì AUTH_EXPIRED, /settings hiện lỗi để Mark cấp lại.
import { readAll, staticToken, type ReadOptions } from "./read-http.ts";

import type { AdRowInput as AdRow } from "../crm/ad-report-import.ts";
export type { AdRow };
const err = (b: unknown) => (b as { error?: { code?: number } } | null)?.error?.code;
const RATE = new Set([4, 17, 32, 613]);

export function metaOptions(token: string, extra: Partial<ReadOptions> = {}): ReadOptions {
  return { connector: "meta-ads", hosts: ["graph.facebook.com"], token: staticToken(token),
    isAuthExpired: (_s, b) => err(b) === 190, isRateLimited: (_s, b) => { const c = err(b); return c !== undefined && (RATE.has(c) || (c >= 80000 && c <= 80014)); }, ...extra };
}

export async function readMetaWeek(accountId: string, since: string, until: string, o: ReadOptions, version = "v21.0"): Promise<AdRow[]> {
  const u = new URL(`https://graph.facebook.com/${version}/act_${accountId.replace(/^act_/, "")}/insights`);
  u.searchParams.set("level", "ad");
  u.searchParams.set("fields", "campaign_name,ad_name,impressions,inline_link_clicks,spend,frequency");
  u.searchParams.set("time_range", JSON.stringify({ since, until }));
  u.searchParams.set("limit", "500");
  type Page = { data?: Record<string, string>[]; paging?: { next?: string } };
  return readAll({ url: u.href }, o,
    (b) => ((b as Page).data ?? []).filter((r) => r.ad_name).map((r) => ({ campaign: r.campaign_name ?? null, ad: r.ad_name!, impressions: Number(r.impressions ?? 0), clicks: Number(r.inline_link_clicks ?? 0), spend: Number(r.spend ?? 0), frequency: r.frequency ? Number(r.frequency) : null })),
    (b) => { const n = (b as Page).paging?.next; return n ? { url: n } : null; });
}
