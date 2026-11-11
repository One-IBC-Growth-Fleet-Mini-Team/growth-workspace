// Kéo số liệu quảng cáo và GA4 qua adapter API (D-96), chạy trong CRON-03. Ổ cắm nào thiếu biến thì bỏ qua: số vẫn vào
// bằng file tải lên như cũ. Chỉ đọc; mỗi lần gọi ghi connector_calls để /settings hiện lần thành công gần nhất. Kéo
// tuần trọn gần nhất (thứ Hai tới Chủ nhật, giờ Việt Nam) vào cùng bảng ad_rows với file tải lên. Không gọi LLM.
import type { Database } from "bun:sqlite";
import { readGa4EventCounts, ga4Options } from "../connectors/ga4.ts";
import { googleAdsOptions, readGoogleAdsWeek } from "../connectors/google-ads.ts";
import { metaOptions, readMetaWeek } from "../connectors/meta-ads.ts";
import { googleRefreshToken, type ReadOptions } from "../connectors/read-http.ts";
import { recordCall, socketReady } from "../connectors/registry.ts";
import { saveAdRows } from "../crm/ad-report-import.ts";
import { log } from "../log.ts";
import { addDays, vnDate } from "../time.ts";

type Env = Record<string, string | undefined>;
export type ApiPull = { connector: string; status: "skipped" | "succeeded" | "failed"; rows?: number; errorCode?: string };

export function lastFullWeek(now: Date): { since: string; until: string } {
  const today = vnDate(now), dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const since = addDays(today, -((dow + 6) % 7) - 7);
  return { since, until: addDays(since, 6) };
}

export async function pullAdsApi(db: Database, env: Env, opts: { now: Date; actor: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<ApiPull[]> {
  const { since, until } = lastFullWeek(opts.now);
  const extra: Partial<ReadOptions> = { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), ...(opts.sleep ? { sleep: opts.sleep } : {}) };
  const g = (p: string) => googleRefreshToken({ clientId: env[`${p}_CLIENT_ID`]!, clientSecret: env[`${p}_CLIENT_SECRET`]!, refreshToken: env[`${p}_REFRESH_TOKEN`]! }, p === "GA4" ? "ga4" : "google-ads", opts.fetchImpl);
  const jobs: [string, () => Promise<number>][] = [
    ["meta-ads", async () => { const rows = await readMetaWeek(env.META_AD_ACCOUNT_ID!, since, until, metaOptions(env.META_ACCESS_TOKEN!, extra), env.META_API_VERSION || undefined); saveAdRows(db, rows, { platform: "meta", weekStart: since, now: opts.now, actor: opts.actor }); return rows.length; }],
    ["google-ads", async () => { const rows = await readGoogleAdsWeek(env.GOOGLE_ADS_CUSTOMER_ID!, since, until, googleAdsOptions(g("GOOGLE_ADS"), env.GOOGLE_ADS_DEVELOPER_TOKEN!, env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined, extra), env.GOOGLE_ADS_API_VERSION || undefined); saveAdRows(db, rows, { platform: "google", weekStart: since, now: opts.now, actor: opts.actor }); return rows.length; }],
    // GA4: chưa có bảng nhận số (chưa có trong Việc tiếp theo); chỉ đọc để kiểm nối và ghi lần gọi.
    ["ga4", async () => Object.keys(await readGa4EventCounts(env.GA4_PROPERTY_ID!, since, until, ga4Options(g("GA4"), extra))).length],
  ];
  const out: ApiPull[] = [];
  for (const [connector, run] of jobs) {
    if (!socketReady(connector, env)) { out.push({ connector, status: "skipped" }); continue; }
    try {
      const rows = await recordCall(db, connector, opts.now, run);
      out.push({ connector, status: "succeeded", rows });
    } catch (e) {
      const errorCode = (e as { code?: string }).code ?? "UNKNOWN";
      log({ event: `pull.${connector.replace("-", "_")}.failed`, error_code: errorCode });
      out.push({ connector, status: "failed", errorCode });
    }
  }
  return out;
}
