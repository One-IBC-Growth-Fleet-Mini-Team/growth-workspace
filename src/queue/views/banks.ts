// Trang gợi ý ngân hàng (D-34): chọn nơi thành lập công ty và tình trạng khách, ra kế hoạch mở tài khoản.
import type { BankAdvice } from "../../db/banks.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderBanksPage(args: { advice: BankAdvice; jurisdiction: string | null; newCompany: boolean; csrf: string; canImport: boolean; message: string | null }): string {
  const a = args.advice;
  const s = a.suggestion;
  const info = (bank: string) => {
    const d = a.details.get(bank);
    return d ? [d.complexity, d.processing, d.deposit ? `nạp đầu ${d.deposit}` : null, d.meeting].filter(Boolean).join(" · ") : "";
  };
  const list = (rows: { bank: string }[]) => html`<table class="kv">${rows.map((b) => html`<tr><td>${b.bank}</td><td class="meta">${info(b.bank)}</td></tr>`)}</table>`;
  return shell("Ngân hàng", html`<h1>Gợi ý mở tài khoản ngân hàng</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${a.importedAt ? "green" : "red"}">Ma trận của Bank Team nạp lần cuối: ${a.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<form method="get" action="/banks"><label>Nơi thành lập công ty <select name="j"><option value="">Chọn</option>${a.jurisdictions.map((j) => html`<option value="${j}"${j === args.jurisdiction ? html` selected` : ""}>${j}</option>`)}</select></label>
<label><input type="checkbox" name="new" value="1"${args.newCompany ? html` checked` : ""}> Công ty mới, chưa có lịch sử kinh doanh</label><button type="submit">Xem gợi ý</button></form>
${args.jurisdiction && !s ? html`<p class="warn">${args.jurisdiction} chưa có trong ma trận. Hỏi Bank Team.</p>` : ""}
${s ? html`<section><h2>Kế hoạch cho ${args.jurisdiction}</h2><ul>${s.plan.map((x) => html`<li>${x}</li>`)}</ul>
<p class="meta">Mục tiêu của Bank Team: 2 tới 3 tài khoản mỗi khách, ít nhất 1 ngân hàng truyền thống. Ma trận chưa xét quốc tịch, nơi cư trú của giám đốc, cổ đông, UBO và ngành nghề: kiểm với Bank Team trước khi báo khách.</p>
<h3>EMI và ngân hàng số nhận (${s.emi.length})</h3>${list(s.emi)}
<h3>Ngân hàng truyền thống nhận (${s.traditional.length})</h3>${list(s.traditional)}
<h3>Không nhận công ty ở nơi này (${s.notSupported.length})</h3><p class="meta">${s.notSupported.join(", ")}</p></section>` : ""}
${args.canImport ? html`<section><h2>Nạp ma trận</h2><form method="post" action="/banks" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV của sheet "Product Matrix - Bank Name X Support" (bắt buộc) <input type="file" name="matrix" accept=".csv,text/csv"></label>
<label>CSV của sheet "Bank ( Core Information for Clients)" <input type="file" name="core" accept=".csv,text/csv"></label>
<button type="submit">Nạp</button></form></section>` : ""}`);
}
