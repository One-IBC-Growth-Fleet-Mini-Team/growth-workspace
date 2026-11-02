// Nạp danh bạ RM từ file JSON do người vận hành giữ NGOÀI repo (Q-07):
//   bun run scripts/load-rm-directory.ts /đường/dẫn/rm-directory.json
// File: [{"rm_id": "<owner id trên CRM>", "display_name": "<tên nhân viên>", "teams_user_id": "<AAD object id>"}]
import { readFileSync } from "node:fs";
import { getDbPath } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";
import { loadRmDirectory } from "../src/db/rm-directory.ts";
import { log } from "../src/log.ts";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Cần đường dẫn file JSON danh bạ RM\n");
  process.exit(2);
}
const db = openReadWrite(getDbPath());
migrate(db);
try {
  const r = loadRmDirectory(db, JSON.parse(readFileSync(file, "utf8")) as unknown[]);
  log({ event: "rm_directory.loaded", count: r.active });
  log({ event: "rm_directory.deactivated", count: r.deactivated });
} catch {
  log({ event: "rm_directory.failed", error_code: "RM_DIRECTORY_INVALID" });
  process.exitCode = 1;
} finally {
  db.close();
}
