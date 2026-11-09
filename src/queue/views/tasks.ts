// Trang nháp việc (D-60): chỉ hiện để chép sang Jira; không có nút gửi.
import type { TaskDraft } from "../../mi1/task-drafts.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

export function renderTasksPage(drafts: TaskDraft[]): string {
  return shell("Nháp việc", html`<h1>Nháp việc cho Jira</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<p class="meta">Soạn từ số liệu hiện tại. Growth không gửi đi đâu; xem rồi tự tạo việc trên Jira (MKT) hoặc gửi MobCEC.</p>
${drafts.length ? drafts.map((d) => html`<div class="card"><div class="head">[${d.project}] ${d.title}</div><p>${d.body}</p><p class="meta">Bằng chứng: <a href="${d.evidence}">${d.evidence}</a></p>
<textarea readonly rows="4">${d.title}\n\n${d.body}</textarea></div>`) : html`<p class="meta">Chưa có việc nào cần mở.</p>`}`);
}
