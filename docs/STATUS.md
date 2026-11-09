# Trạng thái dự án

Cập nhật: 09/11/2026 (phiên 12). Quy ước: ai xong việc thì cập nhật file này trong cùng PR. Lịch sử: [`docs/history.md`](history.md). Quyết định: [`docs/context/decisions.md`](context/decisions.md). Tiến độ cho trang Tổng quan: [`docs/progress.json`](progress.json).

## Mục tiêu đợt này

Growth Workspace "dùng được cơ bản" cho 4 vai trò (Amy, Team MKT, Mark, BOD) bằng dữ liệu tổng hợp; giao diện rõ, không tràn ngang ở 375px. Không làm GĐ3, Phụ lục B, Neo4j.

## Đã có

- Hàng chờ của Amy (tự báo RM, mã lý do, NBA, Lead trùng, đơn hàng, WO), Brief sáng, Digest tuần, báo cáo tháng.
- Trang của Team MKT: kiểm quảng cáo, Hook, Creative (Storyboard, đóng gói, phân tích, nháp lịch kênh), quảng cáo tuần, giá đối thủ, thị trường, 45 tài phán.
- Tổng quan `/overview` theo vai trò; điểm vào, thanh điều hướng, hướng dẫn cho từng vai trò; file mẫu cho mọi loại nạp.
- Bản demo có dữ liệu mẫu và tài khoản 4 vai trò (`bun run demo`).
- Cài trên Ubuntu một lệnh (`deploy/local/install.sh`), tài khoản theo vai trò (`scripts/add-user.ts`), sao lưu hằng ngày, khôi phục (`scripts/restore-db.ts`).
- `bun test`: 390 pass, `tsc --strict` sạch.

## Giá trị tạm đang dùng

Mọi giá trị chưa chốt ở [`config/provisional.json`](../config/provisional.json), đọc qua `getProvisional()`, có nhãn "Tạm" trên giao diện. Mark sửa hoặc chuyển FINAL ở trang Ngưỡng. Gồm: tầng 3B, Win gate, lịch kênh, hoa hồng, tên bundle, CRON-07, từ cấm K-07, ngưỡng tầng 4, trọng số Stage Q-09.

## Việc tiếp theo

1. Mi1 Command Center bản phẳng (sổ thuyền viên, điều phối, `/command`), rồi nghiệm thu 4 vai trò trên demo.
2. Trang persona tổng hợp cho Team MKT: để sau, cần dữ liệu Closed Won từ CRM.

## Đang bị chặn

| # | Việc | Cần gì | Ai gỡ |
|---|---|---|---|
| a | Dữ liệu CRM thật | File xuất hoặc API chỉ đọc Opportunity, Lead, Order | MobCEC |
| b | Đọc channel Teams "Đồng bộ dữ liệu" | Đăng ký app Microsoft Graph | Admin tenant |
| c | Bộ eval Mi1-sa-01 | Khoảng 30 ca Amy xác nhận | Amy |
| d | Danh mục mã lý do từ chối | Amy và RM xác nhận | Amy, RM |
| e | Eval Mi1 hỏi đáp với Claude thật | API key trên máy cài, chạy `bun run eval:mi1` | Mark |

## Người giữ việc

- Sản phẩm: Mark Ng. Review và merge PR: `@harveyng710-source`.

## PR đang mở

- growth-workspace: chuỗi PR #50 tới #60, merge theo thứ tự số (mỗi PR có base là nhánh PR trước).
- creative-factory-v2: markng-byte/creative-factory-v2#17 tới #20.
