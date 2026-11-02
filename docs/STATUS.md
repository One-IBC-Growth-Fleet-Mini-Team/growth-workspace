# Trạng thái dự án

Cập nhật lần cuối: 02/11/2026 (phiên 03). Quy ước: agent hoặc người nào xong một việc phải cập nhật file này **trong cùng PR** với việc đó.

## Trạng thái hiện tại

- Đã bootstrap repo (commit `49f349c`): spec v0.3.2, CLAUDE.md kèm Karpathy guidelines, tài liệu kickoff.
- Repo public, `main` có branch protection: cần 1 approve của code owner, cấm force push và xoá nhánh.
- gstack đã đưa vào `.claude/skills/gstack` (chỉ mã nguồn; cách cài xem `docs/kickoff/setup.md` mục "Môi trường cloud").
- CODEOWNERS (`@harveyng710-source @markng-byte`), README.md và file này đã có trên `main` (PR #3).
- **Phiên 01 xong**: design doc `docs/design/slice-01-amy-queue.md` và khung eval `evals/sa-01/README.md` đã merge ở PR #4. Mark Ng đồng ý cả 13 quyết định D-01 tới D-13 theo cột "Đề xuất" (ghi ở `docs/context/decisions.md`). 16 câu hỏi mở Q-01 tới Q-16 chưa có câu trả lời.
- **Phiên 02 xong (PR #5 đã merge)**: build lát cắt 01 bước 1 tới 4 (design doc mục 15), test trước, chỉ dữ liệu tổng hợp, không gọi mạng hay LLM thật.
  - Bước 1: khung Bun (`package.json`, `tsconfig.json`, `bunfig.toml`), `src/config.ts`, `src/log.ts`, `src/db/schema.sql` kèm trigger chỉ thêm, `src/db/migrate.ts`, `src/db/open.ts`. Test T-Q-01.
  - Bước 2: `src/metrics/*` (pipeline_in_period, is_reseller_end_client, services_purchased, rm_active_on_deal, compute_confidence, cost). Test T-MET-01 tới T-MET-07.
  - Bước 3: `src/crm/http.ts` (crmGet duy nhất, GET gán cứng), `src/crm/mappers.ts`, `src/crm/etl.ts`, `src/pii/hash.ts` (HMAC-SHA256, D-05). Test T-CRM-01 tới T-CRM-06, T-MAP-01, T-MAP-02, T-HASH-01 tới T-HASH-03.
  - Bước 4: `src/teams/graph-read.ts`, `src/teams/parse-report.ts`, `src/pii/redact-regex.ts` (R1), `src/pii/name-guard.ts` (R3). Test T-TEAMS-01, T-PARSE-01 tới T-PARSE-05, T-PII-01 tới T-PII-04, T-PII-07.
  - `bun test`: 117 pass, 0 fail (sau khi sửa 9 trên 10 finding của `/review`; finding còn lại ghi ở PR).
  - Mọi chỗ phụ thuộc schema thật hoặc câu hỏi mở được đánh dấu `[ĐỐI CHIẾU SCHEMA]` hoặc mã Q-xx trong comment, nằm sau interface và chạy với dữ liệu tổng hợp: tên trường CRM, đường dẫn và phân trang API CRM (Q-01), quy tắc mã quốc gia SĐT (mục 7.2), id team, channel và cách nhận diện thread ngày (mục 5.3), lấy token Graph (Q-02), ngưỡng "cập nhật hàng loạt" của rm_active_on_deal (Q-09, giá trị tạm 3).

- **Phiên 03 (02/11/2026)**: build bước 5 tới 8 (design doc mục 15), test trước, chỉ dữ liệu tổng hợp, LLM giả, không gọi mạng thật.
  - Bước 5: `src/mcp/crm-read` (server stdio, Growth DB mở chỉ đọc, đúng 3 tool). Test T-MCP-01 tới T-MCP-06.
  - Bước 6: `src/agents/sa-01` (`runSa01`, prompt có version, schema đầu ra, LLM qua `@anthropic-ai/sdk`, luật NBA bằng code), bộ chạy eval `bun run eval:sa01` với 10 ca synthetic trong `evals/sa-01/cases`. Test T-SA-01 tới T-SA-05, T-NBA-*, T-PII-05.
  - Bước 7: `src/queue` (trang Hàng chờ, đăng nhập Entra OIDC kèm PKCE, CSRF, CSP), `src/teams/notify.ts`, job `src/jobs/etl-crm.ts` và `src/jobs/sa01-morning.ts`. Test T-Q-02 tới T-Q-11, T-N-01, T-N-02, T-PII-06, T-E2E-01.
  - Bước 8: review bảo mật bằng skill `security-review` (thay `/cso`, vì bản gstack trong repo chưa render skill cho phiên cloud): không có lỗ hổng đạt ngưỡng. QA trên Chromium với dữ liệu tổng hợp: bắt và sửa lỗi `Referrer-Policy: no-referrer` làm trình duyệt gửi `Origin: null`, chặn mọi nút của Amy; sửa tràn ngang trên màn hình điện thoại.
  - `bun test`: 189 pass, 0 fail.
  - Phụ thuộc: `@anthropic-ai/sdk` 1.3.0, `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7 (đúng D-01).
  - Lệch thiết kế cần người duyệt xác nhận: (1) NBA đọc thêm trường bổ sung (`last_modified_at`, ngành, dịch vụ đã mua, khách cũ) thẳng từ snapshot, vì 3 tool MCP không trả các trường này; danh sách Opportunity vẫn chỉ đến từ `get_pipeline_by_close_date` (luật 5). (2) `find_duplicate_leads` chỉ nhận `lead_id`: snapshot chưa có liên kết Lead với Client nên `NBA_X_DUP` chưa kích hoạt khi chạy thật ([ĐỐI CHIẾU SCHEMA]).
  - Giá trị tạm chờ chốt: tên Stage đã đóng và trọng số Stage (Q-09), giới hạn 20 mục NBA (Q-10), mã ngành bị hạ ưu tiên (Q-14), định dạng thân tin webhook (Q-11).

## Việc tiếp theo

1. Bước 9: nối nguồn thật khi STATUS a, b được gỡ; đối chiếu mọi chỗ **[ĐỐI CHIẾU SCHEMA]**; Amy xác nhận khoảng 30 ca eval (đặt ở `SA01_PRIVATE_EVAL_DIR`), chạy `bun run eval:sa01`; dựng container theo D-03 (Q-13), đặt biến môi trường theo `.env.example`; bật cho Amy.
2. Mang các câu Q-01 tới Q-16 cho Amy, MobCEC, admin tenant (design doc mục 14); trả lời Q-09, Q-10, Q-14 để thay giá trị tạm trong `src/config.ts`.
3. Mark quyết finding R3 còn mở (tên khách một từ ở đầu câu) và hai lệch thiết kế ở trên.
4. Bật Secret scanning và Push protection cho repo. Người làm: admin repo.

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

- PR phiên 03 (nhánh `claude/dreamy-faraday-sw7jto`): lát cắt 01 bước 5 tới 8, chờ `@harveyng710-source` duyệt. PR #5 (phiên 02) đã merge.
