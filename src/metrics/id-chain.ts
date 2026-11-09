// chain_link_coverage (spec mục 5, metric-definitions.md; D-52): chuỗi 12 mã ID là chuỗi liên kết mềm. Mỗi mắt nối
// (ID trước, ID sau) đo trên sự kiện Phụ lục A2 mang cả hai ID: tỷ lệ sự kiện loại đó có đủ cả hai. Mắt nối không có sự
// kiện nào trong Phụ lục A2 mang đủ hai ID thì báo "no_event" (cần bổ sung Data Contract), không suy đoán.
export const CHAIN_IDS = ["channel_account_id", "platform_campaign_id", "hook_id", "creative_ir_id", "asset_id", "session_id", "conversation_id", "contact_id", "lead_id", "opportunity_id", "quote_id", "order_id", "payment_id"] as const;

// Sự kiện mang cả hai ID của từng mắt nối (theo REQUIRED_BY_EVENT, Phụ lục A2). null: chưa có sự kiện nào.
export const CHAIN_LINKS: { from: string; to: string; event: string | null }[] = [
  { from: "channel_account_id", to: "platform_campaign_id", event: null },
  { from: "platform_campaign_id", to: "hook_id", event: null },
  { from: "hook_id", to: "creative_ir_id", event: "asset_packaged" },
  { from: "creative_ir_id", to: "asset_id", event: "asset_packaged" },
  { from: "asset_id", to: "session_id", event: "asset_view" },
  { from: "session_id", to: "conversation_id", event: "ask_occ_started" },
  { from: "conversation_id", to: "contact_id", event: "contact_captured" },
  { from: "contact_id", to: "lead_id", event: "lead_verified" },
  { from: "lead_id", to: "opportunity_id", event: "opportunity_created" },
  { from: "opportunity_id", to: "quote_id", event: "quote_sent" },
  { from: "quote_id", to: "order_id", event: null },
  { from: "order_id", to: "payment_id", event: "payment_confirmed" },
];

export type LinkCoverage = { from: string; to: string; event: string | null; status: "no_event" | "no_data" | "measured"; total: number; linked: number; rate: number | null };

export function chainLinkCoverage(events: readonly { eventName: string; ids: ReadonlySet<string> }[]): LinkCoverage[] {
  return CHAIN_LINKS.map((l) => {
    if (!l.event) return { ...l, status: "no_event", total: 0, linked: 0, rate: null };
    const rs = events.filter((e) => e.eventName === l.event);
    const linked = rs.filter((e) => e.ids.has(l.from) && e.ids.has(l.to)).length;
    return { ...l, status: rs.length ? "measured" : "no_data", total: rs.length, linked, rate: rs.length ? linked / rs.length : null };
  });
}
