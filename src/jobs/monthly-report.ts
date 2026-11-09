// Job 07:00 ngày 1 (CRON-09): báo Mark qua Teams rằng báo cáo tháng trước đã sẵn sàng. Tin chỉ có tháng và link (D-11).
// Không gọi LLM. Chưa đặt TEAMS_WEBHOOK_URL_MARK thì bỏ qua.
import { getQueueConfig, getTeamsWebhooks } from "../config.ts";
import { log } from "../log.ts";
import { previousMonth } from "../mi1/monthly.ts";
import { monthlyReadyMessage, postTeams } from "../teams/notify.ts";

const hook = getTeamsWebhooks().mark;
if (!hook) log({ event: "monthly.skipped", error_code: "NO_WEBHOOK" });
else log({ event: "monthly.notified", count: (await postTeams(hook, monthlyReadyMessage(previousMonth(new Date()), getQueueConfig().baseUrl))) ? 1 : 0 });
