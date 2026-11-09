# Trạng thái dự án

Cập nhật lần cuối: 09/11/2026 (phiên 11). Quy ước: agent hoặc người nào xong một việc phải cập nhật file này **trong cùng PR** với việc đó.

## Mục tiêu tối thượng

Làm ra thứ **chạy được thực tế sớm nhất có thể** (`@harveyng710-source`, 02/11/2026). Mỗi phiên ưu tiên việc rút ngắn đường tới lúc Amy dùng được với dữ liệu thật; chỗ nào phải chờ người ngoài thì tìm đường tạm an toàn (D-24) thay vì chờ.

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

- **Phiên 03 xong (PR #6 đã merge)**: build bước 5 tới 8 (design doc mục 15), test trước, chỉ dữ liệu tổng hợp, LLM giả, không gọi mạng thật.
  - Bước 5: `src/mcp/crm-read` (server stdio, Growth DB mở chỉ đọc, đúng 3 tool). Test T-MCP-01 tới T-MCP-06.
  - Bước 6: `src/agents/sa-01` (`runSa01`, prompt có version, schema đầu ra, LLM qua `@anthropic-ai/sdk`, luật NBA bằng code), bộ chạy eval `bun run eval:sa01` với 10 ca synthetic trong `evals/sa-01/cases`. Test T-SA-01 tới T-SA-05, T-NBA-*, T-PII-05.
  - Bước 7: `src/queue` (trang Hàng chờ, đăng nhập Entra OIDC kèm PKCE, CSRF, CSP), `src/teams/notify.ts`, job `src/jobs/etl-crm.ts` và `src/jobs/sa01-morning.ts`. Test T-Q-02 tới T-Q-11, T-N-01, T-N-02, T-PII-06, T-E2E-01.
  - Bước 8: review bảo mật bằng skill `security-review` (thay `/cso`, vì bản gstack trong repo chưa render skill cho phiên cloud): không có lỗ hổng đạt ngưỡng. QA trên Chromium với dữ liệu tổng hợp: bắt và sửa lỗi `Referrer-Policy: no-referrer` làm trình duyệt gửi `Origin: null`, chặn mọi nút của Amy; sửa tràn ngang trên màn hình điện thoại.
  - `bun test`: 189 pass, 0 fail.
  - Phụ thuộc: `@anthropic-ai/sdk` 1.3.0, `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7 (đúng D-01).
  - Lệch thiết kế cần người duyệt xác nhận: (1) NBA đọc thêm trường bổ sung (`last_modified_at`, ngành, dịch vụ đã mua, khách cũ) thẳng từ snapshot, vì 3 tool MCP không trả các trường này; danh sách Opportunity vẫn chỉ đến từ `get_pipeline_by_close_date` (luật 5). (2) `find_duplicate_leads` chỉ nhận `lead_id`: snapshot chưa có liên kết Lead với Client nên `NBA_X_DUP` chưa kích hoạt khi chạy thật ([ĐỐI CHIẾU SCHEMA]).
  - Giá trị tạm chờ chốt: tên Stage đã đóng và trọng số Stage (Q-09), giới hạn 20 mục NBA (Q-10), mã ngành bị hạ ưu tiên (Q-14), định dạng thân tin webhook (Q-11).

- **Phiên 04 xong (PR #7 đã merge)**: bước 9, phần làm được khi chưa có nguồn thật. Test trước, chỉ dữ liệu tổng hợp.
  - Dọn snapshot cũ hơn 14 ngày (D-09): `src/db/prune.ts`, job `src/jobs/prune-snapshots.ts`; không bao giờ xoá snapshot succeeded mới nhất.
  - Xoá có kiểm soát (D-12): `src/db/redact.ts` và lệnh chạy tay `scripts/redact-row.ts`; bảng kiểm toán `redaction_log` (migration 002, chỉ thêm). Test tĩnh: chỉ `scripts/` dùng được.
  - Danh bạ RM (Q-07): `src/db/rm-directory.ts` và `scripts/load-rm-directory.ts`, nạp từ file JSON giữ ngoài repo.
  - Preflight: `bun run preflight` (cấu hình, DB, danh bạ, eval) và `--network` (dò CRM chỉ GET trang đầu, báo tên trường lệch schema; đọc thử channel Graph).
  - `Dockerfile` (D-03), biến `SA01_EVAL_RESULTS_DIR` để kết quả eval nằm trên ổ bền.
  - Runbook `docs/runbook/lat-cat-01.md`: lịch job, checklist bật cho Amy, bảng chỗ cần đối chiếu schema, xử lý sự cố, xoá có kiểm soát, tắt khẩn cấp.
  - Chạy `/review` (code review mức high) trên toàn bộ code bước 5 tới 9: 10 finding, sửa cả 10, mỗi lỗi có test tái hiện. Nặng nhất: cookie `SameSite=Strict` làm đăng nhập Entra thật không bao giờ hoàn tất; lỗi LLM tạm thời làm mất tự báo vĩnh viễn; xoá có kiểm soát bỏ sót bản sửa và `rm_reports`. QA lại trên Chromium: đăng nhập, xác nhận, ghi phản hồi RM chạy đúng.
  - Lệch thiết kế mới: cookie OIDC là `SameSite=Lax` (cookie phiên vẫn Strict như design doc mục 9); cờ reseller cho NBA đọc từ cùng snapshot với pipeline thay vì gọi `check_reseller_flag` từng khách.
  - Chưa làm: thêm `nba_priority`, `cost_usd`, `compute_confidence` vào `docs/spec/metric-definitions.md` (CLAUDE.md quy tắc 3; đổi định nghĩa cần PR riêng, Mark duyệt).
  - `bun test`: 208 pass, 0 fail.

- **Phiên 05 xong (PR #8, #9 đã merge)**: CI và gom việc chờ người.
  - CI GitHub Actions `.github/workflows/test.yml`: `bun test` và `tsc --strict` trên mỗi PR vào `main`; typecheck cài `typescript` tạm trong job, không đổi `package.json` (D-18).
  - Sổ quyết định D-14 tới D-22: `docs/context/so-quyet-dinh-mo.md`; `@harveyng710-source` đã chốt cả 9 theo đề xuất, cùng K-01 và K-02 (ghi ở `docs/context/decisions.md`).
  - Câu hỏi mở gom theo người nhận (MobCEC, admin tenant, Amy, Mark, kỹ thuật): `docs/context/cau-hoi-mo-lat-cat-01.md`.
  - PR #8 đã merge. Ghi quyết định D-14 tới D-22 vào `decisions.md` và thêm `nba_priority`, `cost_usd`, `compute_confidence` vào `docs/spec/metric-definitions.md` (D-22, CLAUDE.md quy tắc 3) đi chung một PR tài liệu, chờ duyệt.

- **Phiên 06 xong (PR #10 đã merge)**: bản demo và bộ triển khai không Docker (D-23, chưa chốt nhà cung cấp E-01).
  - Bản demo `bun run demo` (`src/demo/`): Hàng chờ trên máy cá nhân với dữ liệu tổng hợp, LLM, CRM, Teams và đăng nhập đều giả; chỉ nghe trên 127.0.0.1. Hướng dẫn: `docs/huong-dan-demo.md`.
  - `deploy/`: `setup.sh` (cài Bun 1.4.4 từ GitHub có kiểm SHA-256, user `growth`, systemd cho web và 5 lịch job theo giờ Việt Nam, Caddy lo HTTPS, rclone đẩy backup có mã hoá ra ngoài máy), `README.md` viết cho người không làm kỹ thuật. Bỏ `Dockerfile`.
  - Backup Growth DB: `src/db/backup.ts`, job `backup-db` (VACUUM INTO, giữ 14 bản).
  - Chạy thử `setup.sh` trên máy Ubuntu 24.04 giả lập có systemd: lần một dừng chờ cấu hình, lần hai dựng xong, lần ba chạy lại không hỏng; HTTPS qua Caddy; web chỉ nghe 127.0.0.1. `bun test`: 212 pass, 0 fail.

- **Phiên 07 xong (PR #11 đã merge)**: đường chạy thật sớm (D-24).
  - Thẻ Hàng chờ dễ đọc: tự báo thành bảng số và lời khách nói, mã lý do kèm nghĩa tiếng Việt, NBA thành câu giải thích; dữ liệu kỹ thuật thu gọn.
  - Trang "Dán tự báo của RM" (`/paste`, chỉ Amy): tách theo dòng tiêu đề mẫu, xử lý qua đủ các lớp lọc PII như nguồn Graph; `REPORT_SOURCE=paste`.
  - Đăng nhập bằng mật khẩu (`AUTH_MODE=password`, argon2id, khoá sau 5 lần sai); `scripts/hash-password.ts`.
  - Bản demo có thêm trang dán. `bun test`: 220 pass, 0 fail.

- **Phiên 08 (02/11/2026)**: nạp CSV xuất từ CRM cho NBA (D-24), không chờ API của MobCEC.
  - `src/crm/csv.ts` (đọc CSV: ngoặc kép, xuống dòng trong ô, BOM, dấu chấm phẩy), `src/crm/csv-import.ts` (bảng ghép cột, đổi ngày dd/mm/yyyy, giờ hiểu theo giờ Việt Nam, rồi đi qua đúng bộ ánh xạ allowlist và băm của ETL; file gốc không lưu).
  - Trang `/import` (chỉ Amy, có CSRF): nạp xong sinh lại NBA cho hôm nay; câu báo lỗi chỉ có tên cột và số dòng.
  - `CRM_SOURCE=csv` (mặc định): job ETL theo API tự bỏ qua. Bảng ghép thật giữ ngoài repo (`/etc/growth/crm-columns.json`), mẫu ở `deploy/crm-columns.example.json`.
  - `bun test`: 227 pass, 0 fail.
  - Mở thêm phạm vi BK-08 (D-25): trang "WO tồn đọng" của Bank Team. Nạp file Work Order và file ghép PIC ở trang `/import` (`src/crm/wo-import.ts`, migration 003 chỉ thêm, không lưu tên Account); `wo_idle_days` ở `src/metrics/wo-idle.ts`; bảng ở `src/db/wo.ts`; trang `/wo` (Amy ghi nhận "Đã cập nhật" kèm đang chờ ai, Mark chỉ xem). Ngưỡng tạm 7 và 14 ngày (`WO_PARAMS`). Test T-WO-01 tới T-WO-08.
  - Rà file Work Order của Bank Team (chỉ cấu trúc và số đếm, chạy trên máy): sheet lưu mật khẩu cổng đối tác ở dạng chữ thường (tab "Thông tin đăng ký của BankEMI"); đã báo `@harveyng710-source`.
  - `bun test`: 243 pass, 0 fail.

- **Chạy trên máy Ubuntu của người dùng (D-26)**: `deploy/local/install.sh` (một lệnh, không sudo), `deploy/local/run.sh`, hướng dẫn `deploy/local/README.md`. Cho phép `QUEUE_BASE_URL=http://localhost` (test T-LOCAL-01, T-LOCAL-02). Đã cài thử trên một tài khoản Ubuntu sạch (systemd giả lập): đăng nhập, nạp WO, ghi nhận, sao lưu, chạy lại script đều đúng.

- **Phiên 10 (03/11/2026)**: PR #17, #20, #21 đã merge vào `main`, không còn xung đột; `bun test` trên `main` 267 pass (cần `bun install` trước khi chạy).
  - Mi1-mkt-05 (D-32, D-33): trang `/jurisdictions` đọc thẳng CSV của sheet "FINAL - Gói & Giá năm 2 & năm 3". Một tài phán "đã chốt giá" khi mọi loại hình có đủ 6 giá bằng số và gói 2, 3 năm khớp công thức gia hạn (`price_row_status`, dung sai max(150 USD, 5%)). SKD là một bộ kit eKYC chung 10 file, theo dõi bằng danh sách tên file dán tay. Trên dữ liệu thật: 39/46 tài phán đã chốt; Singapore và Hoa Kỳ lệch công thức; bộ SKD 6/10.
  - Gợi ý ngân hàng (D-34): trang `/banks` đọc CSV của sheet "Product Matrix" và "Core Information" trong file BANKING INSTRUCTION; chọn nơi thành lập công ty, ra kế hoạch mở 2 EMI trước, ngân hàng truyền thống sau 6 tới 12 tháng nếu là công ty mới. Chưa xét quốc tịch, ngành nghề; chưa nối vào NBA (snapshot CRM chưa có tài phán của khách). Test T-BANK-01 tới T-BANK-04.
  - Issue log sandbox8 (D-35, phiên 11): nạp tab Bug và Test Cases ở `/jurisdictions`; Brief sáng có dòng Mi1-mkt-05. Với file thật 09/11/2026: 101 bug, 32 mở (3 High), test case Pass 97,9%, chưa sẵn sàng nghiệm thu. Test T-SBX-01 tới T-SBX-04.
  - Mi1-data-01 (D-36, phiên 11): trang `/data` nạp CSV sự kiện, tính `id_coverage` 7 ngày theo ngày giờ VN, cờ TRACKING_DEGRADED dưới 19%, sự kiện thiếu trường Phụ lục A, email lọt vào tham số; Brief sáng có dòng Mi1-data-01. Test T-DATA-01 tới T-DATA-04.
  - CRON-02 (D-37, phiên 11): trang `/channels` ghi tay sức khoẻ 3 BM, 3 số WA, 6 Fanpage; Brief sáng có dòng CRON-02. Test T-CH-01 tới T-CH-04.
  - Phân tích hai file và các chỗ cần sửa trong sheet: `docs/context/bang-gia-va-ngan-hang.md`. Câu hỏi K-04, K-05, B-01.
  - Test T-JUR-01 tới T-JUR-05, T-BANK-01 tới T-BANK-04. QA trên Chromium bề rộng 375px với dữ liệu thật: không tràn ngang.
  - `bun test`: 276 pass, 0 fail; `tsc --strict` sạch.

## Cách làm từ 02/11/2026

`@harveyng710-source` đổi cách làm: mọi kết nối ra ngoài đi qua cổng chọn bằng biến môi trường (`docs/context/ports.md`); trần độ phức tạp trong CLAUDE.md (người dùng là Amy; PR dưới khoảng 400 dòng; không mở phạm vi ngoài danh sách dưới).

- **Nơi chạy:** chỉ một cách, cài trên máy Ubuntu ở localhost (`deploy/local/`, PR #15, D-26). `deploy/` cho máy chủ là "để sau", không bảo trì.
- **BK-08 (WO tồn đọng) tạm dừng:** giữ code đã merge (PR #13, #14), không làm thêm cho tới khi lát cắt của Amy chạy thật 2 tuần.
- **Không chờ dữ liệu thật** (`@harveyng710-source`, 02/11/2026): build tiếp bằng dữ liệu tổng hợp, khi nối dữ liệu thật thì sửa tới đâu hay tới đó (D-27).

## Tiến độ toàn dự án (ước tính 03/11/2026, tính cả PR đang mở)

Khoảng **35%** spec v0.3.2. GĐ0 nền móng khoảng 55%; GĐ1 khoảng 65%; GĐ2, GĐ3 chưa bắt đầu.

| Hạng mục | Trạng thái |
|---|---|
| Repo, Growth DB, CI, cài máy Ubuntu | xong |
| Hàng chờ, Mi1-sa-01 (tự báo, mã lý do, NBA, Lead trùng `/leads`) | xong |
| Mi1-sa-01 đối soát đơn hàng `/billing` | xong (PR #20) |
| Mi1 lõi: áp mặc định, Brief sáng, Digest tuần | xong (PR #17) |
| Mi1-ptn-01 đối tác `/partners` | xong (PR #21) |
| Mi1-mkt-05 bảng giá và SKD `/jurisdictions` | PR nhánh `claude/tender-gates-nn4rif`; còn issue log sandbox8, lịch kênh |
| Gợi ý ngân hàng `/banks` (D-34) | PR nhánh `claude/tender-gates-nn4rif-banks` |
| Issue log sandbox8, dòng Mi1-mkt-05 trên Brief (D-35) | PR nhánh `claude/tender-gates-nn4rif-sandbox8` |
| Mi1-data-01 độ phủ ID, gãy tracking `/data` (D-36) | PR nhánh `claude/tender-gates-nn4rif-data01` |
| CRON-02 sức khoẻ BM, số WA, Fanpage `/channels` (D-37) | PR nhánh `claude/tender-gates-nn4rif-channels` |
| GĐ2: mkt-01 tới mkt-04, Creative Factory, cổng tuân thủ, ma trận 5 tầng | chưa làm |

## Việc tiếp theo

Mỗi việc một PR, nhánh `claude/<tên-việc>`, dưới khoảng 400 dòng chưa tính test, dữ liệu tổng hợp, adapter tải file chạy ngay cho mỗi nguồn mới (thêm dòng vào `ports.md`). PR song song: migration áp theo bảng đánh dấu (`src/db/migrate.ts` sau PR #20, #21), nên số migration không cần liên tiếp.

1. Các team đã sửa sheet giá, ma trận ngân hàng và xác nhận bộ SKD (ghi nhận 09/11/2026 ở `decisions.md`). Nạp lại file mới ở `/jurisdictions` và `/banks`.
1a. Mi1-mkt-05 phần còn lại: lịch kênh (chờ phạm vi); verify Meta TW/IN. Gợi ý ngân hàng: nối vào NBA khi snapshot CRM có tài phán của khách.
2. Thêm `price_row_status`, `skd_kit_done`, `suggestBanks` vào `docs/spec/metric-definitions.md` bằng PR tài liệu riêng (Mark duyệt), cùng các hàm của PR #17, #20, #21 nếu chưa có.
3. Mi1-data-01 (GĐ0): đủ bản đầu. Nạp file sự kiện thật khi MobCEC hoặc GA4 xuất được; ghi lần kiểm tài khoản kênh đầu tiên.
4. Mi1-sa-01 đối chiếu dữ liệu thật khi Harvey gửi dòng tên cột CSV, tự báo thật, danh sách RM.
5. GĐ2 theo spec mục 7, 8: Creative Factory, cổng tuân thủ (bộ từ cấm chờ chốt), mkt-01 tới mkt-04.
6. Song song, không chặn: Amy xác nhận khoảng 30 ca eval, chốt mã lý do; câu hỏi cho MobCEC, admin tenant; bật Secret scanning (E-02).

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

- Nhánh `claude/tender-gates-nn4rif` (Mi1-mkt-05, D-32, D-33): PR #23 chờ duyệt.
- Nhánh `claude/tender-gates-nn4rif-banks` (gợi ý ngân hàng, D-34): PR #24, chồng lên PR #23.
- Nhánh `claude/tender-gates-nn4rif-sandbox8` (issue log sandbox8, D-35): PR #25, chồng lên #24.
- Nhánh `claude/tender-gates-nn4rif-data01` (Mi1-data-01, D-36): PR #26, chồng lên #25.
- Nhánh `claude/tender-gates-nn4rif-channels` (CRON-02, D-37): chồng lên #26. Thứ tự merge: #23, #24, #25, #26, rồi PR này.
- PR #12 tới #22 đã merge.
