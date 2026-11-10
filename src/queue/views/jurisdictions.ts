// Trang tiến độ 45 tài phán (Mi1-mkt-05, D-32, D-33): chốt giá từng tài phán theo sheet FINAL và bộ SKD eKYC.
import type { JurisdictionBoard } from "../../db/jurisdictions.ts";
import type { SandboxBoard } from "../../db/sandbox.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const usd = (v: number | null) => (v === null ? "chưa có" : v.toLocaleString("en-US"));
const STATUS = { locked: "Đã chốt", no_price: "Chưa đủ giá (còn Get a Quote)", formula_mismatch: "Lệch công thức gia hạn" } as const;

export function renderJurisdictionsPage(args: { board: JurisdictionBoard; sandbox: SandboxBoard; csrf: string; message: string | null }): string {
  const b = args.board;
  const s = b.summary;
  return shell("Tài phán", html`<h1>Tiến độ ${s.total} tài phán</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Bảng giá nạp lần cuối: ${b.importedAt ?? "chưa có"} · Danh sách SKD: ${b.skd.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>${s.priceLocked}/${s.total} tài phán đã chốt giá</h2><p>Có trong sheet FINAL: ${s.listed} tài phán.${s.notListed ? html` <span class="warn">Chưa có trong sheet: ${s.notListed}.</span>` : ""}</p>
<p class="meta">Đã chốt = mọi loại hình công ty có đủ 6 giá bằng số và gói 2 năm, 3 năm khớp Starter + 1 hoặc 2 năm gia hạn. Tài phán chưa chốt thì giữ lại, không chạy chiến dịch giá gói (spec mục 15).</p></section>
<section><h2>Bộ SKD eKYC: ${b.skd.done}/${b.skd.total} file</h2>${b.skd.missing.length ? html`<ul>${b.skd.missing.map((m) => html`<li class="warn">${m}</li>`)}</ul>` : html`<p>Đủ bộ.</p>`}</section>
${sandboxSection(args.sandbox)}
<section><h2>Từng tài phán</h2>${b.jurisdictions.length ? html`<table class="kv"><tr><td><strong>Tài phán, loại hình</strong></td><td><strong>Starter / Grow / Premium</strong></td><td><strong>Gia hạn / 2 năm / 3 năm</strong></td><td><strong>Tình trạng</strong></td></tr>
${b.jurisdictions.flatMap((j) => j.rows.map((r) => html`<tr><td>${j.name}<br><span class="meta">${r.companyType}</span></td><td>${usd(r.starter)} / ${usd(r.grow)} / ${usd(r.premium)}</td><td>${usd(r.renewal)} / ${usd(r.renewal2y)} / ${usd(r.renewal3y)}</td><td>${r.status === "locked" ? STATUS.locked : html`<span class="warn">${STATUS[r.status]}${r.status === "formula_mismatch" ? html`: Starter + 1 năm gia hạn = ${usd(r.expected2y)}, Starter + 2 năm = ${usd(r.expected3y)}; kiểm lại cột gia hạn và cột 2, 3 năm` : ""}</span>`}</td></tr>`))}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp dữ liệu</h2><form method="post" action="/jurisdictions" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>File CSV của sheet "FINAL - Gói &amp; Giá năm 2 &amp; năm 3" (Google Sheets: Tệp, Tải xuống, CSV) <input type="file" name="price" accept=".csv,text/csv"> <span class="meta"><a href="/samples/price-final.csv" download>File mẫu</a></span></label>
<label>CSV của tab "Bug" trong file test case sandbox8 <input type="file" name="bugs" accept=".csv,text/csv"> <span class="meta"><a href="/samples/sandbox-bugs.csv" download>File mẫu</a></span></label>
<label>CSV của tab "Test Cases" trong file test case sandbox8 <input type="file" name="cases" accept=".csv,text/csv"> <span class="meta"><a href="/samples/sandbox-cases.csv" download>File mẫu</a></span></label>
<label>Tên các file trong thư mục Userguide eKYC, mỗi dòng một tên <textarea name="skd" rows="6"></textarea></label>
<button type="submit">Nạp</button></form></section>`);
}

function sandboxSection(sb: SandboxBoard) {
  if (sb.ready === null && !sb.cases) return html`<section><h2>Nghiệm thu sandbox8: chưa nạp issue log</h2></section>`;
  const pct = (v: number | null) => (v === null ? "chưa có" : `${(v * 100).toFixed(1)}%`);
  return html`<section><h2>Nghiệm thu sandbox8: ${sb.ready === null ? "chưa nạp tab Bug" : sb.ready ? "sẵn sàng" : "chưa sẵn sàng"}</h2>
<p class="meta">Nạp lần cuối: ${sb.importedAt ?? "chưa có"}. Sẵn sàng = không còn bug Critical, High đang mở (Open hoặc Fixed chờ kiểm lại); ngưỡng tạm.</p>
${sb.cases ? html`<p>Test case: ${sb.cases.pass}/${sb.cases.total} Pass, ${sb.cases.fail} Fail, ${sb.cases.blocked} Blocked, tỷ lệ Pass ${pct(sb.cases.passRate)} (không tính N/A).</p>` : ""}
${sb.ready === null ? "" : html`<p>Bug mở theo mức độ: ${sb.bySeverity.map((x) => `${x.severity} ${x.open}/${x.total}`).join(", ")}.</p>
${sb.open.length ? html`<table class="kv">${sb.open.map((b) => html`<tr><td>${b.bugId}<br><span class="meta">${b.severity} · ${b.status}</span></td><td>${b.title ?? ""}<br><span class="meta">${b.url ?? ""}</span></td></tr>`)}</table>` : ""}`}</section>`;
}
