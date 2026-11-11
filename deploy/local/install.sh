#!/usr/bin/env bash
# Cài hoặc cập nhật Hàng chờ chạy trên chính máy Ubuntu của người dùng (D-26). Không cần sudo, không cần máy chủ.
# Chạy từ thư mục mã nguồn đã tải về:
#   bash deploy/local/install.sh
# Lần đầu: hỏi API key Claude và mật khẩu cho Amy, Mark; tự tạo khoá bí mật. Các lần sau (sau khi `git pull`):
# cài thư viện, nâng schema DB, khởi động lại; cấu hình cũ giữ nguyên.
set -euo pipefail

BUN_VERSION="1.4.4" # khớp D-01 và CI
PORT=3000
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARE="$HOME/.local/share/growth"
CONF="$HOME/.config/growth"
ENV_FILE="$CONF/growth.env"
BACKUP_DIR="$HOME/Growth-backup"
BUN="$SHARE/bun/bin/bun"
UNIT_DIR="$HOME/.config/systemd/user"

say() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -ne 0 ] || { echo "Chạy bằng tài khoản thường của bạn, không dùng sudo."; exit 1; }
for cmd in curl unzip sha256sum openssl systemctl; do
  command -v "$cmd" >/dev/null || { echo "Thiếu lệnh $cmd. Cài bằng: sudo apt install $cmd"; exit 1; }
done

say "1/6 Cài Bun $BUN_VERSION vào $SHARE/bun"
# Tải bản phát hành chính thức trên GitHub và kiểm SHA-256 trước khi cài (không chạy script tải từ mạng).
if [ ! -x "$BUN" ] || [ "$("$BUN" --version)" != "$BUN_VERSION" ]; then
  case "$(uname -m)" in
    x86_64) BUN_ASSET=bun-linux-x64 ;;
    aarch64) BUN_ASSET=bun-linux-aarch64 ;;
    *) echo "Kiến trúc máy không hỗ trợ: $(uname -m)"; exit 1 ;;
  esac
  tmp="$(mktemp -d)"
  rel="https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION"
  curl -fsSL -o "$tmp/$BUN_ASSET.zip" "$rel/$BUN_ASSET.zip"
  curl -fsSL -o "$tmp/SHASUMS256.txt" "$rel/SHASUMS256.txt"
  (cd "$tmp" && grep " $BUN_ASSET.zip\$" SHASUMS256.txt | sha256sum -c -)
  unzip -q -o "$tmp/$BUN_ASSET.zip" -d "$tmp"
  install -d "$SHARE/bun/bin"
  install -m 755 "$tmp/$BUN_ASSET/bun" "$BUN"
  rm -rf "$tmp"
fi
"$BUN" --version

say "2/6 Cài thư viện"
(cd "$APP_DIR" && "$BUN" install --frozen-lockfile --production)

say "3/6 Cấu hình trong $ENV_FILE (chỉ tài khoản của bạn đọc được)"
install -d -m 700 "$CONF"
install -d -m 700 "$SHARE/data" "$SHARE/data/eval-results"
install -d -m 700 "$BACKUP_DIR"
if [ ! -f "$ENV_FILE" ]; then
  # Chưa có key thì Enter để bỏ qua (D-89): cài vẫn chạy, LLM tắt tới khi điền ANTHROPIC_API_KEY vào file cấu hình.
  while true; do
    read -rsp "Dán API key Claude (bắt đầu bằng sk-ant-), hoặc Enter để điền sau: " api_key; echo
    [ -z "$api_key" ] && { echo "Bỏ qua API key: hỏi Mi1 và đọc tự báo tắt tới khi điền ANTHROPIC_API_KEY vào $ENV_FILE."; break; }
    [[ "$api_key" =~ ^sk-ant-[A-Za-z0-9_-]+$ ]] && break
    echo "API key không đúng dạng, dán lại hoặc Enter để bỏ qua."
  done
  umask 077
  # Giá trị để trong nháy đơn: systemd và bash đều đọc nguyên văn (mã băm argon2 có ký tự $).
  cat > "$ENV_FILE" <<EOF
# Tạo bởi deploy/local/install.sh. Không gửi file này cho ai, không đưa lên repo.
ANTHROPIC_API_KEY='$api_key'
SESSION_SECRET='$(openssl rand -hex 32)'
PII_HASH_KEY='$(openssl rand -hex 32)'
LLM_MODEL='claude-sonnet-5-5'
LLM_PRICE_INPUT_USD_PER_MTOK='2'
LLM_PRICE_OUTPUT_USD_PER_MTOK='10'
AUTH_MODE='password'
REPORT_SOURCE='paste'
CRM_SOURCE='csv'
CRM_CSV_COLUMNS_PATH='$CONF/crm-columns.json'
QUEUE_BASE_URL='http://localhost:$PORT'
HOST='127.0.0.1'
PORT='$PORT'
GROWTH_DB_PATH='$SHARE/data/growth.sqlite'
SA01_EVAL_RESULTS_DIR='$SHARE/data/eval-results'
GROWTH_BACKUP_DIR='$BACKUP_DIR'
NODE_ENV='production'
EOF
  chmod 600 "$ENV_FILE"
  echo "Đã tạo $ENV_FILE."
else
  echo "Giữ nguyên cấu hình cũ."
fi

# Bảng ghép cột theo tên cột của file xuất CRM thật (D-42, D-72); giữ file cũ nếu đã có.
[ -f "$CONF/crm-columns.json" ] || install -m 600 "$APP_DIR/deploy/crm-columns.example.json" "$CONF/crm-columns.json"

say "4/6 Nâng schema Growth DB, tài khoản đầu tiên"
(set -a; . "$ENV_FILE"; set +a; cd "$APP_DIR" && "$BUN" run src/db/migrate.ts)
# Đăng nhập bằng tài khoản trong DB (D-97), giống máy chủ. Lần cài đầu tạo amy và mark, in mật khẩu tạm một lần.
accounts() { (set -a; . "$ENV_FILE"; set +a; cd "$APP_DIR" && "$BUN" run scripts/accounts.ts "$@"); }
if accounts list-users | grep -q "^Chưa có tài khoản"; then
  accounts add-user amy amy
  accounts add-user mark mark
  echo "Ghi lại hai mật khẩu tạm trên (hết hạn sau 72 giờ); lần đăng nhập đầu sẽ bắt đổi."
fi
if grep -qE '^(AMY|MARK|MKT|BOD)_PASSWORD_HASH=' "$ENV_FILE"; then
  echo "Cảnh báo: $ENV_FILE còn dòng *_PASSWORD_HASH, không còn được dùng (D-97)."
  echo "  Cấp mật khẩu tạm: bash $APP_DIR/deploy/local/run.sh scripts/accounts.ts reset-password <tài khoản> (chưa có thì add-user <tài khoản> <vai trò>), rồi tự xoá các dòng đó."
fi

say "5/6 Dịch vụ chạy nền khi bạn đăng nhập; lịch 08:00, 08:15, 13:00, Digest 08:30 thứ Hai"
install -d "$UNIT_DIR"
cat > "$UNIT_DIR/growth-queue.service" <<EOF
[Unit]
Description=Growth Workspace: Hàng chờ (http://localhost:$PORT)

[Service]
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/queue/server.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
cat > "$UNIT_DIR/growth-daily.service" <<EOF
[Unit]
Description=Growth Workspace: Mi1 áp mặc định cho mục quá hạn, sao lưu DB vào $BACKUP_DIR, dọn snapshot CRM cũ

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
# Dấu "-": Mi1 lỗi thì vẫn sao lưu và dọn snapshot.
ExecStart=-$BUN run src/jobs/mi1-morning.ts
ExecStart=$BUN run src/jobs/backup-db.ts
ExecStart=$BUN run src/jobs/prune-snapshots.ts
EOF
cat > "$UNIT_DIR/growth-daily.timer" <<EOF
[Unit]
Description=Growth Workspace: việc hằng ngày

[Timer]
OnCalendar=*-*-* 08:15:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
# CRON-05 (spec mục 10): Mi1-sa-01 lúc 08:00 và 13:00 thứ Hai tới thứ Bảy. Chế độ dán (REPORT_SOURCE=paste) chỉ làm NBA.
cat > "$UNIT_DIR/growth-sa01.service" <<EOF
[Unit]
Description=Growth Workspace: Mi1-sa-01 (NBA vào Hàng chờ của Amy)

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/jobs/sa01-morning.ts
EOF
cat > "$UNIT_DIR/growth-sa01.timer" <<EOF
[Unit]
Description=Growth Workspace: Mi1-sa-01 08:00 và 13:00 thứ Hai tới thứ Bảy

[Timer]
OnCalendar=Mon..Sat *-*-* 08:00:00 Asia/Ho_Chi_Minh
OnCalendar=Mon..Sat *-*-* 13:00:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
# CRON-08: báo Mark Digest tuần qua Teams lúc 08:30 thứ Hai (bỏ qua khi chưa đặt TEAMS_WEBHOOK_URL_MARK).
cat > "$UNIT_DIR/growth-digest.service" <<EOF
[Unit]
Description=Growth Workspace: báo Digest tuần

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/jobs/digest-weekly.ts
EOF
cat > "$UNIT_DIR/growth-digest.timer" <<EOF
[Unit]
Description=Growth Workspace: Digest tuần 08:30 thứ Hai

[Timer]
OnCalendar=Mon *-*-* 08:30:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
# CRON-09: báo Mark báo cáo tháng qua Teams lúc 07:00 ngày 1 (bỏ qua khi chưa đặt TEAMS_WEBHOOK_URL_MARK).
cat > "$UNIT_DIR/growth-monthly.service" <<EOF
[Unit]
Description=Growth Workspace: báo cáo tháng

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/jobs/monthly-report.ts
EOF
cat > "$UNIT_DIR/growth-monthly.timer" <<EOF
[Unit]
Description=Growth Workspace: báo cáo tháng 07:00 ngày 1

[Timer]
OnCalendar=*-*-01 07:00:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
# CRON-03: 06:30 hằng ngày kéo các nguồn đã đặt <PREFIX>_SOURCE=mcp (HOOK, ADS, MARKET); nguồn chế độ file bỏ qua.
cat > "$UNIT_DIR/growth-pull.service" <<EOF
[Unit]
Description=Growth Workspace: kéo nguồn MCP (Hook, chiến dịch, thị trường)

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/jobs/pull-sources.ts
EOF
cat > "$UNIT_DIR/growth-pull.timer" <<EOF
[Unit]
Description=Growth Workspace: kéo nguồn MCP 06:30 hằng ngày

[Timer]
OnCalendar=*-*-* 06:30:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
# CRON-07 bản Tạm (D-87): 02:00 thứ Hai tạo sẵn Storyboard cho Hook đề xuất của tuần (cần CREATIVE_SOURCE=mcp).
cat > "$UNIT_DIR/growth-harness.service" <<EOF
[Unit]
Description=Growth Workspace: vòng lặp Harness tuần (Storyboard cho Hook đề xuất)

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$BUN run src/jobs/harness-weekly.ts
EOF
cat > "$UNIT_DIR/growth-harness.timer" <<EOF
[Unit]
Description=Growth Workspace: Harness tuần 02:00 thứ Hai

[Timer]
OnCalendar=Mon *-*-* 02:00:00 Asia/Ho_Chi_Minh
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable growth-queue.service growth-daily.timer growth-sa01.timer growth-digest.timer growth-monthly.timer growth-pull.timer growth-harness.timer
systemctl --user restart growth-queue.service
systemctl --user start growth-daily.timer growth-sa01.timer growth-digest.timer growth-monthly.timer growth-pull.timer growth-harness.timer

# Biểu tượng "Hàng chờ Growth" trong danh sách ứng dụng và trên màn hình.
apps="$HOME/.local/share/applications"
install -d "$apps"
cat > "$apps/growth-queue.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Hàng chờ Growth
Comment=Mở Hàng chờ trên trình duyệt
Exec=xdg-open http://localhost:$PORT
Icon=x-office-calendar
Terminal=false
EOF
desk="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$desk" ]; then
  install -m 755 "$apps/growth-queue.desktop" "$desk/growth-queue.desktop"
  gio set "$desk/growth-queue.desktop" metadata::trusted true 2>/dev/null || true
fi

say "6/6 Kiểm tra"
for _ in $(seq 1 20); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  cat <<DONE

Growth Workspace đang chạy: http://localhost:$PORT  (hoặc bấm biểu tượng "Hàng chờ Growth")

Bước tiếp theo:
  1. Mở địa chỉ trên, đăng nhập bằng tài khoản amy hoặc mark (mật khẩu tạm in ở bước 4), đổi mật khẩu ngay.
  2. Thêm tài khoản, mỗi người một mã (in ra mật khẩu tạm, phải đổi trong 72 giờ):
       bash "$APP_DIR/deploy/local/run.sh" scripts/accounts.ts add-user mkt-01 mkt
  3. Thử nạp file mẫu ở trang "File CRM" (link "File mẫu" cạnh từng ô), hoặc nạp file xuất thật.
  4. Hướng dẫn cho từng vai trò: nút "Hướng dẫn" trên thanh điều hướng.
  5. Sao lưu tự động mỗi ngày vào $BACKUP_DIR. Khôi phục:
       systemctl --user stop growth-queue
       cd "$APP_DIR" && set -a && . "$ENV_FILE" && set +a && "$BUN" run scripts/restore-db.ts <file trong $BACKUP_DIR>
       systemctl --user start growth-queue
DONE
else
  echo "Hàng chờ chưa chạy. Xem lỗi bằng: journalctl --user -u growth-queue -n 50"
  exit 1
fi
