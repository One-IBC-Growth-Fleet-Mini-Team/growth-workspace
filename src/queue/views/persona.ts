// Trang /persona (D-86, D-88). Chưa nạp file Closed Won thật thì hiện "Chờ dữ liệu thật"; không dựng persona từ dữ liệu
// tổng hợp. Đã nạp thì hiện persona theo (tài phán, dịch vụ) từ `personaSegments`, bỏ khách cuối của reseller, kèm cỡ
// mẫu và tín hiệu thị trường. Không có tên hay mã khách.
import type { buildPersonaBoard } from "../../db/persona.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

type Board = NonNullable<ReturnType<typeof buildPersonaBoard>>;
const GRID = "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const tops = (xs: { name: string; count: number }[]) => (xs.length ? xs.map((x) => `${x.name} (${x.count})`).join(", ") : "chưa có trong file");

export function renderPersonaPage(args: { board: Board | null; canImport: boolean; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Persona khách", html`<h1>Persona khách</h1>
${args.message ? html`<div class="status yellow">${args.message}</div>` : ""}
${b ? html`<div class="status green">Từ ${b.total} deal Closed Won nạp lúc ${b.importedAt.slice(0, 16).replace("T", " ")} UTC: ${b.direct} deal khách trực tiếp, ${b.reseller} deal khách cuối của reseller (không tính vào persona)${b.resellerUnknown ? `, ${b.resellerUnknown} deal chưa rõ cờ reseller (đang tính là trực tiếp)` : ""}.</div>
<p class="meta">Mỗi persona là một nhóm (tài phán, dịch vụ) có từ ${b.minDeals} deal${b.minDealsProvisional ? " (Tạm)" : ""}. ${b.thin.segments ? `${b.thin.segments} nhóm khác (${b.thin.deals} deal) chưa đủ mẫu nên chưa dựng.` : ""}</p>
${b.segments.length ? html`<div style="${GRID}">${b.segments.map((s) => html`<div class="card">
<div class="head">${s.jurisdiction} · ${s.serviceFamily}</div>
<div>${s.deals} deal, ${pct(s.share)} deal trực tiếp</div>
<div class="meta">Giá trị giữa: ${s.medianAmountUsd === null ? "chưa có" : `${s.medianAmountUsd} USD`}</div>
<div class="meta">Ngành: ${tops(s.industries)}</div>
<div class="meta">Quốc gia: ${tops(s.countries)}</div>
<div class="meta">Thị trường: ${s.market.regulations.length ? `quy định mới: ${s.market.regulations.join("; ")}` : "chưa có quy định mới"}${s.market.reviewThemes.length ? `; khách hay nói về: ${s.market.reviewThemes.join(", ")}` : ""}. <a href="/market">Xem</a></div></div>`)}</div>`
    : html`<p>Chưa nhóm nào đủ ${b.minDeals} deal để dựng persona.</p>`}`
    : html`<div class="status yellow"><strong>Chờ dữ liệu thật.</strong> Chưa nạp file Closed Won xuất từ CRM. Trang không dựng persona từ dữ liệu mẫu.</div>`}
<p class="meta">Persona chỉ dựng từ deal Closed Won thật: tài phán, dịch vụ, ngành, quốc gia, đại lý hay khách trực tiếp. Không lưu tên khách, email, số điện thoại, mã khách.</p>
${args.canImport ? html`<section><h2>Nạp file</h2><form method="post" action="/persona" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Opportunity Closed Won (bắt buộc) <input type="file" name="opportunity" accept=".csv"></label> <a href="/samples/closed-won-opportunity.csv" download>File mẫu</a>
<label>Account <input type="file" name="account" accept=".csv"></label> <a href="/samples/closed-won-account.csv" download>File mẫu</a>
<button type="submit">Nạp</button></form><p class="meta">Cột tên khách, email, số điện thoại trong file không được đọc.</p></section>` : ""}`);
}
