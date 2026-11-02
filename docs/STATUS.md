# Trạng thái dự án

Cập nhật lần cuối: 02/11/2026 (phiên 02). Quy ước: agent hoặc người nào xong một việc phải cập nhật file này **trong cùng PR** với việc đó.

## Trạng thái hiện tại

- Đã bootstrap repo (commit `49f349c`): spec v0.3.2, CLAUDE.md kèm Karpathy guidelines, tài liệu kickoff.
- Repo public, `main` có branch protection: cần 1 approve của code owner, cấm force push và xoá nhánh.
- gstack đã đưa vào `.claude/skills/gstack` (chỉ mã nguồn; cách cài xem `docs/kickoff/setup.md` mục "Môi trường cloud").
- CODEOWNERS (`@harveyng710-source @markng-byte`), README.md và file này đã có trên `main` (PR #3).
- **Phiên 01 xong**: design doc `docs/design/slice-01-amy-queue.md` và khung eval `evals/sa-01/README.md` đã merge ở PR #4. Mark Ng đồng ý cả 13 quyết định D-01 tới D-13 theo cột "Đề xuất" (ghi ở `docs/context/decisions.md`). 16 câu hỏi mở Q-01 tới Q-16 chưa có câu trả lời.
- **Phiên 02 (02/11/2026)**: build lát cắt 01 bước 1 tới 4 (design doc mục 15), test trước, chỉ dữ liệu tổng hợp, không gọi mạng hay LLM thật.
  - Bước 1: khung Bun (`package.json`, `tsconfig.json`, `bunfig.toml`), `src/config.ts`, `src/log.ts`, `src/db/schema.sql` kèm trigger chỉ thêm, `src/db/migrate.ts`, `src/db/open.ts`. Test T-Q-01.
  - Bước 2: `src/metrics/*` (pipeline_in_period, is_reseller_end_client, services_purchased, rm_active_on_deal, compute_confidence, cost). Test T-MET-01 tới T-MET-07.
  - Bước 3: `src/crm/http.ts` (crmGet duy nhất, GET gán cứng), `src/crm/mappers.ts`, `src/crm/etl.ts`, `src/pii/hash.ts` (HMAC-SHA256, D-05). Test T-CRM-01 tới T-CRM-06, T-MAP-01, T-MAP-02, T-HASH-01 tới T-HASH-03.
  - Bước 4: `src/teams/graph-read.ts`, `src/teams/parse-report.ts`, `src/pii/redact-regex.ts` (R1), `src/pii/name-guard.ts` (R3). Test T-TEAMS-01, T-PARSE-01 tới T-PARSE-05, T-PII-01 tới T-PII-04, T-PII-07.
  - `bun test`: 117 pass, 0 fail (sau khi sửa 9 trên 10 finding của `/review`; finding còn lại ghi ở PR).
  - Mọi chỗ phụ thuộc schema thật hoặc câu hỏi mở được đánh dấu `[ĐỐI CHIẾU SCHEMA]` hoặc mã Q-xx trong comment, nằm sau interface và chạy với dữ liệu tổng hợp: tên trường CRM, đường dẫn và phân trang API CRM (Q-01), quy tắc mã quốc gia SĐT (mục 7.2), id team, channel và cách nhận diện thread ngày (mục 5.3), lấy token Graph (Q-02), ngưỡng "cập nhật hàng loạt" của rm_active_on_deal (Q-09, giá trị tạm 3).

## Việc tiếp theo

1. Phiên build tiếp: bước 5 tới 8 của design doc mục 15 (`mcp/crm-read`, `agents/sa-01` với LLM giả và `nba/*`, `queue/*` và `teams/notify`, rồi `/cso`, `/qa`, `/ship`). Không cần gỡ chặn a, b.
2. Mang các câu Q-01 tới Q-16 cho Amy, MobCEC, admin tenant (design doc mục 14). Q-09 (ngưỡng hàng loạt, trọng số Stage) và Q-10 (giới hạn mục NBA) cần trước bước 6.
3. Bật Secret scanning và Push protection cho repo (Settings, Code security). Người làm: admin repo.
4. Song song: gỡ các mục trong "Đang bị chặn"; bước 9 (nối nguồn thật, bật cho Amy) cần chúng.

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

- PR phiên 02 (nhánh `claude/dreamy-faraday-sw7jto`): lát cắt 01 bước 1 tới 4, chờ `@harveyng710-source` duyệt. PR #4 (phiên 01) đã merge.
