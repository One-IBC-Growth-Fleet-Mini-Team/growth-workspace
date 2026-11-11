// Adapter Google Ads (D-96): Google Ads API, chỉ đọc. Chỉ gọi googleAds:search (truy vấn GAQL); mọi đường dẫn khác, kể
// cả :mutate, bị cửa đọc chung từ chối trước khi gọi. Phân trang nextPageToken. Token OAuth làm mới bằng refresh token
// khi 401 UNAUTHENTICATED; giới hạn tần suất 429 RESOURCE_EXHAUSTED thì chờ rồi thử lại.
import type { AdRow } from "./meta-ads.ts";
import { readAll, type ReadOptions, type TokenSource } from "./read-http.ts";

export function googleAdsOptions(token: TokenSource, developerToken: string, loginCustomerId?: string, extra: Partial<ReadOptions> = {}): ReadOptions {
  return { connector: "google-ads", hosts: ["googleads.googleapis.com"], readPost: [/\/customers\/\d+\/googleAds:search$/], token,
    authHeaders: (t) => ({ Authorization: `Bearer ${t}`, "developer-token": developerToken, ...(loginCustomerId ? { "login-customer-id": loginCustomerId.replace(/-/g, "") } : {}) }),
    isRateLimited: (s, b) => s === 429 || (b as { error?: { status?: string } } | null)?.error?.status === "RESOURCE_EXHAUSTED", ...extra };
}

export async function readGoogleAdsWeek(customerId: string, since: string, until: string, o: ReadOptions, version = "v21"): Promise<AdRow[]> {
  const url = `https://googleads.googleapis.com/${version}/customers/${customerId.replace(/-/g, "")}/googleAds:search`;
  const query = `SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ad_group_ad WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  type R = { campaign?: { name?: string }; adGroup?: { name?: string }; adGroupAd?: { ad?: { id?: string; name?: string } }; metrics?: { impressions?: string; clicks?: string; costMicros?: string } };
  type Page = { results?: R[]; nextPageToken?: string };
  return readAll({ url, method: "POST", body: { query } }, o,
    (b) => ((b as Page).results ?? []).map((r) => ({ campaign: r.campaign?.name ?? null, ad: r.adGroupAd?.ad?.name || r.adGroup?.name || `ad ${r.adGroupAd?.ad?.id ?? "?"}`,
      impressions: Number(r.metrics?.impressions ?? 0), clicks: Number(r.metrics?.clicks ?? 0), spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000, frequency: null })),
    (b) => { const t = (b as Page).nextPageToken; return t ? { url, method: "POST", body: { query, pageToken: t } } : null; });
}
