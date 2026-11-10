// Trang tổng quan quảng cáo (Mi1-mkt-01; D-39): số theo nền tảng một tuần, gợi ý tầng 2, khoá chéo TRACKING_DEGRADED.
import type { AdsOverview } from "../../db/ads-overview.ts";
import { ddmm } from "../../time.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const NAME: Record<string, string> = { meta: "Meta", google: "Google Ads" };
const pct = (v: number | null) => (v === null ? "chưa có" : `${(v * 100).toFixed(2)}%`);

export function renderAdsOverviewPage(args: { o: AdsOverview; prevWeek: string; nextWeek: string; csrf: string; message: string | null }): string {
  const o = args.o;
  return shell("Tổng quan quảng cáo", html`<h1>Quảng cáo tuần ${ddmm(o.week)}</h1>
<p><a href="/queue">Quay lại Hàng chờ</a> · <a href="/ads-overview?week=${args.prevWeek}">Tuần trước</a> · <a href="/ads-overview?week=${args.nextWeek}">Tuần sau</a></p>
${o.frozen ? html`<div class="status yellow"><strong>TRACKING_DEGRADED</strong> ở Mi1-data-01: đóng băng đánh giá xấu Hook ở tầng 2 cho tới khi tracking phục hồi (spec mục 8, khoá chéo). Không tắt quảng cáo vì các cờ dưới.</div>` : ""}
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
${o.platforms.length ? html`<section><h2>Theo nền tảng</h2><table class="kv"><tr><td><strong>Nền tảng</strong></td><td><strong>Quảng cáo</strong></td><td><strong>Impressions</strong></td><td><strong>Clicks, CTR</strong></td><td><strong>Chi tiêu, CPC (USD)</strong></td></tr>
${o.platforms.map((p) => html`<tr><td>${NAME[p.platform] ?? p.platform}</td><td>${p.ads}</td><td>${p.impressions.toLocaleString("en-US")}</td><td>${p.clicks.toLocaleString("en-US")}, ${pct(p.ctr)}</td><td>${p.spend.toLocaleString("en-US")}, ${p.cpc === null ? "chưa có" : p.cpc.toFixed(2)}</td></tr>`)}</table></section>
<section><h2>Tầng 2: nên đổi pattern Hook hoặc Scene 1, giữ offer (${o.flags.length})</h2><p class="meta">Xét quảng cáo từ 3.000 impressions trong tuần: CTR dưới trung vị cùng nền tảng hoặc Frequency trên 2,5. Đây là gợi ý; Team MKT chọn biến thể sáng thứ Hai.</p>
${o.flags.length ? html`<table class="kv">${o.flags.map((f) => html`<tr><td>${f.ad}<br><span class="meta">${NAME[f.platform] ?? f.platform}</span></td><td class="${o.frozen ? "meta" : "warn"}">${f.reasons.join("; ")}${o.frozen ? " (đang đóng băng)" : ""}</td></tr>`)}</table>` : ""}</section>` : html`<p class="meta">Chưa có file quảng cáo cho tuần này. Không đề xuất gì khi chưa có dữ liệu thật (spec mục 6, quy tắc 3).</p>`}
<section><h2>Nạp báo cáo tuần</h2><form method="post" action="/ads-overview" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Nền tảng <select name="platform"><option value="meta">Meta Ads Manager</option><option value="google">Google Ads</option></select></label>
<label>Tuần bắt đầu (thứ Hai) <input type="date" name="week" value="${o.week}" required></label>
<label>CSV xuất theo cấp quảng cáo, đúng khoảng thứ Hai tới Chủ nhật <input type="file" name="report" accept=".csv,text/csv"> <span class="meta"><a href="/samples/meta-ads.csv" download>File mẫu meta</a> <a href="/samples/google-ads.csv" download>File mẫu google</a></span></label>
<button type="submit">Nạp</button></form></section>`);
}
