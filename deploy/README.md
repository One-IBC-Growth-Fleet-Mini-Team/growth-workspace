# Đưa Growth Workspace lên một máy chủ

Viết cho người không làm kỹ thuật. Mỗi bước có "làm gì" và "xong khi nào". Máy chủ chạy song song với bản cài trên máy của Mark (`deploy/local/README.md`, D-26 giữ nguyên); máy chủ là để Amy và Team MKT vào từ xa (D-97). Không dùng Docker (D-23): ứng dụng chạy thẳng trên máy Ubuntu, `setup.sh` lo hết phần cài đặt.

Muốn xem thử trên máy tính của mình trước (không cần máy chủ): `docs/huong-dan-demo.md`.

Trong tài liệu này, chữ trong ngoặc nhọn là chỗ bạn điền giá trị thật, ví dụ `<tên miền>`. Không ghi giá trị thật vào repo (repo đang công khai).

## Bước 1. Tạo máy (khoảng 15 phút, trên trang web của nhà cung cấp)

**Làm gì.** Tạo máy Ubuntu 24.04, 1 vCPU, 2 GB RAM, ổ 30 GB gắn trực tiếp vào máy (không dùng ổ mạng như Azure Files), địa chỉ IP công khai cố định. Đăng nhập máy bằng khoá SSH, không bằng mật khẩu.

**Azure** (gói miễn phí 12 tháng):
1. portal.azure.com, Virtual machines, Create.
2. Image: Ubuntu Server 24.04 LTS. Region: Southeast Asia. Size: một cỡ có nhãn miễn phí trong tài khoản (đọc trang "free services" của Azure trước; chọn sai cỡ máy hoặc loại ổ là bị tính tiền ngay).
3. Authentication: SSH public key. Azure tạo và cho tải file khoá; cất file này cẩn thận, không gửi qua chat.
4. Inbound ports: mở 22, 80, 443. Sau khi tạo, vào Networking sửa luật cổng 22 chỉ cho IP của bạn (tường lửa trên máy cũng chặn, đây là lớp thứ hai).
5. Bật "Automatic guest OS patching" và Backup cho máy.

**Oracle Cloud** (0 đồng lâu dài):
1. cloud.oracle.com, Compute, Instances, Create. Image Ubuntu 24.04; shape Ampere A1 với 1 OCPU, 6 GB (ít hơn hạn mức miễn phí). Dán khoá SSH công khai của bạn.
2. Security List của mạng: thêm luật cho cổng 80 và 443; cổng 22 chỉ cho IP của bạn.
3. Bắt buộc làm bước 7 (backup ra ngoài máy): Oracle có thể tắt máy miễn phí khi đổi chính sách.

**Xong khi:** thấy địa chỉ IP công khai của máy trên trang quản lý, và vào được máy bằng SSH: `ssh <tên đăng nhập>@<IP máy>`.

Nếu SSH bị khoá vì gõ sai cấu hình: Azure có "Serial console", Oracle có "Console connection"; hai cửa này không đi qua tường lửa của máy.

## Bước 2. Trỏ tên miền (khoảng 5 phút, người quản lý tên miền của One IBC làm)

**Làm gì.** Tạo bản ghi DNS loại A, ví dụ `growth.<tên miền>`, trỏ tới IP ở bước 1.

**Xong khi:** vài phút sau, lệnh `ping growth.<tên miền>` trên laptop trả về đúng IP của máy.

## Bước 3. Chạy setup lần đầu (khoảng 5 phút)

**Làm gì.** Vào máy bằng SSH. Chọn bản phát hành (tag) mới nhất ở trang Releases của repo, ví dụ `v1.0.0`. Luôn dùng tag, không dùng `main`: `main` thay đổi liên tục, tag thì cố định và đã được duyệt. Dán hai lệnh, thay `<tag>`:

```bash
curl -fsSLO https://raw.githubusercontent.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace/<tag>/deploy/setup.sh
```

```bash
sudo REPO_REF=<tag> bash setup.sh
```

Riêng Oracle: Ubuntu của Oracle có sẵn luật iptables chặn 80 và 443 trước ufw. Dán thêm một lần:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
```

**Xong khi:** dòng cuối báo "Đã tạo /etc/growth/growth.env, /etc/growth/caddy.env và /etc/growth/admin-ips".

## Bước 4. Điền admin-ips, caddy.env, growth.env (khoảng 10 phút)

Mở file bằng trình soạn thảo trong cửa sổ lệnh (phím mũi tên để di chuyển; Ctrl+O rồi Enter để lưu; Ctrl+X để thoát).

**4a. Ai được SSH vào máy.**

```bash
sudo nano /etc/growth/admin-ips
```

Mỗi dòng một IP hoặc dải của người quản trị, ví dụ `192.0.2.10` hoặc `192.0.2.0/24`. Xem IP của bạn ở trang "what is my ip". File trống thì setup dừng: cổng 22 không bao giờ mở cho mọi nơi. Nếu IP bạn đang SSH vào không có trong file, setup cũng dừng để bạn không tự khoá mình ra ngoài.

**4b. Tên miền và ai được vào web.**

```bash
sudo nano /etc/growth/caddy.env
```

| Biến | Điền gì |
|---|---|
| `QUEUE_DOMAIN` | `growth.<tên miền>` (không có https://) |
| `ACME_EMAIL` | email nhận thông báo chứng chỉ |
| `ALLOW_IPS` | **mặc định để trống**: ai biết địa chỉ cũng mở được trang đăng nhập. Điền IP hoặc dải, cách nhau bằng dấu cách (ví dụ IP văn phòng One IBC) thì chỉ các IP đó vào được, IP khác nhận 403. Chỉ điền khi mọi người dùng ngồi ở các mạng cố định |

**4c. Cấu hình ứng dụng.**

```bash
sudo nano /etc/growth/growth.env
```

| Biến | Điền gì |
|---|---|
| `QUEUE_BASE_URL` | `https://growth.<tên miền>` |
| `SESSION_SECRET`, `PII_HASH_KEY` | mỗi biến một chuỗi ngẫu nhiên; tạo bằng `openssl rand -hex 32` (mỗi biến chạy một lần) |
| `AUTH_MODE` | `password` |
| `REPORT_SOURCE` | `paste` |
| `LLM_MODEL` | `claude-sonnet-5-5` |
| `LLM_PRICE_INPUT_USD_PER_MTOK`, `LLM_PRICE_OUTPUT_USD_PER_MTOK` | `2` và `10` (kiểm lại trên trang giá của Anthropic) |
| `ANTHROPIC_API_KEY` | API key Claude; chưa có thì để trống |
| Biến CRM, Teams, quảng cáo | để trống tới khi có; xem trạng thái ở trang `/settings` |

Không còn biến mật khẩu trong file này: tài khoản nằm trong Growth DB (bước 6). Không gửi nội dung các file trong `/etc/growth` qua chat hay email.

**Xong khi:** ba file đã lưu, `admin-ips` có ít nhất một dòng.

## Bước 5. Chạy setup lần hai (khoảng 10 phút)

**Làm gì.**

```bash
sudo REPO_REF=<tag> bash setup.sh
```

Setup làm theo thứ tự: cài gói, Bun, lấy mã nguồn đúng tag, kiểm cấu hình, tắt đăng nhập SSH bằng mật khẩu và đăng nhập root (dừng nếu tài khoản của bạn chưa có khoá SSH), bật tường lửa (chặn hết, mở 80 và 443, cổng 22 chỉ cho admin-ips), bật fail2ban cho SSH, nâng schema DB, cài dịch vụ, lịch job và Caddy (HTTPS).

**Xong khi:** thấy "Hàng chờ đang chạy." và mở `https://growth.<tên miền>/health` trên trình duyệt thấy chữ `ok`. Dòng "Preflight còn mục chưa đạt" là bình thường khi chưa có CRM, Teams, eval và tài khoản.

## Bước 6. Tạo tài khoản (mỗi người khoảng 1 phút)

**Làm gì.** Mỗi người một tài khoản, gắn một vai trò. Mã tài khoản là chữ thường, số, gạch nối, không dùng tên thật, ví dụ `amy-01`, `mkt-01`, `mkt-02`, `mark-01`, `bod-01`.

| Vai trò | Ai | Thấy gì |
|---|---|---|
| `amy` | Amy | Hàng chờ, duyệt việc |
| `mkt` | từng người Team MKT | số tổng hợp, không mã khách |
| `mark` | Mark | mọi trang, `/settings`, đổi ngưỡng |
| `bod` | BOD | xem như Mark, không đổi ngưỡng |

```bash
sudo growth-run add-user mkt-01 mkt
```

Lệnh in mật khẩu tạm đúng một lần, hết hạn sau 72 giờ. Mật khẩu này không được lưu ở đâu, không in lại được; quên thì cấp mới (bước 10).

**Xong khi:** `sudo growth-run list-users` có đủ tài khoản, cột "Mật khẩu tạm" ghi "còn".

## Gửi tài khoản cho người dùng

- Gửi địa chỉ web (`https://growth.<tên miền>`) và mã tài khoản qua một kênh, ví dụ email.
- Gửi mật khẩu tạm qua kênh khác, ví dụ chat Teams 1-1. **Không gửi cả hai trong một tin.**
- Nhắc người nhận đăng nhập và đổi mật khẩu trong 72 giờ. Quá hạn thì không đăng nhập được, phải nhờ Mark cấp lại.
- Mật khẩu mới: ít nhất 12 ký tự, khác mật khẩu tạm, không chứa mã tài khoản, không thuộc nhóm mật khẩu phổ biến. Gợi ý: ba bốn từ ghép lại, ví dụ dạng `tu-mot-tu-hai-tu-ba`.

**Xong khi:** `list-users` ghi "không" ở cột "Mật khẩu tạm" và có giờ ở cột "Đăng nhập cuối".

## Bước 7. Backup ra ngoài máy, có mã hoá (khoảng 15 phút, làm ngay)

Máy tự backup lúc 06:15 mỗi ngày vào `/srv/growth/data/backups`, giữ 14 bản. Lúc 06:20 máy đẩy bản sao ra kho ngoài, **chỉ khi đã mã hoá**: thiếu cấu hình mã hoá thì lịch này báo lỗi và không đẩy gì đi.

**Làm gì.**

```bash
sudo rclone config --config /etc/growth/rclone.conf
```

1. Tạo remote tới kho lưu trữ: Azure Blob Storage (chọn `azureblob`) hoặc Oracle Object Storage (chọn `s3`, provider Oracle).
2. Tạo thêm remote tên đúng là **`growth-backup`**, loại **`crypt`**, bọc remote ở mục 1. Đặt mật khẩu mạnh, cất ở kho bí mật của tổ chức. Mất mật khẩu này là mất khả năng đọc backup.

**Xong khi:** `sudo systemctl start growth-offsite-backup.service` chạy không báo lỗi, và `journalctl -u growth-offsite-backup -n 5` có dòng "đã đẩy bản mã hoá".

## Bước 8. Kiểm từ bên ngoài bằng verify-remote.sh (khoảng 5 phút, trên laptop)

**Làm gì.** Tạo một tài khoản thử ngay trước khi kiểm:

```bash
sudo growth-run add-user verify-01 bod
```

Trên laptop (macOS hoặc Linux, cần `curl` và `python3`), tải `deploy/verify-remote.sh` của đúng tag rồi chạy. Thêm `--admin` nếu laptop nằm trong admin-ips (khi đó cổng 22 được phép mở với laptop):

```bash
bash verify-remote.sh growth.<tên miền> verify-01 --admin
```

Script hỏi mật khẩu tạm của `verify-01` (không hiện khi gõ), rồi kiểm: HTTPS hợp lệ, HTTP chuyển sang HTTPS, cổng 3000 đóng, cổng 22 đóng (hoặc chỉ mở cho laptop có `--admin`), đủ header bảo mật, cookie có Secure, `/command/data.json` không vào được khi chưa đăng nhập, sai 5 lần thì tài khoản thử bị khoá. Kiểm xong, khoá tài khoản thử:

```bash
sudo growth-run disable-user verify-01
```

**Xong khi:** bảng in ra có mọi dòng "Đạt". Muốn chắc cổng 22 đóng với người ngoài, chạy thêm một lần không có `--admin` từ mạng khác (ví dụ điện thoại phát wifi), với một tài khoản thử mới.

## Bước 9. Cập nhật bản mới

**Làm gì.** Khi có tag phát hành mới, vào máy và chạy lại setup với tag đó. Setup chạy lại nhiều lần không hỏng gì; tường lửa dựng lại theo `admin-ips` hiện tại.

```bash
sudo REPO_REF=<tag mới> bash setup.sh
```

**Xong khi:** setup in "Phiên bản: <tag mới>" và "Hàng chờ đang chạy."; chạy lại bước 8 nếu bản mới có ghi chú về bảo mật.

## Bước 10. Quên mật khẩu, người nghỉ việc

| Muốn | Lệnh | Xong khi |
|---|---|---|
| Cấp mật khẩu tạm mới (quên, hết hạn 72 giờ) | `sudo growth-run reset-password <tài khoản>` | lệnh in mật khẩu tạm mới; mọi phiên cũ của tài khoản đó bị đăng xuất |
| Khoá người nghỉ việc, ngay hôm nghỉ | `sudo growth-run disable-user <tài khoản>` | `list-users` ghi "đã khoá"; phiên đang mở bị đăng xuất ngay; lịch sử thao tác giữ nguyên |
| Xem tài khoản | `sudo growth-run list-users` | bảng tài khoản, vai trò, lần đăng nhập cuối; không có mật khẩu hay mã băm |
| Xem đăng nhập sai, bị khoá | trang `/settings`, mục "Sổ sự kiện bảo mật" (chỉ Mark) | thấy từng sự kiện kèm giờ |

Tài khoản đã khoá không mở lại; người quay lại thì tạo mã mới. Người nghỉ việc là quản trị máy: xoá IP của họ khỏi `admin-ips`, xoá khoá SSH của họ khỏi máy, chạy lại setup.

## Bước 11. Bảng ghép cột CRM (một lần, khoảng 10 phút)

1. Xuất thử một lần các danh sách Opportunity, Client (Account), Lead, Order từ trang quản trị CRM; chép **chỉ dòng tiêu đề** (tên cột) của từng file gửi fleet kỹ thuật. Không gửi dòng dữ liệu nào.
2. Fleet gửi lại nội dung file bảng ghép (cùng dạng `deploy/crm-columns.example.json`).
3. Trên máy chủ: `sudo nano /etc/growth/crm-columns.json`, dán nội dung, lưu; rồi `sudo systemctl restart growth-queue`.

**Xong khi:** Amy nạp thử file Opportunity ở trang "File CRM", thấy dòng "Đã nạp ... Opportunity".

## Các việc thường gặp

| Muốn | Lệnh |
|---|---|
| Xem lịch chạy | `systemctl list-timers 'growth-*'` |
| Xem Hàng chờ có chạy không | `systemctl status growth-queue` |
| Xem log một job | `journalctl -u growth-job@sa01-morning -n 50` |
| Chạy tay một job | `sudo systemctl start growth-job@etl-crm` |
| Kiểm cấu hình | `sudo systemctl start growth-job@preflight` rồi `journalctl -u growth-job@preflight -n 30` |
| Tắt khẩn cấp phần agent | `sudo systemctl disable --now growth-sa01-morning.timer` |
| Xem tường lửa | `sudo ufw status verbose` |
| Xem IP bị fail2ban chặn | `sudo fail2ban-client status sshd` |

Preflight báo `AMY_PASSWORD_HASH` (hoặc `MARK_`, `MKT_`, `BOD_`) với mã `LEGACY_UNUSED_RUN_ADD_USER_THEN_REMOVE`: đó là cách đăng nhập cũ, không còn dùng. Tạo tài khoản cho người đó (`add-user`), gửi mật khẩu tạm, rồi xoá dòng đó trong `/etc/growth/growth.env`. Setup không tự xoá.

Nạp danh bạ RM, chạy eval: `docs/runbook/lat-cat-01.md`. Lệnh `bun run <file>` trong runbook chạy trên máy chủ bằng `sudo growth-run <file>`.

## Khôi phục từ backup

1. `sudo systemctl stop growth-queue`
2. `sudo growth-run scripts/restore-db.ts /srv/growth/data/backups/<file>.sqlite` (DB đang có được giữ lại thành `growth.sqlite.before-restore-<giờ>`)
3. `sudo systemctl start growth-queue`

Lấy bản từ kho ngoài: `sudo rclone --config /etc/growth/rclone.conf copy growth-backup:<file>.sqlite /srv/growth/data/backups/` (rclone tự giải mã), rồi làm như trên.

**Xong khi:** `https://growth.<tên miền>/health` thấy `ok` và đăng nhập được bằng tài khoản cũ.

## Đã kiểm

Ngày 11/11/2026 (D-97), trong container Ubuntu 24.04 có systemd thật, mạng riêng, một container khác đóng vai laptop:
setup lần một, hai, ba và lần bốn với `ALLOW_IPS`; các cổng an toàn (admin-ips trống, IP đang SSH ngoài danh sách, tài khoản không có khoá SSH); tạo tài khoản 4 vai trò, đăng nhập lần đầu, đổi mật khẩu; backup có và không có mã hoá; khôi phục; `verify-remote.sh` đạt cả 8 mục. Phần giả lập: chứng chỉ do Caddy tự ký cho tên miền thử thay Let's Encrypt; máy ảo là container. Chưa kiểm trên Azure hoặc Oracle thật và với kho lưu trữ thật.
