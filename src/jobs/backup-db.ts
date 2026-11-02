// Job backup hằng ngày (Q-13). Nền tảng host gọi trước etl-crm; sau đó công cụ của máy chủ
// (rclone, xem deploy/README.md) đẩy thư mục backup ra kho lưu trữ ngoài máy.
import { join } from "node:path";
import { getDbPath } from "../config.ts";
import { backupDb } from "../db/backup.ts";
import { openReadWrite } from "../db/open.ts";
import { log } from "../log.ts";

const dbPath = getDbPath();
const dir = process.env.GROWTH_BACKUP_DIR?.trim() || join(dbPath, "..", "backups");
const db = openReadWrite(dbPath);
try {
  backupDb(db, dir, new Date());
  log({ event: "backup.done" });
} catch (e) {
  log({ event: "backup.failed", error_code: e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : "BACKUP_FAILED" });
  process.exitCode = 1;
} finally {
  db.close();
}
