// Trang so giá với đối thủ (Mi1-mkt-04; D-40): theo tài phán và gói; tài phán chưa có giá đối thủ.
import type { buildCompetitorBoard } from "../../db/competitors.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const usd = (v: number | null) => (v === null ? "chưa có" : v.toLocaleString("en-US"));
const gap = (v: number | null) => (v === null ? "" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

export function renderCompetitorsPage(args: { board: ReturnType<typeof buildCompetitorBoard>; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Giá đối thủ", html`<h1>Giá gói so với đối thủ</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Giá đối thủ nạp lần cuối: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p class="meta">Giá của mình là giá "từ" (loại hình rẻ nhất) trong sheet FINAL. Chênh dương: mình đắt hơn giá thấp nhất của đối thủ. Dùng cho bảng so sánh phí ở tầng 4; không tự đổi giá.</p>
${b.rows.length ? html`<table class="kv"><tr><td><strong>Tài phán, gói</strong></td><td><strong>Mình</strong></td><td><strong>Đối thủ thấp nhất, trung vị</strong></td><td><strong>Chênh</strong></td></tr>
${b.rows.map((r) => html`<tr><td>${r.jurisdiction}<br><span class="meta">${r.tier}</span></td><td>${usd(r.ours)}</td><td>${usd(r.competitorMin)} (${r.cheapest ?? ""}), ${usd(r.competitorMedian)}<br><span class="meta">${r.competitors} đối thủ</span></td><td>${r.gapToMin !== null && r.gapToMin > 0 ? html`<span class="warn">${gap(r.gapToMin)}</span>` : gap(r.gapToMin)}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}
${b.withoutCompetitor.length ? html`<p class="meta">Tài phán trong sheet FINAL chưa có giá đối thủ (${b.withoutCompetitor.length}): ${b.withoutCompetitor.join(", ")}.</p>` : ""}
${b.notInPriceSheet.length ? html`<p class="warn">Tên tài phán không có trong sheet FINAL: ${b.notInPriceSheet.join(", ")}.</p>` : ""}
<section><h2>Nạp giá đối thủ</h2><form method="post" action="/competitors" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV có cột competitor, jurisdiction, tier (starter, grow, premium), price_usd, source_url, collected_on <input type="file" name="prices" accept=".csv,text/csv"> <span class="meta"><a href="/samples/competitor-prices.csv" download>File mẫu</a></span></label>
<button type="submit">Nạp</button></form></section>`);
}
