// Job dọn snapshot CRM cũ hơn 14 ngày (D-09). Nền tảng host gọi mỗi ngày sau etl-crm.
import { getDbPath } from "../config.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { pruneSnapshots } from "../db/prune.ts";
import { log } from "../log.ts";

const db = openReadWrite(getDbPath());
migrate(db);
const r = pruneSnapshots(db, new Date());
db.close();
log({ event: "prune.done", count: r.prunedRuns.length });
