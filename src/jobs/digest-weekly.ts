// Job 08:30 thứ Hai (CRON-08): báo Mark qua Teams rằng Digest tuần vừa xong đã sẵn sàng. Tin chỉ có ngày và link (D-11);
// số liệu nằm trên trang /digest. Không gọi LLM. Chưa đặt TEAMS_WEBHOOK_URL_MARK thì bỏ qua.
import { getQueueConfig, getTeamsWebhooks } from "../config.ts";
import { log } from "../log.ts";
import { mondayOf } from "../mi1/core.ts";
import { digestReadyMessage, postTeams } from "../teams/notify.ts";
import { vnDate } from "../time.ts";

const week = mondayOf(vnDate(new Date(Date.now() - 7 * 86_400_000)));
const hook = getTeamsWebhooks().mark;
if (!hook) log({ event: "digest.skipped", error_code: "NO_WEBHOOK" });
else log({ event: "digest.notified", count: (await postTeams(hook, digestReadyMessage(week, getQueueConfig().baseUrl))) ? 1 : 0 });
