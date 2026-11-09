// Trang báo cáo tháng (CRON-09; D-55).
import type { buildMonthly } from "../../mi1/monthly.ts";
import { ddmm } from "../../time.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const pct = (v: number | null) => (v === null ? "chưa có" : `${(v * 100).toFixed(0)}%`);

export function renderMonthlyPage(m: ReturnType<typeof buildMonthly>): string {
  const [y, mo] = m.month.split("-");
  return shell("Báo cáo tháng", html`<h1>Báo cáo tháng ${mo}/${y}</h1>
<p><a href="/queue">Quay lại Hàng chờ</a> · <a href="/digest">Digest tuần</a></p>
<section><h2>Hàng chờ theo tuần</h2><table class="kv">${m.weeks.map((w) => html`<tr><td>Tuần từ ${ddmm(w.weekStart)}</td><td>Tỷ lệ quyết ${pct(w.decisionRate)}</td><td>${w.gate2 ? "Đạt Cổng 2" : "Chưa đạt Cổng 2"}</td></tr>`)}</table></section>
<section><h2>Fleet</h2><p>Chi phí LLM: ${m.costUsd.toFixed(2)} / ${m.capUsd} USD. Chi tiết từng phiên ở <a href="/runs">Phiên chạy</a>.</p></section>
<section><h2>Đối tác</h2>${m.partners.importedAt ? html`<p>${m.partners.wonDeals} deal đối tác chốt thắng có Close Date trong tháng.</p>
<table class="kv">${m.partners.stats.map((s) => html`<tr><td>${s.partner_id} (${s.partner_type})</td><td>${s.referred} giới thiệu, ${s.won} chốt</td><td>${s.profitUsd.toFixed(0)} USD lợi nhuận</td></tr>`)}</table>` : html`<p class="meta">Chưa nạp file đối tác.</p>`}
<p>Hoa hồng: chờ chính sách. Chi trả đi theo luồng duyệt tiền của Amy và tài chính.</p></section>
<section><h2>Bài học và quyết định trong tháng</h2>${m.lessons.length ? html`<ul>${m.lessons.map((l) => html`<li>${l.kind === "lesson" ? "Bài học" : "Quyết định"}: ${l.title} (<a href="${l.evidence}">${l.evidence}</a>)</li>`)}</ul>` : html`<p class="meta">Chưa ghi mục nào.</p>`}</section>`);
}
