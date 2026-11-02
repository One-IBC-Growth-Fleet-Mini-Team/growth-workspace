// Danh mục rejection_reason_code v0.1 (docs/spec/rejection-reason-codes.md, BẢN NHÁP chờ Amy và RM, Q-15).
// Đổi danh mục phải tăng CATALOG_VERSION và chạy lại toàn bộ eval (design doc mục 12.4).
export const CATALOG_VERSION = "v0.1";

export const REASON_CODES = [
  "PRICE_TOO_HIGH",
  "PRICE_COMPARING",
  "PRICE_DISCOUNT_ASK",
  "NO_NEED_NOW",
  "NO_NEED",
  "EXPECTATION_MISMATCH",
  "SCOPE_ADVISORY_DEPTH",
  "RESTRICTED_INDUSTRY",
  "KYC_NOT_COMPLETED",
  "BANK_DECLINED",
  "SLOW_TURNAROUND",
  "UNRESPONSIVE",
  "PAYMENT_PENDING",
  "RESELLER_CHANNEL",
  "OTHER",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

// Nhóm STALL: deal đang kẹt, không phải từ chối (is_final mặc định false).
export const STALL_CODES: readonly ReasonCode[] = ["UNRESPONSIVE", "PAYMENT_PENDING"];
