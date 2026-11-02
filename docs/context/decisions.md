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
