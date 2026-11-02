# Quyết định đã chốt (chuyển từ phiên Claude Chat, 29/10 tới 02/11/2026)

File này thay cho việc chia sẻ lịch sử chat. Claude Code không đọc được hội thoại Claude Chat; mọi bối cảnh cần thiết phải nằm trong repo.

## Phạm vi và người dùng

- Growth Workspace dựng độc lập, chỉ đọc từ hệ thống ghi nhận; không thay CRM, không thay Jira.
- Người dùng: Mark Ng (giám sát Mi1 và thuyền viên phía MKT, Dữ liệu), Amy (Sales Admin, giám sát Mi1-sa-01 và Mi1-ptn-01), Team MKT và Content. Anh Jimmy chỉ nhận Digest qua Teams. MobCEC, RM, đối tác không đăng nhập.
- Ontology Growth riêng, hẹp; dùng chung instance Neo4j với repo Mi1 cho các nút Client, Jurisdiction, Service_Type; không đọc nhánh KYC.

## Cổng và duyệt

- Điểm tự tin không lấy từ việc model tự chấm; tính từ tỷ lệ pass eval, độ phủ dữ liệu, cỡ mẫu.
- Dưới 0,8 escalate; tiền, gửi ra ngoài, xuất bản công khai luôn cần người duyệt.
- Mỗi quyết định có phương án mặc định và hạn; quá hạn chỉ tự áp nếu không tốn tiền, không gửi ra ngoài.
- Hàng chờ trong Workspace là nơi duyệt duy nhất; Teams và Claude Chat chỉ gửi link.
- Người duyệt PR hiện là tài khoản tạm thời của chính chủ dự án; chuyển cho người kỹ thuật độc lập khi có.

## Tài khoản và sở hữu

- Mọi tài khoản dùng mail quản lý chung của One IBC (kể cả quyền BM). Repo đặt trong GitHub organization của One IBC.
- Bàn giao từ nhân sự cũ đã hoàn tất (02/11/2026).
- Repo `One-IBC-Growth-Fleet-Mini-Team/growth-workspace` chuyển sang **public** (02/11/2026) để bật được branch protection trên gói GitHub Free; thay cho yêu cầu "private" trong `docs/kickoff/setup.md`. Hệ quả: quy tắc không PII và không secret áp dụng như với nội dung xuất bản công khai.
- Người chịu trách nhiệm kỹ thuật, reviewer bắt buộc qua CODEOWNERS: `@harveyng710-source`.

## Lát cắt đầu tiên (Giai đoạn 0 và 1)

Mục tiêu: Amy dùng được hằng tuần (Cổng 2).
1. Growth DB và job ETL chỉ đọc từ CRM.
2. `crm-read-mcp`: `get_pipeline_by_close_date`, `check_reseller_flag`, `find_duplicate_leads`.
3. Mi1-sa-01: đọc tự báo RM trên Teams, phân loại lý do từ chối, soạn NBA theo 5 luật.
4. Hàng chờ tối giản cho Amy.

Không làm lúc này: Command Center 3D, Creative Factory, ads, Monte-Carlo, agent MKT, mọi mục Phụ lục B của spec.

## Định dạng tự báo RM trên Teams (đầu vào của Mi1-sa-01)

Channel "Đồng bộ dữ liệu", mỗi RM trả lời vào thread ngày theo mẫu:
`[dd/mm] [RM] Tên` rồi các dòng TIẾP CẬN, ĐĂNG BÀI, HỘI THOẠI, BÁO GIÁ, KHÁCH NÓI, CHƯA LÊN HỆ THỐNG, CẦN HỖ TRỢ.
RM viết tự do quanh mẫu (bullet, HTML, có tên khách). Parser phải chịu được định dạng lệch và phải loại tên khách trước khi lưu.
Giới hạn công cụ đọc: reply trong thread chỉ trả khoảng 1.000 ký tự đầu mỗi tin.

## Đang chờ (giả định đã thoả khi bắt đầu build)

- MobCEC xác nhận Data Contract và mở API GET Internal Control.
- Có người chịu trách nhiệm kỹ thuật duyệt PR. (Đã có: `@harveyng710-source`, 02/11/2026.)
- Chốt xử lý "banking", "finance" trong bộ từ cấm (không ảnh hưởng lát cắt đầu).

## Quyết định lát cắt 01, chốt sau PR #4

Mark Ng đồng ý toàn bộ Sổ quyết định (design doc `docs/design/slice-01-amy-queue.md` mục 13) theo cột "Đề xuất", 02/11/2026.

- **D-01** Stack: TypeScript chạy trên Bun 1.4.x, một ngôn ngữ cho ETL, MCP, agent, web; phụ thuộc chỉ gồm `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `zod`.
- **D-02** Growth DB: SQLite (`bun:sqlite`) trên ổ bền; Neo4j để lát sau.
- **D-03** Nơi chạy: 1 container trên nền tảng có cron và ổ bền; nền tảng gọi `bun run jobs/...`; không dùng thư viện cron trong tiến trình.
- **D-04** Đăng nhập Hàng chờ: Microsoft Entra ID (OIDC), dùng chung app đăng ký với quyền Graph.
- **D-05** Băm email và SĐT bằng HMAC-SHA256, khoá bí mật trong biến môi trường `PII_HASH_KEY`; **lệch spec** (spec ghi "SHA-256", CLAUDE.md quy tắc 2), Mark đã duyệt vì SHA-256 trần dò ngược được không gian SĐT nhỏ.
- **D-06** Cờ reseller `"unknown"`: không upsell, sinh hành động "nhờ RM xác nhận cờ reseller".
- **D-07** Điểm tự tin theo công thức design doc mục 5.6; ngưỡng ca eval `scored` là 0,8; ca `hard` (NBA, PII) phải pass 100%.
- **D-08** Cron gọi thẳng `runSa01(date)`; Mi1 gọi sau.
- **D-09** Phạm vi kéo CRM theo design doc mục 5.1; giữ snapshot 14 ngày.
- **D-10** Cổng 2 đo theo design doc mục 1.8: 3 tuần liên tiếp, mỗi tuần Amy mở ít nhất 3 ngày và quyết định ít nhất 80% mục.
- **D-11** Thông báo Teams qua Workflows hoặc Incoming Webhook tới chat của Amy, chỉ có ngày và link.
- **D-12** Xoá có kiểm soát trên bảng chỉ thêm bằng script chạy tay (design doc mục 7.5), không chạy được từ web hay agent.
- **D-13** Ca eval dựng từ dữ liệu thật để ngoài repo public, đọc qua biến `SA01_PRIVATE_EVAL_DIR`; trong repo chỉ có ca synthetic.

## Quyết định lát cắt 01, chốt ở PR #8

`@harveyng710-source` chốt toàn bộ Sổ quyết định còn mở (`docs/context/so-quyet-dinh-mo.md`) theo cột "Đang làm", và chốt thay Mark hai câu K-01, K-02, ngày 02/11/2026.

- **D-14** Cookie của luồng đăng nhập OIDC là `SameSite=Lax` (path `/auth`, 10 phút, có ký); cookie phiên giữ `Strict` (lệch design doc mục 9 có chủ đích).
- **D-15** R3 giữ như hiện tại (phương án A): tên khách một từ đứng đầu câu dựa vào lớp R2 và R4; theo dõi số `pii_flag` mỗi tuần.
- **D-16** NBA đọc trường bổ sung và cờ reseller thẳng từ snapshot chỉ đọc, cùng `etl_run_id` với `get_pipeline_by_close_date`; MCP giữ đúng 3 tool.
- **D-17** `NBA_X_DUP` để chưa kích hoạt cho tới khi MobCEC trả lời M-03 (liên kết Lead với Client).
- **D-18** Typecheck trên CI cài `typescript` và `@types/bun` tạm trong job; `package.json` giữ đúng D-01.
- **D-19** Mỗi cờ `truncated`, `unstructured` nhân điểm tự tin với 0,8 (hai cờ thành 0,64).
- **D-20** Lớp R1 xoá mọi URL, không chỉ URL có tham số (chặt hơn design doc mục 7.3).
- **D-21** Gọi Claude API bật `fallbacks: "default"` cho các model hỗ trợ.
- **D-22** Thêm `nba_priority`, `cost_usd`, `compute_confidence` vào `docs/spec/metric-definitions.md` bằng PR riêng, đúng như code hiện tại.
- **K-01 (Q-03)** Được gửi văn bản tự báo đã qua R1 sang Claude API.
- **K-02 (Q-16)** Mark chỉ xem và nhận escalate trên Hàng chờ.

## Quyết định sau PR #9

- **D-23** (`@harveyng710-source`, 02/11/2026): không dùng Docker. Ứng dụng chạy thẳng trên một máy Ubuntu 24.04 bằng Bun 1.4.4 (cài từ bản phát hành GitHub, có kiểm SHA-256) dưới user hệ thống `growth`; systemd giữ web và lịch job; Caddy lo HTTPS. Thay phần "1 container" của D-03; phần "nền tảng có cron và ổ bền, nền tảng gọi `bun run jobs/...`, không thư viện cron trong tiến trình" giữ nguyên.
- **D-24** (`@harveyng710-source`, 02/11/2026, mục tiêu "chạy thật sớm nhất"): bỏ chờ ba nguồn ngoài bằng đường tạm. (1) Tự báo: Amy dán thread trên trang Hàng chờ (`REPORT_SOURCE=paste`), RM map theo tên trong dòng tiêu đề khớp danh bạ; đọc Teams qua Graph giữ cho sau (`graph`). (2) Đăng nhập: mật khẩu riêng cho Amy và Mark (mã băm argon2id, khoá 15 phút sau 5 lần sai), là lựa chọn "mật khẩu riêng" có sẵn ở D-04; Entra giữ cho sau (`AUTH_MODE=entra`). (3) Dữ liệu CRM cho NBA: nạp file CSV xuất từ trang quản trị CRM, chờ dòng tiêu đề cột thật; API MobCEC giữ cho sau.
