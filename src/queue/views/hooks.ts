// Trang Hook (Mi1-mkt-02; D-43): điểm có trọng số, cổng tuân thủ, đề xuất Hook card đầu tuần. Team MKT chọn.
import type { buildHookBoard } from "../../db/hooks.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const VERDICT = { pass: "Đạt", review: "Cần người duyệt", hold: "Giữ lại", fail: "Không đạt" } as const;

export function renderHooksPage(args: { board: ReturnType<typeof buildHookBoard>; weights: readonly number[]; canPull: boolean; csrf: string; message: string | null }): string {
  const b = args.board;
  return shell("Hook", html`<h1>Chấm Hook</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${b.importedAt ? "green" : "red"}">Nạp lần cuối: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<p class="meta">Điểm = ${b.labels.map((l, i) => `${l} ${args.weights[i]}%`).join(" + ")}. Điểm từng tiêu chí do nguồn chấm gửi về; code chỉ áp trọng số. Chọn Hook card là việc của Team MKT.</p>
${b.proposed.length ? html`<section><h2>Đề xuất Hook card đầu tuần</h2><ol>${b.proposed.map((h) => html`<li>${h.text} <span class="meta">(${h.score!.toFixed(1)}${h.verdict === "review" ? ", cần người duyệt" : ""})</span></li>`)}</ol></section>` : ""}
${b.hooks.length ? html`<section><h2>Tất cả Hook (${b.hooks.length})</h2><table class="kv">${b.hooks.map((h) => html`<tr><td>${h.hookId}${h.jurisdiction ? html`<br><span class="meta">${h.jurisdiction}</span>` : ""}</td><td>${h.text}<br><span class="meta">${h.scores.map((s) => (s === null ? "-" : String(s))).join(" / ")}</span></td><td>${h.score === null ? "thiếu điểm" : h.score.toFixed(1)}</td><td>${h.verdict === "pass" ? VERDICT.pass : html`<span class="warn">${VERDICT[h.verdict]}</span><br><span class="meta">${h.issues.map((i) => i.detail).join(", ")}</span>`}</td></tr>`)}</table></section>` : html`<p class="meta">Chưa có Hook.</p>`}
<section><h2>Nạp Hook</h2>${args.canPull ? html`<form method="post" action="/hooks"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="pull" value="1"><button type="submit">Kéo điểm từ hệ thống SEO/AIO</button></form>` : ""}
<form method="post" action="/hooks" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV có cột hook_id, text, jurisdiction, score_1 tới score_5 (0 tới 100) <input type="file" name="file" accept=".csv,text/csv"> <span class="meta"><a href="/samples/hooks.csv" download>File mẫu</a></span></label>
<button type="submit">Nạp</button></form></section>`);
}
