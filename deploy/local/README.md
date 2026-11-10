# Chạy Hàng chờ trên máy Ubuntu của bạn (D-26)

Hàng chờ chạy ngay trên máy tính Ubuntu của người dùng (Amy, hoặc Harvey khi thử). Không cần máy chủ, không cần Docker, không cần Claude Code. Dữ liệu nằm trên máy này, không đi đâu khác; chỉ phần tự báo đã lọc thông tin khách được gửi sang Claude API để đọc (K-01).

Chi phí: 0 đồng cho máy; chỉ trả tiền gọi Claude API theo lượng dùng, có trần 100 USD/tháng (spec mục 10).

## Cần chuẩn bị

- Máy Ubuntu (đã thử với 24.04), tài khoản đăng nhập thường của bạn. Không dùng sudo.
- API key Claude (bắt đầu bằng `sk-ant-`), lấy ở console.anthropic.com. Đây là khoá trả tiền theo lượng dùng, khác với gói Claude Pro hay Max.
- Hai mật khẩu, mỗi cái ít nhất 12 ký tự: một cho Amy (người duyệt), một cho Mark (chỉ xem).

## Cài lần đầu (khoảng 5 phút)

Mở Terminal (Ctrl+Alt+T), chạy từng lệnh:

```bash
sudo apt install -y git curl unzip
```

```bash
git clone https://github.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace.git ~/growth-workspace
```

```bash
bash ~/growth-workspace/deploy/local/install.sh
```

Script hỏi API key và hai mật khẩu (gõ không hiện chữ, đó là bình thường). Xong khi thấy dòng "Hàng chờ đang chạy".

Mở `http://localhost:3000` trên Firefox hoặc Chrome (hoặc bấm biểu tượng "Hàng chờ Growth"), đăng nhập bằng Amy.

## Dùng hằng ngày

Xem `docs/runbook/lat-cat-01.md` mục 1b: dán tự báo, nạp file CSV từ CRM, mở "WO tồn đọng". Hàng chờ tự chạy mỗi khi bạn đăng nhập vào máy; không cần mở Terminal.

## Cập nhật lên bản mới

```bash
cd ~/growth-workspace && git pull && bash deploy/local/install.sh
```

Cấu hình, mật khẩu và dữ liệu giữ nguyên.

## Sao lưu

Mỗi ngày 08:15 (hoặc lần đăng nhập kế tiếp nếu máy tắt lúc đó), Mi1 đánh dấu "quá hạn, giữ nháp" cho mục chưa ai quyết của ngày trước, rồi máy chép Growth DB vào thư mục `~/Growth-backup`, giữ 14 bản gần nhất. Bản sao lưu nằm trên cùng ổ đĩa: nên chép thư mục này sang Google Drive hoặc ổ USB mỗi tuần. File trong đó không có email hay số điện thoại khách (chỉ mã băm) nhưng vẫn là dữ liệu nội bộ, không chia sẻ công khai.

Thêm tài khoản (D-79): `bun run scripts/add-user.ts <amy|mark|mkt|bod>` trong thư mục repo đã cài, sau khi nạp biến môi trường (`set -a && . ~/.config/growth/growth.env && set +a`). Lệnh in mật khẩu tạm một lần; người dùng phải đổi ở lần đăng nhập đầu. Chạy lại lệnh là đặt lại mật khẩu. Team MKT chỉ vào trang số tổng hợp; BOD xem như Mark.

Khôi phục từ bản sao lưu: `systemctl --user stop growth-queue`, rồi `bun run scripts/restore-db.ts ~/Growth-backup/<file>.sqlite`, rồi `systemctl --user start growth-queue`. DB trước khi khôi phục được giữ thành `<db>.before-restore-<thời điểm>`.

Giá trị tạm (D-67): Mark sửa ở trang `/tuning`; thay đổi lưu ở `~/.local/share/growth/data/provisional-overrides.jsonl` (cạnh Growth DB). Bản sao lưu tự động hằng ngày chỉ chép Growth DB, nên khi chuyển máy hãy chép kèm file này.

Trang "Hỏi Mi1" (`/ask`) chỉ mở sau khi chạy bộ eval một lần: `set -a && . ~/.config/growth/growth.env && set +a && ~/.local/share/growth/bun/bin/bun run eval:mi1` chạy trong thư mục repo đã cài (tốn vài cent token). Đổi phiên bản Growth có đổi prompt Mi1 thì chạy lại.

Lịch khác (spec mục 10): 08:00 và 13:00 thứ Hai tới thứ Bảy, Mi1-sa-01 làm NBA cho Hàng chờ (CRON-05; chế độ dán chỉ làm NBA, NBA chỉ sinh khi bộ eval đã pass). 08:30 thứ Hai, báo Mark Digest tuần qua Teams nếu đã đặt `TEAMS_WEBHOOK_URL_MARK` (CRON-08). 07:00 ngày 1, báo Mark báo cáo tháng trước ở trang `/monthly` (CRON-09). 06:30 hằng ngày, kéo các nguồn đã đặt chế độ MCP: điểm Hook, kết quả chiến dịch, quét thị trường (CRON-03; nguồn chế độ file bỏ qua). Xem lần chạy gần nhất: `systemctl --user list-timers`; xem token và chi phí từng phiên ở trang `/runs`.

## Việc thỉnh thoảng

| Muốn | Làm |
|---|---|
| Nạp danh bạ RM (để tự báo gắn đúng RM) | `bash ~/growth-workspace/deploy/local/run.sh scripts/load-rm-directory.ts ~/rm-directory.json` (file JSON giữ ngoài repo, dạng xem `docs/runbook/lat-cat-01.md`) |
| Đặt bảng ghép cột CRM | lưu file vào `~/.config/growth/crm-columns.json`, rồi `systemctl --user restart growth-queue` |
| Đổi mật khẩu | `echo -n 'mật khẩu mới' \| bash ~/growth-workspace/deploy/local/run.sh scripts/hash-password.ts`, chép kết quả vào `~/.config/growth/growth.env` (giữ nháy đơn hai bên), rồi `systemctl --user restart growth-queue` |
| Xem Hàng chờ có chạy không | `systemctl --user status growth-queue` |
| Xem lỗi | `journalctl --user -u growth-queue -n 50` |
| Tắt hẳn | `systemctl --user disable --now growth-queue growth-daily.timer growth-sa01.timer growth-digest.timer growth-monthly.timer growth-pull.timer` |

## Giới hạn

- Chỉ người ngồi ở máy này mở được Hàng chờ. Khi cần người khác xem từ xa thì chuyển lên máy chủ (`deploy/README.md`) bằng cách chép file DB và file cấu hình sang.
- Máy tắt thì Hàng chờ tắt; mọi việc chỉ chạy khi Amy bấm (dán, nạp), nên không mất gì.
- File `~/.config/growth/growth.env` chứa API key và khoá bí mật: không gửi cho ai, không đưa lên repo.
