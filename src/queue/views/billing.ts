// Trang đối soát đơn hàng (Mi1-sa-01, D-30): invoice quá hạn, SO chưa có PO, PO không khớp SO. Chỉ xem và soạn tin nhắc.
import type { BillingBoard, OverdueInvoice } from "../../db/billing.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

function invTable(rows: OverdueInvoice[]) {
  return rows.length
    ? html`<table class="kv"><tr><td><strong>Invoice</strong></td><td><strong>SO</strong></td><td><strong>RM</strong></td><td><strong>Hạn</strong></td><td><strong>Quá hạn</strong></td></tr>
${rows.map((r) => html`<tr><td>${r.invoice_number}</td><td>${r.so_number ?? ""}</td><td>${r.owner_rm_id ?? "chưa rõ"}</td><td>${r.due_date}</td><td>${r.overdue_days} ngày</td></tr>`)}</table>`
    : html`<p class="meta">Không có.</p>`;
}

export function renderBillingPage(args: { board: BillingBoard; reminders: { rm: string; text: string }[]; escalateDays: number; csrf: string; canImport: boolean; message: string | null }): string {
  const b = args.board;
  return shell("Đơn hàng và invoice", html`<h1>Đơn hàng và invoice</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Lượt nạp gần nhất: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>Invoice quá hạn từ ${args.escalateDays} ngày: báo Amy (${b.escalate.length})</h2>${invTable(b.escalate)}</section>
<section><h2>Invoice quá hạn: RM nhắc khách (${b.remind.length})</h2>${invTable(b.remind)}
${args.reminders.length ? html`<details><summary>Tin nhắc theo từng RM (chép rồi gửi)</summary>${args.reminders.map((r) => html`<p><strong>${r.rm}</strong></p><textarea readonly rows="6">${r.text}</textarea>`)}</details>` : ""}</section>
<section><h2>SO cần PO nhưng chưa có PO (${b.soMissingPo.length})</h2>${b.soMissingPo.length ? html`<table class="kv">${b.soMissingPo.map((s) => html`<tr><td>${s.so_number}</td><td>${s.owner_rm_id ?? "chưa rõ"}</td><td>${s.status}</td></tr>`)}</table>` : html`<p class="meta">Không có (hoặc chưa nạp đủ file SO và PO).</p>`}</section>
<section><h2>PO không khớp SO nào (${b.poWithoutSo.length})</h2>${b.poWithoutSo.length ? html`<table class="kv">${b.poWithoutSo.map((x) => html`<tr><td>${x.po_number}</td><td>${x.so_number ?? "chưa gắn SO"}</td></tr>`)}</table>` : html`<p class="meta">Không có.</p>`}</section>
${args.canImport ? html`<section><h2>Nạp file</h2><p class="meta">Xuất từ CRM dạng CSV UTF-8. Có file nào nạp file đó; chỉ đọc mã đơn, Status, ngày, không đọc tên khách hay số tiền.</p>
<form method="post" action="/billing" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>SO (đơn bán) <input type="file" name="salesorder" accept=".csv,text/csv"></label>
<label>PO (đơn đặt nhà cung cấp) <input type="file" name="purchaseorder" accept=".csv,text/csv"></label>
<label>Invoice <input type="file" name="invoice" accept=".csv,text/csv"></label>
<button type="submit">Nạp</button></form></section>` : ""}`);
}
