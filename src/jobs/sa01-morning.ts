// Job 08:00 thứ Hai tới thứ Bảy (CRON-05, D-03, D-08): cron gọi thẳng runSa01 cho ngày D (giờ Việt Nam).
// crm-read-mcp chạy như tiến trình con qua stdio, mở Growth DB chỉ đọc.
import { join } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDbPath, getEntraConfig, getEvalResultsDir, getGraphChannel, getLlmPricing, hasLlmKey, getQueueConfig, getReportSource, getTeamsWebhooks } from "../config.ts";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { recordCall } from "../connectors/registry.ts";
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
// Chế độ dán (D-24): tự báo do Amy dán trên trang, lượt 08:00 chỉ làm NBA.
const pasteMode = getReportSource() === "paste";
const channel = pasteMode ? null : getGraphChannel();
const pricing = getLlmPricing();
const { stats, evalVersion } = readEvalStats(getEvalResultsDir(ROOT));
const hooks = getTeamsWebhooks();
const baseUrl = getQueueConfig().baseUrl;

try {
  await runSa01(vnDate(new Date()), {
    db,
    crm,
    // Mỗi lần gọi Graph ghi vào nhật ký ổ cắm cho /settings (D-96).
    graph: channel ? { client: ((c) => ({ get: (u: string) => recordCall(db, "graph-teams", new Date(), () => c.get(u)) }))(createGraphClient({ getToken: createGraphTokenProvider(getEntraConfig()) })), ...channel } : null,
    // Chưa có key thì không gọi LLM; NBA vẫn chạy (D-89).
    llm: hasLlmKey() ? createAnthropicLlm({ model: pricing.model }) : null,
    pricing,
    evalStats: stats,
    evalVersion,
    trigger: "cron-05",
    parts: { selfReports: !pasteMode, nba: true },
    notify: hooks.amy ? (d) => postTeams(hooks.amy!, queueReadyMessage(d, baseUrl)) : undefined,
  });
} finally {
  await crm.close();
  db.close();
}
