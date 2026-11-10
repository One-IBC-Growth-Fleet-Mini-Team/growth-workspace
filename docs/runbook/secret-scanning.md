# Bật Secret scanning cho repo

Mục đích: GitHub tự báo khi có ai lỡ đẩy khoá API, token hay mật khẩu lên repo, và chặn ngay lúc push (quy tắc cứng 6).
Người làm: chủ tổ chức One-IBC-Growth-Fleet-Mini-Team hoặc admin của repo. Claude Code không có quyền đổi cài đặt này.

## Các bước

1. Mở repo trên GitHub, bấm **Settings** (cần quyền admin).
2. Cột trái chọn **Advanced Security** (tên cũ: **Code security and analysis**).
3. Ở mục **Secret Protection** (tên cũ: **Secret scanning**), bấm **Enable**.
4. Ngay dưới, bật **Push protection**: push có secret sẽ bị chặn và người push thấy lý do.
5. Nếu thấy mục **Validity checks**, bật để GitHub thử xem khoá lộ còn dùng được không.
6. Kiểm tra: vào tab **Security**, mục **Secret scanning** hiện danh sách (lúc đầu nên trống).

Repo riêng tư trên gói Free có thể không có mục này; khi đó cần GitHub Team hoặc Secret Protection trả phí. Không có thì giữ cách hiện tại: `.env` nằm trong `.gitignore`, secret chỉ ở `/etc/growth-workspace/env` trên máy Amy.

## Nếu thấy cảnh báo thì làm gì

| Nếu thấy | Thì làm |
|---|---|
| Cảnh báo có khoá thật trong một commit | Thu hồi khoá đó ở nơi cấp (Anthropic Console, Azure, CRM) ngay, rồi cấp khoá mới vào file env trên máy. Xoá khỏi lịch sử git không đủ, khoá đã lộ phải đổi. |
| Push bị chặn vì push protection | Bỏ secret khỏi file, đưa vào biến môi trường, commit lại. Không bấm "allow" trừ khi chắc đó là dữ liệu giả. |
| Cảnh báo trên dữ liệu giả trong test | Đóng cảnh báo với lý do "Used in tests". |
