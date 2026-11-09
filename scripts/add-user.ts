// Tạo hoặc đặt lại tài khoản theo vai trò (D-79): bun run scripts/add-user.ts <amy|mark|mkt|bod>
// Sinh mật khẩu tạm, in ra một lần; người dùng phải đổi ở lần đăng nhập đầu. Chạy trên máy cài, với biến môi trường
// của bản cài (GROWTH_DB_PATH). Mật khẩu tạm không được ghi vào log hay file nào.
import { getDbPath } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";
import { ACCOUNT_IDS, setPassword, tempPassword, type AccountId } from "../src/db/users.ts";

const role = process.argv[2] ?? "";
if (!(ACCOUNT_IDS as readonly string[]).includes(role)) {
  process.stderr.write(`Cách dùng: bun run scripts/add-user.ts <${ACCOUNT_IDS.join("|")}>\n`);
  process.exit(2);
}
const db = openReadWrite(getDbPath());
migrate(db);
const pw = tempPassword();
await setPassword(db, role as AccountId, pw, { mustChange: true, now: new Date(), actor: "add-user" });
db.close();
process.stdout.write(`Tài khoản: ${role}\nMật khẩu tạm: ${pw}\nĐăng nhập ở trang /login, chọn "${role}"; hệ thống sẽ bắt đổi mật khẩu ngay.\n`);
