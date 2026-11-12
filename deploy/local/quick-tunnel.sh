#!/usr/bin/env bash
# Truy cập từ xa bằng Cloudflare Quick Tunnel có khoá email (D-98), chạy trên máy của Mark, không cần máy chủ hay tài
# khoản Cloudflare. Chạy lại được nhiều lần (cũng là cách cập nhật cloudflared và áp danh sách email mới):
#   bash deploy/local/quick-tunnel.sh
# - Cài cloudflared bản mới nhất vào ~/.local/share/growth/bin, kiểm SHA-256 theo GitHub trước khi dùng.
# - Đọc email được phép từ ~/.config/growth/tunnel-emails.txt (mỗi dòng một email). Cloudflare gửi mã PIN tới email đó;
#   ai không có trong danh sách thì không tới được trang đăng nhập Growth.
# - Dịch vụ systemd của user: growth-tunnel (tự chạy lại, tự bật khi máy khởi động) và growth-tunnel-url (mỗi phút ghi
#   link mới vào Growth DB để /settings và Brief sáng hiện).
# Lưu ý: Quick Tunnel không có cam kết thời gian chạy; mỗi lần khởi động lại là một link mới.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF="$HOME/.config/growth"
ENV_FILE="$CONF/growth.env"
EMAILS="$CONF/tunnel-emails.txt"
BIN_DIR="$HOME/.local/share/growth/bin"
CFD="$BIN_DIR/cloudflared"
UNIT_DIR="$HOME/.config/systemd/user"
METRICS="127.0.0.1:20241"
MIN_VERSION="2026.9.2" # bản đầu có --allowed-mail

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nDỪNG: %s\n' "$*" >&2; exit 2; }

[ -f "$ENV_FILE" ] || die "Chưa cài Growth Workspace trên máy này. Chạy trước: bash deploy/local/install.sh"
PORT="$(sed -n "s/^PORT='\{0,1\}\([0-9]*\)'\{0,1\}$/\1/p" "$ENV_FILE" | tail -n 1)"
PORT="${PORT:-3000}"

say "1/4 Danh sách email được phép"
install -d -m 700 "$CONF"
if [ ! -f "$EMAILS" ]; then
  printf '# Mỗi dòng một email được mở link truy cập từ xa (Cloudflare gửi mã PIN tới email này).\n# Sửa xong chạy lại: bash deploy/local/quick-tunnel.sh\n' > "$EMAILS"
  chmod 600 "$EMAILS"
fi
mails="$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$EMAILS" | grep -v '^$' || true)"
[ -n "$mails" ] || die "$EMAILS chưa có email nào. Thêm mỗi dòng một email rồi chạy lại. Không mở tunnel cho mọi người."
while IFS= read -r m; do
  [[ "$m" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "Dòng không phải email hợp lệ trong $EMAILS: $m"
done <<<"$mails"
echo "$(wc -l <<<"$mails" | tr -d ' ') email được phép."

say "2/4 Cài cloudflared bản mới nhất, kiểm SHA-256"
case "$(uname -m)" in
  x86_64) asset=cloudflared-linux-amd64 ;;
  aarch64) asset=cloudflared-linux-arm64 ;;
  *) die "Kiến trúc máy không hỗ trợ: $(uname -m)" ;;
esac
# Hỏi GitHub bản phát hành mới nhất và mã băm SHA-256 của đúng file; không có mã băm thì không cài.
rel="$(curl -fsSL https://api.github.com/repos/cloudflare/cloudflared/releases/latest)" || die "Không hỏi được GitHub về bản cloudflared mới nhất."
read -r tag url digest < <(printf '%s' "$rel" | python3 -c '
import json, sys
d = json.load(sys.stdin); a = [x for x in d["assets"] if x["name"] == sys.argv[1]]
print(d["tag_name"], a[0]["browser_download_url"] if a else "-", (a[0].get("digest") or "-") if a else "-")' "$asset")
[[ "$digest" == sha256:* ]] || die "GitHub không trả mã SHA-256 cho $asset bản $tag; không cài file chưa kiểm được."
have="$("$CFD" --version 2>/dev/null | awk '{print $3}' || true)"
if [ "$have" != "$tag" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/cloudflared" "$url"
  echo "${digest#sha256:}  $tmp/cloudflared" | sha256sum -c - >/dev/null || { rm -rf "$tmp"; die "SHA-256 của cloudflared tải về không khớp; không cài."; }
  install -d "$BIN_DIR"
  install -m 755 "$tmp/cloudflared" "$CFD"
  rm -rf "$tmp"
fi
ver="$("$CFD" --version | awk '{print $3}')"
[ "$(printf '%s\n%s\n' "$MIN_VERSION" "$ver" | sort -V | head -n 1)" = "$MIN_VERSION" ] || die "cloudflared $ver chưa có --allowed-mail (cần từ $MIN_VERSION)."
echo "cloudflared $ver"

say "3/4 Dịch vụ chạy nền: growth-tunnel, growth-tunnel-url"
install -d "$UNIT_DIR"
allowed="$(paste -sd, <<<"$mails")"
cat > "$UNIT_DIR/growth-tunnel.service" <<EOF
# Tạo bởi deploy/local/quick-tunnel.sh (D-98). Danh sách email lấy từ $EMAILS lúc chạy script; sửa file thì chạy lại script.
[Unit]
Description=Growth Workspace: Quick Tunnel có khoá email tới http://127.0.0.1:$PORT
After=network-online.target growth-queue.service

[Service]
ExecStart=$CFD tunnel --no-autoupdate --url http://127.0.0.1:$PORT --metrics $METRICS --allowed-mail $allowed
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
chmod 600 "$UNIT_DIR/growth-tunnel.service"
cat > "$UNIT_DIR/growth-tunnel-url.service" <<EOF
[Unit]
Description=Growth Workspace: ghi link Quick Tunnel mới vào Growth DB

[Service]
Type=oneshot
Environment=TUNNEL_METRICS=$METRICS
ExecStart=/bin/bash $APP_DIR/deploy/local/run.sh scripts/tunnel-url.ts
EOF
cat > "$UNIT_DIR/growth-tunnel-url.timer" <<'EOF'
[Unit]
Description=Growth Workspace: kiểm link Quick Tunnel mỗi phút

[Timer]
OnBootSec=30
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable growth-tunnel.service growth-tunnel-url.timer >/dev/null
systemctl --user restart growth-tunnel.service
systemctl --user start growth-tunnel-url.timer
# Tự chạy khi máy khởi động, kể cả khi chưa ai đăng nhập vào máy.
me="$(id -un)"
loginctl enable-linger "$me" 2>/dev/null || echo "Chưa bật được linger: tunnel chỉ chạy khi bạn đã đăng nhập vào máy. Bật bằng: sudo loginctl enable-linger $me"

say "4/4 Link truy cập"
for _ in $(seq 1 30); do
  if bash "$APP_DIR/deploy/local/run.sh" scripts/tunnel-url.ts 2>/dev/null; then
    echo "Gửi link này cho người dùng; họ nhập email trong danh sách để nhận mã PIN, rồi đăng nhập bằng tài khoản Growth."
    exit 0
  fi
  sleep 2
done
die "Tunnel chưa lên sau 60 giây. Xem lỗi: journalctl --user -u growth-tunnel -n 50"
