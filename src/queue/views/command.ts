// Trang /command cho Mark và BOD (PHẦN 7B, D-82): phiên Mi1 gần nhất từng bước, lưới thuyền viên, việc chờ Mark và
// tuổi, dự báo tải tuần tới, chi phí tháng so với trần. Giao diện phẳng; trình duyệt tự tải lại mỗi 5 giây
// (header Refresh, vì CSP chặn script).
import type { CrewStatus } from "../../fleet/registry.ts";
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

const STATUS_VI: Record<string, string> = { succeeded: "xong", failed: "lỗi", blocked: "bị chặn", running: "đang chạy" };
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "chưa chạy");
const usd = (n: number) => `${n.toFixed(4)} USD`;
const GRID = "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px";

export function renderCommandPage(d: CommandData): string {
  const s = d.session;
  return shell("Điều phối Mi1", html`<h1>Điều phối Mi1</h1>
<p class="meta">Tự tải lại mỗi 5 giây. Mi1 chỉ gọi thuyền viên đang bật, bằng tool trong danh sách của thuyền viên đó; việc cần duyệt vẫn đi vào Hàng chờ.</p>
<section><h2>Phiên gần nhất</h2>
${s ? html`<p>${s.trigger === "ask" ? "Hỏi Mi1" : s.trigger.toUpperCase()} · ${s.actor} · bắt đầu ${time(s.startedAt)} · <strong${s.status === "succeeded" ? "" : html` class="warn"`}>${STATUS_VI[s.status] ?? s.status}</strong>${s.reason ? ` (${s.reason})` : ""} · chi phí ${usd(d.sessionCostUsd)}</p>
<p class="meta">Đầu vào (đã lọc PII): ${s.inputSummary}</p>
${s.steps.length ? html`<ol>${s.steps.map((st) => html`<li><strong>${st.crewId}</strong> · tool <code>${st.tool}</code> · ${STATUS_VI[st.status] ?? st.status}: ${st.resultSummary}
<div class="meta">Đầu vào: ${st.inputSummary} · độ tự tin ${st.confidence === null ? "không áp dụng" : st.confidence.toFixed(2)} · cổng đã qua: ${st.gates.join(", ") || "không"} · ${usd(st.costUsd)} · ${time(st.finishedAt)}</div></li>`)}</ol>` : html`<p class="meta">Phiên dừng trước khi gọi thuyền viên nào.</p>`}` : html`<p class="meta">Chưa có phiên nào. Hỏi Mi1 ở <a href="/ask">/ask</a> hoặc chờ CRON-06 lúc 08:15.</p>`}
</section>
<section><h2>Thuyền viên</h2><div style="${GRID}">${d.crew.map((c) => html`<div class="card">
<div><strong>${c.id}</strong> ${c.enabled ? "" : html`<span class="warn">(đang tắt)</span>`}</div>
<div class="meta">${c.role}</div>
<div class="meta">Giám sát: ${c.supervisor} · ${c.kind === "llm" ? "LLM" : "script"}</div>
<div class="meta">Eval: ${c.evalScore === null ? (c.kind === "llm" ? "chưa chạy" : "không cần") : `${Math.round(c.evalScore * 100)}%`}</div>
<div class="meta">Lần cuối: ${time(c.lastRunAt)}${c.lastStatus ? ` (${STATUS_VI[c.lastStatus] ?? c.lastStatus})` : ""}</div>
<div class="meta">Chi phí tháng: ${usd(c.monthCostUsd)}</div>
<div class="meta">Tool: ${c.tools.length ? c.tools.join(", ") : "chưa có"}</div></div>`)}</div></section>
<section><h2>Việc chờ Mark (${d.waitingMark.length})</h2>
${d.waitingMark.length ? html`<ul>${d.waitingMark.map((w) => html`<li><a href="/queue">${w.itemType}</a> · chờ ${w.ageHours} giờ${w.ageHours >= 24 ? html` <span class="warn">quá 1 ngày</span>` : ""}</li>`)}</ul>` : html`<p class="meta">Không có mục nào Amy escalate đang chờ.</p>`}
</section>
<section><h2>Tải tuần tới và chi phí</h2>
<p>Dự báo Hàng chờ: khoảng ${d.forecastPerDay} mục mỗi ngày (trung bình 7 ngày qua).</p>
<p${d.monthCostUsd >= d.capUsd ? html` class="warn"` : ""}>Chi phí LLM tháng này: ${usd(d.monthCostUsd)} / trần ${d.capUsd} USD.</p>
</section>`);
}
