// Cửa duy nhất tới API CRM (design doc mục 6, lớp L2 và L3). CRM chỉ đọc (CLAUDE.md quy tắc 1).
// - Phương thức gán cứng "GET"; crmGet không có tham số phương thức hay nội dung gửi đi.
// - resource thuộc enum cố định; host phải thuộc allowlist; mọi chuyển hướng (3xx) bị từ chối, không đi theo.
// - 401/403 không thử lại; 5xx, 429 và lỗi mạng thử lại đúng 3 lần có giãn cách.
// - Thông điệp lỗi chỉ có mã, không có nội dung phản hồi (có thể chứa dữ liệu khách).
// [ĐỐI CHIẾU SCHEMA] Đường dẫn resource, xác thực, tiêu đề: tên tạm, chờ tài liệu API CRM (Q-01).

export const CRM_RESOURCES = ["Opportunity", "Client", "Lead", "OrderItem"] as const;
export type CrmResource = (typeof CRM_RESOURCES)[number];
export type CrmQuery = Record<string, string | number | boolean>;

// Đường dẫn tạm của từng resource, nối sau CRM_API_BASE.
const RESOURCE_PATHS: Record<CrmResource, string> = {
  Opportunity: "Opportunity",
  Client: "Client",
  Lead: "Lead",
  OrderItem: "OrderItem",
};

// Host CRM được phép (https). Loopback chỉ được phép khi NODE_ENV=test (bun test tự đặt),
// để chạy CRM giả trong test; môi trường chạy thật không gọi được loopback.
const ALLOWED_HOSTS = new Set(["api-crm.oneibc.com"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const CRM_MAX_RETRIES = 3;

export type CrmErrorCode =
  | "CRM_RESOURCE_NOT_ALLOWED"
  | "CRM_HOST_NOT_ALLOWED"
  | "CRM_OPTION_NOT_ALLOWED"
  | "CRM_REDIRECT"
  | "CRM_AUTH"
  | "CRM_CLIENT_ERROR"
  | "CRM_SERVER_ERROR"
  | "CRM_NETWORK"
  | "CRM_BAD_RESPONSE";

export class CrmError extends Error {
  constructor(
    readonly code: CrmErrorCode,
    readonly status?: number,
  ) {
    super(status === undefined ? code : `${code} ${status}`);
  }
}

export type CrmGetOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch; // thay bằng fetch giả trong test
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

const OPTION_KEYS = new Set(["baseUrl", "token", "fetchImpl", "sleep", "timeoutMs"]);

function checkedBase(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CrmError("CRM_HOST_NOT_ALLOWED");
  }
  const allowed =
    (url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname)) ||
    (process.env.NODE_ENV === "test" &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname));
  if (!allowed || url.username || url.password) throw new CrmError("CRM_HOST_NOT_ALLOWED");
  return url;
}

function buildUrl(base: URL, resource: CrmResource, query: CrmQuery): URL {
  const url = new URL(base.href);
  url.pathname = `${base.pathname.replace(/\/+$/, "")}/${RESOURCE_PATHS[resource]}`;
  url.search = "";
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  if (url.origin !== base.origin) throw new CrmError("CRM_HOST_NOT_ALLOWED");
  return url;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function crmGet(resource: CrmResource, query: CrmQuery, options: CrmGetOptions): Promise<unknown> {
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new CrmError("CRM_OPTION_NOT_ALLOWED");
  }
  if (!(CRM_RESOURCES as readonly string[]).includes(resource)) throw new CrmError("CRM_RESOURCE_NOT_ALLOWED");
  const base = checkedBase(options.baseUrl);
  const url = buildUrl(base, resource, query);
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: CrmError = new CrmError("CRM_NETWORK");
  for (let attempt = 0; attempt <= CRM_MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await doFetch(url.href, {
        method: "GET",
        headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch {
      lastError = new CrmError("CRM_NETWORK");
      continue;
    }
    if (res.status >= 300 && res.status < 400) throw new CrmError("CRM_REDIRECT", res.status);
    if (res.status === 401 || res.status === 403) throw new CrmError("CRM_AUTH", res.status);
    if (res.status >= 500 || res.status === 429) {
      lastError = new CrmError("CRM_SERVER_ERROR", res.status);
      continue;
    }
    if (res.status >= 400) throw new CrmError("CRM_CLIENT_ERROR", res.status);
    try {
      return await res.json();
    } catch {
      throw new CrmError("CRM_BAD_RESPONSE", res.status);
    }
  }
  throw lastError;
}
