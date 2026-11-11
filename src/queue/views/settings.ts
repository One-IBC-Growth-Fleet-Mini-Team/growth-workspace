// Trang /settings (D-96), chỉ Mark: bảng ổ cắm, adapter đang dùng, đã nối hay chưa, thiếu biến nào, lần gọi thành công gần
// nhất. Chỉ hiện TÊN biến, không bao giờ hiện giá trị; không có ô nhập key: key chỉ điền trong file cấu hình trên máy.
import type { SocketStatus } from "../../connectors/registry.ts";
import type { SecurityEventKind } from "../../db/users.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const STATE = { connected: "Đã nối", not_enabled: "Đủ biến, chưa bật", not_connected: "Chưa nối" } as const;
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "chưa có");

const KIND: Record<SecurityEventKind, string> = {
  login_ok: "Đăng nhập được", login_failed: "Đăng nhập sai", login_locked: "Bị khoá 15 phút (sai 5 lần)", login_rate_limited: "Chặn theo IP (sai quá nhiều)",
  password_changed: "Đổi mật khẩu", password_reset: "Cấp mật khẩu tạm mới", password_expired: "Mật khẩu tạm hết hạn", account_created: "Tạo tài khoản", account_disabled: "Khoá tài khoản",
};
const WARN: ReadonlySet<SecurityEventKind> = new Set(["login_failed", "login_locked", "login_rate_limited", "password_expired", "account_disabled"]);

export function renderSettingsPage(rows: SocketStatus[], events: { at: string; accountId: string; kind: SecurityEventKind; actor: string }[] = [], tunnel: { url: string; since: string } | null = null): string {
  return shell("Cài đặt kết nối", html`<h1>Cài đặt kết nối</h1>
<p class="meta">Mỗi ổ cắm có adapter tải file (chạy ngay) và adapter thật (cần biến môi trường). Chưa nối thì hệ thống dùng adapter tải file. Điền biến trong <code>~/.config/growth/growth.env</code> trên máy cài rồi khởi động lại dịch vụ; trang này không nhận key và không hiện giá trị nào.</p>
<div style="overflow-x:auto"><table class="kv">
<tr><td><strong>Ổ cắm</strong></td><td><strong>Đang dùng</strong></td><td><strong>Trạng thái</strong></td><td><strong>Thiếu biến</strong></td><td><strong>Gọi thành công gần nhất</strong></td></tr>
${rows.map((r) => html`<tr><td>${r.label}<br><span class="meta">${r.usedBy}</span></td><td>${r.active}</td>
<td>${r.state === "connected" ? html`<strong>${STATE[r.state]}</strong>` : html`<span class="warn">${STATE[r.state]}</span>`}</td>
<td>${r.missing.length ? html`<code>${r.missing.join(", ")}</code>` : "không"}${r.optionalMissing.length ? html`<br><span class="meta">tuỳ chọn: ${r.optionalMissing.join(", ")}</span>` : ""}</td>
<td>${time(r.lastOkAt)}${r.lastError ? html`<br><span class="meta">lỗi gần nhất: ${r.lastError}</span>` : ""}</td></tr>`)}</table></div>
<section id="tunnel"><h2>Truy cập từ xa (Quick Tunnel)</h2>
${tunnel ? html`<p>Link hiện tại: <a href="${tunnel.url}">${tunnel.url}</a> <span class="meta">từ ${time(tunnel.since)}</span></p>` : html`<p class="warn">Chưa có link. Bật bằng <code>bash deploy/local/quick-tunnel.sh</code>.</p>`}
<p class="meta">Link đổi mỗi lần tunnel khởi động lại; lệnh <code>bun run tunnel:url</code> in link hiện tại. Chỉ email trong <code>~/.config/growth/tunnel-emails.txt</code> qua được trang mã PIN của Cloudflare; sau đó vẫn phải đăng nhập bằng tài khoản Growth.</p></section>
<section id="security"><h2>Sổ sự kiện bảo mật (${events.length} gần nhất)</h2>
<p class="meta">Đăng nhập, đổi và cấp mật khẩu, khoá tài khoản (D-97). Tài khoản "?" là mã không có trong hệ thống (gõ nhầm hoặc dò). Không lưu mật khẩu, mã băm hay IP.</p>
${events.length ? html`<div style="overflow-x:auto"><table class="kv"><tr><td><strong>Lúc</strong></td><td><strong>Tài khoản</strong></td><td><strong>Sự kiện</strong></td><td><strong>Bởi</strong></td></tr>
${events.map((e) => html`<tr><td>${time(e.at)}</td><td>${e.accountId}</td><td>${WARN.has(e.kind) ? html`<span class="warn">${KIND[e.kind]}</span>` : KIND[e.kind]}</td><td class="meta">${e.actor}</td></tr>`)}</table></div>` : html`<p class="meta">Chưa có sự kiện nào.</p>`}</section>`);
}
