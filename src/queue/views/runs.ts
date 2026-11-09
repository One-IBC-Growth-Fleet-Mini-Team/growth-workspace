// Trang nhật ký phiên chạy (D-50): từng phiên agent, token, chi phí, số đề xuất, người giám sát đã xem chưa.
import type { buildRunLog } from "../../db/runs.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderRunsPage(args: { log: ReturnType<typeof buildRunLog>; me: string; csrf: string; message: string | null }): string {
  const l = args.log;
  const over = l.monthCostUsd >= l.capUsd * 0.8;
  return shell("Phiên chạy", html`<h1>Phiên chạy của fleet</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<div class="status ${over ? "yellow" : "green"}">Chi phí LLM tháng ${l.month}: ${l.monthCostUsd.toFixed(2)} / ${l.capUsd} USD</div>
<p>${l.unseen} phiên chưa có người giám sát xem.</p>
<table><thead><tr><th>Bắt đầu</th><th>Agent</th><th>Lịch</th><th>Kết quả</th><th>Đề xuất</th><th>Token vào/ra</th><th>USD</th><th>Giám sát</th></tr></thead><tbody>
${l.runs.map((r) => html`<tr><td>${r.startedAt}</td><td>${r.agent}</td><td>${r.trigger}</td><td>${r.status}</td><td>${r.items}</td><td>${r.inputTokens}/${r.outputTokens}</td><td>${r.costUsd.toFixed(4)}</td>
<td>${r.seenBy ? `Đã xem (${r.seenBy})` : r.supervisor === args.me
    ? html`<form method="post" action="/runs"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="run_id" value="${r.id}"><button type="submit">Đánh dấu đã xem</button></form>`
    : `Chờ ${r.supervisor}`}</td></tr>`)}
</tbody></table>`);
}
