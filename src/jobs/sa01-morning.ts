// Job 08:00 thứ Hai tới thứ Bảy (CRON-05, D-03, D-08): cron gọi thẳng runSa01 cho ngày D (giờ Việt Nam).
// crm-read-mcp chạy như tiến trình con qua stdio, mở Growth DB chỉ đọc.
import { join } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDbPath, getEntraConfig, getEvalResultsDir, getGraphChannel, getLlmPricing, getQueueConfig, getTeamsWebhooks } from "../config.ts";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { readEvalStats } from "../agents/sa-01/eval/runner.ts";
import { runSa01 } from "../agents/sa-01/run.ts";
import { migrate } from "../db/migrate.ts";
import { openReadWrite } from "../db/open.ts";
import { connectCrmReadMcp } from "../mcp/crm-read/client.ts";
import { createGraphClient } from "../teams/graph-read.ts";
import { createGraphTokenProvider } from "../teams/graph-token.ts";
import { postTeams, queueReadyMessage } from "../teams/notify.ts";
import { vnDate } from "../time.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const dbPath = getDbPath();
const db = openReadWrite(dbPath);
migrate(db);

const crm = await connectCrmReadMcp(
  new StdioClientTransport({
    command: process.execPath,
    args: ["run", join(ROOT, "src/mcp/crm-read/server.ts")],
    env: { GROWTH_DB_PATH: dbPath, PATH: process.env.PATH ?? "" },
  }),
);
const channel = getGraphChannel();
const pricing = getLlmPricing();
const { stats, evalVersion } = readEvalStats(getEvalResultsDir(ROOT));
const hooks = getTeamsWebhooks();
const baseUrl = getQueueConfig().baseUrl;

try {
  await runSa01(vnDate(new Date()), {
    db,
    crm,
    graph: channel ? { client: createGraphClient({ getToken: createGraphTokenProvider(getEntraConfig()) }), ...channel } : null,
    llm: createAnthropicLlm({ model: pricing.model }),
    pricing,
    evalStats: stats,
    evalVersion,
    trigger: "cron-05",
    notify: hooks.amy ? (d) => postTeams(hooks.amy!, queueReadyMessage(d, baseUrl)) : undefined,
  });
} finally {
  await crm.close();
  db.close();
}
