// Job 02:00 thứ Hai (CRON-07 bản Tạm, D-87): tạo sẵn Storyboard cho Hook đề xuất của tuần. Cần CREATIVE_SOURCE=mcp.
import { getDbPath, getRemoteSource } from "../config.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { runCron07 } from "../fleet/cron07.ts";
import { parseDisabled } from "../fleet/registry.ts";
import { log } from "../log.ts";

const db = openReadWrite(getDbPath());
migrate(db);
try {
  const src = getRemoteSource("CREATIVE");
  const r = await runCron07(db, new Date(), parseDisabled(process.env.FLEET_DISABLED), src.mode === "mcp" ? () => ({ url: src.url, token: src.token }) : null);
  log({ event: "mi1.cron07", run_id: r.sessionId ?? "none", count: r.compiled.length, error_code: r.errorCode });
} finally {
  db.close();
}
