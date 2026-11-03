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
- **D-25** (`@harveyng710-source`, 02/11/2026): mở thêm phạm vi ngoài spec v0.3.2 cho việc BK-08 của Amy (nhắc Bank Team xử lý Work Order tồn đọng), dưới dạng trang "WO tồn đọng" cạnh Hàng chờ. (1) Nguồn: Amy nạp file Work Order xuất từ CRM (không có ngày cập nhật cuối, không có Owner) và file ghép số WO với PIC chép từ sheet của Bank Team; chỉ lưu số WO, Status, ngày tạo, tên dịch vụ, PIC; không lưu tên Account hay ghi chú. (2) Mốc "cập nhật lần cuối": lượt nạp mà Status đổi gần nhất, hoặc lần Amy bấm "Đã cập nhật" kèm đang chờ ai (member, khách, bank, bộ phận khác), lấy mốc muộn hơn. (3) WO có từ trước lượt nạp đầu tính từ lượt nạp đầu; danh sách "tồn từ trước, chưa rà" riêng, cũ nhất lên đầu. (4) Ngưỡng tạm N = 7 ngày nhắc PIC, M = 14 ngày báo Amy, chờ Amy chốt. Tin nhắc do hệ thống soạn, Amy tự gửi. Hàm tính là `wo_idle_days` (`src/metrics/wo-idle.ts`); thêm vào `metric-definitions.md` bằng PR riêng.
- **D-26** (`@harveyng710-source`, 02/11/2026, không có ngân sách thuê máy chủ): bản chạy thật đầu tiên chạy ngay trên máy Ubuntu của người dùng, không thuê Azure, Vercel hay Railway. `deploy/local/install.sh` cài Bun vào thư mục của người dùng, tạo cấu hình (mode 600) và khoá bí mật, chạy Hàng chờ bằng systemd của người dùng ở `http://localhost:3000`, sao lưu mỗi ngày vào `~/Growth-backup`. Ngoại lệ HTTPS chỉ áp cho `http://localhost` và `http://127.0.0.1`; khi đó cookie phiên bỏ cờ `Secure` (vẫn HttpOnly, SameSite=Strict). Bộ máy chủ (D-23) giữ nguyên cho lúc cần truy cập từ xa.
- **D-27** (`@harveyng710-source`, 02/11/2026, "không chờ dữ liệu thật, cứ build tới, tới đâu sửa tới đó"): làm Mi1 phần lõi bằng dữ liệu tổng hợp, chia PR nhỏ. Mục còn chờ quá hạn được Mi1 áp phương án mặc định "giữ nháp" (CRON-06; không ghi đi đâu, không gửi ra ngoài, không có tiền), ghi ở bảng chỉ thêm `queue_defaults`; quyết định của người luôn thắng, kể cả khi đến sau. Chạy cùng việc hằng ngày 08:15 của bản cài máy Ubuntu. Không gọi LLM.
- **D-28** (02/11/2026, Mi1 lõi): Brief sáng `/brief` và Digest tuần `/digest` tính trực tiếp từ Growth DB khi mở trang, không gọi LLM ($0 token) và không gửi tin (spec ghi Sonnet cho CRON-06, CRON-08; phần viết lời và gửi Teams để sau, xem `ports.md` cổng Thông báo). Digest đo Cổng 2 theo D-10. Hàm tính ở `src/metrics/queue-health.ts`; thêm vào `metric-definitions.md` bằng PR riêng.
- **D-29** (02/11/2026, "Việc tiếp theo" mục 2): trang `/leads` liệt kê Lead trùng (cùng email hoặc cùng SĐT, so bằng mã băm) từ snapshot CRM mới nhất, nhóm khác RM lên trước. Chỉ xem: Amy quyết và gộp trên CRM, Growth không ghi vào CRM. Đây là bản đơn giản của "mục Lead trùng riêng" mà design doc lát 01 hoãn chờ Q-12; khi Amy trả lời Q-12 thì sửa tiếp.
- **D-30** (02/11/2026, "Việc tiếp theo" mục 2, không chờ dữ liệu thật): đối soát đơn hàng của Mi1-sa-01 ở trang `/billing`. Cổng "Đơn hàng và invoice", adapter tải file: SO, PO, Invoice dạng CSV, tên cột mặc định là tên tạm [ĐỐI CHIẾU SCHEMA], đổi bằng bảng ghép. Chỉ lưu mã đơn, mã liên kết, Status, hạn invoice; không lưu tên khách, số tiền. Báo: invoice chưa trả quá hạn (từ 14 ngày báo Amy, ít hơn thì có tin nhắc soạn sẵn theo RM để Amy tự gửi), SO cần PO mà chưa có PO, PO không khớp SO. Giá trị Status đã trả hay đã huỷ là tạm (`BILLING_PARAMS`). Migration giờ áp theo bảng đánh dấu, để các PR thêm migration merge theo thứ tự nào cũng đúng.
- **D-31** (02/11/2026, không chờ dữ liệu thật): Mi1-ptn-01 bản đầu ở trang `/partners`. Cổng "Đối tác", adapter tải file: danh sách đối tác (mã, loại reseller hoặc giới thiệu) và deal do đối tác giới thiệu (mã deal, mã khách, Stage, Close Date, lợi nhuận ghi nhận). Không lưu tên đối tác hay khách. Hiệu suất lọc theo Close Date trong tháng (NBA luật 5); lợi nhuận chỉ cộng deal chốt thắng. Không tự tính hoa hồng khi chưa có chính sách: chỉ liệt kê deal cần xét để người duyệt (quy tắc 4). Liệt kê khách đến từ reseller mà CRM chưa gắn cờ `is_reseller_end_client` (D-06). Stage chốt thắng là tạm (`PARTNER_PARAMS`).
- **D-32** (03/11/2026, "Việc tiếp theo" mục 2, không chờ dữ liệu thật): Mi1-mkt-05 bản đầu ở trang `/jurisdictions` ("45 tài phán"). Cổng "Bảng giá và SKD", adapter tải file: bảng giá (mã tài phán, trạng thái, version) và danh sách file SKD (mã tài phán, loại file, trạng thái). Không lưu số tiền, ghi chú hay người phụ trách. Tài phán sẵn sàng = đã chốt giá và đủ 10 loại file SKD khác nhau ở trạng thái xong (`jurisdiction_ready`, `src/metrics/jurisdiction-ready.ts`); spec không liệt kê 10 file nên chưa kiểm từng loại (câu K-04). Tên trạng thái là tạm (`JURISDICTION_PARAMS`, K-05). Tính khi mở trang thay cho script CRON-04 ($0 token, giống D-28). Mark giám sát Mi1-mkt-05 (spec mục 6) nên cả Amy và Mark nạp file được ở trang này; các trang khác giữ nguyên quyền. Issue log sandbox8 để PR sau.
- **D-33** (03/11/2026, `@harveyng710-source` chốt; thay phần nguồn và SKD của D-32): (1) Giá đang dùng là sheet "FINAL - Gói & Giá năm 2 & năm 3" của file "Website mới OCC Bảng giá gói". Trang `/jurisdictions` đọc thẳng CSV của sheet này theo vị trí cột (A tài phán, B loại hình, C tới H sáu giá); chỉ lưu giá bán, không lưu giá vốn. Tên viết khác gộp một (UK, United Kingdom; Cayman, Cayman Islands). (2) Một dòng "đã chốt" khi đủ 6 giá bằng số và gói 2 năm, 3 năm khớp Starter + 1 hoặc 2 năm gia hạn trong dung sai max(150 USD, 5%); tài phán đã chốt khi mọi loại hình đã chốt (`price_row_status`). (3) Premium giảm 5% so với giá gốc, không phải 7% như sheet FINAL đang áp; sheet cần sửa (bảng số ở `docs/context/bang-gia-va-ngan-hang.md`). (4) SKD là một bộ kit chung cho mọi tài phán, không phải 10 file mỗi tài phán: Userguide eKYC gồm PDF, HTML và clip ở 2 khổ (16x9, 9x16) x 2 bản (sạch, phụ đề). 10 file = PDF + HTML + 2 clip x 4; số clip là suy luận, chờ Team Content xác nhận (K-04).
- **D-34** (03/11/2026, `@harveyng710-source` "dùng ma trận ngân hàng"): trang `/banks` gợi ý mở tài khoản theo nơi thành lập công ty, từ CSV của sheet "Product Matrix - Bank Name X Support" (YES/NO) và "Bank ( Core Information for Clients)" của file BANKING INSTRUCTION. Quy tắc theo file: lọc tổ chức nhận nơi thành lập; EMI xếp Airwallex, Payoneer, Aspire rồi theo độ khó; mở ngay 2 EMI; công ty mới nộp ngân hàng truyền thống sau 6 tới 12 tháng (`suggestBanks`). Chưa xét quốc tịch (ma trận quốc tịch mã hoá bằng màu ô, mất khi xuất CSV) và ngành nghề: trang nhắc kiểm với Bank Team. Chỉ Amy nạp file. Không lưu liên hệ đối tác, link referral, case study. Chưa nối vào NBA vì snapshot CRM chưa có tài phán của khách.
