// Phân quyền theo vai trò (D-63, Mark 09/11/2026). Team MKT chỉ thấy persona và số tổng hợp: không vào trang nào có mã
// khách, mã deal, tự báo RM hay tiền. Mark, Amy, BOD thấy được mã khách (Growth DB không lưu tên khách, CLAUDE.md quy tắc 2).
// Trang mới mặc định đóng với MKT: chỉ mở khi thêm vào danh sách dưới đây.
import type { QueueUser } from "./auth.ts";

export const MKT_PATHS: ReadonlySet<string> = new Set([
  "/hooks", "/creative", "/ads-check", "/ads-overview", "/competitors", "/channels", "/jurisdictions", "/banks", "/data", "/market", "/lessons", "/ask", "/tasks",
]);
// MKT không làm các việc tốn tiền hay cần người duyệt (CLAUDE.md quy tắc 4): duyệt Storyboard, chạy tạo ảnh, video, đóng gói.
const MKT_BLOCKED_POSTS: ReadonlySet<string> = new Set(["/creative/decide", "/creative/run", "/creative/export"]);

export function canSee(user: QueueUser, path: string): boolean {
  return user.role !== "mkt" || MKT_PATHS.has(path) || [...MKT_PATHS].some((p) => path.startsWith(`${p}/`));
}

export function canPost(user: QueueUser, path: string): boolean {
  return canSee(user, path) && !(user.role === "mkt" && MKT_BLOCKED_POSTS.has(path));
}
