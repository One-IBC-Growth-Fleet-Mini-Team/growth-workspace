# Câu hỏi mở của lát cắt 01, gom theo người nhận

02/11/2026 · Fleet kỹ thuật · Để Mark gửi một lần cho từng người. Nguồn: design doc `docs/design/slice-01-amy-queue.md` mục 14, `docs/STATUS.md` mục "Đang bị chặn", và những gì phiên 02 tới 04 phát hiện khi build.

Cột "Mặc định hiện tại" là cách code đang chạy trong lúc chờ; câu trả lời khác thì sửa qua PR ở đúng chỗ ghi trong cột đó. Câu hỏi không chứa dữ liệu khách; khi trả lời cũng không gửi kèm dữ liệu khách thật vào repo hay vào PR.

## 1. MobCEC (CRM)

| Mã | Câu hỏi | Đang chặn | Mặc định hiện tại |
|---|---|---|---|
| M-01 (Q-01) | Tài liệu API CRM: endpoint của Opportunity, Client (Account), Lead, OrderItem kèm Product2.Family; cách lọc theo ngày; phân trang; giới hạn tần suất; múi giờ của trường thời gian | Toàn bộ ETL thật (STATUS a) | Tên tạm kiểu Salesforce trong `src/crm/mappers.ts`; phân trang tổng hợp `page=n` trong `src/crm/etl.ts` |
| M-02 (Q-01) | Token cho Growth Workspace có đúng là chỉ đọc không? Xin văn bản xác nhận (lưu ở kho tài liệu nội bộ) | Bật ETL thật (design doc mục 6, lớp L1) | Code chỉ gửi GET, nhưng chưa có xác nhận phía CRM |
| M-03 | Có trường nào cho biết Lead đã chuyển thành Client nào (ví dụ ConvertedAccountId)? | Cảnh báo Lead trùng với RM khác trên NBA (D-17) | Chưa kích hoạt |
| M-04 (A-03) | Khi nào CRM có hai trường của Data Contract A4: cờ khách cuối của reseller và `rejection_reason_code`? Kiểu dữ liệu là gì? | Luật 2 (reseller) dùng dữ liệu thật; mọi khách hiện là "unknown" nên NBA hỏi RM xác nhận cờ (D-06) | Cột `Is_Reseller_End_Client__c` (true/false/trống), `Rejection_Reason_Code__c` |
| M-05 (A-09) | "Khách cũ" lấy theo Order đầu tiên hay Opportunity Closed Won đầu tiên? Trường nào? | Luật 1 (khách cũ chỉ bán thêm Bank) | `First_Won_Date__c` trên Client |
| M-06 (Q-14) | CRM có trường ngành không? Mã nào ứng với Forex, Markets, môi giới tài chính? | Luật 3 (hạ ưu tiên ngành hạn chế) | `FOREX`, `MARKETS`, `FINANCIAL_BROKER` trong `src/config.ts` |
| M-07 | Tên chính xác của các Stage đã đóng (thắng, thua) | Lọc "Opportunity mở" cho NBA | `Closed Won`, `Closed Lost` trong `src/config.ts` |
| M-08 (mục 7.2) | SĐT trên CRM lưu dạng nào: có mã quốc gia không, số nội địa bắt đầu bằng 0 thuộc nước nào? | Kiểm trùng Lead theo SĐT | Không thêm mã quốc gia (`PII_PHONE_DEFAULT_COUNTRY_CODE` để trống) |

Sau khi có token: chạy `bun run preflight -- --network`, lệnh tự báo tên trường nào lệch (runbook `docs/runbook/lat-cat-01.md` mục 2).

## 2. Admin tenant Microsoft 365

| Mã | Câu hỏi | Đang chặn | Mặc định hiện tại |
|---|---|---|---|
| AD-01 (Q-02) | Cấp quyền Graph nào để đọc channel "Đồng bộ dữ liệu": application hay delegated? Dùng chung app đăng ký với đăng nhập Hàng chờ được không (D-04)? | Đọc tự báo RM (STATUS b) | Quyền application, client credentials (`src/teams/graph-token.ts`) |
| AD-02 | Id của team và channel "Đồng bộ dữ liệu" | Đọc tự báo RM | Biến `GRAPH_TEAM_ID`, `GRAPH_CHANNEL_ID` |
| AD-03 | Đăng ký redirect URI `https://<địa chỉ Hàng chờ>/auth/callback` cho app; cấp client secret | Đăng nhập Hàng chờ (D-04) | Biến `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` |
| AD-04 | AAD object id của Amy và Mark | Danh sách người dùng Hàng chờ | Biến `AMY_ENTRA_OID`, `MARK_ENTRA_OID` |
| AD-05 (D-11) | Tạo Incoming Webhook hoặc Workflows để gửi tin tới chat của Amy và của Mark | Thông báo Hàng chờ và tin escalate | Gửi JSON `{"text": ...}` (`src/teams/notify.ts`) |

## 3. Amy

| Mã | Câu hỏi | Đang chặn | Mặc định hiện tại |
|---|---|---|---|
| AM-01 (STATUS c) | Xác nhận khoảng 30 ca eval dựng từ tự báo thật (đã ẩn danh), đặt ở kho nội bộ | Bật cho Amy; điểm tự tin hiện bị phạt cỡ mẫu (10 ca synthetic) | 10 ca synthetic trong `evals/sa-01/cases` |
| AM-02 (STATUS d, Q-15) | Xác nhận danh mục mã lý do v0.1 (3 câu hỏi cuối file `docs/spec/rejection-reason-codes.md`) | Nhãn eval mã lý do; gửi danh mục cho MobCEC | Danh mục v0.1 bản nháp |
| AM-03 (Q-04) | Chấp nhận tự chọn Opportunity cho mỗi mã lý do trên Hàng chờ, hay RM ghi mã Opportunity trong tự báo? | Nối mã lý do với deal | Amy chọn trong form sửa (ô "Mã Opportunity") |
| AM-04 (Q-05) | Hàng chờ chỉ hiện mã và link, không hiện tên khách: làm việc được không? | Thiết kế trang | Chỉ mã và link |
| AM-05 (Q-06) | Ai ghi `rejection_reason_code` lên CRM sau khi Amy xác nhận: RM hay Amy? | Quy trình sau xác nhận | Hệ thống không ghi CRM; ghi tay |
| AM-06 (Q-07) | Ai giữ file danh bạ RM (owner CRM, tài khoản Teams), cập nhật khi có RM mới hoặc nghỉ? | Map tác giả tự báo với RM | Người vận hành nạp bằng `bun run ops:load-rm-directory` |
| AM-07 (Q-08) | RM có hay sửa hoặc nộp tự báo sau 08:00 không? | Có cần lượt chạy 13:00 không | Chỉ lượt 08:00 |
| AM-08 (Q-09) | Thứ tự ưu tiên giữa các Stage; bao nhiêu Opportunity cập nhật cùng một giây thì coi là cập nhật hàng loạt? | Xếp hạng NBA; chỉ số `rm_active_on_deal` | Negotiation 3, Quotation 2, Qualification 1, Prospecting 0,5; ngưỡng 3 bản ghi (`src/config.ts`) |
| AM-09 (Q-10) | Mỗi sáng tối đa bao nhiêu mục NBA thì vẫn duyệt hết? | Giới hạn NBA | 20 |
| AM-10 (Q-11) | Thông báo gửi vào chat riêng hay một channel? | Tạo webhook (AD-05) | Chat riêng |
| AM-11 (Q-12) | Cần mục "Lead trùng" riêng để quyết định gộp, hay chỉ cần cảnh báo trên NBA? | Phạm vi lát sau | Chỉ cảnh báo |

## 4. Mark

| Mã | Câu hỏi | Đang chặn | Mặc định hiện tại |
|---|---|---|---|
| K-01 (Q-03) | Được gửi văn bản tự báo (đã xoá email, SĐT, giấy tờ, ngày sinh, URL; có thể còn tên khách) sang Claude API không? | Toàn bộ phần đọc tự báo bằng LLM | **Đã chốt ở PR #8: có** |
| K-02 (Q-16) | Ngoài xem và nhận escalate, Mark cần quyền gì trên Hàng chờ? | Phân quyền | **Đã chốt ở PR #8: chỉ xem** |
| K-03 | Trả lời Sổ quyết định D-14 tới D-22 | Xem `docs/context/so-quyet-dinh-mo.md` | **Đã chốt ở PR #8** |
| K-04 (D-33) | Bộ SKD eKYC 10 file gồm những gì? Thư mục Userguide hiện có 6 file (PDF, HTML, 4 video của một clip). Có phải còn thiếu 1 clip nữa (4 video) không? | Đếm đủ 10 file | **Đã xong 09/11/2026** |
| K-05 (D-33) | Sửa sheet FINAL: Premium giảm 5% thay 7%; Singapore Branch và LLP đảo cột gia hạn và gói 2 năm; Hoa Kỳ LLC và Corporation lệch cột gia hạn | Trang `/jurisdictions` đang báo 2 tài phán lệch công thức | **Đã xong 09/11/2026** |

## 5. Người chịu trách nhiệm kỹ thuật

| Mã | Câu hỏi | Đang chặn | Mặc định hiện tại |
|---|---|---|---|
| E-01 (Q-13) | Nhà cung cấp máy chủ Ubuntu (ổ bền gắn trực tiếp); mã hoá ổ đĩa và backup | Triển khai (D-03, D-23) | `deploy/` chạy được trên Azure, Oracle hay máy Ubuntu 24.04 khác; đề xuất Azure gói miễn phí 12 tháng |
| E-02 | Bật Secret scanning và Push protection cho repo | An toàn repo public | Chưa bật |
