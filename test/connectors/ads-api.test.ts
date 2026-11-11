// T-CONN-08 tới T-CONN-12: adapter Meta Ads, Google Ads, GA4 và job kéo (D-96). Phản hồi giả lập theo dạng tài liệu
// chính thức (Marketing API Insights, Google Ads googleAds:search, GA4 runReport); không gọi mạng thật, không cần key.
import { describe, expect, test } from "bun:test";
import { ga4Options, readGa4EventCounts } from "../../src/connectors/ga4.ts";
import { googleAdsOptions, readGoogleAdsWeek } from "../../src/connectors/google-ads.ts";
import { metaOptions, readMetaWeek } from "../../src/connectors/meta-ads.ts";
import { staticToken, type TokenSource } from "../../src/connectors/read-http.ts";
import { lastFullWeek, pullAdsApi } from "../../src/jobs/pull-ads-api.ts";
import { freshDb } from "../helpers/db.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };
function fake(responses: Array<[number, unknown, Record<string, string>?]>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: (init.body as string) ?? null });
    const [status, body, headers] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
const sleeps: number[] = [];
const noSleep = { sleep: async (ms: number) => { sleeps.push(ms); } };
function refreshing(): TokenSource & { forced: number } {
  const t = { forced: 0, async get(force = false) { if (force) t.forced += 1; return `tok-${t.forced}`; } };
  return t;
}

describe("T-CONN adapter quảng cáo và GA4", () => {
  test("T-CONN-08 Meta Insights: GET level=ad, phân trang paging.next, code 190 là hết hạn, code 17 là giới hạn tần suất", async () => {
    const f = fake([
      [400, { error: { message: "User request limit reached", type: "OAuthException", code: 17 } }, { "retry-after": "3" }],
      [200, { data: [{ campaign_name: "C1", ad_name: "A1", impressions: "1000", inline_link_clicks: "25", spend: "12.50", frequency: "1.4", date_start: "2026-11-02", date_stop: "2026-11-08" }],
        paging: { cursors: { before: "b", after: "a" }, next: "https://graph.facebook.com/v21.0/act_123/insights?after=a" } }],
      [200, { data: [{ campaign_name: "C1", ad_name: "A2", impressions: "500", spend: "3" }], paging: { cursors: { before: "a" } } }],
    ]);
    const rows = await readMetaWeek("act_123", "2026-11-02", "2026-11-08", metaOptions("T", { fetchImpl: f.impl, ...noSleep }));
    expect(rows).toEqual([{ campaign: "C1", ad: "A1", impressions: 1000, clicks: 25, spend: 12.5, frequency: 1.4 }, { campaign: "C1", ad: "A2", impressions: 500, clicks: 0, spend: 3, frequency: null }]);
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
    const u = new URL(f.calls[0]!.url);
    expect(u.pathname).toBe("/v21.0/act_123/insights");
    expect(u.searchParams.get("level")).toBe("ad");
    expect(JSON.parse(u.searchParams.get("time_range")!)).toEqual({ since: "2026-11-02", until: "2026-11-08" });
    expect(sleeps.at(-1)).toBe(3000);
    const exp = fake([[400, { error: { type: "OAuthException", code: 190, error_subcode: 463 } }], [400, { error: { type: "OAuthException", code: 190 } }]]);
    await expect(readMetaWeek("123", "2026-11-02", "2026-11-08", metaOptions("T", { fetchImpl: exp.impl, ...noSleep }))).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });

  test("T-CONN-09 Google Ads: chỉ POST googleAds:search (mutate bị chặn), nextPageToken, cost_micros đổi ra tiền, 401 làm mới token", async () => {
    const t = refreshing();
    const f = fake([
      [401, { error: { code: 401, status: "UNAUTHENTICATED" } }],
      [200, { results: [{ campaign: { name: "C1" }, adGroup: { name: "G1" }, adGroupAd: { ad: { id: "9", name: "A1" } }, metrics: { impressions: "2000", clicks: "40", costMicros: "15500000" } }], nextPageToken: "N2", fieldMask: "x" }],
      [429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } }],
      [200, { results: [{ campaign: { name: "C2" }, adGroup: { name: "G2" }, adGroupAd: { ad: { id: "10" } }, metrics: { impressions: "10", clicks: "1", costMicros: "250000" } }] }],
    ]);
    const o = googleAdsOptions(t, "DEV", "111-222-3333", { fetchImpl: f.impl, ...noSleep });
    const rows = await readGoogleAdsWeek("123-456-7890", "2026-11-02", "2026-11-08", o);
    expect(rows).toEqual([{ campaign: "C1", ad: "A1", impressions: 2000, clicks: 40, spend: 15.5, frequency: null }, { campaign: "C2", ad: "G2", impressions: 10, clicks: 1, spend: 0.25, frequency: null }]);
    expect(t.forced).toBe(1);
    expect(f.calls[0]!.url).toBe("https://googleads.googleapis.com/v21/customers/1234567890/googleAds:search");
    expect(f.calls[0]!.headers["developer-token"]).toBe("DEV");
    expect(f.calls[0]!.headers["login-customer-id"]).toBe("1112223333");
    expect(JSON.parse(f.calls[3]!.body!).pageToken).toBe("N2");
    expect(JSON.parse(f.calls[1]!.body!).query).toMatch(/^SELECT .* FROM ad_group_ad WHERE segments\.date BETWEEN '2026-11-02' AND '2026-11-08'$/);
    const none = fake([]);
    const { readJson } = await import("../../src/connectors/read-http.ts");
    await expect(readJson({ url: "https://googleads.googleapis.com/v21/customers/1/campaigns:mutate", method: "POST", body: {} }, googleAdsOptions(staticToken("x"), "DEV", undefined, { fetchImpl: none.impl }))).rejects.toMatchObject({ code: "NOT_READ_ENDPOINT" });
    expect(none.calls.length).toBe(0);
  });

  test("T-CONN-10 GA4 runReport: phân trang offset tới rowCount, 429 RESOURCE_EXHAUSTED chờ rồi thử lại, không có POST nào khác", async () => {
    const row = (n: string, v: string) => ({ dimensionValues: [{ value: n }], metricValues: [{ value: v }] });
    const f = fake([
      [200, { dimensionHeaders: [{ name: "eventName" }], metricHeaders: [{ name: "eventCount", type: "TYPE_INTEGER" }], rows: [row("page_view", "900"), row("form_start", "40")], rowCount: 3, kind: "analyticsData#runReport" }],
      [429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } }],
      [200, { rows: [row("generate_lead", "12")], rowCount: 3 }],
    ]);
    const counts = await readGa4EventCounts("properties/42", "2026-11-02", "2026-11-08", ga4Options(staticToken("x"), { fetchImpl: f.impl, ...noSleep }), 2);
    expect(counts).toEqual({ page_view: 900, form_start: 40, generate_lead: 12 });
    expect(f.calls[0]!.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/42:runReport");
    expect(f.calls.map((c) => JSON.parse(c.body!).offset)).toEqual([0, 2, 2]);
  });

  test("T-CONN-11 job kéo: thiếu biến thì bỏ qua, không gọi mạng; đủ biến Meta thì ghi ad_rows tuần trọn gần nhất và connector_calls", async () => {
    expect(lastFullWeek(new Date("2026-11-11T03:00:00Z"))).toEqual({ since: "2026-11-02", until: "2026-11-08" });
    expect(lastFullWeek(new Date("2026-11-08T20:00:00Z"))).toEqual({ since: "2026-11-02", until: "2026-11-08" }); // thứ Hai 03:00 giờ VN
    const db = freshDb();
    const none = fake([]);
    const skipped = await pullAdsApi(db, {}, { now: new Date("2026-11-11T03:00:00Z"), actor: "t", fetchImpl: none.impl });
    expect(skipped.map((r) => r.status)).toEqual(["skipped", "skipped", "skipped"]);
    expect(none.calls.length).toBe(0);
    const f = fake([[200, { data: [{ campaign_name: "C", ad_name: "A", impressions: "10", inline_link_clicks: "1", spend: "2" }], paging: {} }]]);
    const r = await pullAdsApi(db, { META_ACCESS_TOKEN: "T", META_AD_ACCOUNT_ID: "1" }, { now: new Date("2026-11-11T03:00:00Z"), actor: "t", fetchImpl: f.impl });
    expect(r[0]).toEqual({ connector: "meta-ads", status: "succeeded", rows: 1 });
    expect(db.query("SELECT platform, week_start FROM ad_imports").all()).toEqual([{ platform: "meta", week_start: "2026-11-02" }]);
    expect(db.query("SELECT ad, impressions, spend FROM ad_rows").all()).toEqual([{ ad: "A", impressions: 10, spend: 2 }]);
    expect(db.query("SELECT connector, ok FROM connector_calls").all()).toEqual([{ connector: "meta-ads", ok: 1 }]);
  });

  test("T-CONN-12 job kéo: lỗi một ổ cắm không chặn ổ khác, ghi mã lỗi, không ghi ad_rows dở", async () => {
    const db = freshDb();
    const f = fake([[400, { error: { code: 190 } }], [400, { error: { code: 190 } }]]);
    const r = await pullAdsApi(db, { META_ACCESS_TOKEN: "T", META_AD_ACCOUNT_ID: "1" }, { now: new Date("2026-11-11T03:00:00Z"), actor: "t", fetchImpl: f.impl, ...noSleep });
    expect(r.map((x) => x.status)).toEqual(["failed", "skipped", "skipped"]);
    expect(r[0]!.errorCode).toBe("AUTH_EXPIRED");
    expect((db.query("SELECT COUNT(*) AS n FROM ad_rows").get() as { n: number }).n).toBe(0);
    expect(db.query("SELECT ok, error_code FROM connector_calls").all()).toEqual([{ ok: 0, error_code: "AUTH_EXPIRED" }]);
  });
});
