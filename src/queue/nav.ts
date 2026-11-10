// Điểm vào theo vai trò (D-77): trang chính sau đăng nhập, thanh điều hướng nhóm theo việc (chỉ trang vai trò được xem),
// một dòng mô tả đầu mỗi trang (để làm gì, số từ file nào, cập nhật lần cuối) và lời nhắc khi trang chưa có dữ liệu.
import type { Database } from "bun:sqlite";
import type { QueueUser } from "./auth.ts";
import { canSee } from "./roles.ts";

type Page = { path: string; label: string; group: "Hằng ngày" | "Nạp dữ liệu" | "Theo dõi" | "Cài đặt"; purpose: string; source?: string; samples?: string[]; last?: string; approverOnly?: boolean };

export const PAGES: Page[] = [
  { path: "/overview", label: "Tổng quan", group: "Hằng ngày", purpose: "Tổng hợp số từ các trang khác; bấm vào ô để xem chi tiết." },
  { path: "/queue", label: "Hàng chờ", group: "Hằng ngày", purpose: "Các đề xuất chờ Amy xác nhận, sửa, bác hoặc escalate.", source: "tự báo RM dán vào và file CRM", last: "SELECT MAX(created_at) AS t FROM queue_items" },
  { path: "/brief", label: "Brief sáng", group: "Hằng ngày", purpose: "Việc cần chú ý sáng nay." },
  { path: "/tasks", label: "Nháp việc", group: "Hằng ngày", purpose: "Nháp ticket MobCEC và việc MKT soạn từ số liệu; chép sang Jira." },
  { path: "/ask", label: "Hỏi Mi1", group: "Hằng ngày", purpose: "Hỏi Mi1; câu trả lời là kết quả của truy vấn mẫu đã duyệt." },
  { path: "/paste", label: "Dán tự báo RM", group: "Nạp dữ liệu", purpose: "Dán thread tự báo trong Teams để tạo mục trên Hàng chờ.", approverOnly: true },
  { path: "/import", label: "File CRM", group: "Nạp dữ liệu", purpose: "Nạp file CSV xuất từ CRM (Opportunity, Account, Lead, Order, Work Order).", approverOnly: true, samples: ["opportunity.csv"], last: "SELECT MAX(finished_at) AS t FROM etl_run_status WHERE status = 'succeeded'" },
  { path: "/billing", label: "Đơn hàng, invoice", group: "Nạp dữ liệu", purpose: "Đối soát SO, PO và invoice quá hạn.", source: "file Sales Order, Purchase Order, Invoice", samples: ["salesorder.csv", "invoice.csv"], last: "SELECT MAX(imported_at) AS t FROM billing_imports" },
  { path: "/partners", label: "Đối tác", group: "Nạp dữ liệu", purpose: "Hiệu suất đối tác và đề xuất hoa hồng (chưa chi).", source: "file danh sách đối tác và deal giới thiệu", samples: ["partner.csv", "referral.csv"], last: "SELECT MAX(imported_at) AS t FROM partner_imports" },
  { path: "/jurisdictions", label: "45 tài phán", group: "Nạp dữ liệu", purpose: "Tài phán đã chốt giá, bộ SKD, nghiệm thu sandbox8.", source: "sheet giá FINAL, danh sách file SKD, tab Bug và Test Cases", samples: ["price-final.csv", "sandbox-bugs.csv"], last: "SELECT MAX(imported_at) AS t FROM jurisdiction_imports" },
  { path: "/banks", label: "Ngân hàng", group: "Nạp dữ liệu", purpose: "Gợi ý ngân hàng theo nơi thành lập.", source: "ma trận ngân hàng của Bank Team", samples: ["bank-matrix.csv", "bank-core.csv"], last: "SELECT MAX(imported_at) AS t FROM bank_imports" },
  { path: "/data", label: "Độ phủ ID", group: "Nạp dữ liệu", purpose: "Độ phủ chuỗi ID, gãy tracking, tầng 3B.", source: "file sự kiện web, CRM", samples: ["events.csv"], last: "SELECT MAX(imported_at) AS t FROM data_event_imports" },
  { path: "/channels", label: "Tài khoản kênh", group: "Nạp dữ liệu", purpose: "Sức khoẻ BM, số WhatsApp, Fanpage; verify Meta theo quốc gia.", source: "lần kiểm ghi tay", last: "SELECT MAX(checked_at) AS t FROM channel_checks" },
  { path: "/ads-overview", label: "Quảng cáo tuần", group: "Nạp dữ liệu", purpose: "Tổng quan quảng cáo tuần, cờ tầng 2.", source: "báo cáo tuần Meta Ads, Google Ads", samples: ["meta-ads.csv", "google-ads.csv"], last: "SELECT MAX(imported_at) AS t FROM ad_imports" },
  { path: "/competitors", label: "Giá đối thủ", group: "Nạp dữ liệu", purpose: "So giá gói đối thủ với sheet FINAL.", source: "sheet giá đối thủ", samples: ["competitor-prices.csv"], last: "SELECT MAX(imported_at) AS t FROM competitor_imports" },
  { path: "/hooks", label: "Hook", group: "Nạp dữ liệu", purpose: "Chấm Hook và đề xuất Hook card tuần.", source: "file điểm Hook hoặc hệ thống SEO/AIO", samples: ["hooks.csv"], last: "SELECT MAX(imported_at) AS t FROM hook_imports" },
  { path: "/budget", label: "Ngân sách", group: "Nạp dữ liệu", purpose: "Kết quả chiến dịch, Win gate, nháp đổi ngân sách chờ duyệt.", source: "file kết quả theo chiến dịch", samples: ["campaigns.csv"], last: "SELECT MAX(imported_at) AS t FROM campaign_imports" },
  { path: "/market", label: "Thị trường", group: "Nạp dữ liệu", purpose: "Quy định và tiếng khách theo tài phán.", source: "file quy định, tiếng khách", samples: ["market-regulation.csv", "market-reviews.csv"], last: "SELECT MAX(imported_at) AS t FROM market_imports" },
  { path: "/leads", label: "Lead trùng", group: "Theo dõi", purpose: "Lead cùng email hoặc số điện thoại (so mã băm).", source: "file Lead của CRM" },
  { path: "/wo", label: "WO tồn đọng", group: "Theo dõi", purpose: "Work Order lâu không cập nhật.", source: "file Work Order", samples: ["workorder.csv"], last: "SELECT MAX(imported_at) AS t FROM wo_imports" },
  { path: "/ads-check", label: "Kiểm quảng cáo", group: "Theo dõi", purpose: "Kiểm mẫu quảng cáo trước khi đăng (từ cấm, độ dài, tài phán chưa chốt giá)." },
  { path: "/creative", label: "Creative", group: "Theo dõi", purpose: "Storyboard, chạy tạo ảnh và video sau khi duyệt, đóng gói, nháp lịch kênh." },
  { path: "/lessons", label: "Bài học", group: "Theo dõi", purpose: "Bài học và quyết định kèm bằng chứng." },
  { path: "/digest", label: "Digest tuần", group: "Theo dõi", purpose: "Tổng kết Hàng chờ tuần vừa xong." },
  { path: "/monthly", label: "Báo cáo tháng", group: "Theo dõi", purpose: "Số tháng trước: Hàng chờ, chi phí, đối tác, bài học." },
  { path: "/runs", label: "Phiên chạy", group: "Theo dõi", purpose: "Từng phiên agent: token, chi phí, người giám sát đã xem." },
  { path: "/tuning", label: "Ngưỡng", group: "Cài đặt", purpose: "Ngưỡng, trọng số và giá trị tạm; chỉ Mark đổi." },
  { path: "/huong-dan", label: "Hướng dẫn", group: "Cài đặt", purpose: "Hướng dẫn sử dụng cho vai trò của bạn." },
  { path: "/password", label: "Đổi mật khẩu", group: "Cài đặt", purpose: "Đặt mật khẩu mới." },
];

// Trang chính sau khi đăng nhập: Amy vào Hàng chờ; Team MKT, Mark, BOD vào Tổng quan.
export function homeFor(u: QueueUser): string {
  return u.role === "approver" ? "/queue" : "/overview";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function navHtml(u: QueueUser, current: string): string {
  const groups = ["Hằng ngày", "Nạp dữ liệu", "Theo dõi", "Cài đặt"] as const;
  const visible = PAGES.filter((p) => canSee(u, p.path) && (!p.approverOnly || u.role === "approver"));
  return `<nav class="meta">${groups.map((g) => { const ps = visible.filter((p) => p.group === g); return ps.length ? `<div><strong>${g}:</strong> ${ps.map((p) => p.path === current ? `<b>${esc(p.label)}</b>` : `<a href="${p.path}">${esc(p.label)}</a>`).join(" · ")}</div>` : ""; }).join("")}</nav>`;
}

export function pageInfoHtml(db: Database, path: string): string {
  const p = PAGES.find((x) => x.path === path);
  if (!p) return "";
  let last: string | null = null;
  if (p.last) { try { last = (db.query(p.last).get() as { t: string | null } | null)?.t ?? null; } catch { last = null; } }
  const samples = (p.samples ?? []).map((n) => `<a href="/samples/${n}" download>${n}</a>`).join(", ");
  const info = `<p class="meta">${esc(p.purpose)}${p.source ? ` Số lấy từ: ${esc(p.source)}.` : ""}${p.last ? ` Cập nhật lần cuối: ${last ? esc(last.slice(0, 16).replace("T", " ")) + " (UTC)" : "chưa nạp"}.` : ""}</p>`;
  const empty = p.last && !last && p.samples ? `<div class="status yellow">Trang chưa có dữ liệu. Nạp ${esc(p.source ?? "file")} ở ô "Nạp" cuối trang này. File mẫu: ${samples}.</div>` : "";
  return info + empty;
}

// Chèn thanh điều hướng và dòng mô tả ngay sau <body> của mọi trang HTML (trừ trang đăng nhập).
export function decorate(html: string, u: QueueUser, db: Database, path: string): string {
  return html.replace("<body>", `<body>${navHtml(u, path)}${pageInfoHtml(db, path)}`);
}
