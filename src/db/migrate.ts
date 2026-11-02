// Áp các file migrations/NNN-*.sql theo thứ tự số. Chạy lại không làm gì.
import type { Database } from "bun:sqlite";
import { getDbPath } from "../config.ts";
import { log } from "../log.ts";
import { openReadWrite } from "./open.ts";

// Mỗi migration kèm một bảng đánh dấu: migration được áp khi bảng đó chưa có. Nhờ vậy các PR thêm migration
// song song merge theo thứ tự nào cũng đúng (không dựa vào user_version tăng dần). user_version giữ số lớn nhất đã áp.
const FILES: [file: string, marker: string][] = [
  ["001-schema.sql", "etl_runs"],
  ["002-redaction-log.sql", "redaction_log"],
  ["003-work-orders.sql", "wo_imports"],
  ["005-billing.sql", "billing_imports"],
];
const MIGRATIONS: { version: number; marker: string; sql: string }[] = [];
for (const [name, marker] of FILES) {
  MIGRATIONS.push({
    version: Number(name.slice(0, 3)),
    marker,
    sql: await Bun.file(new URL(`./migrations/${name}`, import.meta.url)).text(),
  });
}

export const SCHEMA_VERSION = Math.max(...MIGRATIONS.map((m) => m.version));

// targetVersion chỉ dùng trong test để dựng DB ở phiên bản cũ.
export function migrate(db: Database, targetVersion: number = SCHEMA_VERSION): void {
  for (const m of MIGRATIONS) {
    if (m.version > targetVersion) continue;
    if (db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(m.marker)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      const current = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
      db.run(`PRAGMA user_version = ${Math.max(current, m.version)}`);
    })();
  }
}

if (import.meta.main) {
  const db = openReadWrite(getDbPath());
  migrate(db);
  db.close();
  log({ event: "db.migrated", count: SCHEMA_VERSION });
}
