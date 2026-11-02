# Trạng thái dự án

Cập nhật lần cuối: 02/11/2026. Quy ước: agent hoặc người nào xong một việc phải cập nhật file này **trong cùng PR** với việc đó.

## Trạng thái hiện tại

- Đã bootstrap repo (commit `49f349c`): spec v0.3.2, CLAUDE.md kèm Karpathy guidelines, tài liệu kickoff.
- Repo public, `main` có branch protection: cần 1 approve của code owner, cấm force push và xoá nhánh.
- gstack đã đưa vào `.claude/skills/gstack` (chỉ mã nguồn; cách cài xem `docs/kickoff/setup.md` mục "Môi trường cloud").
- CODEOWNERS (`@harveyng710-source @markng-byte`), README.md và file này đã có trên `main` (PR #3).
- `docs/kickoff/session-01.md` đã có mục "Bối cảnh môi trường"; `decisions.md` ghi quyết định repo public (PR #2).
- Phiên 01 đã chạy (02/11/2026): design doc `docs/design/slice-01-amy-queue.md` (đã qua 3 vòng office-hours, CEO review, eng review), khung eval `evals/sa-01/README.md`. Chỉ tài liệu, chưa có code sản phẩm. Còn 13 quyết định (D-01 tới D-13) và 16 câu hỏi mở (Q-01 tới Q-16) chờ trả lời ở PR.

## Việc tiếp theo

1. Người duyệt PR phiên 01 trả lời Sổ quyết định (design doc mục 13), ít nhất D-01 (stack) và D-02 (Growth DB) trước khi build. Mang các câu Q-xx cho Amy, MobCEC, admin tenant (design doc mục 14).
2. Sau khi merge: phiên build bước 1 tới 8 (design doc mục 15), test trước, chạy hoàn toàn trên dữ liệu tổng hợp; không cần gỡ chặn a, b.
3. Bật Secret scanning và Push protection cho repo (Settings, Code security). Người làm: admin repo.
4. Song song: bắt đầu gỡ các mục trong "Đang bị chặn"; phiên 01 không cần chúng, giai đoạn build thì cần.

## Đang bị chặn

| # | Việc bị chặn | Cần gì | Ai gỡ |
|---|---|---|---|
| a | Chưa có đường đọc dữ liệu CRM. `api-crm.oneibc.com` chỉ xem được qua trang admin; MobCEC không cấp dump hàng loạt. | API chỉ đọc cho Opportunity, Lead, Order. | MobCEC |
| b | Chưa đọc được channel Teams "Đồng bộ dữ liệu" qua Microsoft Graph. | Admin tenant đăng ký app với quyền đọc channel. | Admin tenant Microsoft 365 |
| c | Bộ eval Mi1-sa-01 chưa có ca nào. | Amy xác nhận khoảng 30 ca. | Amy |
| d | Danh mục `rejection_reason_code` mới là bản nháp. | Amy và RM xác nhận. | Amy, RM |

## Người giữ việc

- Sản phẩm: Mark Ng.
- Review và merge PR: `@harveyng710-source` (tạm thời, xem `docs/context/decisions.md`).

## PR đang mở

- PR phiên 01 (nhánh `claude/elegant-goodall-3edwo7`): design doc lát cắt 01, chỉ tài liệu, chờ `@harveyng710-source` duyệt. PR #1 đã đóng, thay bằng PR #3.
