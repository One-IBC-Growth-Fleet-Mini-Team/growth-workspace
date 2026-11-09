// Trang đối tác (Mi1-ptn-01, D-31): hiệu suất theo kỳ, deal cần xét hoa hồng, khách reseller thiếu cờ. Chỉ xem.
import type { PartnerBoard } from "../../db/partners.ts";
import { ddmm } from "../../time.ts";
import { tag } from "../../provisional.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderPartnersPage(args: { board: PartnerBoard; csrf: string; canImport: boolean; message: string | null; prevMonth: string; nextMonth: string }): string {
  const b = args.board;
  const money = (v: number | null) => (v === null ? "chưa có" : `${v.toLocaleString("en-US")} USD`);
  return shell("Đối tác", html`<h1>Đối tác ${ddmm(b.period.start)} tới ${ddmm(b.period.end)}</h1>
<p><a href="/queue">Quay lại Hàng chờ</a> · <a href="/partners?month=${args.prevMonth}">Tháng trước</a> · <a href="/partners?month=${args.nextMonth}">Tháng sau</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Lượt nạp gần nhất: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>Hiệu suất theo Close Date trong kỳ</h2>${b.stats.length ? html`<table class="kv"><tr><td><strong>Đối tác</strong></td><td><strong>Loại</strong></td><td><strong>Deal</strong></td><td><strong>Chốt thắng</strong></td><td><strong>Lợi nhuận ghi nhận</strong></td></tr>
${b.stats.map((s) => html`<tr><td>${s.partner_id}</td><td>${s.partner_type}</td><td>${s.referred}</td><td>${s.won}</td><td>${money(s.profitUsd)}${s.wonMissingProfit ? html` <span class="warn">(${s.wonMissingProfit} deal chưa có lợi nhuận)</span>` : ""}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Đề xuất hoa hồng, chưa chi (${b.commissionReview.length})${tag("commission")}</h2><p class="meta">Tỉ lệ theo loại đối tác trên lợi nhuận ghi nhận (Internal Control) của deal chốt thắng; tỉ lệ là giá trị tạm. Đây chỉ là đề xuất: chi trả đi theo luồng duyệt tiền hiện có của Amy và tài chính.</p>
${b.commissionReview.length ? html`<table class="kv">${b.commissionReview.map((r) => html`<tr><td>${r.deal_id}</td><td>${r.partner_id} (${r.partner_type})</td><td>${r.close_date}</td><td>${money(r.profit_usd)}</td><td>${r.status === "proposed" ? html`${(r.rate! * 100).toFixed(0)}% = ${money(r.amount_usd)}, chưa chi` : r.status === "no_rate" ? html`<span class="warn">chưa có tỉ lệ cho loại này</span>` : html`<span class="warn">chưa có lợi nhuận</span>`}</td></tr>`)}</table>` : ""}</section>
<section><h2>Khách của reseller chưa gắn cờ trên CRM (${b.resellerFlagMissing.length})</h2><p class="meta">Nhờ RM xác nhận rồi gắn cờ is_reseller_end_client trên CRM (D-06); khách chưa gắn cờ vẫn có thể bị NBA đề xuất upsell.</p>
${b.resellerFlagMissing.length ? html`<table class="kv">${b.resellerFlagMissing.map((r) => html`<tr><td>${r.client_id}</td><td>qua ${r.partner_id}</td></tr>`)}</table>` : ""}</section>
${args.canImport ? html`<section><h2>Nạp file</h2><form method="post" action="/partners" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Danh sách đối tác (mã, loại) <input type="file" name="partner" accept=".csv,text/csv"> <span class="meta"><a href="/samples/partner.csv" download>File mẫu</a></span></label>
<label>Deal do đối tác giới thiệu <input type="file" name="referral" accept=".csv,text/csv"> <span class="meta"><a href="/samples/referral.csv" download>File mẫu</a></span></label>
<button type="submit">Nạp</button></form></section>` : ""}`);
}
