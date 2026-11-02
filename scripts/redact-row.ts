// Xoá có kiểm soát một dòng trên bảng chỉ thêm (D-12, design doc mục 7.5). CHỈ người vận hành chạy tay:
//   bun run scripts/redact-row.ts --table queue_items --id <mã> --reason PII_FLAG --operator <mã người vận hành>
// Bảng cho phép: queue_items (payload), queue_events (payload), rm_reports (parsed).
import { parseArgs } from "node:util";
import { getDbPath } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";
import { redactRow, type RedactTable } from "../src/db/redact.ts";
import { log } from "../src/log.ts";

const { values } = parseArgs({
  options: { table: { type: "string" }, id: { type: "string" }, reason: { type: "string" }, operator: { type: "string" } },
});
if (!values.table || !values.id || !values.reason || !values.operator) {
  process.stderr.write("Thiếu tham số: --table --id --reason --operator\n");
  process.exit(2);
}
const db = openReadWrite(getDbPath());
migrate(db);
try {
  redactRow(db, { table: values.table as RedactTable, id: values.id, reasonCode: values.reason, operator: values.operator, now: new Date() });
  log({ event: "redact.done", run_id: values.id.slice(0, 64) });
} catch (e) {
  log({ event: "redact.failed", error_code: e instanceof Error ? e.message : "REDACT_FAILED" });
  process.exitCode = 1;
} finally {
  db.close();
}
