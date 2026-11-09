// Phân quyền theo vai trò (D-63, Mark 09/11/2026). Team MKT chỉ thấy persona và số tổng hợp: không vào trang nào có mã
// khách, mã deal, tự báo RM hay tiền. Mark, Amy, BOD thấy được mã khách (Growth DB không lưu tên khách, CLAUDE.md quy tắc 2).
// Trang mới mặc định đóng với MKT: chỉ mở khi thêm vào danh sách dưới đây.
import type { QueueUser } from "./auth.ts";

export const MKT_PATHS: ReadonlySet<string> = new Set([
  "/hooks", "/creative", "/ads-check", "/ads-overview", "/competitors", "/channels", "/jurisdictions", "/banks", "/data", "/market", "/lessons", "/ask", "/tasks", "/samples", "/overview",
]);
// MKT chỉ được POST ở việc không tốn tiền và không đổi dữ liệu dùng chung (D-63, D-66): kiểm mẫu quảng cáo, hỏi Mi1,
// tạo Storyboard (chưa gọi model trả phí), phân tích bước 7, ghi bài học. Nạp file giá, sandbox, kênh, kéo MCP, duyệt
// Storyboard, chạy tạo ảnh, video, đóng gói vẫn chỉ Mark, Amy (CLAUDE.md quy tắc 4; D-32, D-37). Đăng xuất luôn được.
const MKT_POSTS: ReadonlySet<string> = new Set(["/ads-check", "/ask", "/creative/compile", "/creative/analyze", "/lessons"]);

export function canSee(user: QueueUser, path: string): boolean {
  return user.role !== "mkt" || MKT_PATHS.has(path) || [...MKT_PATHS].some((p) => path.startsWith(`${p}/`));
}

export function canPost(user: QueueUser, path: string): boolean {
  return user.role !== "mkt" || path === "/logout" || MKT_POSTS.has(path);
}

// Bỏ khỏi trang các form POST mà vai trò này không được dùng (D-66), để MKT không bấm rồi nhận 403.
// Form trong trang không lồng nhau nên khớp từ <form tới </form> gần nhất là đủ.
export function stripForbiddenForms(user: QueueUser, html: string): string {
  if (user.role !== "mkt") return html;
  return html.replace(/<form method="post" action="([^"]+)"[\s\S]*?<\/form>/g, (m, action: string) => (canPost(user, action) ? m : ""));
}
