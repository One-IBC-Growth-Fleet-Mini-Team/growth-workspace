// is_reseller_end_client (metric-definitions.md): chỉ lấy từ trường CRM (Data Contract A4).
// Không suy đoán: trường trống là "unknown"; giá trị lạ là lỗi dữ liệu, không đoán.
export type ResellerFlag = true | false | "unknown";

export function isResellerEndClient(value: 0 | 1 | null): ResellerFlag {
  if (value === 1) return true;
  if (value === 0) return false;
  if (value === null || value === undefined) return "unknown";
  throw new TypeError("is_reseller_end_client: unexpected value");
}
