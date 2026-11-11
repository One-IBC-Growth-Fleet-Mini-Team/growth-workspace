// Cửa đọc chung cho adapter thật (D-96): CRM, Internal Control, Graph, Meta Ads, Google Ads, GA4. Chỉ đọc:
// - GET, hoặc POST chỉ tới đường dẫn truy vấn đọc đã liệt kê (GA4 :runReport, Google Ads googleAds:search); đường
//   dẫn khác bị từ chối trước khi gọi, nên không có code path nào gọi được endpoint ghi (mutate, create, update).
// - Host phải thuộc allowlist của adapter; chuyển hướng (3xx) bị từ chối, không đi theo.
// - Token hết hạn (401 hoặc mã riêng của nền tảng): lấy token mới đúng một lần rồi gọi lại; vẫn hết hạn thì AUTH_EXPIRED.
// - Giới hạn tần suất (429 hoặc mã riêng) và 5xx: chờ theo Retry-After (hoặc giãn cách luỹ thừa) rồi thử lại, tối đa 3 lần.
// - Thông điệp lỗi chỉ có mã, không có nội dung phản hồi (có thể chứa dữ liệu khách).

export type ConnectorErrorCode = "HOST_NOT_ALLOWED" | "NOT_READ_ENDPOINT" | "REDIRECT" | "AUTH" | "AUTH_EXPIRED" | "RATE_LIMITED" | "HTTP" | "NETWORK" | "BAD_RESPONSE";
export class ConnectorError extends Error {
  constructor(readonly connector: string, readonly code: ConnectorErrorCode, readonly status?: number) {
    super(`${connector}: ${code}${status === undefined ? "" : ` ${status}`}`);
  }
}

// get(true) bỏ token đang giữ và lấy token mới (refresh token, client credentials); token cố định thì trả lại như cũ.
export type TokenSource = { get(force?: boolean): Promise<string> };
export const staticToken = (t: string): TokenSource => ({ get: async () => t });

export type ReadRequest = { url: string; method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> };
export type ReadOptions = {
  connector: string;
  hosts: readonly string[];
  readPost?: readonly RegExp[];                 // đường dẫn POST được phép (truy vấn đọc)
  token: TokenSource;
  authHeaders?: (token: string) => Record<string, string>;
  isAuthExpired?: (status: number, body: unknown) => boolean;
  isRateLimited?: (status: number, body: unknown) => boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function check(req: ReadRequest, o: ReadOptions): URL {
  let url: URL;
  try { url = new URL(req.url); } catch { throw new ConnectorError(o.connector, "HOST_NOT_ALLOWED"); }
  const testLoopback = process.env.NODE_ENV === "test" && LOOPBACK.has(url.hostname);
  if ((!testLoopback && (url.protocol !== "https:" || !o.hosts.includes(url.hostname))) || url.username || url.password) throw new ConnectorError(o.connector, "HOST_NOT_ALLOWED");
  if ((req.method ?? "GET") === "POST" && !(o.readPost ?? []).some((re) => re.test(url.pathname))) throw new ConnectorError(o.connector, "NOT_READ_ENDPOINT");
  return url;
}

function retryAfterMs(res: Response, attempt: number): number {
  const h = res.headers.get("retry-after");
  const s = h !== null && /^\d+$/.test(h.trim()) ? Number(h) : null;
  return s !== null ? Math.min(s, 120) * 1000 : 500 * 2 ** attempt;
}

export async function readJson(req: ReadRequest, o: ReadOptions): Promise<unknown> {
  const url = check(req, o);
  const doFetch = o.fetchImpl ?? fetch, sleep = o.sleep ?? defaultSleep, max = o.maxRetries ?? 3;
  let refreshed = false, attempt = 0, last: ConnectorError = new ConnectorError(o.connector, "NETWORK");
  while (attempt <= max) {
    const token = await o.token.get(false);
    let res: Response;
    try {
      res = await doFetch(url.href, {
        method: req.method ?? "GET", redirect: "manual", signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
        headers: { Accept: "application/json", ...(req.body === undefined ? {} : { "content-type": "application/json" }), ...(o.authHeaders ?? ((t) => ({ Authorization: `Bearer ${t}` })))(token), ...req.headers },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      });
    } catch {
      last = new ConnectorError(o.connector, "NETWORK"); attempt += 1; if (attempt <= max) await sleep(500 * 2 ** attempt); continue;
    }
    if (res.status >= 300 && res.status < 400) throw new ConnectorError(o.connector, "REDIRECT", res.status);
    let body: unknown = null;
    try { body = await res.json(); } catch { if (res.ok) throw new ConnectorError(o.connector, "BAD_RESPONSE", res.status); }
    if (res.ok && !(o.isAuthExpired?.(res.status, body)) && !(o.isRateLimited?.(res.status, body))) return body;
    if (res.status === 401 || o.isAuthExpired?.(res.status, body)) {
      if (refreshed) throw new ConnectorError(o.connector, "AUTH_EXPIRED", res.status);
      refreshed = true; await o.token.get(true); continue;
    }
    if (res.status === 429 || res.status >= 500 || o.isRateLimited?.(res.status, body)) {
      last = new ConnectorError(o.connector, res.status >= 500 ? "HTTP" : "RATE_LIMITED", res.status);
      attempt += 1; if (attempt <= max) await sleep(retryAfterMs(res, attempt)); continue;
    }
    throw new ConnectorError(o.connector, res.status === 403 ? "AUTH" : "HTTP", res.status);
  }
  throw last;
}

// Phân trang: next(body) trả yêu cầu trang kế tiếp hoặc null. Có trần số trang để không lặp vô hạn.
export async function readAll<T>(first: ReadRequest, o: ReadOptions, items: (body: unknown) => T[], next: (body: unknown, req: ReadRequest) => ReadRequest | null, maxPages = 200): Promise<T[]> {
  const out: T[] = [];
  let req: ReadRequest | null = first;
  for (let page = 0; req && page < maxPages; page++) {
    const body = await readJson(req, o);
    out.push(...items(body));
    req = next(body, req);
  }
  return out;
}

// OAuth refresh token (Google Ads, GA4): đổi refresh token lấy access token ở oauth2.googleapis.com, giữ tới gần hết hạn.
export function googleRefreshToken(cfg: { clientId: string; clientSecret: string; refreshToken: string }, connector: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): TokenSource {
  let cached: { token: string; exp: number } | null = null;
  return {
    async get(force = false) {
      if (!force && cached && cached.exp - 60_000 > now()) return cached.token;
      let res: Response;
      try {
        res = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }).toString() });
      } catch { throw new ConnectorError(connector, "NETWORK"); }
      if (!res.ok) throw new ConnectorError(connector, "AUTH_EXPIRED", res.status);
      const b = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!b.access_token) throw new ConnectorError(connector, "BAD_RESPONSE");
      cached = { token: b.access_token, exp: now() + (b.expires_in ?? 3600) * 1000 };
      return cached.token;
    },
  };
}
