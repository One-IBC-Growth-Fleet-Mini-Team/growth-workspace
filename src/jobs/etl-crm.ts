// Job 06:30 hằng ngày (D-03: nền tảng host gọi `bun run src/jobs/etl-crm.ts`). Chỉ đọc CRM.
import { getCrmConfig, getCrmSource, getDbPath, getPhoneDefaultCountryCode, getPiiHashKey } from "../config.ts";
import { log } from "../log.ts";

// Chế độ CSV (D-24): dữ liệu CRM do Amy nạp trên trang; job API không có gì để làm.
if (getCrmSource() === "csv") {
  log({ event: "etl.skipped", error_code: "CRM_SOURCE_CSV" });
  process.exit(0);
}
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
// Nhật ký ổ cắm cho /settings (D-96): chỉ thành công hay mã lỗi.
db.run("INSERT INTO connector_calls (id, connector, ok, error_code, at) VALUES (?, 'crm-api', ?, ?, ?)",
  [Bun.randomUUIDv7(), result.status === "succeeded" ? 1 : 0, result.status === "succeeded" ? null : "ETL_FAILED", new Date().toISOString()]);
db.close();
process.exit(result.status === "succeeded" ? 0 : 1);
