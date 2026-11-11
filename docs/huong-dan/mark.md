# Hướng dẫn cho Mark

Mark giám sát fleet Mi1 và Team MKT, duyệt việc tốn tiền, chốt các giá trị tạm. Sau khi đăng nhập, trang đầu tiên là Tổng quan.

## Trang chính

- **Tổng quan** (`/overview`): 4 hàng. Hệ thống (độ mới từng nguồn, phiên lỗi, chi phí LLM); Vận hành (Hàng chờ của Amy, Lead trùng, invoice, WO); Growth (cờ tầng 1 tới 5, Win gate, lịch kênh, hoa hồng đề xuất); Tiến độ dự án. Ô màu cam là ô cần xem.
- **Điều phối Mi1** (`/command`): Mi1 đang làm gì từng bước (thuyền viên, tool, kết quả, chi phí), thẻ từng thuyền viên (bật hay tắt, điểm eval, lần chạy cuối, chi phí tháng), việc Amy escalate đang chờ Mark và đã chờ bao lâu, dự báo tải Hàng chờ, chi phí tháng so với trần. Trang tự tải lại mỗi 5 giây. Tắt một thuyền viên: thêm mã của nó vào `FLEET_DISABLED` trong file env rồi khởi động lại dịch vụ.
- **Storyboard mỗi thứ Hai** (CRON-07, Tạm): 02:00 thứ Hai Mi1 tạo sẵn Storyboard cho Hook đề xuất của tuần chưa có Storyboard. Sáng thứ Hai mở Creative để duyệt hoặc từ chối; chưa duyệt thì không tạo ảnh, video. Tắt ở Ngưỡng, khoá `cron07`.
- **Kế hoạch ngân sách tuần** (Ngân sách, Tạm): mỗi thứ Hai Mi1 xếp từng tổ hợp Kênh × Tài phán vào A (mở rộng phễu) hoặc C (thu liên hệ) và đề xuất ngân sách theo khung quyết định; mỗi dòng ghi quy tắc đã áp. Duyệt hay từ chối cả kế hoạch; dòng ghi "cần anh Jimmy" thì xin anh Jimmy trước khi đổi trên nền tảng. Growth không tự đổi ngân sách.
- **Đề xuất chiến lược** (`/strategy`): bấm "Soạn đề xuất tuần này". Mi1 gom số của 7 câu hỏi đầu ra; câu hỏi nào thiếu dữ liệu ghi rõ lý do. Mỗi câu lời dẫn có mã số liệu trong ngoặc vuông để đối chiếu với bảng "Gói số" bên dưới. Duyệt thì bản tóm tắt vào Digest tuần cho anh Jimmy. Nút bị khoá khi chưa có API key hoặc bộ eval chưa pass (`bun run eval:strategy`).
- **Phiên chạy** (`/runs`): mỗi lần agent chạy, token, chi phí; bấm "Đánh dấu đã xem" cho agent Mark giám sát.
- **Ngưỡng** (`/tuning`): đổi ngưỡng escalate, trọng số Hook (cần chạy lại eval) và các giá trị tạm.
- **Độ phủ ID** (`/data`): độ phủ chuỗi ID, gãy tracking, tầng 3B.
- **Báo cáo tháng** (`/monthly`): Hàng chờ theo tuần, chi phí, đối tác, bài học.
- **Brief và Digest trên Teams**: 08:30 thứ Hai có tin "Digest tuần đã sẵn sàng" kèm link; ngày 1 có tin báo cáo tháng. Tin chỉ có ngày và link; số nằm trên trang.

## Đổi giá trị Tạm

Mở Ngưỡng, bảng "Giá trị tạm". Chọn khoá, gõ giá trị mới dạng JSON (ví dụ `{"min_count":4,"window_days":28}`), chọn "Tạm" hoặc "Đã chốt (FINAL)", bấm Ghi. Chuyển FINAL thì nhãn "Tạm" biến mất khỏi mọi trang. Mọi lần sửa được ghi lại.

## Quản lý tài khoản

Mỗi người một tài khoản, gắn một vai trò `amy`, `mkt`, `mark` hoặc `bod`. Mã tài khoản không dùng tên thật, ví dụ `mkt-01`. Trên máy chủ chạy bằng `sudo growth-run ...`; trên máy của Mark chạy bằng `bash ~/growth-workspace/deploy/local/run.sh scripts/accounts.ts ...`.

- **Thêm**: `add-user mkt-02 mkt`. Lệnh in mật khẩu tạm đúng một lần, hết hạn sau 72 giờ. Gửi địa chỉ web một kênh, mật khẩu tạm một kênh khác (ví dụ chat Teams 1-1), không gửi chung một tin; nhắc đổi trong 72 giờ.
- **Cấp lại mật khẩu** (quên, hết hạn): `reset-password mkt-02`. Mọi phiên đang mở của tài khoản đó bị đăng xuất.
- **Khoá người nghỉ việc**, ngay hôm nghỉ: `disable-user mkt-02`. Phiên đang mở bị đăng xuất ngay, lịch sử thao tác giữ nguyên. Không mở lại; người quay lại thì tạo mã mới.
- **Xem**: `list-users`: tài khoản, vai trò, lần đăng nhập cuối, còn mật khẩu tạm không. Không in mật khẩu hay mã băm.

Mọi thao tác (nạp file, xác nhận, bác, duyệt) ghi theo mã tài khoản, nên hai người cùng vai `mkt` vẫn phân biệt được.

## Sổ sự kiện bảo mật

Trang `/settings`, mục "Sổ sự kiện bảo mật" (chỉ vai trò `mark`): 200 sự kiện gần nhất, gồm đăng nhập được, đăng nhập sai, bị khoá 15 phút, chặn theo IP, đổi mật khẩu, cấp mật khẩu tạm, mật khẩu tạm hết hạn, tạo và khoá tài khoản. Dòng cam là dòng cần xem. Tài khoản "?" là mã không có trong hệ thống (gõ nhầm, hoặc có người dò). Không có mật khẩu, mã băm hay IP trong sổ.

Đọc mỗi tuần một lần. Nhiều dòng sai liên tiếp ở một tài khoản mà người đó không nhận là mình: cấp lại mật khẩu (`reset-password`). Nhiều dòng "?" và "Chặn theo IP": có người dò từ ngoài; cân nhắc điền `ALLOW_IPS` (deploy/README.md bước 4b).

## Nếu thấy X thì làm Y

| Nếu thấy | Thì làm |
|---|---|
| Ô "Chi phí LLM tháng" màu cam | Gần trần 100 USD; xem Phiên chạy, tắt bớt lượt hỏi Mi1. Chạm trần thì Mi1 tự dừng gọi LLM. |
| Hỏi Mi1 báo "chưa qua bộ eval" | Chạy `bun run eval:mi1` trên máy cài (cần API key). |
| Tổng quan báo nguồn "chưa nạp" hoặc nhiều ngày | Nhắc người phụ trách nạp file; bấm vào ô để tới trang nạp. |
| Nháp đổi ngân sách chờ duyệt | Mở Ngân sách, duyệt hoặc từ chối; đổi ngân sách trên nền tảng là việc của Mark, Growth không tự đổi. |
| Mục escalate từ Amy | Mở Hàng chờ ngày đó; trả lời Amy ngoài hệ thống. |
