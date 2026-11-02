#!/usr/bin/env bash
# Chạy một lệnh của Growth Workspace với cấu hình của máy này (D-26), ví dụ nạp danh bạ RM:
#   bash deploy/local/run.sh scripts/load-rm-directory.ts ~/rm-directory.json
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$HOME/.config/growth/growth.env"
[ -f "$ENV_FILE" ] || { echo "Chưa cài. Chạy trước: bash deploy/local/install.sh"; exit 1; }
set -a; . "$ENV_FILE"; set +a
cd "$APP_DIR" && exec "$HOME/.local/share/growth/bun/bin/bun" run "$@"
