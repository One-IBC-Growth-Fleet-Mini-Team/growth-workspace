#!/usr/bin/env bash
# Kiểm máy chủ Growth Workspace từ bên ngoài (D-97). Mark chạy trên laptop sau khi cài máy thật:
#   bash verify-remote.sh <tên miền> <tài khoản thử> [--admin]
# Mật khẩu của tài khoản thử đọc từ biến VERIFY_PASSWORD hoặc gõ khi được hỏi (không hiện, không lưu).
# Tạo tài khoản thử ngay trước khi chạy: sudo growth-run add-user verify-01 bod; chạy xong: sudo growth-run disable-user verify-01.
# --admin: máy đang chạy nằm trong /etc/growth/admin-ips, nên cổng 22 được phép mở. Không có cờ này thì 22 phải đóng.
# Bước cuối cố ý gõ sai 5 lần để thấy tài khoản thử bị khoá 15 phút. Cần curl và python3.
set -uo pipefail
DOMAIN="${1:-}"; ACCOUNT="${2:-}"; ADMIN=0
[ "${3:-}" = "--admin" ] && ADMIN=1
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ && "$ACCOUNT" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || { echo "Cách dùng: bash verify-remote.sh <tên miền> <tài khoản thử> [--admin]"; exit 2; }
for t in curl python3; do command -v "$t" >/dev/null || { echo "Cần cài $t."; exit 2; }; done
# Tên miền phải phân giải được: nếu không, mọi kết nối đều hỏng và kiểm cổng sẽ báo "đóng" sai.
python3 -c 'import socket,sys; socket.getaddrinfo(sys.argv[1], 443)' "$DOMAIN" 2>/dev/null || { echo "Không phân giải được $DOMAIN. Kiểm bản ghi DNS (deploy/README.md bước 2)."; exit 2; }
PW="${VERIFY_PASSWORD:-}"
[ -n "$PW" ] || { read -rsp "Mật khẩu của $ACCOUNT: " PW; echo; }
BASE="https://$DOMAIN"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
rows=(); bad=0
row() { rows+=("$1|$2|$3"); [ "$2" = "Đạt" ] || bad=1; }
port_open() { python3 -c 'import socket,sys; s=socket.socket(); s.settimeout(5); sys.exit(0 if s.connect_ex((socket.gethostbyname(sys.argv[1]), int(sys.argv[2])))==0 else 1)' "$DOMAIN" "$1" 2>/dev/null; }
login() { curl -sS -o "$TMP/body" -D "$TMP/head" -w '%{http_code}' --max-time 20 -X POST "$BASE/login" \
  -H "Origin: $BASE" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "user=$ACCOUNT" --data-urlencode "password=$1"; }
header() { grep -i "^$1:" "$TMP/head" | head -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

# 1. HTTPS hợp lệ (curl kiểm chứng chỉ, không có -k).
if [ "$(curl -sS --max-time 20 "$BASE/health" 2>"$TMP/err")" = "ok" ]; then row "HTTPS hợp lệ" "Đạt" "chứng chỉ được tin, /health trả ok"
else row "HTTPS hợp lệ" "Lỗi" "$(head -c 120 "$TMP/err")"; fi

# 2. HTTP chuyển sang HTTPS.
code="$(curl -sS -o /dev/null -D "$TMP/head" -w '%{http_code}' --max-time 20 "http://$DOMAIN/login" 2>/dev/null)"
loc="$(header location)"
if [[ "$code" =~ ^30[178]$ && "$loc" == https://* ]]; then row "HTTP chuyển HTTPS" "Đạt" "$code tới $loc"
else row "HTTP chuyển HTTPS" "Lỗi" "mã $code, Location: ${loc:-không có}"; fi

# 3. Cổng 3000 không mở; cổng 22 chỉ mở khi máy này trong admin-ips.
if port_open 3000; then row "Cổng 3000 đóng" "Lỗi" "mở từ ngoài"; else row "Cổng 3000 đóng" "Đạt" "không kết nối được"; fi
if port_open 22; then
  if [ "$ADMIN" -eq 1 ]; then row "Cổng 22" "Đạt" "mở cho máy này (trong admin-ips)"; else row "Cổng 22 đóng" "Lỗi" "mở từ máy không khai là admin"; fi
else
  if [ "$ADMIN" -eq 1 ]; then row "Cổng 22" "Lỗi" "đóng dù khai --admin; kiểm admin-ips"; else row "Cổng 22 đóng" "Đạt" "không kết nối được"; fi
fi

# 4. Header bảo mật.
curl -sS -o /dev/null -D "$TMP/head" --max-time 20 "$BASE/login" 2>/dev/null
miss=()
[[ "$(header strict-transport-security)" == *max-age=* ]] || miss+=("Strict-Transport-Security")
[ "$(header x-content-type-options)" = "nosniff" ] || miss+=("X-Content-Type-Options")
[ "$(header x-frame-options)" = "DENY" ] || miss+=("X-Frame-Options")
[ "$(header referrer-policy)" = "same-origin" ] || miss+=("Referrer-Policy")
[[ "$(header content-security-policy)" == *"frame-ancestors 'none'"* ]] || miss+=("Content-Security-Policy")
if [ "${#miss[@]}" -eq 0 ]; then row "Header bảo mật" "Đạt" "HSTS, nosniff, DENY, same-origin, CSP"; else row "Header bảo mật" "Lỗi" "thiếu: ${miss[*]}"; fi

# 5. /command/data.json không vào được khi chưa đăng nhập.
code="$(curl -sS -o "$TMP/body" -w '%{http_code}' --max-time 20 "$BASE/command/data.json" 2>/dev/null)"
if [ "$code" != "200" ] && ! grep -q '"crew"' "$TMP/body"; then row "API khi chưa đăng nhập" "Đạt" "mã $code, không có dữ liệu"
else row "API khi chưa đăng nhập" "Lỗi" "mã $code"; fi

# 6. Cookie phiên có Secure, HttpOnly, SameSite=Strict (đăng nhập đúng một lần).
code="$(login "$PW")"
ck="$(grep -i '^set-cookie: *gw_session=' "$TMP/head" | head -n 1)"
if [ "$code" = "303" ] && [[ "$ck" == *Secure* && "$ck" == *HttpOnly* && "$ck" == *SameSite=Strict* ]]; then row "Cookie phiên" "Đạt" "Secure, HttpOnly, SameSite=Strict"
elif [ "$code" = "303" ]; then row "Cookie phiên" "Lỗi" "thiếu cờ trong Set-Cookie"
else row "Cookie phiên" "Lỗi" "đăng nhập bằng $ACCOUNT không được (mã $code); kiểm mật khẩu hoặc tài khoản đã hết hạn"; fi

# 7. Sai 5 lần thì bị khoá, kể cả lần sau gõ đúng.
for _ in 1 2 3 4 5; do login "sai-co-y-$RANDOM-$RANDOM" >/dev/null; done
code="$(login "$PW")"
if [ "$code" = "429" ]; then row "Khoá sau 5 lần sai" "Đạt" "lần thứ 6 (đúng mật khẩu) nhận 429"
else row "Khoá sau 5 lần sai" "Lỗi" "lần thứ 6 nhận mã $code"; fi

# Bảng dạng | cột |: chữ có dấu làm lệch cột khi căn bằng printf.
echo; echo "| Kiểm tra | Kết quả | Chi tiết |"; echo "|---|---|---|"
for r in "${rows[@]}"; do IFS='|' read -r a b c <<<"$r"; echo "| $a | $b | $c |"; done
echo
[ "$bad" -eq 0 ] && echo "Tất cả đạt. Khoá tài khoản thử: sudo growth-run disable-user $ACCOUNT" || echo "Còn mục lỗi; xem deploy/README.md bước 5 tới 8 và chạy lại sau khi sửa."
exit "$bad"
