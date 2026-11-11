#!/usr/bin/env bash
# Dựng hoặc cập nhật Growth Workspace trên một máy Ubuntu 24.04 (Azure, Oracle hay máy khác), không dùng Docker (D-23, D-97).
# Chạy bằng root, chạy lại được nhiều lần: lần đầu tạo file cấu hình rồi dừng để người vận hành điền;
# các lần sau khoá cổng, kéo đúng phiên bản, cài thư viện, nâng schema DB, cài lại dịch vụ và lịch job, chạy preflight.
#   sudo REPO_REF=<tag phát hành> bash setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/One-IBC-Growth-Fleet-Mini-Team/growth-workspace.git}"
REPO_REF="${REPO_REF:-}"
BUN_VERSION="1.4.4" # khớp D-01 và CI
APP_DIR=/opt/growth-workspace
ENV_DIR=/etc/growth
DATA_DIR=/srv/growth
BUN=/opt/bun/bin/bun
IP_RE='^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$'

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nDỪNG: %s\n' "$*" >&2; exit 2; }
as_app() { runuser -u growth -- env HOME="$DATA_DIR/home" "$@"; }
# Danh sách IP hoặc dải trong file (mỗi dòng một mục, bỏ dòng trống và chú thích #).
# Kiểm đúng dạng IP hoặc dải bằng thư viện chuẩn, trước khi đụng tường lửa: mục sai mà lọt tới ufw thì ufw đã bị reset.
valid_ip() { python3 -c 'import ipaddress,sys; ipaddress.ip_network(sys.argv[1], strict=False)' "$1" 2>/dev/null; }
ip_list() { sed -e 's/#.*//' -e 's/[[:space:]]//g' "$1" | grep -v '^$' || true; }

[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng root: sudo REPO_REF=<tag> bash setup.sh"; exit 1; }
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || echo "Cảnh báo: bộ này thử trên Ubuntu 24.04; máy đang là ${PRETTY_NAME:-không rõ}."
# Ghim phiên bản (D-97): tag phát hành hoặc mã commit; không chạy theo nhánh đang đổi.
[ -n "$REPO_REF" ] || die "Chưa chọn phiên bản. Chạy: sudo REPO_REF=<tag phát hành, ví dụ v1.0.0> bash setup.sh (deploy/README.md bước 3)."
[[ "$REPO_REF" =~ ^[A-Za-z0-9._/-]+$ ]] || die "REPO_REF sai dạng."
[ "$REPO_REF" != "main" ] || echo "Cảnh báo: REPO_REF=main là nhánh đang đổi, chỉ dùng để thử. Máy thật dùng tag phát hành."

say "1/10 Cài gói hệ thống: git, Caddy (HTTPS), rclone (backup), tường lửa, fail2ban, cập nhật bảo mật tự động"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl unzip caddy rclone ufw fail2ban unattended-upgrades python3
systemctl enable --now unattended-upgrades

say "2/10 Cài Bun $BUN_VERSION vào /opt/bun"
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

say "3/10 Người dùng hệ thống 'growth' và thư mục dữ liệu $DATA_DIR"
id growth >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR/home" --shell /usr/sbin/nologin growth
install -d -m 750 -o growth -g growth "$DATA_DIR" "$DATA_DIR/data" "$DATA_DIR/home"

say "4/10 Lấy mã nguồn đúng phiên bản $REPO_REF và cài thư viện"
[ -d "$APP_DIR/.git" ] || git clone -q --no-checkout "$REPO_URL" "$APP_DIR"
git -C "$APP_DIR" fetch -q --tags --force origin
# Tag, commit hoặc (chỉ để thử) tên nhánh trên origin; luôn tách khỏi nhánh để đúng bản đã chọn.
if git -C "$APP_DIR" rev-parse -q --verify "refs/remotes/origin/$REPO_REF^{commit}" >/dev/null; then ref="origin/$REPO_REF"; else ref="$REPO_REF"; fi
git -C "$APP_DIR" rev-parse -q --verify "$ref^{commit}" >/dev/null || die "Không thấy phiên bản $REPO_REF trên repo."
git -C "$APP_DIR" checkout -q --force --detach "$ref"
echo "Phiên bản: $(git -C "$APP_DIR" describe --tags --always)"
(cd "$APP_DIR" && "$BUN" install --frozen-lockfile --production)

say "5/10 File cấu hình trong $ENV_DIR (chỉ root đọc được)"
install -d -m 700 "$ENV_DIR"
need_fill=0
if [ ! -f "$ENV_DIR/caddy.env" ]; then
  printf '# Tên miền (không có https://), email nhận thông báo chứng chỉ.\nQUEUE_DOMAIN=\nACME_EMAIL=\n# Tuỳ chọn: chỉ các IP hoặc dải này vào được web (cách nhau bằng dấu cách). Trống là mở cho mọi IP.\nALLOW_IPS=\n' > "$ENV_DIR/caddy.env"
  chmod 600 "$ENV_DIR/caddy.env"
  need_fill=1
fi
if [ ! -f "$ENV_DIR/admin-ips" ]; then
  printf '# IP hoặc dải được SSH vào máy (cổng 22), mỗi dòng một mục, ví dụ 192.0.2.10 hoặc 192.0.2.0/24.\n# File trống thì setup dừng: không bao giờ mở cổng 22 cho mọi nơi.\n' > "$ENV_DIR/admin-ips"
  chmod 600 "$ENV_DIR/admin-ips"
  need_fill=1
fi
if [ ! -f "$ENV_DIR/growth.env" ]; then
  install -m 600 "$APP_DIR/.env.example" "$ENV_DIR/growth.env"
  need_fill=1
fi
if [ "$need_fill" -eq 1 ]; then
  echo "Đã tạo $ENV_DIR/growth.env, $ENV_DIR/caddy.env và $ENV_DIR/admin-ips. Điền giá trị (deploy/README.md bước 4) rồi chạy lại cùng lệnh."
  exit 2
fi
val() { sed -n "s/^$1=//p" "$ENV_DIR/caddy.env" | tail -n 1; }
QUEUE_DOMAIN="$(val QUEUE_DOMAIN)"
ACME_EMAIL="$(val ACME_EMAIL)"
ALLOW_IPS="$(val ALLOW_IPS)"
[[ "$QUEUE_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "QUEUE_DOMAIN trong $ENV_DIR/caddy.env chưa điền hoặc sai dạng."
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || die "ACME_EMAIL trong $ENV_DIR/caddy.env chưa điền hoặc sai dạng."
for ip in $ALLOW_IPS; do [[ "$ip" =~ $IP_RE ]] && valid_ip "$ip" || die "ALLOW_IPS có mục sai dạng: $ip"; done
ADMIN_IPS="$(ip_list "$ENV_DIR/admin-ips")"
[ -n "$ADMIN_IPS" ] || die "$ENV_DIR/admin-ips trống. Điền IP của người quản trị (mỗi dòng một IP) rồi chạy lại. Cổng 22 không mở cho mọi nơi."
for ip in $ADMIN_IPS; do [[ "$ip" =~ $IP_RE ]] && valid_ip "$ip" || die "admin-ips có mục sai dạng: $ip"; done
# Mọi người đang SSH vào phải nằm trong admin-ips, nếu không bật tường lửa xong là tự khoá mình ra ngoài. Đọc từ các kết nối
# đang mở tới cổng 22 (sudo bỏ biến SSH_CLIENT); chạy ở serial console thì không có kết nối nào, bỏ qua.
for client_ip in $(ss -Htn state established '( sport = :22 )' 2>/dev/null | awk '{print $4}' | sed -e 's/:[0-9]*$//' -e 's/^\[//' -e 's/\]$//' -e 's/^::ffff://' | sort -u); do
  python3 - "$client_ip" $ADMIN_IPS <<'PY' || die "Có phiên SSH từ $client_ip, IP này không có trong $ENV_DIR/admin-ips. Thêm vào rồi chạy lại, để không tự khoá mình ra ngoài."
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
sys.exit(0 if any(ip in ipaddress.ip_network(n, strict=False) for n in sys.argv[2:]) else 1)
PY
done

say "6/10 SSH chỉ dùng khoá, không đăng nhập root"
admin="${SUDO_USER:-}"
[ -n "$admin" ] && [ "$admin" != "root" ] || die "Chạy setup bằng sudo từ tài khoản quản trị (không phải root) để kiểm khoá SSH của tài khoản đó."
admin_home="$(getent passwd "$admin" | cut -d: -f6)"
# Dòng khoá có thể có tuỳ chọn đứng trước (from="...", restrict...): tìm loại khoá ở bất kỳ vị trí nào.
grep -qE '(^|[[:space:],])(ssh-[a-z0-9]+|ecdsa-sha2-[a-z0-9]+|sk-[a-z0-9@.-]+) AAAA' "$admin_home/.ssh/authorized_keys" 2>/dev/null \
  || die "Tài khoản $admin chưa có khoá SSH trong $admin_home/.ssh/authorized_keys. Thêm khoá trước khi tắt đăng nhập bằng mật khẩu."
cat > /etc/ssh/sshd_config.d/10-growth.conf <<'EOF'
# Tạo bởi deploy/setup.sh (D-97): chỉ đăng nhập bằng khoá, không root.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t || die "Cấu hình SSH lỗi; chưa áp dụng. Xem: sshd -t"
systemctl reload ssh 2>/dev/null || systemctl reload sshd

say "7/10 Tường lửa: chặn vào, cho ra; mở 80, 443; cổng 22 chỉ cho admin-ips; không bao giờ mở 3000"
# Dựng lại từ đầu mỗi lần để danh sách luôn khớp file (bỏ IP đã xoá khỏi admin-ips).
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
for ip in $ADMIN_IPS; do ufw allow from "$ip" to any port 22 proto tcp >/dev/null; done
ufw --force enable >/dev/null
ufw status verbose
cat > /etc/fail2ban/jail.d/growth-sshd.conf <<'EOF'
# Tạo bởi deploy/setup.sh (D-97): chặn IP dò SSH.
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

say "8/10 Nâng schema Growth DB"
as_app bash -c "set -a; . '$APP_DIR/deploy/paths.env'; cd '$APP_DIR' && '$BUN' run src/db/migrate.ts"

say "9/10 Dịch vụ, lịch job (giờ Việt Nam) và HTTPS"
install -m 644 "$APP_DIR"/deploy/systemd/growth-* /etc/systemd/system/
install -m 755 "$APP_DIR/deploy/growth-run" /usr/local/bin/growth-run
install -m 755 "$APP_DIR/deploy/offsite-backup.sh" /usr/local/sbin/growth-offsite-backup
systemctl daemon-reload
systemctl enable growth-queue.service
systemctl restart growth-queue.service
systemctl enable --now growth-backup-db.timer growth-offsite-backup.timer growth-etl-crm.timer \
  growth-prune-snapshots.timer growth-sa01-morning.timer
# ALLOW_IPS có giá trị thì chỉ các IP đó vào được web, IP khác nhận 403 (D-97).
allow_block=""
[ -z "$ALLOW_IPS" ] || allow_block="@not_allowed not remote_ip $ALLOW_IPS\n\trespond @not_allowed \"Không được phép\" 403"
sed -e "s/__QUEUE_DOMAIN__/$QUEUE_DOMAIN/" -e "s/__ACME_EMAIL__/$ACME_EMAIL/" -e "s#__ALLOW_IPS_BLOCK__#$allow_block#" \
  "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null || die "Caddyfile tạo ra bị lỗi; xem: caddy validate --config /etc/caddy/Caddyfile.new"
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload-or-restart caddy
systemctl list-timers 'growth-*' --no-pager

say "10/10 Kiểm tra"
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS http://127.0.0.1:3000/health >/dev/null; then echo "Hàng chờ đang chạy."; else echo "Hàng chờ chưa chạy; xem: journalctl -u growth-queue -n 50"; fi
if systemctl start growth-job@preflight.service; then
  echo "Preflight xanh."
else
  echo "Preflight còn mục chưa đạt (xem: journalctl -u growth-job@preflight -n 30). Bình thường khi chưa có nguồn thật."
fi
echo "Mở https://$QUEUE_DOMAIN/health trên trình duyệt; thấy chữ ok là xong. Rồi chạy deploy/verify-remote.sh từ laptop."
