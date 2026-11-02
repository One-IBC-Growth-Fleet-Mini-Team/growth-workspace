# Dựng Growth Workspace trên một máy Linux

Bộ này chạy được trên bất kỳ máy Ubuntu 22.04 hoặc 24.04 nào: Azure (gói miễn phí 12 tháng), Oracle Cloud Always Free, hay máy khác. Chọn nhà cung cấp là câu E-01 (Q-13) trong `docs/context/cau-hoi-mo-lat-cat-01.md`; bộ này không phụ thuộc lựa chọn đó.

Gồm: `docker-compose.yml` (ứng dụng và Caddy tự lo HTTPS), `Caddyfile`, `systemd/` (lịch job theo giờ Việt Nam), `setup.sh` (dựng hoặc cập nhật bằng một lệnh). Đã chạy thử đầy đủ bằng Docker ngày 02/11/2026: build image, HTTPS qua Caddy, migration, backup, preflight, các unit systemd hợp lệ.

## 1. Tạo máy

Yêu cầu tối thiểu: 1 vCPU, 2 GB RAM, ổ 30 GB gắn trực tiếp vào máy (không dùng ổ mạng như Azure Files hay NFS: SQLite có thể hỏng file trên ổ mạng), Ubuntu 22.04 hoặc 24.04 bản x86_64 hay arm64, một địa chỉ IP công khai cố định.

- **Azure**: tạo Virtual Machine Ubuntu, vùng Southeast Asia, cỡ máy và loại ổ nằm trong danh sách miễn phí 12 tháng của tài khoản (xem trang "free services" của Azure trước khi tạo; chọn sai cỡ máy hoặc loại ổ là bị tính tiền ngay). Bật "Automatic guest OS patching". Network security group mở cổng 22 (chỉ từ IP của người vận hành), 80, 443. Bật Azure Backup cho máy.
- **Oracle Cloud**: tạo instance Ubuntu, shape Ampere A1, dùng ít hơn hạn mức Always Free (ví dụ 1 OCPU, 6 GB). Security List mở cổng 80, 443. Image Ubuntu của Oracle chặn sẵn 80 và 443 bằng iptables trên máy, phải mở thêm:

  ```bash
  sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
  ```

  Bắt buộc làm mục 5 (backup ra ngoài máy): Oracle có thể tắt máy Always Free khi đổi chính sách.

## 2. Trỏ tên miền

Tạo bản ghi DNS A (ví dụ `hangcho.<tên miền của One IBC>`) trỏ tới IP công khai của máy. Địa chỉ này cũng là redirect URI của app Entra: `https://<tên miền>/auth/callback` (câu AD-03).

## 3. Chạy setup lần đầu

```bash
curl -fsSLO https://raw.githubusercontent.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace/main/deploy/setup.sh
sudo bash setup.sh
```

Lần đầu, lệnh tạo hai file rồi dừng để điền (cả hai chỉ root đọc được, không bao giờ đưa vào repo):

- `/etc/growth/caddy.env`: `QUEUE_DOMAIN` là tên miền ở mục 2, `ACME_EMAIL` là email nhận thông báo chứng chỉ.
- `/etc/growth/growth.env`: các biến trong `.env.example`. Để trống `GROWTH_DB_PATH` và `SA01_EVAL_RESULTS_DIR` (compose tự đặt vào `/data`). `QUEUE_BASE_URL` là `https://<tên miền>`. Biến nào chưa có (token CRM, quyền Graph...) cứ để trống; preflight sẽ báo.

Điền xong thì chạy lại `sudo bash setup.sh`. Lệnh cài Docker, build image, chạy ứng dụng, nâng schema DB, cài lịch job, chạy preflight. Mở `https://<tên miền>/health` thấy `ok` là xong phần máy.

## 4. Các bước sau

| Việc | Lệnh |
|---|---|
| Nạp danh bạ RM | `sudo docker compose -f /opt/growth-workspace/deploy/docker-compose.yml exec -T growth bun run scripts/load-rm-directory.ts /data/rm-directory.json` (chép file JSON vào `/srv/growth/data/` trước, xoá đi sau khi nạp) |
| Kiểm trước khi bật | `... exec -T growth bun run src/jobs/preflight.ts --network` |
| Chạy eval | `... exec -T growth bun run src/agents/sa-01/eval/main.ts` |
| Xem lịch job | `systemctl list-timers 'growth-*'` |
| Xem log một job | `journalctl -u growth-job@sa01-morning.service` |
| Chạy tay một job | `sudo systemctl start growth-job@etl-crm.service` |
| Cập nhật lên `main` mới nhất | `sudo bash /opt/growth-workspace/deploy/setup.sh` |
| Tắt khẩn cấp phần agent | `sudo systemctl disable --now growth-sa01-morning.timer` |

`...` là `sudo docker compose -f /opt/growth-workspace/deploy/docker-compose.yml`. Checklist bật cho Amy ở `docs/runbook/lat-cat-01.md` mục 2.

## 5. Backup

- 06:15 hằng ngày, job `backup-db` tạo một bản SQLite nhất quán trong `/srv/growth/data/backups`, giữ 14 bản gần nhất.
- 06:20, timer `growth-offsite-backup` đẩy thư mục đó ra kho lưu trữ ngoài máy bằng rclone, chỉ khi đã có `/etc/growth/rclone.conf`. Kho chỉ giữ bản trong 15 ngày, khớp D-09 và D-12: nội dung đã xoá có kiểm soát tự biến khỏi backup.

Cấu hình rclone một lần (`sudo rclone config --config /etc/growth/rclone.conf`):

1. Tạo remote tới kho của nhà cung cấp: Azure Blob Storage (loại `azureblob`) hoặc Oracle Object Storage (loại `s3`, provider Oracle).
2. Tạo remote mã hoá loại `crypt` tên **`growth-backup`** bọc remote ở bước 1, đặt mật khẩu mạnh và cất mật khẩu ở kho bí mật của tổ chức. Backup chứa snapshot CRM và tự báo đã ẩn danh, nên chỉ đẩy ra ngoài khi đã mã hoá.
3. `sudo chmod 600 /etc/growth/rclone.conf`, rồi thử `sudo systemctl start growth-offsite-backup.service`.

Khôi phục: dừng ứng dụng (`... stop growth`), chép một bản backup thành `/srv/growth/data/growth.sqlite` (chủ sở hữu uid 1000), chạy lại `setup.sh`.

## 6. An toàn

- Không mở cổng nào khác ngoài 22, 80, 443; cổng 22 chỉ cho IP của người vận hành.
- Secret chỉ nằm trong `/etc/growth/*.env` (quyền 600) hoặc kho bí mật của nhà cung cấp, không bao giờ trong repo hay trong lệnh gõ trên máy (lịch sử shell).
- `unattended-upgrades` do `setup.sh` bật sẵn để vá bảo mật hệ điều hành tự động.
