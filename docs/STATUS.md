# Trạng thái dự án

Cập nhật lần cuối: 09/11/2026 (phiên 11, cuối phiên). Quy ước: agent hoặc người nào xong một việc phải cập nhật file này **trong cùng PR** với việc đó.

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
  - Cổng tuân thủ (D-38, phiên 11): trang `/ads-check` kiểm một mẫu hoặc CSV nhiều mẫu: từ cấm, từ cần duyệt, độ dài, giữ lại tài phán chưa chốt giá. Test T-ADS-01 tới T-ADS-04.
  - Mi1-mkt-01 (D-39, phiên 11): trang `/ads-overview` nạp CSV báo cáo tuần của Meta, Google Ads; tổng theo nền tảng, gợi ý tầng 2, khoá chéo TRACKING_DEGRADED. Test T-MKT1-01 tới T-MKT1-04.
  - Mi1-mkt-04 (D-40, phiên 11): trang `/competitors` so giá gói đối thủ với sheet FINAL theo tài phán và gói. Test T-MKT4-01 tới T-MKT4-03. Mi1-mkt-02 chờ tiêu chí chấm Hook (K-08).
  - Mi1-mkt-03 verify Meta TW/IN (D-41, phiên 11): ghi trạng thái verify theo quốc gia ở `/channels`; `/ads-check` giữ lại mẫu nhắm quốc gia chưa verify. Test T-MKT3-01 tới T-MKT3-03.
  - Mi1-mkt-02 (D-43, phiên 11): trang `/hooks` chấm Hook 25/25/20/15/15 từ điểm tiêu chí của nguồn (file hoặc MCP `get_hook_scores` của hệ thống SEO/AIO), qua cổng tuân thủ, đề xuất Hook card. Test T-HOOK-01 tới T-HOOK-04.
  - Creative Factory (D-44, phiên 11): trang `/creative`, cổng MCP tới creative-factory-v2; cổng Storyboard chặn bước tạo ảnh, video khi chưa duyệt. Test T-CF-01 tới T-CF-04.
  - Tầng 5 (D-45, phiên 11): trang `/budget` nạp kết quả theo chiến dịch (file hoặc ads-mcp), tạo nháp đổi ngân sách chờ duyệt, khoá chéo TRACKING_DEGRADED. Test T-T5-01 tới T-T5-04.
  - market-scan (D-46, phiên 11): trang `/market` quy định và tiếng khách (lọc R1), giá đối thủ vào `/competitors`; file hoặc MCP. Test T-MS-01 tới T-MS-04.
  - content-dist-mcp (D-47, phiên 11): server MCP chỉ đọc 5 tool (giá 45 tài phán, SKD, sandbox8, kiểm nội dung, sức khoẻ kênh) cho hệ thống khác lấy dữ liệu. Test T-CD-01 tới T-CD-03.
  - growth-mcp và nhật ký bài học (D-48, phiên 11): trang `/lessons`, server MCP growth (search_knowledge, propose_hook_card, log_lesson, log_decision). Test T-KN-01 tới T-KN-03.
  - creative-factory-v2 (D-49, phiên 11): 4 PR trên repo đó (cổng Storyboard, plugin One IBC, nguồn Google Sheets, server MCP); Growth gửi `approved_by` khi chạy pipeline.
  - Nhật ký phiên chạy (D-50, phiên 12): trang `/runs` theo spec mục 6 quy tắc 2, chi phí tháng so với trần 100 USD, người giám sát đánh dấu đã xem. Test T-RUN-01 tới T-RUN-03.
  - Lịch chạy trên máy Ubuntu (phiên 12): thêm timer CRON-05 (Mi1-sa-01 08:00, 13:00 thứ Hai tới thứ Bảy) và CRON-08 (`src/jobs/digest-weekly.ts`, báo Digest qua Teams 08:30 thứ Hai); tin Teams nhận link http localhost theo D-26. Test T-N-03.
  - `execute_approved_cypher` (D-51, phiên 12): growth-mcp chạy 5 truy vấn mẫu đã duyệt trên Growth DB (câu hỏi đầu ra 3, 4, 5, 7). Test T-AQ-01, T-AQ-02.
  - Chuỗi 12 ID (D-52, phiên 12): khối trên `/data`, độ phủ từng mắt nối; 3 mắt nối chưa có sự kiện trong Phụ lục A2, cần hỏi MobCEC bổ sung. Test T-DATA-05.
  - Ngưỡng và trọng số (D-53, phiên 12): trang `/tuning`, chỉ Mark đổi ngưỡng escalate và trọng số Hook, kích hoạt sau khi eval chạy lại và pass. Test T-TUNE-01 tới T-TUNE-03.
  - Tầng 4 (D-54, phiên 12): lý do từ chối Amy đã xác nhận lặp từ 3 lần trong 28 ngày được gửi kèm `compile_creative_ir`, hiện ở `/creative`. Test T-T4-01, T-T4-02.
  - Báo cáo tháng (D-55, phiên 12): trang `/monthly`, job CRON-09 báo Mark 07:00 ngày 1. Test T-MON-01, T-MON-02.
  - partner-mcp (D-56, phiên 12): `track_referral`, `match_to_contact` (so mã băm, không lưu). Test T-PMCP-01.
  - QA Chromium 375px (phiên 12) cho `/queue`, `/runs`, `/tuning`, `/monthly`, `/data`, `/creative`, `/hooks`, `/lessons` bằng bản demo: `/runs` tràn ngang khoảng 200px, đã sửa (bảng cuộn ngang như trang WO); `/tuning` sửa cùng lúc; không lỗi console.
  - Hỏi Mi1 (D-58, phiên 12): trang `/ask`, LLM chỉ chọn truy vấn mẫu, số do hàm tính; trần chi phí tính trên cả fleet. Test T-ASK-01 tới T-ASK-03, T-SA-04 (thêm ca).
  - Đóng gói theo kênh (D-59, phiên 12): bước 5 tới 6 của Creative Factory ở chế độ chạy thử, chỉ khi đã duyệt và QA PASS. Chạy thử thật: 26 asset, 1 bundle. Test T-CF-05 tới T-CF-07.
  - Nháp việc Jira, MobCEC (D-60, phiên 12): trang `/tasks`, chỉ nháp, không gửi. Test T-TASK-01, T-TASK-02.
  - CRON-03 (D-61, phiên 12): job kéo nguồn MCP 06:30, timer trong bản cài. Test T-PULL-01.
  - Eval Gate Mi1 hỏi đáp (D-62, phiên 12): `evals/mi1-ask/EVAL_mi1-ask.json` theo chuẩn repo Mi1, `bun run eval:mi1`; `/ask` khoá tới khi eval pass. Chưa chạy với Claude thật (môi trường build không có API key). Test T-ASK-05 tới T-ASK-07.
  - Phân quyền MKT, BOD (D-63, phiên 12): MKT chỉ thấy trang số tổng hợp, không thấy mã khách; BOD xem như Mark. Persona cho MKT chờ dữ liệu CRM. Test T-ROLE-01 tới T-ROLE-03.
  - Phân tích hai file và các chỗ cần sửa trong sheet: `docs/context/bang-gia-va-ngan-hang.md`. Câu hỏi K-04, K-05, B-01.
  - Test T-JUR-01 tới T-JUR-05, T-BANK-01 tới T-BANK-04. QA trên Chromium bề rộng 375px với dữ liệu thật: không tràn ngang.
  - `bun test`: 276 pass, 0 fail; `tsc --strict` sạch.

## Cách làm từ 02/11/2026

`@harveyng710-source` đổi cách làm: mọi kết nối ra ngoài đi qua cổng chọn bằng biến môi trường (`docs/context/ports.md`); trần độ phức tạp trong CLAUDE.md (người dùng là Amy; PR dưới khoảng 400 dòng; không mở phạm vi ngoài danh sách dưới).

- **Nơi chạy:** chỉ một cách, cài trên máy Ubuntu ở localhost (`deploy/local/`, PR #15, D-26). `deploy/` cho máy chủ là "để sau", không bảo trì.
- **BK-08 (WO tồn đọng) tạm dừng:** giữ code đã merge (PR #13, #14), không làm thêm cho tới khi lát cắt của Amy chạy thật 2 tuần.
- **Không chờ dữ liệu thật** (`@harveyng710-source`, 02/11/2026): build tiếp bằng dữ liệu tổng hợp, khi nối dữ liệu thật thì sửa tới đâu hay tới đó (D-27).

## Tiến độ toàn dự án (ước tính 09/11/2026, tính cả PR đang mở)

Khoảng **60%** spec v0.3.2 (cập nhật phiên 12). GĐ0 khoảng 90% (thiếu Neo4j; `execute_approved_cypher` đã có, chạy trên Growth DB); GĐ1 khoảng 85%; GĐ2 khoảng 65% (đủ 4 thuyền viên mkt, ổ cắm MCP, tầng 4 nối về Creative; còn Win gate, lịch kênh, tầng 3B); GĐ3 chưa bắt đầu. Phần còn lại phần lớn là nối nguồn thật vào các ổ cắm đã có.

| Hạng mục | Trạng thái |
|---|---|
| Repo, Growth DB, CI, cài máy Ubuntu | xong |
| Hàng chờ, Mi1-sa-01 (tự báo, mã lý do, NBA, Lead trùng `/leads`) | xong |
| Mi1-sa-01 đối soát đơn hàng `/billing` | xong (PR #20) |
| Mi1 lõi: áp mặc định, Brief sáng, Digest tuần | xong (PR #17) |
| Mi1-ptn-01 đối tác `/partners` | xong (PR #21) |
| Mi1-mkt-05 bảng giá và SKD `/jurisdictions` | xong (PR #23 tới #33) |
| Gợi ý ngân hàng `/banks` (D-34) | xong (PR #23 tới #33) |
| Issue log sandbox8, dòng Mi1-mkt-05 trên Brief (D-35) | xong (PR #23 tới #33) |
| Mi1-data-01 độ phủ ID, gãy tracking `/data` (D-36) | xong (PR #23 tới #33) |
| CRON-02 sức khoẻ BM, số WA, Fanpage `/channels` (D-37) | xong (PR #23 tới #33) |
| Cổng tuân thủ tầng 1A, 1B `/ads-check` (D-38) | xong (PR #23 tới #33) |
| Mi1-mkt-01 tổng quan tuần, tầng 2 `/ads-overview` (D-39) | xong (PR #23 tới #33) |
| Mi1-mkt-04 giá đối thủ `/competitors` (D-40) | xong (PR #23 tới #33) |
| Mi1-mkt-03 verify Meta TW/IN (D-41) | xong (PR #23 tới #33) |
| GĐ2 còn lại: Win gate, nháp ngân sách (cần chuỗi ID tới đơn hàng), mkt-02 (chờ K-08), mkt-03 quy định và tiếng khách, Creative Factory (repo creative-factory-v2) | chưa làm |

## Việc tiếp theo

Mỗi việc một PR, nhánh `claude/<tên-việc>`, dưới khoảng 400 dòng chưa tính test, dữ liệu tổng hợp, adapter tải file chạy ngay cho mỗi nguồn mới (thêm dòng vào `ports.md`). PR song song: migration áp theo bảng đánh dấu (`src/db/migrate.ts` sau PR #20, #21), nên số migration không cần liên tiếp.

1. Chạy thật trên máy Ubuntu của Amy: `git pull && bash deploy/local/install.sh`, rồi nạp file thật ở `/jurisdictions` (sheet FINAL, tab Bug, Test Cases của sandbox8, tên file SKD), `/banks`, `/ads-overview`, `/competitors`; ghi lần kiểm đầu ở `/channels`. Ghi lại lỗi gặp khi nạp file thật để sửa (D-27).
1a. Mi1-mkt-05 phần còn lại: lịch kênh (spec chưa mô tả, cần phạm vi). Gợi ý ngân hàng: nối vào NBA khi snapshot CRM có tài phán của khách.
2. `metric-definitions.md` đã có định nghĩa các hàm tính tới PR #27 (PR #28 đã merge); hàm mới sau này thêm bằng PR tài liệu riêng.
3. Mi1-data-01 (GĐ0): đủ bản đầu. Nạp file sự kiện thật khi MobCEC hoặc GA4 xuất được; ghi lần kiểm tài khoản kênh đầu tiên.
4. Mi1-sa-01 đối chiếu dữ liệu thật: đã biết cấu trúc CRM và tên Stage thật (D-42). Còn thiếu đường lấy dữ liệu: trang quản trị CRM không có nút xuất CSV, cần MobCEC xuất hộ file Opportunity, Lead, Order, Account (đủ cột theo `deploy/crm-columns.example.json`) hoặc mở API (chặn a). Danh bạ RM: lấy từ file "CRM MobCEC - New - Oct 22 2026.xlsx" (danh sách tài khoản CRM), nạp bằng `scripts/load-rm-directory.ts`, giữ ngoài repo.
5. Đã có ổ cắm cho mọi nguồn ngoài trong spec mục 9 (partner-mcp từ D-56, thiếu `calc_commission`; atlassian-m365-drive-mcp mới có nháp việc `/tasks` D-60, đọc Teams chờ chặn b) (hợp đồng ở `docs/context/hop-dong-mcp.md`); nối khi hệ thống có: HOOK (SEO/AIO), CREATIVE (creative-factory-v2 đã merge #12 tới #16; markng-byte/creative-factory-v2#17 câu lọc tầng 4, #18 QA miễn tên thương hiệu, #19 chọn nguồn bằng biến môi trường đang mở. Chạy `packages/mcp-server` với `PORT=8787 CF_MCP_TOKEN=... CF_BRANDS_DIR=plugins/brands CF_DEFAULT_BRAND_ID=brand-one-ibc` (sau #19; brief, campaign lấy từ Google Sheet bằng `CF_SHEET_ID`, `CF_BRIEFS_GID`, `CF_CAMPAIGNS_GID`), rồi đặt `CREATIVE_SOURCE=mcp`, `CREATIVE_MCP_URL=http://127.0.0.1:8787/mcp`, `CREATIVE_MCP_TOKEN` cùng giá trị. Đã chạy thử thật 09/11/2026: compile ra Storyboard; chạy khi chưa duyệt bị chặn `STORYBOARD_NOT_APPROVED`; sau khi duyệt chạy xong, QA PASS, 26 asset. Token sai báo `REMOTE_UNAUTHORIZED` từ D-57), ADS, MARKET. Còn chờ định nghĩa: Win gate, lịch kênh (`schedule_channel_post`), chính sách hoa hồng (partner-mcp `calc_commission`), kiểm màu ảnh. Phơi MCP qua HTTP khi có máy chủ.
5a. Phần spec xây được ngay bằng dữ liệu tổng hợp (so lại spec 09/11/2026), làm lần lượt: lịch trong `deploy/local` đã có CRON-05, CRON-06, CRON-08; CRON-03 kéo nguồn MCP lúc 06:30 (D-61), CRON-01 chờ nguồn sự kiện, CRON-02, 04 nằm trong Brief sáng, CRON-09 có job và trang `/monthly` (D-55), CRON-07 chưa có job (mục 10). Đã làm xong cả bốn mục (D-50 tới D-53).
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

- growth-workspace: PR nhánh `claude/tender-gates-nn4rif` (Eval Gate Mi1, phân quyền theo vai trò). PR #23 tới #46 đã merge. creative-factory-v2: markng-byte/creative-factory-v2#17, #18, #19. creative-factory-v2: markng-byte/creative-factory-v2#12 tới #16 đã merge.
