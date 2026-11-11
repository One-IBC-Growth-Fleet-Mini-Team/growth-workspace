// Trang /command bản phẳng (PHẦN 7B, D-82; D-92: mọi vai trò, module theo vai, việc chờ Mark chỉ Mark và BOD): phiên Mi1
// gần nhất từng bước, thuyền viên, dự báo tải, chi phí tháng. Dựng từ cùng payload với /command/data.json. Tự tải lại
// mỗi 5 giây bằng header Refresh (CSP chặn script ở bản phẳng).
import type { CrewStatus } from "../../fleet/registry.ts";
import type { CommandPayload } from "../../fleet/command-json.ts";
import type { SessionView } from "../../fleet/orchestrate.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export type CommandData = {
  session: SessionView | null;
  sessionCostUsd: number;
  crew: CrewStatus[];
  waitingMark: { id: string; itemType: string; ageHours: number }[];
  forecastPerDay: number;
  monthCostUsd: number;
  capUsd: number;
};

const WAIT_TEXT: Record<string, string> = { budget_plan: "Kế hoạch ngân sách tuần", strategy: "Đề xuất chiến lược tuần" };
const WAIT_HREF: Record<string, string> = { budget_plan: "/budget", strategy: "/strategy" };
const STATUS_VI: Record<string, string> = { succeeded: "xong", failed: "lỗi", blocked: "bị chặn", running: "đang chạy" };
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "chưa chạy");
const usd = (n: number) => `${n.toFixed(4)} USD`;
const GRID = "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px";

// Bản phẳng dựng từ cùng payload với /command/data.json (D-92).
export function renderCommandPage(d: CommandPayload): string {
  const s = d.session;
  return shell("Điều phối Mi1", html`<h1>Điều phối Mi1</h1>
<p><a href="/command/3d?on=1">Xem bản 3D</a></p>
<p class="meta">Tự tải lại mỗi 5 giây. Mi1 chỉ gọi thuyền viên đang bật, bằng tool trong danh sách của thuyền viên đó; việc cần duyệt vẫn đi vào Hàng chờ.</p>
<section><h2>Phiên gần nhất</h2>
${s ? html`<p>${s.trigger === "ask" ? "Hỏi Mi1" : s.trigger.toUpperCase()} · ${s.actor} · bắt đầu ${time(s.startedAt)} · <strong${s.status === "succeeded" ? "" : html` class="warn"`}>${STATUS_VI[s.status] ?? s.status}</strong>${s.reason ? ` (${s.reason})` : ""} · chi phí ${usd(d.sessionCostUsd)}</p>
<p class="meta">Đầu vào (đã lọc PII): ${s.inputSummary}</p>
${s.steps.length ? html`<ol>${s.steps.map((st) => html`<li><strong>${st.crewId}</strong> · tool <code>${st.tool}</code> · ${STATUS_VI[st.status] ?? st.status}: ${st.resultSummary}
<div class="meta">Đầu vào: ${st.inputSummary} · độ tự tin ${st.confidence === null ? "không áp dụng" : st.confidence.toFixed(2)} · cổng đã qua: ${st.gates.join(", ") || "không"} · ${usd(st.costUsd)} · ${time(st.finishedAt)}</div></li>`)}</ol>` : html`<p class="meta">Phiên dừng trước khi gọi thuyền viên nào.</p>`}` : html`<p class="meta">Chưa có phiên nào. Hỏi Mi1 ở <a href="/ask">/ask</a> hoặc chờ CRON-06 lúc 08:15.</p>`}
</section>
<section><h2>Module</h2><ul>${d.modules.map((m) => html`<li>${m.href ? html`<a href="${m.href}">${m.label}</a>` : m.label}: <span class="meta">${m.summary}</span></li>`)}</ul></section>
<section id="crew"><h2>Thuyền viên</h2><div style="${GRID}">${d.crew.map((c) => html`<div class="card">
<div><strong>${c.id}</strong> ${c.enabled ? "" : html`<span class="warn">(đang tắt)</span>`}</div>
<div class="meta">${c.role}</div>
<div class="meta">Giám sát: ${c.supervisor} · ${c.kind === "llm" ? "LLM" : "script"}</div>
<div class="meta">Eval: ${c.evalScore === null ? (c.kind === "llm" ? "chưa chạy" : "không cần") : `${Math.round(c.evalScore * 100)}%`}</div>
<div class="meta">Lần cuối: ${time(c.lastRunAt)}${c.lastStatus ? ` (${STATUS_VI[c.lastStatus] ?? c.lastStatus})` : ""}</div>
<div class="meta">Chi phí tháng: ${usd(c.monthCostUsd)}</div>
<div class="meta">Tool: ${c.tools.length ? c.tools.join(", ") : "chưa có"}</div></div>`)}</div></section>
${d.waitingMark ? html`<section id="waiting"><h2>Việc chờ Mark (${d.waitingMark.length})</h2>
${d.waitingMark.length ? html`<ul>${d.waitingMark.map((w) => html`<li><a href="${WAIT_HREF[w.itemType] ?? "/queue"}">${WAIT_TEXT[w.itemType] ?? w.itemType}</a> · chờ ${w.ageHours} giờ${w.ageHours >= 24 ? html` <span class="warn">quá 1 ngày</span>` : ""}</li>`)}</ul>` : html`<p class="meta">Không có mục nào chờ Mark.</p>`}
</section>` : ""}
${d.appendixB ? html`<section id="appendix-b"><h2>Sẵn sàng Phụ lục B (chưa xây, chỉ đo điều kiện bật)</h2><div style="overflow-x:auto"><table class="kv">
<tr><td><strong>Hạng mục</strong></td><td><strong>Điều kiện bật (spec)</strong></td><td><strong>Tiến độ</strong></td><td><strong>Ai mở khoá</strong></td></tr>
${d.appendixB.map((r) => html`<tr><td>${r.item}</td><td class="meta">${r.condition}</td><td>${r.ready ? html`<strong>Đủ điều kiện</strong>` : html`<span class="warn">Chưa</span>`}: ${r.progress}</td><td class="meta">${r.unlockBy}</td></tr>`)}</table></div></section>` : ""}
<section><h2>Tải tuần tới và chi phí</h2>
<p>Dự báo Hàng chờ: khoảng ${d.forecastPerDay} mục mỗi ngày (trung bình 7 ngày qua).</p>
<p${d.monthCostUsd >= d.capUsd ? html` class="warn"` : ""}>Chi phí LLM tháng này: ${usd(d.monthCostUsd)} / trần ${d.capUsd} USD.</p>
</section>`);
}
