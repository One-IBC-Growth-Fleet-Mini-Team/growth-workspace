// Token ứng dụng cho Microsoft Graph (client credentials) từ app Entra dùng chung (D-04).
// Q-02: quyền application hay delegated do admin tenant chốt; nếu là delegated thì thay hàm này.
// Gọi login.microsoftonline.com, không phải CRM.
import type { EntraConfig } from "../config.ts";

export function createGraphTokenProvider(cfg: EntraConfig, fetchImpl: typeof fetch = fetch): (force?: boolean) => Promise<string> {
  let cached: { token: string; exp: number } | null = null;
  // force = true: token bị Graph từ chối (401) nên lấy token mới (D-96).
  return async (force = false) => {
    if (!force && cached && cached.exp - 60_000 > Date.now()) return cached.token;
    const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }).toString(),
      redirect: "manual",
    });
    if (!res.ok) throw Object.assign(new Error("GRAPH_TOKEN"), { code: "GRAPH_AUTH" });
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
    return cached.token;
  };
}
