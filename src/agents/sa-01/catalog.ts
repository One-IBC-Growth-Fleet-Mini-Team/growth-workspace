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

// Nghĩa tiếng Việt của từng mã để hiện trên Hàng chờ (cột "Nghĩa" của rejection-reason-codes.md).
export const REASON_LABELS: Record<ReasonCode, string> = {
  PRICE_TOO_HIGH: "Khách chê giá cao so với kỳ vọng",
  PRICE_COMPARING: "Khách đang so giá với nhà cung cấp khác, chưa quyết",
  PRICE_DISCOUNT_ASK: "Khách đồng ý dịch vụ nhưng đòi giảm phí",
  NO_NEED_NOW: "Có nhu cầu nhưng chưa cần ngay",
  NO_NEED: "Không có nhu cầu",
  EXPECTATION_MISMATCH: "Khách kỳ vọng sai về dịch vụ",
  SCOPE_ADVISORY_DEPTH: "Khách cần tư vấn chuyên sâu vượt phạm vi gói",
  RESTRICTED_INDUSTRY: "Ngành không nhận (Forex, Markets, môi giới tài chính...)",
  KYC_NOT_COMPLETED: "Khách không bổ sung hoặc không qua được KYC",
  BANK_DECLINED: "Ngân hàng hoặc EMI từ chối hồ sơ",
  SLOW_TURNAROUND: "Khách bỏ vì thời gian xử lý chậm",
  UNRESPONSIVE: "Khách im lặng sau báo giá hoặc follow up",
  PAYMENT_PENDING: "Đã chốt nhưng chưa thanh toán, quá hạn invoice",
  RESELLER_CHANNEL: "Khách cuối của reseller, không upsell trực tiếp",
  OTHER: "Lý do khác",
};
