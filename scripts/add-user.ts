// Tạo tài khoản (D-79, D-97): bun run scripts/add-user.ts <mã tài khoản> <amy|mkt|mark|bod>. In mật khẩu tạm một lần;
// người dùng phải đổi ở lần đăng nhập đầu. Giữ cho tương thích; các lệnh khác ở scripts/accounts.ts.
import { getDbPath } from "../src/config.ts";
import { runAccountCommand } from "../src/db/account-cli.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";

const db = openReadWrite(getDbPath());
migrate(db);
const r = await runAccountCommand(db, ["add-user", ...process.argv.slice(2)], { now: new Date(), actor: "cli" });
db.close();
(r.code === 0 ? process.stdout : process.stderr).write(r.out);
process.exit(r.code);
