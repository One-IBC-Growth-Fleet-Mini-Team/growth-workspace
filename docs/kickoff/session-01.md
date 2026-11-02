# Phiên 01: thiết kế lát cắt đầu tiên cho Amy

Dán toàn bộ phần dưới đây vào Claude Code làm tin nhắn đầu tiên.

---

Bạn là fleet kỹ thuật xây Growth Workspace cho One IBC. Đọc theo thứ tự trước khi làm gì khác:
`CLAUDE.md`, `docs/context/decisions.md`, `docs/spec/growth-workspace-spec-v0.3.2.md` (mục 0, 2, 6, 9, 11, 13, 14), `docs/spec/metric-definitions.md`, `docs/spec/rejection-reason-codes.md`, `docs/spec/data-contract-mobcec.md`.

**Mục tiêu phiên này: chỉ thiết kế, chưa viết code sản phẩm.**

Lát cắt cần thiết kế: Amy (Sales Admin) mỗi sáng mở một Hàng chờ thấy (a) bản nháp tự báo RM của hôm trước đã được cấu trúc hoá, (b) đề xuất mã lý do từ chối, (c) danh sách NBA theo 5 luật trong spec mục 11, và bấm xác nhận, sửa hoặc bác từng mục. Mọi thao tác của Amy được ghi nhật ký.

Thành phần: Growth DB tối giản, job ETL chỉ đọc từ CRM, `crm-read-mcp` (3 tool: `get_pipeline_by_close_date`, `check_reseller_flag`, `find_duplicate_leads`), bộ đọc tự báo RM trên Teams, Mi1-sa-01, trang Hàng chờ tối giản, thông báo Teams chỉ chứa link.

Làm theo thứ tự:
1. Chạy `/office-hours` cho lát cắt này, viết design doc vào `docs/design/slice-01-amy-queue.md`.
2. Chạy `/plan-ceo-review` để cắt mọi thứ không cần cho Cổng 2 ("Amy dùng hằng tuần").
3. Chạy `/plan-eng-review` để khóa: schema Growth DB tối thiểu, luồng dữ liệu, cách chứng minh CRM chỉ đọc, cách loại PII khỏi tự báo RM, danh sách test.
4. Liệt kê mọi giả định và câu hỏi bạn chưa chắc ở cuối design doc. Không tự đoán schema CRM: đánh dấu chỗ cần đối chiếu schema thật.
5. Đề xuất cấu trúc thư mục và stack (giữ tối giản; ưu tiên một ngôn ngữ cho cả ETL, MCP và agent).
6. Đề xuất cấu trúc bộ eval cho Mi1-sa-01 trong `evals/sa-01/`: định dạng một ca (đầu vào đã ẩn danh, đáp án mong đợi, luật được kiểm). Chưa cần điền ca thật.

**Tiêu chí xong phiên:** có design doc đã qua 2 vòng review, danh sách test, danh sách câu hỏi mở, và một PR chỉ chứa tài liệu. Không merge.

**Ràng buộc:** CRM chỉ đọc; không PII trong repo; không tự merge; không làm Command Center 3D, Creative Factory, ads, agent MKT.
