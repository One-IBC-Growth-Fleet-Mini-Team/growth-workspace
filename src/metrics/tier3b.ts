// tier3b_landing (spec mục 8 tầng 3B, metric-definitions.md; D-68): lỗi ở trang đích khi tracking bình thường nhưng ít
// người bắt đầu hỏi hoặc để lại liên hệ. Ngưỡng là giá trị tạm (getProvisional("tier3b")). Tính bằng code, không do LLM.
export type Tier3bParams = { min_asset_view_per_week: number; ask_per_view_below: number; contact_per_ask_below: number; skip_when_tracking_degraded: boolean };
export type Tier3bResult =
  | { status: "skipped_tracking_degraded" | "insufficient_data"; assetView: number }
  | { status: "flag" | "ok"; assetView: number; askPerView: number; contactPerAsk: number | null; reasons: ("ask_per_view" | "contact_per_ask")[] };

export function tier3bCheck(c: { assetView: number; askStarted: number; contactCaptured: number; trackingDegraded: boolean }, p: Tier3bParams): Tier3bResult {
  if (p.skip_when_tracking_degraded && c.trackingDegraded) return { status: "skipped_tracking_degraded", assetView: c.assetView };
  if (c.assetView < p.min_asset_view_per_week) return { status: "insufficient_data", assetView: c.assetView };
  const askPerView = c.askStarted / c.assetView;
  const contactPerAsk = c.askStarted > 0 ? c.contactCaptured / c.askStarted : null;
  const reasons: ("ask_per_view" | "contact_per_ask")[] = [];
  if (askPerView < p.ask_per_view_below) reasons.push("ask_per_view");
  if (contactPerAsk !== null && contactPerAsk < p.contact_per_ask_below) reasons.push("contact_per_ask");
  return { status: reasons.length ? "flag" : "ok", assetView: c.assetView, askPerView, contactPerAsk, reasons };
}
