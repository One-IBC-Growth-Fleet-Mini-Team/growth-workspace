#!/usr/bin/env bash
# Dựng hoặc cập nhật Growth Workspace trên một máy Ubuntu 22.04 hoặc 24.04 (Azure, Oracle hay máy khác).
# Chạy bằng root, chạy lại được nhiều lần: lần đầu tạo file cấu hình rồi dừng để người vận hành điền;
# các lần sau kéo code mới, build lại, nâng schema DB, cài lại lịch job, chạy preflight.
#   sudo bash setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace.git}"
REPO_REF="${REPO_REF:-main}"
APP_DIR=/opt/growth-workspace
ENV_DIR=/etc/growth
DATA_DIR=/srv/growth
COMPOSE=(docker compose -f "$APP_DIR/deploy/docker-compose.yml")
APP_UID=1000 # người dùng "bun" trong image oven/bun

say() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng root: sudo bash setup.sh"; exit 1; }

say "1/7 Cài gói: Docker, Compose, git, rclone, cập nhật bảo mật tự động"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 git rclone unattended-upgrades
systemctl enable --now docker unattended-upgrades

say "2/7 Lấy mã nguồn ($REPO_REF)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$REPO_REF"
  git -C "$APP_DIR" checkout -q "$REPO_REF"
  git -C "$APP_DIR" merge -q --ff-only "origin/$REPO_REF"
else
  git clone -q --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
fi

say "3/7 File cấu hình trong $ENV_DIR (chỉ root đọc được)"
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
  echo "Đã tạo $ENV_DIR/growth.env và $ENV_DIR/caddy.env. Điền giá trị (xem deploy/README.md mục 3) rồi chạy lại setup.sh."
  exit 2
fi
grep -q '^QUEUE_DOMAIN=.\+' "$ENV_DIR/caddy.env" || { echo "Chưa điền QUEUE_DOMAIN trong $ENV_DIR/caddy.env"; exit 2; }

say "4/7 Thư mục dữ liệu trên ổ bền: $DATA_DIR"
install -d -m 700 -o "$APP_UID" -g "$APP_UID" "$DATA_DIR/data"
install -d -m 700 "$DATA_DIR/caddy"

say "5/7 Build image và chạy"
"${COMPOSE[@]}" up -d --build --wait

say "6/7 Nâng schema Growth DB"
"${COMPOSE[@]}" exec -T growth bun run src/db/migrate.ts

say "7/7 Lịch job (systemd timer, giờ Việt Nam)"
install -m 644 "$APP_DIR"/deploy/systemd/growth-* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now growth-backup-db.timer growth-offsite-backup.timer growth-etl-crm.timer \
  growth-prune-snapshots.timer growth-sa01-morning.timer
systemctl list-timers 'growth-*' --no-pager

say "Preflight (chỉ đọc, không gọi mạng)"
if "${COMPOSE[@]}" exec -T growth bun run src/jobs/preflight.ts; then
  echo "Preflight xanh."
else
  echo "Preflight còn mục chưa đạt (xem log ở trên). Đây là bình thường trước khi có nguồn thật; xem docs/runbook/lat-cat-01.md mục 2."
fi
