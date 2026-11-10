// Job hằng ngày 08:15 (CRON-06, D-27): Mi1 áp phương án mặc định "giữ nháp" cho mục quá hạn. Không gọi LLM.
// Chạy qua bộ điều phối (D-82) nên có vết trên /command.
import { getDbPath } from "../config.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { runCron06 } from "../fleet/cron06.ts";
import { parseDisabled } from "../fleet/registry.ts";
import { log } from "../log.ts";

const db = openReadWrite(getDbPath());
migrate(db);
try {
  const r = await runCron06(db, new Date(), parseDisabled(process.env.FLEET_DISABLED));
  log({ event: "mi1.defaults_applied", run_id: r.sessionId, count: r.applied ?? 0, error_code: r.errorCode });
} finally {
  db.close();
}
