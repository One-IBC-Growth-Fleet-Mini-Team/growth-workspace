// Trang thị trường (Mi1-mkt-03; D-46): quy định mới và tiếng khách. Giá đối thủ xem ở /competitors.
import type { buildMarketBoard } from "../../db/market.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderMarketPage(args: { board: ReturnType<typeof buildMarketBoard>; canPull: boolean; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Thị trường", html`<h1>Quy định và tiếng khách</h1>
<p><a href="/queue">Quay lại Hàng chờ</a> · <a href="/competitors">Giá đối thủ</a></p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>Quy định mới (${b.regulation.length})</h2>${b.regulation.length ? html`<table class="kv">${b.regulation.map((r) => html`<tr><td>${r.jurisdiction ?? "chung"}<br><span class="meta">${r.effectiveDate ?? ""}</span></td><td>${r.title ?? ""}<br><span class="meta">${r.summary ?? ""}</span></td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Tiếng khách theo chủ đề</h2>${b.reviewThemes.length ? html`<table class="kv">${b.reviewThemes.map((t) => html`<tr><td>${t.theme}</td><td>${t.count} ý kiến</td><td>${t.avgRating === null ? "" : `${t.avgRating}/5`}</td></tr>`)}</table>
<details><summary>Các ý kiến (đã lọc PII)</summary><ul>${b.reviews.map((x) => html`<li>${x.summary ?? ""} <span class="meta">${x.source ?? ""}${x.rating === null ? "" : `, ${x.rating}/5`}</span></li>`)}</ul></details>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp dữ liệu</h2>${args.canPull ? html`<form method="post" action="/market"><input type="hidden" name="csrf" value="${args.csrf}"><button name="pull" value="1">Kéo từ market-scan (quy định, tiếng khách, giá đối thủ)</button></form>` : ""}
<form method="post" action="/market" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Loại <select name="kind"><option value="regulation">Quy định</option><option value="reviews">Tiếng khách</option></select></label>
<p class="meta">Cột của file quy định: jurisdiction, title, summary, effective_date, source_url. Cột của file tiếng khách: source, jurisdiction, theme, rating, text.</p>
<label>CSV <input type="file" name="file" accept=".csv,text/csv"> <span class="meta"><a href="/samples/market-regulation.csv" download>File mẫu quy định</a> <a href="/samples/market-reviews.csv" download>File mẫu tiếng khách</a></span></label><button type="submit">Nạp</button></form></section>`);
}
