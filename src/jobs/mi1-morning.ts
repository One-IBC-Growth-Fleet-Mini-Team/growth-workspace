// Job hằng ngày 08:15 (CRON-06, D-27): Mi1 áp phương án mặc định "giữ nháp" cho mục quá hạn. Không gọi LLM.
import { getDbPath } from "../config.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { log } from "../log.ts";
import { applyDefaults } from "../mi1/core.ts";

const db = openReadWrite(getDbPath());
migrate(db);
try {
  const r = applyDefaults(db, new Date());
  log({ event: "mi1.defaults_applied", run_id: r.agentRunId, count: r.applied });
} finally {
  db.close();
}
