#!/usr/bin/env bash
# Đẩy thư mục backup ra kho ngoài máy (D-97): bắt buộc mã hoá phía máy bằng remote rclone loại crypt tên growth-backup.
# Thiếu file cấu hình, thiếu remote, hay remote không phải crypt thì báo lỗi (timer đỏ) và KHÔNG đẩy gì đi.
# copy không bao giờ xoá trên kho; sau đó chỉ xoá bản cũ hơn 15 ngày, khớp thời hạn giữ 14 bản (D-09, D-12).
set -euo pipefail
CONF=/etc/growth/rclone.conf
SRC=/srv/growth/data/backups
fail() { echo "growth-offsite-backup: $*" >&2; exit 1; }
[ -f "$CONF" ] || fail "chưa có $CONF; làm deploy/README.md bước 7 (rclone crypt)."
rc() { rclone --config "$CONF" "$@"; }
type="$(rc config show growth-backup 2>/dev/null | sed -n 's/^type *= *//p')"
[ "$type" = "crypt" ] || fail "remote growth-backup phải là loại crypt (đang: ${type:-không có}); không đẩy bản rõ."
inner="$(rc config show growth-backup | sed -n 's/^remote *= *//p')"
[ -n "$inner" ] || fail "remote crypt growth-backup chưa trỏ tới kho nào."
rc config show growth-backup | grep -q '^password *= *.\+' || fail "remote crypt growth-backup chưa có mật khẩu mã hoá."
rc copy "$SRC" growth-backup:
rc delete --min-age 15d growth-backup:
echo "growth-offsite-backup: đã đẩy bản mã hoá ra $inner"
