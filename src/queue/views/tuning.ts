// Trang đổi ngưỡng và trọng số (D-53): chỉ Mark đề xuất, kích hoạt sau khi bộ eval chạy lại và pass.
import type { currentTuning, EvalRun, listTuning } from "../../db/tuning.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderTuningPage(args: { current: ReturnType<typeof currentTuning>; changes: ReturnType<typeof listTuning>; evalRun: EvalRun; canTune: boolean; csrf: string; message: string | null }): string {
  const c = args.current;
  return shell("Ngưỡng và trọng số", html`<h1>Ngưỡng và trọng số</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p>Ngưỡng escalate đang dùng: ${c.confidenceEscalateBelow}. Trọng số chấm Hook: ${c.hookWeights.join("/")}.</p>
<p class="meta">Chỉ Mark đổi. Ngưỡng tiền và gửi ra ngoài không chỉnh được. Lượt eval gần nhất: ${args.evalRun.ranAt ?? "chưa có"} (${args.evalRun.passed ? "pass" : "chưa pass"}); giá trị mới chỉ kích hoạt được khi eval chạy lại sau lúc đề xuất và pass (<code>bun run eval:sa01</code>).</p>
<table><thead><tr><th>Đề xuất lúc</th><th>Tham số</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
${args.changes.map((x) => html`<tr><td>${x.proposedAt}</td><td>${x.param}</td><td>${x.value}</td><td>${x.activatedAt ? `Hiệu lực từ ${x.activatedAt}` : args.canTune
    ? html`<form method="post" action="/tuning"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="op" value="activate"><input type="hidden" name="id" value="${x.id}"><button type="submit">Kích hoạt</button></form>`
    : "Chờ kích hoạt"}</td></tr>`)}
</tbody></table>
${args.canTune ? html`<section><h2>Đề xuất mới</h2><form method="post" action="/tuning"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="op" value="propose">
<label>Tham số <select name="param"><option value="confidence_escalate_below">Ngưỡng escalate (0 tới 1)</option><option value="hook_weights">Trọng số Hook (5 số, tổng 100)</option></select></label>
<label>Giá trị <input name="value" required maxlength="40"></label><button type="submit">Đề xuất</button></form></section>` : ""}`);
}
