// Áp các file migrations/NNN-*.sql theo thứ tự. Phiên bản lưu trong PRAGMA user_version;
// chỉ áp file có số lớn hơn phiên bản hiện tại, nên chạy lại không làm gì.
import type { Database } from "bun:sqlite";
import { getDbPath } from "../config.ts";
import { log } from "../log.ts";
import { openReadWrite } from "./open.ts";

const MIGRATIONS: { version: number; sql: string }[] = [];
for (const name of ["001-schema.sql", "002-redaction-log.sql", "003-work-orders.sql", "004-queue-defaults.sql"]) {
  MIGRATIONS.push({
    version: Number(name.slice(0, 3)),
    sql: await Bun.file(new URL(`./migrations/${name}`, import.meta.url)).text(),
  });
}

export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;

// targetVersion chỉ dùng trong test để dựng DB ở phiên bản cũ.
export function migrate(db: Database, targetVersion: number = SCHEMA_VERSION): void {
  const current = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (const m of MIGRATIONS) {
    if (m.version <= current || m.version > targetVersion) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run(`PRAGMA user_version = ${m.version}`);
    })();
  }
}

if (import.meta.main) {
  const db = openReadWrite(getDbPath());
  migrate(db);
  db.close();
  log({ event: "db.migrated", count: SCHEMA_VERSION });
}
