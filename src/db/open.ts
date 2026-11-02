// Mở Growth DB. Hai chế độ duy nhất: đọc ghi (ETL, sa01-morning, queue/server) và chỉ đọc (crm-read-mcp).
import { Database } from "bun:sqlite";

export function openReadWrite(path: string): Database {
  const db = new Database(path, { create: true, readwrite: true, strict: true });
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  return db;
}

// Chỉ đọc ở hai tầng: cờ readonly của SQLite và query_only của kết nối.
export function openReadOnly(path: string): Database {
  const db = new Database(path, { readonly: true, strict: true });
  db.run("PRAGMA query_only = ON");
  db.run("PRAGMA busy_timeout = 5000");
  return db;
}
