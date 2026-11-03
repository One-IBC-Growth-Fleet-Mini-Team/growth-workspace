// Trang tiến độ 45 tài phán (Mi1-mkt-05, D-32, D-33): chốt giá từng tài phán theo sheet FINAL và bộ SKD eKYC.
import type { JurisdictionBoard } from "../../db/jurisdictions.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const usd = (v: number | null) => (v === null ? "chưa có" : v.toLocaleString("en-US"));
const STATUS = { locked: "Đã chốt", no_price: "Chưa đủ giá (còn Get a Quote)", formula_mismatch: "Lệch công thức gia hạn" } as const;

export function renderJurisdictionsPage(args: { board: JurisdictionBoard; csrf: string; message: string | null }): string {
  const b = args.board;
  const s = b.summary;
  return shell("Tài phán", html`<h1>Tiến độ ${s.total} tài phán</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Bảng giá nạp lần cuối: ${b.importedAt ?? "chưa có"} · Danh sách SKD: ${b.skd.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>${s.priceLocked}/${s.total} tài phán đã chốt giá</h2><p>Có trong sheet FINAL: ${s.listed} tài phán.${s.notListed ? html` <span class="warn">Chưa có trong sheet: ${s.notListed}.</span>` : ""}</p>
<p class="meta">Đã chốt = mọi loại hình công ty có đủ 6 giá bằng số và gói 2 năm, 3 năm khớp Starter + 1 hoặc 2 năm gia hạn. Tài phán chưa chốt thì giữ lại, không chạy chiến dịch giá gói (spec mục 15).</p></section>
<section><h2>Bộ SKD eKYC: ${b.skd.done}/${b.skd.total} file</h2>${b.skd.missing.length ? html`<ul>${b.skd.missing.map((m) => html`<li class="warn">${m}</li>`)}</ul>` : html`<p>Đủ bộ.</p>`}</section>
<section><h2>Từng tài phán</h2>${b.jurisdictions.length ? html`<table class="kv"><tr><td><strong>Tài phán, loại hình</strong></td><td><strong>Starter / Grow / Premium</strong></td><td><strong>Gia hạn / 2 năm / 3 năm</strong></td><td><strong>Tình trạng</strong></td></tr>
${b.jurisdictions.flatMap((j) => j.rows.map((r) => html`<tr><td>${j.name}<br><span class="meta">${r.companyType}</span></td><td>${usd(r.starter)} / ${usd(r.grow)} / ${usd(r.premium)}</td><td>${usd(r.renewal)} / ${usd(r.renewal2y)} / ${usd(r.renewal3y)}</td><td>${r.status === "locked" ? STATUS.locked : html`<span class="warn">${STATUS[r.status]}${r.status === "formula_mismatch" ? html`: Starter + 1 năm gia hạn = ${usd(r.expected2y)}, Starter + 2 năm = ${usd(r.expected3y)}; kiểm lại cột gia hạn và cột 2, 3 năm` : ""}</span>`}</td></tr>`))}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp dữ liệu</h2><form method="post" action="/jurisdictions" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>File CSV của sheet "FINAL - Gói &amp; Giá năm 2 &amp; năm 3" (Google Sheets: Tệp, Tải xuống, CSV) <input type="file" name="price" accept=".csv,text/csv"></label>
<label>Tên các file trong thư mục Userguide eKYC, mỗi dòng một tên <textarea name="skd" rows="6"></textarea></label>
<button type="submit">Nạp</button></form></section>`);
}
