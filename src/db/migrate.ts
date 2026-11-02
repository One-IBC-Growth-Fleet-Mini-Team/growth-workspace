// Áp schema.sql vào Growth DB. Phiên bản lưu trong PRAGMA user_version; chạy lại không làm gì.
import type { Database } from "bun:sqlite";
import { getDbPath } from "../config.ts";
import { log } from "../log.ts";
import { openReadWrite } from "./open.ts";

export const SCHEMA_VERSION = 1;

const SCHEMA_SQL = await Bun.file(new URL("./schema.sql", import.meta.url)).text();

export function migrate(db: Database): void {
  const row = db.query("PRAGMA user_version").get() as { user_version: number };
  if (row.user_version >= SCHEMA_VERSION) return;
  db.transaction(() => {
    db.exec(SCHEMA_SQL);
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  })();
}

if (import.meta.main) {
  const db = openReadWrite(getDbPath());
  migrate(db);
  db.close();
  log({ event: "db.migrated", count: SCHEMA_VERSION });
}
