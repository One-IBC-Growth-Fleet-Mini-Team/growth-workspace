// Sổ ổ cắm có adapter thật (D-96; docs/context/ports.md). Mỗi ổ cắm: biến bắt buộc, biến tùy chọn, biến chọn nguồn (nếu có),
// adapter tải file dùng khi chưa nối. Thiếu biến thì "chưa nối" và hệ thống dùng adapter tải file như cũ, không lỗi trang.
// Chỉ đọc tên biến, không bao giờ trả về giá trị (key, token) ra ngoài hàm.
import type { Database } from "bun:sqlite";
import { ConnectorError } from "./read-http.ts";

type Env = Record<string, string | undefined>;
export type Socket = { id: string; label: string; required: readonly string[]; optional: readonly string[]; selector?: { name: string; value: string }; fileAdapter: string; realAdapter: string; usedBy: string };

export const SOCKETS: readonly Socket[] = [
  { id: "crm-api", label: "CRM (Opportunity, Client, Lead, Order)", required: ["CRM_API_BASE", "CRM_API_TOKEN"], optional: [], selector: { name: "CRM_SOURCE", value: "api" },
    fileAdapter: "Tải CSV ở /import", realAdapter: "API CRM chỉ đọc (src/crm/http.ts)", usedBy: "ETL CRM, NBA" },
  { id: "internal-control", label: "Internal Control (Data Contract A5)", required: ["IC_API_BASE", "IC_API_TOKEN"], optional: [],
    fileAdapter: "Lợi nhuận trong file deal đối tác ở /partners", realAdapter: "API GET Internal Control (src/connectors/internal-control.ts)", usedBy: "net_profit_ic (chờ MobCEC mở API)" },
  { id: "graph-teams", label: "Tự báo RM (Teams, Microsoft Graph)", required: ["TEAMS_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "GRAPH_TEAM_ID", "GRAPH_CHANNEL_ID"], optional: [], selector: { name: "REPORT_SOURCE", value: "graph" },
    fileAdapter: "Dán thread ở /paste", realAdapter: "Graph đọc tin channel (src/teams/graph-read.ts)", usedBy: "Mi1-sa-01 lượt 08:00" },
  { id: "meta-ads", label: "Meta Ads", required: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"], optional: ["META_API_VERSION"],
    fileAdapter: "Tải CSV báo cáo tuần ở /ads-overview", realAdapter: "Marketing API Insights chỉ đọc (src/connectors/meta-ads.ts)", usedBy: "Quảng cáo tuần, job kéo nguồn 06:30" },
  { id: "google-ads", label: "Google Ads", required: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"], optional: ["GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_API_VERSION"],
    fileAdapter: "Tải CSV báo cáo tuần ở /ads-overview", realAdapter: "Google Ads API googleAds:search chỉ đọc (src/connectors/google-ads.ts)", usedBy: "Quảng cáo tuần, job kéo nguồn 06:30" },
  { id: "ga4", label: "GA4 (số liệu)", required: ["GA4_PROPERTY_ID", "GA4_CLIENT_ID", "GA4_CLIENT_SECRET", "GA4_REFRESH_TOKEN"], optional: [],
    fileAdapter: "Tải CSV sự kiện ở /data", realAdapter: "Analytics Data API runReport chỉ đọc (src/connectors/ga4.ts)", usedBy: "Job kéo nguồn 06:30 đọc thử để kiểm nối; chưa có bảng nhận số GA4" },
];

export type SocketStatus = { id: string; label: string; state: "connected" | "not_enabled" | "not_connected"; active: string; missing: string[]; optionalMissing: string[]; lastOkAt: string | null; lastError: string | null; fileAdapter: string; realAdapter: string; usedBy: string };
const has = (env: Env, n: string) => (env[n] ?? "").trim() !== "";

// Ổ cắm đã nối khi đủ biến bắt buộc (và biến chọn nguồn bật đúng giá trị nếu ổ cắm có biến đó).
export function socketReady(id: string, env: Env = process.env): boolean {
  const s = SOCKETS.find((x) => x.id === id);
  return Boolean(s && s.required.every((n) => has(env, n)) && (!s.selector || (env[s.selector.name] ?? "").trim() === s.selector.value));
}

export function connectorStatus(db: Database | null, env: Env = process.env): SocketStatus[] {
  return SOCKETS.map((s) => {
    const missing = s.required.filter((n) => !has(env, n));
    const selectorOff = s.selector && (env[s.selector.name] ?? "").trim() !== s.selector.value;
    const state = missing.length ? "not_connected" : selectorOff ? "not_enabled" : "connected";
    const okRow = db?.query("SELECT MAX(at) AS t FROM connector_calls WHERE connector = ? AND ok = 1").get(s.id) as { t: string | null } | undefined;
    const errRow = db?.query("SELECT error_code AS c FROM connector_calls WHERE connector = ? ORDER BY at DESC, id DESC LIMIT 1").get(s.id) as { c: string | null } | undefined;
    return { id: s.id, label: s.label, state, active: state === "connected" ? s.realAdapter : s.fileAdapter, missing: [...missing, ...(selectorOff ? [`${s.selector!.name}=${s.selector!.value}`] : [])],
      optionalMissing: s.optional.filter((n) => !has(env, n)), lastOkAt: okRow?.t ?? null, lastError: errRow?.c ?? null, fileAdapter: s.fileAdapter, realAdapter: s.realAdapter, usedBy: s.usedBy };
  });
}

// Ghi một lần gọi (thành công hoặc mã lỗi). Không ghi tham số hay nội dung phản hồi.
export async function recordCall<T>(db: Database, connector: string, now: Date, fn: () => Promise<T>): Promise<T> {
  try {
    const r = await fn();
    db.run("INSERT INTO connector_calls (id, connector, ok, error_code, at) VALUES (?, ?, 1, NULL, ?)", [Bun.randomUUIDv7(), connector, now.toISOString()]);
    return r;
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "UNKNOWN";
    db.run("INSERT INTO connector_calls (id, connector, ok, error_code, at) VALUES (?, ?, 0, ?, ?)", [Bun.randomUUIDv7(), connector, code.slice(0, 40), now.toISOString()]);
    throw e;
  }
}
