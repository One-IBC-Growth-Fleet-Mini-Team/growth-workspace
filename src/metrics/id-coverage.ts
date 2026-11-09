// Chỉ số Mi1-data-01 (metric-definitions.md `id_coverage`; spec tầng 3A, Phụ lục A; D-36). Tính bằng code, không do LLM.
//   id_coverage: số phiên (session_id khác rỗng) có ít nhất một contact_captured mang contact_id,
//     chia cho số phiên có session_id. Không có phiên thì không có tỷ lệ.
//   event_missing_fields: trường bắt buộc (A1 chung + A2 theo sự kiện) còn trống của một sự kiện.

// Phụ lục A1: trường chung cho mọi sự kiện.
const COMMON = ["event_id", "event_name", "event_time", "source", "anonymous_id"];
// Phụ lục A2: trường bắt buộc thêm. Tên tiếng Việt trong spec đặt tên cột tiếng Anh: kênh = channel,
// số tiền = amount, tiền tệ = currency; utm_* kiểm bằng utm_source.
export const REQUIRED_BY_EVENT: Record<string, string[]> = {
  price_sheet_published: ["jurisdiction_code", "price_sheet_version"],
  asset_packaged: ["asset_id", "creative_ir_id", "hook_id", "channel_account_id", "qa_status"],
  asset_view: ["session_id", "asset_id", "utm_source", "landing_url", "platform_campaign_id", "ad_id"],
  ask_occ_started: ["session_id", "conversation_id", "landing_url"],
  contact_captured: ["session_id", "conversation_id", "contact_id", "channel", "wa_business_number", "consent"],
  lead_verified: ["lead_id", "contact_id"],
  opportunity_created: ["opportunity_id", "lead_id", "jurisdiction_code", "service_type"],
  quote_sent: ["quote_id", "opportunity_id", "price_sheet_version"],
  order_created: ["order_id", "opportunity_id", "gross_order_value"],
  payment_confirmed: ["payment_id", "order_id", "amount", "currency"],
  order_refunded: ["order_id", "refund"],
  renewal_due: ["customer_id", "renewal_due_date"],
  renewal_paid: ["customer_id", "payment_id"],
  referral_submitted: ["referral_id", "partner_id", "partner_type", "contact_id"],
  referral_converted: ["referral_id", "order_id", "is_reseller_end_client"],
};

export function missingFields(eventName: string, row: Record<string, string>): string[] | null {
  const extra = REQUIRED_BY_EVENT[eventName];
  if (!extra) return null;
  return [...COMMON, ...extra].filter((f) => !(row[f] ?? "").trim());
}

export function idCoverage(events: { session_id: string; event_name: string; contact_id: string }[]) {
  const sessions = new Set<string>();
  const linked = new Set<string>();
  for (const e of events) {
    if (!e.session_id) continue;
    sessions.add(e.session_id);
    if (e.event_name === "contact_captured" && e.contact_id) linked.add(e.session_id);
  }
  return { sessions: sessions.size, linked: linked.size, rate: sessions.size ? linked.size / sessions.size : null };
}
