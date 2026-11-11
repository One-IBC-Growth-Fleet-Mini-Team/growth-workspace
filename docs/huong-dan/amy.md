# Hướng dẫn cho Amy

Growth Workspace gom tự báo của RM và dữ liệu CRM thành các đề xuất để Amy duyệt mỗi sáng. Mở bằng địa chỉ trên biểu tượng "Hàng chờ Growth", đăng nhập bằng tài khoản của Amy. Sau khi đăng nhập, trang đầu tiên là Hàng chờ.

## Đăng nhập lần đầu

1. Mở địa chỉ web Mark gửi. Ô "Tài khoản" gõ mã tài khoản của bạn (ví dụ `amy-01`), ô "Mật khẩu" gõ mật khẩu tạm Mark gửi qua kênh khác.
2. Hệ thống chuyển ngay sang trang "Đổi mật khẩu"; chưa đổi thì mọi trang khác đều quay về đây.
3. Đặt mật khẩu mới: ít nhất 12 ký tự, khác mật khẩu tạm, không chứa mã tài khoản, không phải mật khẩu phổ biến. Dễ nhớ nhất là ba bốn từ ghép lại bằng gạch nối. Gõ lại lần hai, bấm Đổi.
4. Xong là vào Hàng chờ. Không ghi mật khẩu lên giấy dán màn hình, không gửi cho ai, kể cả Mark.

Mật khẩu tạm chỉ dùng được trong 72 giờ. Quá hạn, quên mật khẩu, hoặc gõ sai 5 lần (bị khoá 15 phút) mà vẫn không vào được: nhắn Mark cấp mật khẩu tạm mới. Không dùng được 8 giờ liền thì phải đăng nhập lại; sau 7 ngày luôn phải đăng nhập lại.

## Việc hằng sáng (khoảng 20 phút)

1. **Đọc Brief sáng** (thanh trên cùng, nhóm "Hằng ngày"): xem hôm nay có bao nhiêu mục, mục nào còn chờ từ hôm trước, mục nào đã gửi lên Mark.
2. **Dán tự báo của RM** (nhóm "Nạp dữ liệu", "Dán tự báo RM"): mở thread tự báo trong Teams, chọn hết các trả lời, sao chép, dán vào ô, chọn ngày tự báo, bấm Gửi. Trang báo đã tạo bao nhiêu mục và đã che bao nhiêu email, số điện thoại.
3. **Nạp file CRM** khi có file mới (nhóm "Nạp dữ liệu", "File CRM"): chọn file Opportunity (bắt buộc), Account, Lead, Order; bấm Nạp. Trang báo số dòng đã nạp, số dòng bỏ qua và lý do, số đề xuất NBA mới. Không biết cột cần có gì thì bấm "File mẫu" cạnh từng ô.
4. **Duyệt Hàng chờ**: mỗi thẻ là một đề xuất.
   - **Xác nhận**: đồng ý đề xuất.
   - **Sửa**: sửa rồi lưu; bản sửa được dùng thay đề xuất gốc.
   - **Bác**: không đồng ý; phải ghi lý do.
   - **Escalate lên Mark**: chỉ có ở thẻ có điểm tự tin thấp; Mark nhận tin.
   - **Báo PII**: thẻ có thông tin khách lọt vào (tên, email, số điện thoại); thẻ bị ẩn chờ xoá.
   Bấm nhầm thì bấm lại quyết định đúng: quyết định mới nhất có hiệu lực, dòng "Lịch sử" trên thẻ ghi lại mọi lần bấm.

## Đọc một thẻ NBA

NBA là việc nên làm tiếp với một deal: theo tiếp, nhắc thanh toán, bán thêm tài khoản ngân hàng, chuyển cho team khác. Câu đầu thẻ nói việc gì và vì sao; bảng dưới ghi RM phụ trách, Stage, ngày dự kiến chốt. Xác nhận xong, mở "Danh sách cho RM" để chép gửi RM. Khi RM phản hồi, bấm "Ghi phản hồi RM".

## Nếu thấy X thì làm Y

| Nếu thấy | Thì làm |
|---|---|
| "Thiếu nguồn dữ liệu" hoặc "Dữ liệu CRM cũ hơn 24 giờ" trên Hàng chờ | Nạp lại file CRM mới nhất ở "File CRM". |
| Nạp xong báo "Bỏ qua N dòng: ... dòng X cột Y" | Mở file, sửa ô ở dòng X cột Y (thường là ngày sai dạng), nạp lại. Các dòng khác đã vào. |
| "Chưa nạp. File thiếu cột ..." | Đối chiếu tên cột với "File mẫu"; đổi tên cột trong file cho khớp, nạp lại. |
| Dán tự báo xong báo "Không tạo mục mới nào" | Kiểm mỗi bản tự báo có dòng đầu dạng `[dd/mm] [RM] Tên`; dán lại. Dán lại y hệt thì không tạo trùng. |
| "NBA 0 mục: không Opportunity nào ..." | Bình thường khi tháng này không có deal mở đến hạn; không cần làm gì. |
