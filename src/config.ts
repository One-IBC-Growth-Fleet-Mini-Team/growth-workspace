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

export type LlmPricing = { model: string; inputUsdPerMTok: number; outputUsdPerMTok: number };

export function getLlmPricing(env: Env = process.env): LlmPricing {
  return {
    model: required(env, "LLM_MODEL"),
    inputUsdPerMTok: positiveNumber(env, "LLM_PRICE_INPUT_USD_PER_MTOK"),
    outputUsdPerMTok: positiveNumber(env, "LLM_PRICE_OUTPUT_USD_PER_MTOK"),
  };
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
