// Trang tiến độ 45 tài phán (Mi1-mkt-05, D-32): chốt giá và đủ file SKD từng tài phán. Chỉ xem và nạp file.
import type { JurisdictionBoard } from "../../db/jurisdictions.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderJurisdictionsPage(args: { board: JurisdictionBoard; csrf: string; skdFiles: number; message: string | null }): string {
  const b = args.board;
  const s = b.summary;
  const why = (r: JurisdictionBoard["rows"][number]) =>
    r.ready ? "Sẵn sàng" : [r.priceLocked ? "" : "chưa chốt giá", r.skdMissing ? `thiếu ${r.skdMissing} file SKD` : ""].filter(Boolean).join(", ");
  return shell("Tài phán", html`<h1>Tiến độ ${s.total} tài phán</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Lượt nạp gần nhất: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>${s.ready}/${s.total} tài phán sẵn sàng</h2><p>Đã chốt giá: ${s.priceLocked}/${s.total}. Có trong file: ${s.listed}.${s.notListed ? html` <span class="warn">Chưa có trong file nào: ${s.notListed} tài phán.</span>` : ""}</p>
<p class="meta">Sẵn sàng = đã chốt giá và đủ ${args.skdFiles} loại file SKD ở trạng thái xong. Tài phán chưa sẵn sàng thì giữ lại, không chạy chiến dịch giá gói (spec mục 15).</p></section>
<section><h2>Từng tài phán</h2>${b.rows.length ? html`<table class="kv"><tr><td><strong>Mã</strong></td><td><strong>Bảng giá</strong></td><td><strong>File SKD xong</strong></td><td><strong>Tình trạng</strong></td></tr>
${b.rows.map((r) => html`<tr><td>${r.code}</td><td>${r.priceStatus ?? "chưa có"}${r.priceVersion ? html` (${r.priceVersion})` : ""}</td><td>${r.skdDoneTypes}/${args.skdFiles}</td><td>${r.ready ? why(r) : html`<span class="warn">${why(r)}</span>`}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp file</h2><form method="post" action="/jurisdictions" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Bảng giá (mã tài phán, trạng thái, version) <input type="file" name="price" accept=".csv,text/csv"></label>
<label>Danh sách file SKD (mã tài phán, loại file, trạng thái) <input type="file" name="skd" accept=".csv,text/csv"></label>
<button type="submit">Nạp</button></form></section>`);
}
