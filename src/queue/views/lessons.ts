// Trang nhật ký bài học và quyết định (D-48): ghi kèm bằng chứng, tìm lại.
import type { KnowledgeEntry } from "../../db/knowledge.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderLessonsPage(args: { entries: KnowledgeEntry[]; q: string; csrf: string; message: string | null }): string {
  return shell("Bài học", html`<h1>Bài học và quyết định</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<form method="get" action="/lessons"><label>Tìm <input name="q" value="${args.q}" maxlength="200"></label><button type="submit">Tìm</button></form>
<section>${args.entries.length ? args.entries.map((e) => html`<div class="card"><div class="head">${e.kind === "lesson" ? "Bài học" : "Quyết định"}: ${e.title}</div><p>${e.body}</p>
<p class="meta">${e.createdAt} · ${e.actor} · bằng chứng: <a href="${e.evidence}">${e.evidence}</a>${e.tags ? ` · ${e.tags}` : ""}</p></div>`) : html`<p class="meta">Chưa có mục nào.</p>`}</section>
<section><h2>Ghi mới</h2><form method="post" action="/lessons"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Loại <select name="kind"><option value="lesson">Bài học</option><option value="decision">Quyết định</option></select></label>
<label>Tiêu đề <input name="title" maxlength="200" required></label>
<label>Nội dung <textarea name="body" rows="4" required></textarea></label>
<label>Bằng chứng: đường dẫn trang Growth, ví dụ /ads-overview?week=2026-11-02 <input name="evidence" maxlength="500" required></label>
<label>Thẻ <input name="tags" maxlength="200"></label>
<button type="submit">Ghi</button></form></section>`);
}
