// Backup Growth DB (Q-13): VACUUM INTO tạo một bản SQLite nhất quán khi DB đang chạy (kể cả chế độ WAL),
// rồi chỉ giữ `keep` bản gần nhất. Bản backup có cùng nội dung với DB (đã ẩn danh, mã băm), nên phải nằm
// trên ổ mã hoá và đẩy ra ngoài máy bằng kênh mã hoá (xem deploy/README.md). Giữ 14 bản cho khớp D-09:
// nội dung đã xoá có kiểm soát (D-12) tự biến khỏi backup sau tối đa 14 ngày.
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const BACKUP_KEEP = 14;
const NAME_RE = /^growth-\d{4}-\d{2}-\d{2}T\d{6}Z\.sqlite$/;

export function backupDb(db: Database, dir: string, now: Date, keep = BACKUP_KEEP): string {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, "");
  const file = join(dir, `growth-${stamp}Z.sqlite`);
  if (existsSync(file)) throw new Error("BACKUP_EXISTS");
  db.run("VACUUM INTO ?", [file]);
  const all = readdirSync(dir).filter((f) => NAME_RE.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old));
  return file;
}
