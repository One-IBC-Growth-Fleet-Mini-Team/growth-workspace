// Trang /overview (D-76): bốn hàng ô số, mỗi ô link sang trang chi tiết. Rõ ràng, không tràn ngang ở 375px.
import type { Row } from "../../mi1/overview.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const STYLE = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px";

export function renderOverviewPage(rows: Row[]): string {
  return shell("Tổng quan", html`<h1>Tổng quan</h1>
<p class="meta">Gom số từ các trang chi tiết; bấm vào ô để xem. Số có nhãn "Tạm" dùng giá trị chưa chốt (xem trang Ngưỡng).</p>
${rows.map((r) => html`<section><h2>${r.title}</h2><div style="${STYLE}">${r.cells.map((c) => html`<a class="card" href="${c.href}" style="display:block;text-decoration:none;color:inherit">
<div class="meta">${c.label}</div><div style="font-size:18px;font-weight:600"${c.warn ? html` class="warn"` : ""}>${c.value}</div>${c.note ? html`<div class="meta">${c.note}</div>` : ""}</a>`)}</div></section>`)}`);
}
