// Đọc biến môi trường. Secret chỉ đến từ biến môi trường (CLAUDE.md quy tắc 6).
// Mỗi job chỉ đòi đúng nhóm biến nó cần; thiếu biến bắt buộc thì ném ConfigError chỉ kèm tên biến, không kèm giá trị.

export type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  readonly code = "CONFIG_MISSING_OR_INVALID";
  constructor(readonly variable: string) {
    super(`config: ${variable}`);
  }
}

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(name);
  return value;
}

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function positiveNumber(env: Env, name: string): number {
  const n = Number(required(env, name));
  if (!Number.isFinite(n) || n < 0) throw new ConfigError(name);
  return n;
}

export function getDbPath(env: Env = process.env): string {
  return required(env, "GROWTH_DB_PATH");
}

export type CrmConfig = { baseUrl: string; token: string };

export function getCrmConfig(env: Env = process.env): CrmConfig {
  return { baseUrl: required(env, "CRM_API_BASE"), token: required(env, "CRM_API_TOKEN") };
}

// D-05: HMAC-SHA256, khoá tối thiểu 32 ký tự.
export const PII_HASH_KEY_MIN_LENGTH = 32;

export function getPiiHashKey(env: Env = process.env): string {
  const key = required(env, "PII_HASH_KEY");
  if (key.length < PII_HASH_KEY_MIN_LENGTH) throw new ConfigError("PII_HASH_KEY");
  return key;
}

// Chờ đối chiếu schema CRM (design doc mục 7.2): CRM lưu SĐT dạng nào. Không đặt mặc định.
export function getPhoneDefaultCountryCode(env: Env = process.env): string | undefined {
  const cc = optional(env, "PII_PHONE_DEFAULT_COUNTRY_CODE");
  if (cc !== undefined && !/^\d{1,3}$/.test(cc)) throw new ConfigError("PII_PHONE_DEFAULT_COUNTRY_CODE");
  return cc;
}

// D-13: ca eval dựng từ dữ liệu thật nằm ngoài repo; không bắt buộc.
export function getPrivateEvalDir(env: Env = process.env): string | undefined {
  return optional(env, "SA01_PRIVATE_EVAL_DIR");
}

// Thư mục kết quả eval (design doc mục 12.3). Khi chạy trong container phải nằm trên ổ bền,
// ví dụ /data/eval-results; mặc định là evals/sa-01/results trong repo (bị .gitignore chặn).
export function getEvalResultsDir(repoRoot: string, env: Env = process.env): string {
  return optional(env, "SA01_EVAL_RESULTS_DIR") ?? `${repoRoot.replace(/\/+$/, "")}/evals/sa-01/results`;
}

export type LlmPricing = { model: string; inputUsdPerMTok: number; outputUsdPerMTok: number };

export function getLlmPricing(env: Env = process.env): LlmPricing {
  return {
    model: required(env, "LLM_MODEL"),
    inputUsdPerMTok: positiveNumber(env, "LLM_PRICE_INPUT_USD_PER_MTOK"),
    outputUsdPerMTok: positiveNumber(env, "LLM_PRICE_OUTPUT_USD_PER_MTOK"),
  };
}

// Hàng chờ (design doc mục 5.7, D-04). SESSION_SECRET ký cookie phiên, tối thiểu 32 ký tự.
export type QueueConfig = { sessionSecret: string; baseUrl: string; host: string; port: number };

// Chạy trên chính máy của người dùng (D-26): chỉ http://localhost hoặc http://127.0.0.1 được miễn HTTPS,
// vì trình duyệt và Hàng chờ cùng một máy, dữ liệu không đi qua mạng.
export function isLocalBaseUrl(baseUrl: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(baseUrl);
}

export function getQueueConfig(env: Env = process.env): QueueConfig {
  const sessionSecret = required(env, "SESSION_SECRET");
  if (sessionSecret.length < 32) throw new ConfigError("SESSION_SECRET");
  const baseUrl = required(env, "QUEUE_BASE_URL").replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://") && !isLocalBaseUrl(baseUrl)) throw new ConfigError("QUEUE_BASE_URL");
  const port = Number(optional(env, "PORT") ?? "3000");
  if (!Number.isInteger(port)) throw new ConfigError("PORT");
  // Mặc định chỉ nghe trong máy; Caddy đứng trước nhận HTTPS từ Internet (D-23).
  const host = optional(env, "HOST") ?? "127.0.0.1";
  return { sessionSecret, baseUrl, host, port };
}

// Cách đăng nhập (D-24): "password" (mặc định, tạm khi chưa có app Entra) hoặc "entra" (D-04).
export type AuthConfig =
  | { mode: "password"; hashes: Map<string, string> }
  | { mode: "entra"; amyOid: string; markOid: string };

export function getAuthConfig(env: Env = process.env): AuthConfig {
  const mode = optional(env, "AUTH_MODE") ?? "password";
  if (mode === "entra") return { mode, amyOid: required(env, "AMY_ENTRA_OID"), markOid: required(env, "MARK_ENTRA_OID") };
  if (mode !== "password") throw new ConfigError("AUTH_MODE");
  const hashes = new Map<string, string>();
  for (const [user, name] of [["amy", "AMY_PASSWORD_HASH"], ["mark", "MARK_PASSWORD_HASH"]] as const) {
    const h = required(env, name);
    if (!h.startsWith("$argon2")) throw new ConfigError(name);
    hashes.set(user, h);
  }
  return { mode, hashes };
}

// Nguồn tự báo (D-24): "paste" (mặc định, Amy dán) hoặc "graph" (đọc channel Teams, cần quyền Q-02).
export function getReportSource(env: Env = process.env): "paste" | "graph" {
  const v = optional(env, "REPORT_SOURCE") ?? "paste";
  if (v !== "paste" && v !== "graph") throw new ConfigError("REPORT_SOURCE");
  return v;
}

// Nguồn dữ liệu CRM (D-24): "csv" (mặc định, Amy nạp file xuất từ CRM) hoặc "api" (khi MobCEC mở API, Q-01).
export function getCrmSource(env: Env = process.env): "csv" | "api" {
  const v = optional(env, "CRM_SOURCE") ?? "csv";
  if (v !== "csv" && v !== "api") throw new ConfigError("CRM_SOURCE");
  return v;
}

// Bảng ghép cột CSV của CRM, giữ ngoài repo vì tên cột là schema nội bộ (C8). Không có file thì dùng bảng mặc định.
export function getCrmColumnsPath(env: Env = process.env): string {
  return optional(env, "CRM_CSV_COLUMNS_PATH") ?? "/etc/growth/crm-columns.json";
}

// App đăng ký Entra dùng chung cho đăng nhập Hàng chờ và đọc Graph (D-04). Quyền cụ thể chờ admin tenant (Q-02).
export type EntraConfig = { tenantId: string; clientId: string; clientSecret: string };

export function getEntraConfig(env: Env = process.env): EntraConfig {
  return {
    tenantId: required(env, "TEAMS_TENANT_ID"),
    clientId: required(env, "ENTRA_CLIENT_ID"),
    clientSecret: required(env, "ENTRA_CLIENT_SECRET"),
  };
}

// Channel "Đồng bộ dữ liệu". [ĐỐI CHIẾU SCHEMA] id team, id channel (design doc mục 5.3).
export function getGraphChannel(env: Env = process.env): { teamId: string; channelId: string } | null {
  const teamId = optional(env, "GRAPH_TEAM_ID");
  const channelId = optional(env, "GRAPH_CHANNEL_ID");
  return teamId && channelId ? { teamId, channelId } : null;
}

// Webhook Teams (D-11): tới chat của Amy, và tin escalate tới Mark. Không bắt buộc.
export function getTeamsWebhooks(env: Env = process.env): { amy?: string; mark?: string } {
  return { amy: optional(env, "TEAMS_WEBHOOK_URL_AMY"), mark: optional(env, "TEAMS_WEBHOOK_URL_MARK") };
}

// Tham số của hàm chỉ số. Đổi giá trị phải qua PR, Mark duyệt (metric-definitions.md).
export const METRIC_PARAMS = {
  // rm_active_on_deal: số Opportunity có last_modified_at trùng tới từng giây từ mức này trở lên
  // thì coi là cập nhật hàng loạt. GIÁ TRỊ TẠM, chờ Amy và Mark chốt (Q-09).
  rmActiveBulkThreshold: 3,
  // compute_confidence (D-07, design doc mục 5.6).
  confidenceEscalateBelow: 0.8,
  evalMinCaseCount: 30,
  flagPenalty: 0.8,
} as const;

// Tham số NBA (design doc mục 5.5). Mọi giá trị dưới đây là TẠM, đổi qua PR.
export const NBA_PARAMS = {
  // Stage coi là đã đóng (không thuộc "Opportunity mở"). [ĐỐI CHIẾU SCHEMA] tên Stage thật của CRM.
  closedStages: ["Closed Won", "Closed Lost"] as readonly string[],
  // Trọng số ưu tiên theo Stage, gần chốt cao hơn. Chờ Amy cho thứ tự (Q-09); Stage lạ lấy unknownStageWeight.
  stageWeights: { Negotiation: 3, Quotation: 2, Qualification: 1, Prospecting: 0.5 } as Readonly<Record<string, number>>,
  unknownStageWeight: 0.5,
  // Giới hạn số mục NBA mỗi sáng. Đề xuất 20, chờ Amy (Q-10).
  maxItemsPerMorning: 20,
  // Luật 3: mã ngành bị hạ ưu tiên. [ĐỐI CHIẾU SCHEMA] trường ngành trên CRM (Q-14).
  restrictedIndustryCodes: ["FOREX", "MARKETS", "FINANCIAL_BROKER"] as readonly string[],
  restrictedIndustryFactor: 0.5,
  // Ca eval NBA (hard) phải pass 100% mới được sinh NBA (design doc mục 12.4).
  requiredNbaPassRate: 1,
} as const;

// Tham số WO tồn đọng (BK-08, D-25). N, M là GIÁ TRỊ TẠM do @harveyng710-source đặt 02/11/2026, chờ Amy chốt.
export const WO_PARAMS = {
  // Không có cập nhật từ chừng này ngày trở lên thì nhắc người phụ trách (N).
  remindAfterDays: 7,
  // Từ chừng này ngày trở lên thì báo lên Amy (M).
  escalateAfterDays: 14,
  // Status coi là WO đang mở, so không phân biệt hoa thường. Tên theo file Work Order của Bank Team.
  openStatuses: ["New", "In Progress"] as readonly string[],
} as const;

// Đối soát đơn hàng (Mi1-sa-01, D-30). Mọi giá trị là TẠM, [ĐỐI CHIẾU SCHEMA] với giá trị Status thật của CRM.
export const BILLING_PARAMS = {
  paidInvoiceStatuses: ["Paid", "Đã thanh toán"] as readonly string[],
  closedInvoiceStatuses: ["Cancelled", "Canceled", "Void"] as readonly string[],
  closedOrderStatuses: ["Cancelled", "Canceled"] as readonly string[],
  // Quá hạn từ chừng này ngày thì báo lên Amy thay vì chỉ nhắc RM.
  escalateOverdueDays: 14,
} as const;

// Đối tác (Mi1-ptn-01, D-31). Stage coi là đã chốt thắng; TẠM, [ĐỐI CHIẾU SCHEMA].
export const PARTNER_PARAMS = { wonStages: ["Closed Won"] as readonly string[] } as const;

// Tài phán và SKD (Mi1-mkt-05, D-32, D-33). 45 tài phán theo spec mục 1.
// Dòng giá lệch công thức gia hạn khi chênh quá max(absTolerance, relTolerance x số kỳ vọng): dòng lấy giá từ website
// được giảm nhẹ và làm tròn về đuôi 99 (đo trên sheet FINAL 03/11/2026: lệch tới khoảng 2,6%), lỗi thật lệch từ 30%.
// Bộ SKD eKYC: PDF, HTML và skdClips clip x 2 khổ x 2 bản (sạch, phụ đề) = 10 file; số clip là TẠM (K-04).
export const JURISDICTION_PARAMS = { total: 45, absTolerance: 150, relTolerance: 0.05, skdFiles: 10, skdClips: 2 } as const;
export type JurisdictionParams = { total: number; absTolerance: number; relTolerance: number; skdFiles: number; skdClips: number };

// Gợi ý ngân hàng (D-34). Thứ tự EMI ưu tiên theo sheet "GLOBAL EMI" của Bank Team (19/05/2026, TẠM);
// mục tiêu ít nhất 2 tài khoản cho mỗi khách theo sheet "Read me".
export const BANK_PARAMS = { priorityEmi: ["Airwallex", "Payoneer", "Aspire"] as readonly string[], minAccounts: 2 } as const;
export type BankParams = { priorityEmi: readonly string[]; minAccounts: number };

// Mi1-data-01 (D-36): cờ TRACKING_DEGRADED khi id_coverage dưới 19% (spec tầng 3A, mốc 25/09/2026); cửa sổ 7 ngày.
export const DATA01_PARAMS = { degradedBelow: 0.19, windowDays: 7 } as const;
export type Data01Params = { degradedBelow: number; windowDays: number };

// Trần chi phí LLM của Fleet mỗi tháng (spec mục 10, C7).
export const LLM_MONTHLY_CAP_USD = 100;
