// Trang /settings (D-96), chỉ Mark: bảng ổ cắm, adapter đang dùng, đã nối hay chưa, thiếu biến nào, lần gọi thành công gần
// nhất. Chỉ hiện TÊN biến, không bao giờ hiện giá trị; không có ô nhập key: key chỉ điền trong file cấu hình trên máy.
import type { SocketStatus } from "../../connectors/registry.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const STATE = { connected: "Đã nối", not_enabled: "Đủ biến, chưa bật", not_connected: "Chưa nối" } as const;
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "chưa có");

export function renderSettingsPage(rows: SocketStatus[]): string {
  return shell("Cài đặt kết nối", html`<h1>Cài đặt kết nối</h1>
<p class="meta">Mỗi ổ cắm có adapter tải file (chạy ngay) và adapter thật (cần biến môi trường). Chưa nối thì hệ thống dùng adapter tải file. Điền biến trong <code>~/.config/growth/growth.env</code> trên máy cài rồi khởi động lại dịch vụ; trang này không nhận key và không hiện giá trị nào.</p>
<div style="overflow-x:auto"><table class="kv">
<tr><td><strong>Ổ cắm</strong></td><td><strong>Đang dùng</strong></td><td><strong>Trạng thái</strong></td><td><strong>Thiếu biến</strong></td><td><strong>Gọi thành công gần nhất</strong></td></tr>
${rows.map((r) => html`<tr><td>${r.label}<br><span class="meta">${r.usedBy}</span></td><td>${r.active}</td>
<td>${r.state === "connected" ? html`<strong>${STATE[r.state]}</strong>` : html`<span class="warn">${STATE[r.state]}</span>`}</td>
<td>${r.missing.length ? html`<code>${r.missing.join(", ")}</code>` : "không"}${r.optionalMissing.length ? html`<br><span class="meta">tuỳ chọn: ${r.optionalMissing.join(", ")}</span>` : ""}</td>
<td>${time(r.lastOkAt)}${r.lastError ? html`<br><span class="meta">lỗi gần nhất: ${r.lastError}</span>` : ""}</td></tr>`)}</table></div>`);
}
