// Trang /strategy (D-91): đề xuất chiến lược tuần. Gói số do code tính hiện đủ, kể cả câu hỏi "chưa đủ dữ liệu"; lời
// dẫn của Mi1 hiện kèm mã số liệu mỗi câu trỏ tới. Eval chưa pass hoặc chưa có LLM thì khoá nút soạn, như /ask.
import type { StrategyDraft } from "../../mi1/strategy-run.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const show = (v: unknown) => (v === null ? "chưa có" : v === true ? "có" : v === false ? "không" : String(v));
const STATUS = { pending: "Chờ Mark duyệt", approved: "Mark đã duyệt, có trong Digest tuần", rejected: "Mark đã từ chối" } as const;

export function renderStrategyPage(a: { draft: StrategyDraft | null; locked: string | null; canWrite: boolean; csrf: string; message: string | null }): string {
  const d = a.draft;
  return shell("Đề xuất chiến lược", html`<h1>Đề xuất chiến lược tuần</h1>
${a.message ? html`<div class="status yellow">${a.message}</div>` : ""}
<p class="meta">Mi1 gom câu trả lời 7 câu hỏi đầu ra từ số đã tính; lời dẫn chỉ được dùng số trong gói, mỗi câu trỏ tới mã số liệu, câu nào không trỏ được bị loại. Không tự áp thay đổi nào.</p>
${a.locked ? html`<div class="status yellow">${a.locked}</div>` : a.canWrite ? html`<form method="post" action="/strategy"><input type="hidden" name="csrf" value="${a.csrf}"><button name="op" value="write">Soạn đề xuất tuần này</button></form>` : ""}
${d ? html`<section><h2>Tuần ${d.weekStart} · ${STATUS[d.status]}${d.decidedBy && d.status !== "pending" ? ` (${d.decidedBy})` : ""}</h2>
${d.statements.length ? html`<ol>${d.statements.map((s) => html`<li>${s.text} <span class="meta">[${s.refs.join(", ")}]</span></li>`)}</ol>` : html`<p class="meta">Không có câu nào qua bộ kiểm.</p>`}
${d.dropped ? html`<p class="meta">Đã loại ${d.dropped} câu có số ngoài gói hoặc mã sai.</p>` : ""}
${a.canWrite && d.status === "pending" ? html`<form method="post" action="/strategy"><input type="hidden" name="csrf" value="${a.csrf}"><input type="hidden" name="id" value="${d.id}"><input name="note" placeholder="Ghi chú" maxlength="300"><button name="decision" value="approve">Duyệt, đưa vào Digest</button><button name="decision" value="reject">Từ chối</button></form>` : ""}
<h2>Gói số</h2>${d.pack.answers.map((x) => html`<div class="card"><div class="head">${x.question}. ${x.title}</div>${x.status === "insufficient" ? html`<p class="warn">Chưa đủ dữ liệu: ${x.reason ?? ""}</p>`
    : html`<table class="kv">${x.facts.map((f) => html`<tr><td>${f.label}</td><td>${show(f.value)}</td><td class="meta">${f.id}</td></tr>`)}</table>`}</div>`)}</section>`
    : html`<p class="meta">Chưa có đề xuất nào.</p>`}`);
}
