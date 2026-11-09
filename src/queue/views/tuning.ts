// Trang đổi ngưỡng và trọng số (D-53): chỉ Mark đề xuất, kích hoạt sau khi bộ eval chạy lại và pass.
import type { currentTuning, EvalRun, listTuning } from "../../db/tuning.ts";
import { listProvisional } from "../../provisional.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderTuningPage(args: { current: ReturnType<typeof currentTuning>; changes: ReturnType<typeof listTuning>; evalRun: EvalRun; canTune: boolean; csrf: string; message: string | null }): string {
  const c = args.current;
  return shell("Ngưỡng và trọng số", html`<h1>Ngưỡng và trọng số</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p>Ngưỡng escalate đang dùng: ${c.confidenceEscalateBelow}. Trọng số chấm Hook: ${c.hookWeights.join("/")}.</p>
<p class="meta">Chỉ Mark đổi. Ngưỡng tiền và gửi ra ngoài không chỉnh được. Lượt eval gần nhất: ${args.evalRun.ranAt ?? "chưa có"} (${args.evalRun.passed ? "pass" : "chưa pass"}); giá trị mới chỉ kích hoạt được khi eval chạy lại sau lúc đề xuất và pass (<code>bun run eval:sa01</code>).</p>
<div style="overflow-x:auto"><table><thead><tr><th>Đề xuất lúc</th><th>Tham số</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
${args.changes.map((x) => html`<tr><td>${x.proposedAt}</td><td>${x.param}</td><td>${x.value}</td><td>${x.activatedAt ? `Hiệu lực từ ${x.activatedAt}` : args.canTune
    ? html`<form method="post" action="/tuning"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="op" value="activate"><input type="hidden" name="id" value="${x.id}"><button type="submit">Kích hoạt</button></form>`
    : "Chờ kích hoạt"}</td></tr>`)}
</tbody></table></div>
${args.canTune ? html`<section><h2>Đề xuất mới</h2><form method="post" action="/tuning"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="op" value="propose">
<label>Tham số <select name="param"><option value="confidence_escalate_below">Ngưỡng escalate (0 tới 1)</option><option value="hook_weights">Trọng số Hook (5 số, tổng 100)</option></select></label>
<label>Giá trị <input name="value" required maxlength="40"></label><button type="submit">Đề xuất</button></form></section>` : ""}
<section><h2>Giá trị tạm (config/provisional.json)</h2><p class="meta">Giá trị chưa chốt mà code đang dùng; số dùng giá trị tạm hiện nhãn "Tạm". Mark sửa giá trị (JSON) hoặc chuyển FINAL; thay đổi được ghi lại, không xoá.</p>
<div style="overflow-x:auto"><table><thead><tr><th>Khoá</th><th>Giá trị</th><th>Trạng thái</th><th>Nguồn</th><th>Ai chốt</th></tr></thead><tbody>
${listProvisional().map((p) => html`<tr><td>${p.key}</td><td><code>${JSON.stringify(p.value)}</code></td><td>${p.status === "PROVISIONAL" ? "Tạm" : "Đã chốt"}</td><td>${p.source}</td><td>${p.decidedBy ?? "chưa"}</td></tr>`)}
</tbody></table></div>
${args.canTune ? html`<form method="post" action="/tuning"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="op" value="provisional">
<label>Khoá <select name="key">${listProvisional().map((p) => html`<option value="${p.key}">${p.key}</option>`)}</select></label>
<label>Giá trị (JSON, để trống là giữ nguyên) <textarea name="value" rows="3"></textarea></label>
<label>Trạng thái <select name="status"><option value="PROVISIONAL">Tạm</option><option value="FINAL">Đã chốt (FINAL)</option></select></label><button type="submit">Ghi</button></form>` : ""}</section>`);
}
