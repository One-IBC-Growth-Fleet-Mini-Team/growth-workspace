# Trạng thái dự án

Cập nhật: 10/11/2026 (phiên 12). Quy ước: ai xong việc thì cập nhật file này trong cùng PR. Lịch sử: [`docs/history.md`](history.md). Quyết định: [`docs/context/decisions.md`](context/decisions.md). Tiến độ cho trang Tổng quan: [`docs/progress.json`](progress.json).

## Mục tiêu đợt này

Growth Workspace "dùng được cơ bản" cho 4 vai trò (Amy, Team MKT, Mark, BOD) bằng dữ liệu tổng hợp; giao diện rõ, không tràn ngang ở 375px. Không làm GĐ3, Phụ lục B, Neo4j.

## Đã có

- Hàng chờ của Amy (tự báo RM, mã lý do, NBA, Lead trùng, đơn hàng, WO), Brief sáng, Digest tuần, báo cáo tháng.
- Trang của Team MKT: kiểm quảng cáo, Hook, Creative (Storyboard, đóng gói, phân tích, nháp lịch kênh), quảng cáo tuần, giá đối thủ, thị trường, 45 tài phán.
- Tổng quan `/overview` theo vai trò; điểm vào, thanh điều hướng, hướng dẫn cho từng vai trò; file mẫu cho mọi loại nạp.
- Bản demo có dữ liệu mẫu và tài khoản 4 vai trò (`bun run demo`).
- Cài trên Ubuntu một lệnh (`deploy/local/install.sh`), tài khoản theo vai trò (`scripts/add-user.ts`), sao lưu hằng ngày, khôi phục (`scripts/restore-db.ts`).
- Mi1 Command Center bản phẳng: sổ thuyền viên `src/fleet/registry.ts`, điều phối lượt chạy cha và con cho `/ask` và CRON-06, trang `/command` cho Mark và BOD (D-82). Tắt thuyền viên bằng `FLEET_DISABLED`.
- Nghiệm thu 4 vai trò trên demo (10/11/2026): mọi bước trong hướng dẫn đạt. Luồng Creative chạy được với creative-factory-v2 thật trên máy (Storyboard, duyệt, QA PASS, đóng gói chạy thử, phân tích).
- Đổi mật khẩu cần mật khẩu cũ (trừ lần đầu với mật khẩu tạm); đổi xong huỷ mọi phiên khác của tài khoản (D-85).
- Persona MKT: bộ nạp CSV Closed Won (Opportunity, Account; không lưu tên hay mã khách) ở `/persona`, file mẫu trong `deploy/samples`. Chưa nạp thì trang hiện "Chờ dữ liệu thật" (D-86).
- CRON-07 bản Tạm: 02:00 thứ Hai tạo sẵn Storyboard cho Hook đề xuất của tuần qua creative-factory-v2, chờ Mark duyệt; vết trên `/command` (D-87).
- `bun test`: 404 pass, `tsc --strict` sạch.

## Giá trị tạm đang dùng

Mọi giá trị chưa chốt ở [`config/provisional.json`](../config/provisional.json), đọc qua `getProvisional()`, có nhãn "Tạm" trên giao diện. Mark sửa hoặc chuyển FINAL ở trang Ngưỡng. Gồm: tầng 3B, Win gate, lịch kênh, hoa hồng, tên bundle, CRON-07 (đang bật, nội dung đề xuất ở D-87), từ cấm K-07, ngưỡng tầng 4, trọng số Stage Q-09.

## Việc tiếp theo

1. Chạy creative-factory-v2 với `CF_PROFILE=one-ibc` (brand đúng spec mục 7, brief Tạm, CTA "Nhắn One IBC qua WhatsApp"; markng-byte/creative-factory-v2#22). Brief, campaign thật nhập sau qua Google Sheet. Trên máy cài đặt `CREATIVE_SOURCE=mcp`, `CREATIVE_MCP_URL`.
2. Dựng persona trên `/persona` khi Amy đã nạp file Closed Won thật (bộ nạp đã có, D-86).

## Đang bị chặn

| # | Việc | Cần gì | Ai gỡ |
|---|---|---|---|
| a | Dữ liệu CRM thật | File xuất hoặc API chỉ đọc Opportunity, Lead, Order; file Closed Won cho persona | MobCEC |
| b | Đọc channel Teams "Đồng bộ dữ liệu" | Đăng ký app Microsoft Graph | Admin tenant |
| c | Bộ eval Mi1-sa-01 | Khoảng 30 ca Amy xác nhận | Amy |
| d | Danh mục mã lý do từ chối | Amy và RM xác nhận | Amy, RM |
| e | Eval Mi1 và Mi1-sa-01 với Claude thật; `/ask` thật | Điền `ANTHROPIC_API_KEY` trong `~/.config/growth/growth.env`, chạy `bun run eval:mi1` và `bun run eval:sa01` | Mark |

## Người giữ việc

- Sản phẩm: Mark Ng. Review và merge PR: `@harveyng710-source`.

## PR đang mở

- growth-workspace: PR CRON-07 bản Tạm (D-87).
- creative-factory-v2: không có PR mở.
