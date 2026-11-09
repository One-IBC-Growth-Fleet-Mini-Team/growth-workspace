// Trang tầng 5 (D-45): kết quả theo chiến dịch, nháp đổi ngân sách chờ Mark và anh Jimmy duyệt.
import type { buildBudgetBoard } from "../../db/budget.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const usd = (v: number | null) => (v === null ? "chưa đủ chu kỳ" : `${v.toLocaleString("en-US")} USD`);
const STATUS = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối" } as const;

export function renderBudgetPage(args: { board: ReturnType<typeof buildBudgetBoard>; canPull: boolean; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Ngân sách", html`<h1>Kênh và ngân sách (tầng 5)</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${b.frozen ? html`<div class="status yellow"><strong>TRACKING_DEGRADED</strong>: đóng băng đánh giá xấu ở tầng 5, không tạo nháp mới (spec mục 8).</div>` : ""}
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p class="meta">Chiến dịch đủ chu kỳ bán mà gross margin (đã lọc reseller) trừ chi tiêu âm thì có nháp đổi ngân sách. Duyệt chỉ ghi quyết định; người đổi ngân sách trên nền tảng là Mark. Việc có tiền luôn cần Mark và anh Jimmy duyệt.</p>
<section><h2>Nháp đổi ngân sách (${b.drafts.length})</h2>${b.drafts.length ? b.drafts.map((d) => html`<div class="card"><div class="head">${d.campaign} · ${usd(d.netUsd)} · ${d.status === "pending" ? html`<span class="warn">${STATUS.pending}</span>` : STATUS[d.status as keyof typeof STATUS]}${d.decidedBy ? ` (${d.decidedBy})` : ""}</div>
${d.note ? html`<p class="meta">${d.note}</p>` : ""}<form method="post" action="/budget/decide"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${d.id}"><input name="note" placeholder="Đề xuất cụ thể, ví dụ giảm 50%" maxlength="300"><button name="decision" value="approve">Duyệt</button><button name="decision" value="reject">Từ chối</button></form></div>`) : html`<p class="meta">Không có nháp.</p>`}</section>
<section><h2>Kết quả theo chiến dịch</h2>${b.campaigns.length ? html`<table class="kv">${b.campaigns.map((c) => html`<tr><td>${c.campaign}<br><span class="meta">${c.platform ?? ""}</span></td><td>chi ${c.spendUsd.toLocaleString("en-US")}, biên ${c.grossMarginUsd.toLocaleString("en-US")}</td><td>${c.flag ? html`<span class="warn">${usd(c.netUsd)}</span>` : usd(c.netUsd)}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp kết quả</h2>${args.canPull ? html`<form method="post" action="/budget"><input type="hidden" name="csrf" value="${args.csrf}"><button name="pull" value="1">Kéo từ ads-mcp</button></form>` : ""}
<form method="post" action="/budget" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV cột campaign, platform, period_start, period_end, spend_usd, leads, closed_won, gross_margin_usd, sales_cycle_complete <input type="file" name="file" accept=".csv,text/csv"></label>
<button type="submit">Nạp</button></form></section>`);
}
