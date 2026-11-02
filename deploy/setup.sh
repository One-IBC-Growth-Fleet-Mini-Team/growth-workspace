#!/usr/bin/env bash
# Dựng hoặc cập nhật Growth Workspace trên một máy Ubuntu 24.04 (Azure, Oracle hay máy khác), không dùng Docker (D-23).
# Chạy bằng root, chạy lại được nhiều lần: lần đầu tạo file cấu hình rồi dừng để người vận hành điền;
# các lần sau kéo code mới, cài thư viện, nâng schema DB, cài lại dịch vụ và lịch job, chạy preflight.
#   sudo bash setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace.git}"
REPO_REF="${REPO_REF:-main}"
BUN_VERSION="1.4.4" # khớp D-01 và CI
APP_DIR=/opt/growth-workspace
ENV_DIR=/etc/growth
DATA_DIR=/srv/growth
BUN=/opt/bun/bin/bun

say() { printf '\n== %s\n' "$*"; }
as_app() { runuser -u growth -- env HOME="$DATA_DIR/home" "$@"; }

[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng root: sudo bash setup.sh"; exit 1; }
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || echo "Cảnh báo: bộ này thử trên Ubuntu 24.04; máy đang là ${PRETTY_NAME:-không rõ}."

say "1/8 Cài gói hệ thống: git, Caddy (HTTPS), rclone (backup), cập nhật bảo mật tự động"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl unzip caddy rclone unattended-upgrades
systemctl enable --now unattended-upgrades

say "2/8 Cài Bun $BUN_VERSION vào /opt/bun"
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
  install -d /opt/bun/bin
  install -m 755 "$tmp/$BUN_ASSET/bun" "$BUN"
  rm -rf "$tmp"
fi
"$BUN" --version

say "3/8 Người dùng hệ thống 'growth' và thư mục dữ liệu $DATA_DIR"
id growth >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR/home" --shell /usr/sbin/nologin growth
install -d -m 750 -o growth -g growth "$DATA_DIR" "$DATA_DIR/data" "$DATA_DIR/home"

say "4/8 Lấy mã nguồn ($REPO_REF) và cài thư viện"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$REPO_REF"
  git -C "$APP_DIR" checkout -q "$REPO_REF"
  git -C "$APP_DIR" merge -q --ff-only "origin/$REPO_REF"
else
  git clone -q --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
fi
(cd "$APP_DIR" && "$BUN" install --frozen-lockfile --production)

say "5/8 File cấu hình trong $ENV_DIR (chỉ root đọc được)"
install -d -m 700 "$ENV_DIR"
need_fill=0
if [ ! -f "$ENV_DIR/growth.env" ]; then
  install -m 600 "$APP_DIR/.env.example" "$ENV_DIR/growth.env"
  need_fill=1
fi
if [ ! -f "$ENV_DIR/caddy.env" ]; then
  printf 'QUEUE_DOMAIN=\nACME_EMAIL=\n' > "$ENV_DIR/caddy.env"
  chmod 600 "$ENV_DIR/caddy.env"
  need_fill=1
fi
if [ "$need_fill" -eq 1 ]; then
  echo "Đã tạo $ENV_DIR/growth.env và $ENV_DIR/caddy.env. Điền giá trị (deploy/README.md bước 4) rồi chạy lại: sudo bash setup.sh"
  exit 2
fi
QUEUE_DOMAIN="$(sed -n 's/^QUEUE_DOMAIN=//p' "$ENV_DIR/caddy.env")"
ACME_EMAIL="$(sed -n 's/^ACME_EMAIL=//p' "$ENV_DIR/caddy.env")"
[[ "$QUEUE_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "QUEUE_DOMAIN trong $ENV_DIR/caddy.env chưa điền hoặc sai dạng"; exit 2; }
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || { echo "ACME_EMAIL trong $ENV_DIR/caddy.env chưa điền hoặc sai dạng"; exit 2; }

say "6/8 Nâng schema Growth DB"
as_app bash -c "set -a; . '$APP_DIR/deploy/paths.env'; cd '$APP_DIR' && '$BUN' run src/db/migrate.ts"

say "7/8 Dịch vụ, lịch job (giờ Việt Nam) và HTTPS"
install -m 644 "$APP_DIR"/deploy/systemd/growth-* /etc/systemd/system/
install -m 755 "$APP_DIR/deploy/growth-run" /usr/local/bin/growth-run
systemctl daemon-reload
systemctl enable growth-queue.service
systemctl restart growth-queue.service
systemctl enable --now growth-backup-db.timer growth-offsite-backup.timer growth-etl-crm.timer \
  growth-prune-snapshots.timer growth-sa01-morning.timer
sed -e "s/__QUEUE_DOMAIN__/$QUEUE_DOMAIN/" -e "s/__ACME_EMAIL__/$ACME_EMAIL/" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload-or-restart caddy
systemctl list-timers 'growth-*' --no-pager

say "8/8 Kiểm tra"
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS http://127.0.0.1:3000/health >/dev/null; then echo "Hàng chờ đang chạy."; else echo "Hàng chờ chưa chạy; xem: journalctl -u growth-queue -n 50"; fi
if systemctl start growth-job@preflight.service; then
  echo "Preflight xanh."
else
  echo "Preflight còn mục chưa đạt (xem: journalctl -u growth-job@preflight -n 30). Bình thường khi chưa có nguồn thật."
fi
echo "Mở https://$QUEUE_DOMAIN/health trên trình duyệt; thấy chữ ok là xong."
