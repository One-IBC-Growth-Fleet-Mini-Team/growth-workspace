// Job 06:30 hằng ngày (D-03: nền tảng host gọi `bun run src/jobs/etl-crm.ts`). Chỉ đọc CRM.
import { getCrmConfig, getDbPath, getPhoneDefaultCountryCode, getPiiHashKey } from "../config.ts";
import { runCrmEtl } from "../crm/etl.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { createPiiHasher } from "../pii/hash.ts";

const db = openReadWrite(getDbPath());
migrate(db);
const cc = getPhoneDefaultCountryCode();
const result = await runCrmEtl({
  db,
  crm: getCrmConfig(),
  hasher: createPiiHasher(getPiiHashKey(), cc ? { defaultCountryCode: cc } : {}),
});
db.close();
process.exit(result.status === "succeeded" ? 0 : 1);
