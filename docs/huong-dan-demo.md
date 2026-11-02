# Xem thử Hàng chờ trên máy tính của bạn

Bản demo chạy ngay trên máy tính cá nhân, không cần máy chủ, không cần tài khoản nào. Dữ liệu là dữ liệu tổng hợp (không có khách thật); không gọi CRM, Teams hay Claude API. Tắt là mất, mở lại là có bộ dữ liệu mới.

Làm một lần (khoảng 10 phút):

1. **Cài Bun.**
   - Mac: mở ứng dụng Terminal, dán lệnh dưới đây rồi Enter:

     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```

     Đóng Terminal rồi mở lại.
   - Windows: mở PowerShell, dán lệnh dưới đây rồi Enter:

     ```powershell
     powershell -c "irm bun.sh/install.ps1 | iex"
     ```

     Đóng PowerShell rồi mở lại.
2. **Tải mã nguồn.** Vào https://github.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace, bấm nút xanh "Code" → "Download ZIP", giải nén (ví dụ vào thư mục Downloads).
3. **Mở cửa sổ lệnh trong thư mục vừa giải nén.**
   - Mac: trong Terminal gõ `cd ` (có dấu cách), kéo thư mục vừa giải nén thả vào cửa sổ Terminal, rồi Enter.
   - Windows: mở thư mục trong File Explorer, bấm vào thanh địa chỉ, gõ `powershell` rồi Enter.
4. **Cài thư viện** (chỉ lần đầu):

   ```bash
   bun install
   ```

Mỗi lần muốn xem:

```bash
bun run demo
```

Khi thấy dòng "Bản demo Hàng chờ đang chạy", mở Chrome hoặc Edge:

- `http://localhost:3000/login`: vào bằng Amy, bấm thử Xác nhận, Sửa, Bác, Escalate, Báo PII.
- `http://localhost:3000/login?as=mark`: vào bằng Mark, chỉ xem, không có nút duyệt.

Tắt: quay lại cửa sổ lệnh, nhấn Ctrl+C.

Ghi chú: điểm tự tin trong demo thấp và nhiều mục có nút Escalate, vì bộ eval hiện mới có 10 ca tổng hợp (cần khoảng 30 ca Amy xác nhận). Mỗi thẻ đang hiện dữ liệu dạng thô; giao diện dễ đọc hơn sẽ làm trước khi đưa Amy dùng. Demo đã chạy thử trên Linux; Mac và Windows chưa thử trực tiếp, gặp lỗi thì chụp màn hình cửa sổ lệnh gửi lại.
