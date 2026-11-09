# Cổng kết nối (ports)

Nguyên tắc "đi dây chừa ổ cắm" (CLAUDE.md): mọi kết nối ra ngoài đi qua một cổng, chọn adapter bằng biến môi trường. Mỗi cổng có ít nhất một adapter chạy ngay không cần ai ngoài. Thêm nguồn mới = thêm một file adapter và một dòng cấu hình, không sửa code nghiệp vụ.

Bảng dưới gom các cổng đang có trong code, giữ nguyên cách chạy hiện tại. Cột "Mặc định" là adapter dùng khi biến để trống.

## Cổng đang có

| Cổng | Biến môi trường | Mặc định (chạy ngay) | Adapter khác đã có code | Adapter chờ hoặc để sau | Code |
|---|---|---|---|---|---|
| CRM (Opportunity, Client, Lead, Order) | `CRM_SOURCE` | `csv`: Amy tải file ở `/import`; bảng ghép cột ở `CRM_CSV_COLUMNS_PATH` | `api`: ETL chỉ đọc qua `CRM_API_BASE`, `CRM_API_TOKEN` (chờ MobCEC mở API, Q-01) | MCP của CRM nếu MobCEC cung cấp | `src/crm/csv-import.ts`, `src/crm/etl.ts`, `src/crm/http.ts` |
| Tự báo RM | `REPORT_SOURCE` | `paste`: Amy dán thread ở `/paste` | `graph`: đọc channel Teams qua Microsoft Graph (chờ admin tenant, Q-02) | | `src/teams/paste-report.ts`, `src/teams/graph-read.ts` |
| Đăng nhập Hàng chờ | `AUTH_MODE` | `password`: mã băm argon2id `AMY_PASSWORD_HASH`, `MARK_PASSWORD_HASH` | `entra`: Microsoft Entra OIDC (chờ app Entra) | | `src/queue/auth.ts` |
| Thông báo | `TEAMS_WEBHOOK_URL_AMY`, `TEAMS_WEBHOOK_URL_MARK` | để trống: không gửi gì | webhook Teams (chỉ ngày và link, D-11) | email, Slack | `src/teams/notify.ts` |
| LLM | `LLM_MODEL`, `ANTHROPIC_API_KEY`, `LLM_PRICE_*` | Claude API qua `@anthropic-ai/sdk` | LLM giả cho demo và test (không chọn bằng biến, chỉ dùng trong `src/demo` và `test/`) | | `src/agents/sa-01/llm.ts`, `src/demo/fake-llm.ts` |
| Lưu trữ (Growth DB) | `GROWTH_DB_PATH` | SQLite (`bun:sqlite`, D-02) | | Neo4j cho đồ thị (`NEO4J_*`, GĐ sau) | `src/db/` |
| Sao lưu | `GROWTH_BACKUP_DIR` | thư mục trên máy (`~/Growth-backup` ở bản cài máy Ubuntu) | | đẩy ra ngoài máy bằng rclone (chỉ ở bộ máy chủ, để sau) | `src/db/backup.ts` |
| Đơn hàng và invoice (Mi1-sa-01, D-30) | `CRM_CSV_COLUMNS_PATH` (mục `SalesOrder`, `PurchaseOrder`, `Invoice`) | tải file ở `/billing` | | API Order và Invoice của CRM (chờ MobCEC) | `src/crm/billing-import.ts` |
| Đối tác và deal giới thiệu (Mi1-ptn-01, D-31) | `CRM_CSV_COLUMNS_PATH` (mục `Partner`, `Referral`) | tải file ở `/partners` | | Partner Portal trên web OCC, trường A4 trên CRM | `src/crm/partner-import.ts` |
| Bảng giá 45 tài phán và bộ SKD eKYC (Mi1-mkt-05, D-32, D-33) | không có biến | tải CSV của sheet "FINAL - Gói & Giá năm 2 & năm 3" và dán tên file SKD ở `/jurisdictions` | | đọc thẳng Google Sheet và thư mục Drive qua API (chỉ đọc) | `src/crm/jurisdiction-import.ts` |
| Ma trận ngân hàng của Bank Team (D-34) | không có biến | tải CSV của sheet "Product Matrix" và "Core Information" ở `/banks` | | đọc thẳng file BANKING INSTRUCTION qua API (chỉ đọc) | `src/crm/bank-import.ts` |
| Issue log sandbox8 (Mi1-mkt-05, D-35) | không có biến | tải CSV của tab "Bug" và "Test Cases" ở `/jurisdictions` | | đọc thẳng file test case của MobCEC qua API (chỉ đọc) | `src/crm/sandbox-import.ts` |
| Sự kiện web và CRM (Mi1-data-01, D-36) | không có biến | tải CSV sự kiện (tên cột theo Phụ lục A) ở `/data` | | API hoặc webhook sự kiện của MobCEC (Phụ lục A2, A3), GA4 | `src/crm/event-import.ts` |
| Work Order Bank Team (BK-08, tạm dừng) | không có biến | tải file ở `/import` | | | `src/crm/wo-import.ts` |

## Nguồn spec cần, chưa có cổng

Khi nối, mỗi nguồn là một cổng mới theo đúng mẫu trên: adapter tải file trước (chạy ngay), adapter API hoặc MCP sau.

| Nguồn | Dùng cho | Adapter chạy ngay đề xuất | Adapter thật | Đang chờ |
|---|---|---|---|---|
| API Internal Control | `net_profit_ic`, Cổng 1 | tải file xuất | API GET (Phụ lục A5) | MobCEC |
| Meta Ads, Google Ads, GA4 | Mi1-mkt-01 tới mkt-04 (GĐ 2) | tải file xuất | API hoặc MCP | quyền tài khoản quảng cáo |

## Để sau (cách khó hơn, chưa làm khi chưa có người dùng thứ hai cần)

| Việc | Vì sao để sau |
|---|---|
| Chạy trên máy chủ (Azure, Oracle theo `deploy/README.md`; Railway; Vercel) | Chỉ một cách triển khai: cài trên máy Ubuntu, localhost (D-26). Bộ `deploy/` cho máy chủ không bảo trì thêm |
| Truy cập từ xa (Tailscale, Cloudflare Tunnel) | Chỉ Amy dùng, ngồi tại máy |
| Đăng nhập Entra (SSO) | Hai người dùng, mật khẩu là đủ |
| Đọc Teams qua Graph | Dán tay chạy được; cần admin tenant |
| CRM qua API | Tải CSV chạy được; cần MobCEC |
