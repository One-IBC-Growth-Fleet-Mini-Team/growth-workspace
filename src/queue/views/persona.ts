// Trang /persona (D-86). Chưa nạp file Closed Won thật thì hiện "Chờ dữ liệu thật"; không dựng persona từ dữ liệu
// tổng hợp. Đã nạp thì chỉ báo số deal: phần dựng persona làm sau, khi có dữ liệu thật để kiểm.
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderPersonaPage(args: { latest: { importedAt: string; deals: number } | null; canImport: boolean; csrf: string; message: string | null }): string {
  const l = args.latest;
  return shell("Persona khách", html`<h1>Persona khách</h1>
${args.message ? html`<div class="status yellow">${args.message}</div>` : ""}
${l ? html`<div class="status green">Đã nạp ${l.deals} deal Closed Won lúc ${l.importedAt.slice(0, 16).replace("T", " ")} UTC. Phần dựng persona từ dữ liệu này đang làm.</div>`
    : html`<div class="status yellow"><strong>Chờ dữ liệu thật.</strong> Chưa nạp file Closed Won xuất từ CRM. Trang không dựng persona từ dữ liệu mẫu.</div>`}
<p class="meta">Persona chỉ dựng từ deal Closed Won thật: tài phán, dịch vụ, ngành, quốc gia, đại lý hay khách trực tiếp. Không lưu tên khách, email, số điện thoại, mã khách.</p>
${args.canImport ? html`<section><h2>Nạp file</h2><form method="post" action="/persona" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Opportunity Closed Won (bắt buộc) <input type="file" name="opportunity" accept=".csv"></label> <a href="/samples/closed-won-opportunity.csv" download>File mẫu</a>
<label>Account <input type="file" name="account" accept=".csv"></label> <a href="/samples/closed-won-account.csv" download>File mẫu</a>
<button type="submit">Nạp</button></form><p class="meta">Cột tên khách, email, số điện thoại trong file không được đọc.</p></section>` : ""}`);
}
