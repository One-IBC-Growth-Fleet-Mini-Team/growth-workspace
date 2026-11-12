// Phân quyền theo vai trò (D-63, Mark 09/11/2026). Team MKT chỉ thấy persona và số tổng hợp: không vào trang nào có mã
// khách, mã deal, tự báo RM hay tiền. Mark, Amy, BOD thấy được mã khách (Growth DB không lưu tên khách, CLAUDE.md quy tắc 2).
// Trang mới mặc định đóng với MKT: chỉ mở khi thêm vào danh sách dưới đây.
import { accountRoleOf, type QueueUser } from "./auth.ts";

export const MKT_PATHS: ReadonlySet<string> = new Set([
  "/hooks", "/creative", "/ads-check", "/ads-overview", "/competitors", "/channels", "/jurisdictions", "/banks", "/data", "/market", "/lessons", "/ask", "/tasks", "/samples", "/overview", "/huong-dan", "/password", "/persona", "/command", "/static",
]);
// POST theo danh sách cho phép, mặc định từ chối (D-98): đường dẫn không có trong bảng thì không vai nào ghi được.
// - Việc không tốn tiền, không đổi dữ liệu dùng chung: kiểm mẫu quảng cáo, hỏi Mi1, tạo Storyboard (chưa gọi model trả
//   phí), phân tích bước 7, ghi bài học (D-63, D-66): mọi vai.
// - Nạp file giá, sandbox, kênh, sự kiện, quảng cáo, đối thủ, Hook, thị trường, kéo MCP, duyệt Storyboard, chạy tạo ảnh,
//   video, đóng gói: Amy, Mark, BOD (BOD như Mark; CLAUDE.md quy tắc 4; D-32, D-37, D-66).
// - Việc của Hàng chờ và file CRM, đơn hàng, đối tác, persona, WO, dán tự báo: Amy.
// - Việc có tiền hoặc đổi cấu hình: nháp đổi ngân sách, kế hoạch ngân sách tuần, đề xuất chiến lược, ngưỡng: chỉ vai mark.
// Đăng xuất, đổi mật khẩu luôn được.
type AccountRole = ReturnType<typeof accountRoleOf>;
const ALL: readonly AccountRole[] = ["amy", "mkt", "mark", "bod"];
const SHARED: readonly AccountRole[] = ["amy", "mark", "bod"];
export const POST_ALLOW: Readonly<Record<string, readonly AccountRole[]>> = {
  "/logout": ALL, "/password": ALL,
  "/ads-check": ALL, "/ask": ALL, "/creative/compile": ALL, "/creative/analyze": ALL, "/lessons": ALL,
  "/jurisdictions": SHARED, "/channels": SHARED, "/channels/verify": SHARED, "/data": SHARED, "/ads-overview": SHARED,
  "/competitors": SHARED, "/hooks": SHARED, "/market": SHARED, "/budget": SHARED, "/runs": SHARED,
  "/creative/decide": SHARED, "/creative/run": SHARED, "/creative/export": SHARED,
  "/import": ["amy"], "/banks": ["amy"], "/billing": ["amy"], "/persona": ["amy"], "/partners": ["amy"], "/wo/touch": ["amy"], "/paste": ["amy"],
  "/budget/decide": ["mark"], "/budget/plan": ["mark"], "/strategy": ["mark"], "/tuning": ["mark"],
};
const QUEUE_ITEM_POST = /^\/queue\/items\/[A-Za-z0-9-]{1,64}\/[a-z_]+$/;

export function canSee(user: QueueUser, path: string): boolean {
  return user.role !== "mkt" || MKT_PATHS.has(path) || [...MKT_PATHS].some((p) => path.startsWith(`${p}/`));
}

export function canPost(user: QueueUser, path: string): boolean {
  const allowed = QUEUE_ITEM_POST.test(path) ? ["amy"] : POST_ALLOW[path];
  return allowed !== undefined && allowed.includes(accountRoleOf(user));
}

// Bỏ khỏi trang các form POST mà vai trò này không được dùng (D-66, D-98), để không ai bấm rồi nhận 403.
// Form trong trang không lồng nhau nên khớp từ <form tới </form> gần nhất là đủ.
export function stripForbiddenForms(user: QueueUser, html: string): string {
  return html.replace(/<form method="post" action="([^"]+)"[\s\S]*?<\/form>/g, (m, action: string) => (canPost(user, action) ? m : ""));
}
