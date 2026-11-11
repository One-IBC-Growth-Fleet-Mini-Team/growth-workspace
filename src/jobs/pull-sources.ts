// Job 06:30 hằng ngày (CRON-03, spec mục 10; D-61): kéo các nguồn đã đặt <PREFIX>_SOURCE=mcp vào Growth DB bằng đúng hàm
// nạp của trang tương ứng: điểm Hook (HOOK), kết quả chiến dịch (ADS), quét thị trường (MARKET). Nguồn chế độ file bỏ qua.
// Chỉ gọi tool đọc; một nguồn lỗi không chặn nguồn khác. Không gọi LLM.
import type { Database } from "bun:sqlite";
import { getDbPath, getRemoteSource } from "../config.ts";
import { importCampaignsFromMcp } from "../crm/campaign-import.ts";
import { importHooksFromMcp } from "../crm/hook-import.ts";
import { pullMarketScan } from "../crm/market-import.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { log } from "../log.ts";
import { pullAdsApi } from "./pull-ads-api.ts";
import type { RemoteTarget } from "../mcp/remote.ts";

type Targets = { hooks: RemoteTarget | null; ads: RemoteTarget | null; market: RemoteTarget | null };
export type PullResult = { source: keyof Targets; status: "succeeded" | "skipped" } | { source: keyof Targets; status: "failed"; errorCode: string };

export async function pullSources(db: Database, t: Targets, opts: { now: Date; actor: string }): Promise<PullResult[]> {
  const steps: [keyof Targets, (target: RemoteTarget) => Promise<{ status: string; errorCode?: string }>][] = [
    ["hooks", (x) => importHooksFromMcp(db, x, opts)],
    ["ads", (x) => importCampaignsFromMcp(db, x, opts)],
    ["market", (x) => pullMarketScan(db, x, opts)],
  ];
  const out: PullResult[] = [];
  for (const [source, run] of steps) {
    const target = t[source];
    if (!target) { out.push({ source, status: "skipped" }); continue; }
    const r = await run(target);
    out.push(r.status === "succeeded" ? { source, status: "succeeded" } : { source, status: "failed", errorCode: r.errorCode ?? "PULL_FAILED" });
  }
  return out;
}

if (import.meta.main) {
  // Cấu hình sai của một nguồn (ví dụ thiếu <PREFIX>_MCP_URL) chỉ làm nguồn đó lỗi, không chặn nguồn khác.
  const bad: string[] = [];
  const target = (prefix: string): RemoteTarget | null => {
    try {
      const s = getRemoteSource(prefix);
      return s.mode === "mcp" ? { url: s.url, token: s.token } : null;
    } catch {
      bad.push(prefix);
      return null;
    }
  };
  const targets = { hooks: target("HOOK"), ads: target("ADS"), market: target("MARKET") };
  for (const prefix of bad) log({ event: `pull.${prefix.toLowerCase()}.failed`, error_code: "SOURCE_CONFIG_INVALID" });
  const db = openReadWrite(getDbPath());
  migrate(db);
  try {
    const SOURCE = { hooks: "HOOK", ads: "ADS", market: "MARKET" } as const;
    for (const r of await pullSources(db, targets, { now: new Date(), actor: "cron-03" })) {
      if (bad.includes(SOURCE[r.source])) continue; // đã báo SOURCE_CONFIG_INVALID ở trên
      log({ event: `pull.${r.source}.${r.status}`, ...("errorCode" in r ? { error_code: r.errorCode } : {}) });
    }
    // Adapter API (D-96): Meta Ads, Google Ads, GA4 khi đã đủ biến; thiếu biến thì bỏ qua, file tải lên vẫn dùng như cũ.
    for (const r of await pullAdsApi(db, process.env, { now: new Date(), actor: "cron-03" })) if (r.status === "succeeded") log({ event: `pull.${r.connector.replace("-", "_")}.succeeded`, count: r.rows });
  } finally {
    db.close();
  }
}
