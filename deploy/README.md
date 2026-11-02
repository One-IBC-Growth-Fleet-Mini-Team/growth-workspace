# Đưa Growth Workspace lên một máy chủ

Viết cho người không làm kỹ thuật. Mỗi bước có "làm gì" và "xong khi nào". Không dùng Docker (D-23): ứng dụng chạy thẳng trên máy Ubuntu, `setup.sh` lo hết phần cài đặt.

Muốn xem thử Hàng chờ trên máy tính của mình trước (không cần máy chủ, không cần tài khoản nào): xem `docs/huong-dan-demo.md`.

> Chạy được ngay, không chờ ai (D-24): đăng nhập bằng mật khẩu, Amy dán tự báo và nạp file CSV xuất từ CRM ngay trên trang. Chỉ cần máy chủ (bước 1 tới 5), API key Claude, và bảng ghép cột CRM (bước 7). Sau này đổi sang API của MobCEC bằng `CRM_SOURCE=api`. Khi có app Entra và quyền Teams thì đổi `AUTH_MODE=entra`, `REPORT_SOURCE=graph`.

## Bước 1. Tạo máy chủ (khoảng 15 phút, làm trên trang web của nhà cung cấp)

Cần: Ubuntu 24.04, 1 vCPU, 2 GB RAM, ổ 30 GB gắn trực tiếp vào máy (không dùng ổ mạng như Azure Files), địa chỉ IP công khai cố định.

**Azure** (khuyến nghị, gói miễn phí 12 tháng):
1. portal.azure.com → Virtual machines → Create.
2. Image: Ubuntu Server 24.04 LTS. Region: Southeast Asia. Size: một cỡ có nhãn miễn phí trong tài khoản (đọc trang "free services" của Azure trước; chọn sai cỡ máy hoặc loại ổ là bị tính tiền ngay).
3. Authentication: SSH public key. Azure tạo và cho tải file khoá, cất file này cẩn thận.
4. Inbound ports: mở 22, 80, 443. Sau khi tạo, vào Networking sửa luật cổng 22 chỉ cho IP của bạn.
5. Sau khi tạo: bật "Automatic guest OS patching" và Backup cho máy.

**Oracle Cloud** (0 đồng lâu dài):
1. cloud.oracle.com → Compute → Instances → Create. Image Ubuntu 24.04; shape Ampere A1 với 1 OCPU, 6 GB (ít hơn hạn mức miễn phí).
2. Security List của mạng: thêm luật cho cổng 80 và 443.
3. Bắt buộc làm bước 6 (backup ra ngoài máy): Oracle có thể tắt máy miễn phí khi đổi chính sách.

Xong khi: thấy địa chỉ IP công khai của máy trên trang quản lý.

## Bước 2. Trỏ tên miền (khoảng 5 phút, người quản lý tên miền của One IBC làm)

Tạo bản ghi DNS loại A, ví dụ `hangcho.<tên miền One IBC>`, trỏ tới IP ở bước 1. Gửi admin tenant địa chỉ `https://hangcho.<tên miền>/auth/callback` để đăng ký vào app Entra (câu AD-03).

Xong khi: vài phút sau, gõ tên miền vào trình duyệt không còn báo "không tìm thấy" (có thể báo lỗi kết nối, chưa sao).

## Bước 3. Vào máy và chạy setup lần đầu (khoảng 5 phút)

Trên Azure: trang của máy → Connect → "SSH using Azure CLI" hoặc "Serial console" để mở cửa sổ lệnh ngay trên trình duyệt. Trên Oracle: trang của máy → "Cloud Shell" hoặc "Console connection".

Dán hai lệnh này, Enter sau mỗi lệnh:

```bash
curl -fsSLO https://raw.githubusercontent.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace/main/deploy/setup.sh
```

```bash
sudo bash setup.sh
```

Xong khi: dòng cuối báo "Đã tạo /etc/growth/growth.env và /etc/growth/caddy.env".

Riêng Oracle: Ubuntu của Oracle chặn sẵn cổng 80 và 443 ngay trên máy. Dán thêm lệnh này một lần:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
```

## Bước 4. Điền cấu hình (khoảng 10 phút)

Mở file bằng trình soạn thảo trong cửa sổ lệnh (dùng phím mũi tên để di chuyển; Ctrl+O rồi Enter để lưu; Ctrl+X để thoát):

```bash
sudo nano /etc/growth/caddy.env
```

Điền `QUEUE_DOMAIN=hangcho.<tên miền>` (không có https://) và `ACME_EMAIL=<email nhận thông báo chứng chỉ>`.

```bash
sudo nano /etc/growth/growth.env
```

Điền những gì đã có; chưa có thì để trống, chương trình sẽ báo. Tối thiểu cho lần đầu:

| Biến | Điền gì |
|---|---|
| `QUEUE_BASE_URL` | `https://hangcho.<tên miền>` |
| `SESSION_SECRET`, `PII_HASH_KEY` | mỗi biến một chuỗi ngẫu nhiên dài; tạo bằng lệnh `openssl rand -hex 32` (mỗi biến chạy một lần, chép kết quả vào) |
| `AUTH_MODE` | `password` |
| `AMY_PASSWORD_HASH`, `MARK_PASSWORD_HASH` | mã băm mật khẩu, tạo ở bước 5 (để trống lúc này) |
| `REPORT_SOURCE` | `paste` |
| `LLM_MODEL` | `claude-sonnet-5-5` |
| `LLM_PRICE_INPUT_USD_PER_MTOK`, `LLM_PRICE_OUTPUT_USD_PER_MTOK` | `2` và `10` (giá Claude Sonnet 5.5 cho 1 triệu token; kiểm lại trên trang giá của Anthropic) |
| `ANTHROPIC_API_KEY` | API key Claude của One IBC |
| Các biến Entra, Teams, CRM API | để trống cho tới khi có |

Không gửi nội dung hai file này qua chat hay email; chúng chứa khoá bí mật. Cất bản sao ở kho bí mật của tổ chức.

## Bước 5. Chạy setup lần hai và đặt mật khẩu

```bash
sudo bash setup.sh
```

Tạo mật khẩu cho Amy (ít nhất 12 ký tự): chạy lệnh dưới, gõ mật khẩu, Enter, rồi Ctrl+D. Lệnh in ra một chuỗi bắt đầu bằng `$argon2id$`.

```bash
sudo growth-run scripts/hash-password.ts
```

Chép chuỗi đó vào `AMY_PASSWORD_HASH` trong `/etc/growth/growth.env` (`sudo nano /etc/growth/growth.env`). Làm lại cho Mark (`MARK_PASSWORD_HASH`). Rồi chạy lại `sudo bash setup.sh`. Gửi mật khẩu cho Amy và Mark trực tiếp, không qua kênh lưu lại lịch sử.

Xong khi: thấy "Hàng chờ đang chạy.", mở `https://hangcho.<tên miền>/health` thấy chữ `ok`, và đăng nhập được bằng mật khẩu của Amy ở `https://hangcho.<tên miền>/login`. Dòng "Preflight còn mục chưa đạt" là bình thường khi chưa có CRM, Teams và eval.

Từ giờ, mỗi lần có bản mới trên `main`, chỉ cần chạy lại đúng lệnh này.

## Bước 6. Backup ra ngoài máy (khoảng 15 phút, nên làm ngay)

Máy tự backup lúc 06:15 mỗi ngày vào `/srv/growth/data/backups`, giữ 14 bản. Để có bản sao ở nơi khác (phòng khi mất máy):

```bash
sudo rclone config --config /etc/growth/rclone.conf
```

Làm theo câu hỏi trên màn hình:
1. Tạo remote tới kho lưu trữ của nhà cung cấp: Azure Blob Storage (chọn `azureblob`) hoặc Oracle Object Storage (chọn `s3`, provider Oracle).
2. Tạo thêm remote tên đúng là **`growth-backup`**, loại `crypt`, bọc remote ở bước 1. Đặt mật khẩu mạnh, cất ở kho bí mật của tổ chức. Backup được mã hoá trước khi rời máy.

Xong khi: lệnh `sudo systemctl start growth-offsite-backup.service` chạy không báo lỗi. Từ đó máy tự đẩy backup lúc 06:20 mỗi ngày.

## Bước 7. Bảng ghép cột CRM (một lần, khoảng 10 phút)

Để Hàng chờ đọc được file CSV xuất từ CRM, máy cần biết cột nào là gì. Tên cột của CRM là thông tin nội bộ nên không nằm trong repo.

1. Xuất thử một lần các danh sách Opportunity, Client (Account), Lead, Order từ trang quản trị CRM; chép **chỉ dòng tiêu đề** (tên cột) của từng file gửi fleet kỹ thuật. Không gửi dòng dữ liệu nào.
2. Fleet gửi lại nội dung file bảng ghép (cùng dạng `deploy/crm-columns.example.json`).
3. Trên máy chủ: `sudo nano /etc/growth/crm-columns.json`, dán nội dung, lưu; rồi `sudo systemctl restart growth-queue`.

Xong khi: đăng nhập bằng Amy, bấm "Nạp dữ liệu CRM (CSV)", chọn file Opportunity, bấm Nạp, thấy dòng "Đã nạp ... Opportunity". Nếu báo thiếu cột hoặc ô sai định dạng, câu báo ghi rõ tên cột và số dòng; gửi câu đó cho fleet.

## Các việc thường gặp

| Muốn | Lệnh |
|---|---|
| Đổi mật khẩu của Amy hoặc Mark | tạo mã băm mới (bước 5), thay trong `growth.env`, `sudo systemctl restart growth-queue` |
| Xem lịch chạy | `systemctl list-timers 'growth-*'` |
| Xem Hàng chờ có chạy không | `systemctl status growth-queue` |
| Xem log một job | `journalctl -u growth-job@sa01-morning -n 50` |
| Chạy tay một job | `sudo systemctl start growth-job@etl-crm` |
| Kiểm trước khi bật cho Amy | `sudo systemctl start growth-job@preflight` rồi xem log của nó |
| Tắt khẩn cấp phần agent | `sudo systemctl disable --now growth-sa01-morning.timer` |
| Cập nhật lên bản mới | `sudo bash setup.sh` |

Nạp danh bạ RM, chạy eval, xoá có kiểm soát: xem `docs/runbook/lat-cat-01.md`. Lệnh `bun run <file>` trong runbook chạy trên máy chủ bằng `sudo growth-run <file>`, ví dụ:

```bash
sudo growth-run scripts/load-rm-directory.ts /srv/growth/data/rm-directory.json
```

## Khôi phục từ backup

1. `sudo systemctl stop growth-queue`
2. Chép bản backup muốn dùng thành `/srv/growth/data/growth.sqlite`, rồi `sudo chown growth:growth /srv/growth/data/growth.sqlite`
3. `sudo bash setup.sh`

## Đã kiểm

Ngày 02/11/2026, trên một máy Ubuntu 24.04 giả lập (systemd đầy đủ):
- lần một tạo file cấu hình rồi dừng; lần hai dựng xong; lần ba chạy lại không hỏng gì;
- Bun 1.4.4 tải từ GitHub, kiểm SHA-256 khớp;
- Hàng chờ chỉ nghe trên 127.0.0.1, ra ngoài qua Caddy (HTTPS, HSTS);
- 5 lịch đúng giờ Việt Nam; job backup ghi đúng chủ sở hữu `growth`;
- preflight chỉ báo các mục chưa có nguồn thật.

Chưa kiểm: trên máy Azure hoặc Oracle thật, và rclone với kho thật.
