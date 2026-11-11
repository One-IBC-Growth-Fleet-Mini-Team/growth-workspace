// Quản lý tài khoản (D-97): bun run scripts/accounts.ts <add-user|reset-password|disable-user|list-users> ...
// Trên máy chủ: sudo growth-run add-user mkt-01 mkt (growth-run gọi file này). Chạy với GROWTH_DB_PATH của bản cài.
import { getDbPath } from "../src/config.ts";
import { runAccountCommand } from "../src/db/account-cli.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";

const db = openReadWrite(getDbPath());
migrate(db);
const r = await runAccountCommand(db, process.argv.slice(2), { now: new Date(), actor: "cli" });
db.close();
(r.code === 0 ? process.stdout : process.stderr).write(r.out);
process.exit(r.code);
