# Hướng dẫn cho Mark

Mark giám sát fleet Mi1 và Team MKT, duyệt việc tốn tiền, chốt các giá trị tạm. Sau khi đăng nhập, trang đầu tiên là Tổng quan.

## Trang chính

- **Tổng quan** (`/overview`): 4 hàng. Hệ thống (độ mới từng nguồn, phiên lỗi, chi phí LLM); Vận hành (Hàng chờ của Amy, Lead trùng, invoice, WO); Growth (cờ tầng 1 tới 5, Win gate, lịch kênh, hoa hồng đề xuất); Tiến độ dự án. Ô màu cam là ô cần xem.
- **Phiên chạy** (`/runs`): mỗi lần agent chạy, token, chi phí; bấm "Đánh dấu đã xem" cho agent Mark giám sát.
- **Ngưỡng** (`/tuning`): đổi ngưỡng escalate, trọng số Hook (cần chạy lại eval) và các giá trị tạm.
- **Độ phủ ID** (`/data`): độ phủ chuỗi ID, gãy tracking, tầng 3B.
- **Báo cáo tháng** (`/monthly`): Hàng chờ theo tuần, chi phí, đối tác, bài học.
- **Brief và Digest trên Teams**: 08:30 thứ Hai có tin "Digest tuần đã sẵn sàng" kèm link; ngày 1 có tin báo cáo tháng. Tin chỉ có ngày và link; số nằm trên trang.

## Đổi giá trị Tạm

Mở Ngưỡng, bảng "Giá trị tạm". Chọn khoá, gõ giá trị mới dạng JSON (ví dụ `{"min_count":4,"window_days":28}`), chọn "Tạm" hoặc "Đã chốt (FINAL)", bấm Ghi. Chuyển FINAL thì nhãn "Tạm" biến mất khỏi mọi trang. Mọi lần sửa được ghi lại.

## Nếu thấy X thì làm Y

| Nếu thấy | Thì làm |
|---|---|
| Ô "Chi phí LLM tháng" màu cam | Gần trần 100 USD; xem Phiên chạy, tắt bớt lượt hỏi Mi1. Chạm trần thì Mi1 tự dừng gọi LLM. |
| Hỏi Mi1 báo "chưa qua bộ eval" | Chạy `bun run eval:mi1` trên máy cài (cần API key). |
| Tổng quan báo nguồn "chưa nạp" hoặc nhiều ngày | Nhắc người phụ trách nạp file; bấm vào ô để tới trang nạp. |
| Nháp đổi ngân sách chờ duyệt | Mở Ngân sách, duyệt hoặc từ chối; đổi ngân sách trên nền tảng là việc của Mark, Growth không tự đổi. |
| Mục escalate từ Amy | Mở Hàng chờ ngày đó; trả lời Amy ngoài hệ thống. |
