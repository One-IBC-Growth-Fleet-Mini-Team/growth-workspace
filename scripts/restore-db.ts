// Khôi phục Growth DB từ bản sao lưu (D-79): bun run scripts/restore-db.ts <file sao lưu .sqlite>
// Dừng dịch vụ trước: systemctl --user stop growth-queue. Lệnh kiểm toàn vẹn bản sao lưu, giữ DB hiện tại thành
// <db>.before-restore-<thời điểm>, rồi chép bản sao lưu vào chỗ DB. Chạy xong: systemctl --user start growth-queue.
import { getDbPath } from "../src/config.ts";
import { restoreDb } from "../src/db/backup.ts";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Cách dùng: bun run scripts/restore-db.ts <file sao lưu .sqlite>\n");
  process.exit(2);
}
const r = restoreDb(file, getDbPath(), new Date());
process.stdout.write(`Đã khôi phục từ ${file}.\nBản DB trước khi khôi phục giữ ở ${r.previous ?? "(chưa có DB)"}.\nBật lại: systemctl --user start growth-queue\n`);
