// Trang tầng 5 (D-45): kết quả theo chiến dịch, nháp đổi ngân sách chờ Mark và anh Jimmy duyệt.
import type { buildBudgetBoard } from "../../db/budget.ts";
import type { latestPlan } from "../../db/budget-plan.ts";
import { tag } from "../../provisional.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const usd = (v: number | null) => (v === null ? "chưa đủ chu kỳ" : `${v.toLocaleString("en-US")} USD`);
const STATUS = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối" } as const;

const OBJ = { A: "A (Awareness/Traffic)", C: "C (Conversion)" } as const;
const money = (v: number) => `${v.toLocaleString("en-US")} USD`;

function planSection(p: ReturnType<typeof latestPlan>, canDecide: boolean, csrf: string) {
  return html`<section><h2>Kế hoạch ngân sách tuần (khung quyết định)${tag("budget_framework")}</h2>
<p class="meta">Mỗi tổ hợp Kênh × Tài phán mang một mục tiêu: A (mở rộng phễu, đo bằng CPM, CTR, asset_view) hoặc C (thu contact, lead, đo bằng CPL, chuyển đổi, lợi nhuận ròng). Cổng G1 tới G4 xét trước; quy tắc R1 tới R6; mỗi tuần đổi tối đa ±20% mỗi tổ hợp (trừ R5). Duyệt chỉ ghi quyết định; Mark tự đổi trên nền tảng. Khung là bản Tạm: docs/spec/khung-quyet-dinh-awareness-conversion.md.</p>
${canDecide ? html`<form method="post" action="/budget/plan"><input type="hidden" name="csrf" value="${csrf}"><button name="op" value="create">Tạo kế hoạch tuần này</button></form>` : ""}
${p ? html`<div class="card"><div class="head">Tuần ${p.weekStart} · ${money(p.totalOld)} → ${money(p.totalNew)} · ${p.status === "pending" ? html`<span class="warn">Chờ Mark duyệt</span>` : p.status === "approved" ? `Đã duyệt (${p.decidedBy})` : `Đã từ chối (${p.decidedBy})`}</div>
${p.needsJimmy ? html`<p class="warn">Tổng thay đổi vượt ngưỡng: cần anh Jimmy duyệt trước khi Mark đổi trên nền tảng.</p>` : ""}
<div style="overflow-x:auto"><table class="kv">${p.lines.map((l) => html`<tr><td>${l.channel} · ${l.jurisdiction}</td><td>${l.objectiveOld ? OBJ[l.objectiveOld] : "mới"} → ${OBJ[l.objectiveNew]}</td><td>${money(l.budgetOld)} → ${money(l.budgetNew)}${p.needsJimmy && l.budgetNew !== l.budgetOld ? html` <span class="warn">cần anh Jimmy</span>` : ""}</td><td><strong>${l.rules.join(", ")}</strong> <span class="meta">${l.notes.join("; ")} · tự tin ${Math.round(l.confidence * 100)}%</span></td></tr>`)}</table></div>
${p.note ? html`<p class="meta">${p.note}</p>` : ""}${canDecide ? html`<form method="post" action="/budget/plan"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${p.id}"><input name="note" placeholder="Ghi chú" maxlength="300"><button name="decision" value="approve">Duyệt kế hoạch</button><button name="decision" value="reject">Từ chối</button></form>` : ""}</div>`
    : html`<p class="meta">Chưa có kế hoạch. CRON-07 tạo mỗi thứ Hai, hoặc Mark bấm "Tạo kế hoạch tuần này".</p>`}</section>`;
}

export function renderBudgetPage(args: { board: ReturnType<typeof buildBudgetBoard>; plan: ReturnType<typeof latestPlan>; canDecidePlan: boolean; canPull: boolean; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Ngân sách", html`<h1>Kênh và ngân sách (tầng 5)</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${b.frozen ? html`<div class="status yellow"><strong>TRACKING_DEGRADED</strong>: đóng băng đánh giá xấu ở tầng 5, không tạo nháp mới (spec mục 8).</div>` : ""}
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p class="meta">Chiến dịch đủ chu kỳ bán mà gross margin (đã lọc reseller) trừ chi tiêu âm thì có nháp đổi ngân sách. Duyệt chỉ ghi quyết định; người đổi ngân sách trên nền tảng là Mark. Việc có tiền luôn cần Mark và anh Jimmy duyệt.</p>
${planSection(args.plan, args.canDecidePlan, args.csrf)}
<section><h2>Nháp đổi ngân sách tầng 5 (${b.drafts.length})</h2>${b.drafts.length ? b.drafts.map((d) => html`<div class="card"><div class="head">${d.campaign} · ${usd(d.netUsd)} · ${d.status === "pending" ? html`<span class="warn">${STATUS.pending}</span>` : STATUS[d.status as keyof typeof STATUS]}${d.decidedBy ? ` (${d.decidedBy})` : ""}</div>
${d.note ? html`<p class="meta">${d.note}</p>` : ""}<form method="post" action="/budget/decide"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${d.id}"><input name="note" placeholder="Đề xuất cụ thể, ví dụ giảm 50%" maxlength="300"><button name="decision" value="approve">Duyệt</button><button name="decision" value="reject">Từ chối</button></form></div>`) : html`<p class="meta">Không có nháp.</p>`}</section>
<section><h2>Kết quả theo chiến dịch</h2>${b.campaigns.length ? html`<table class="kv">${b.campaigns.map((c) => html`<tr><td>${c.campaign}<br><span class="meta">${c.platform ?? ""}</span></td><td>chi ${c.spendUsd.toLocaleString("en-US")}, biên ${c.grossMarginUsd.toLocaleString("en-US")}</td><td>${c.flag ? html`<span class="warn">${usd(c.netUsd)}</span>` : usd(c.netUsd)}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Win gate (Mi1-mkt-01)${tag("win_gate")}</h2><p class="meta">Đủ mẫu thì thắng khi CPL không cao hơn trung vị và tỷ lệ chốt không thấp hơn trung vị; thiếu mẫu thì không xếp hạng. Thắng chỉ là gợi ý; đổi ngân sách vẫn qua nháp chờ duyệt.</p>
${b.win.length ? html`<table class="kv">${b.win.map((w) => html`<tr><td>${w.campaign}</td><td>${w.status === "win" ? html`<strong>Thắng</strong>` : w.status === "not_win" ? "Chưa thắng" : html`<span class="meta">Thiếu mẫu: ${w.reasons.join(", ")}</span>`}</td><td class="meta">${w.cpl === null ? "" : `CPL ${w.cpl.toFixed(0)}`}${w.winRate === null ? "" : `, chốt ${(w.winRate * 100).toFixed(1)}%`}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}</section>
<section><h2>Nạp kết quả</h2>${args.canPull ? html`<form method="post" action="/budget"><input type="hidden" name="csrf" value="${args.csrf}"><button name="pull" value="1">Kéo từ ads-mcp</button></form>` : ""}
<form method="post" action="/budget" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV cột campaign, platform, jurisdiction, period_start, period_end, spend_usd, leads, closed_won, gross_margin_usd, sales_cycle_complete <input type="file" name="file" accept=".csv,text/csv"> <span class="meta"><a href="/samples/campaigns.csv" download>File mẫu</a></span></label>
<button type="submit">Nạp</button></form></section>`);
}
