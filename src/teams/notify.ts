// Thông báo Teams (design doc mục 5.8, D-11): tin cố định chỉ có ngày và link. Không số liệu, không tên.
// Kênh: Incoming Webhook hoặc Workflows tới chat của Amy (Q-11 chờ Amy chọn chat hay channel).
// [ĐỐI CHIẾU SCHEMA] Định dạng thân tin: dùng {"text": ...} của Incoming Webhook; nếu dùng Workflows
// cần đối chiếu mẫu flow do admin tenant dựng.
import { ddmm } from "../time.ts";
import { log } from "../log.ts";

export type TeamsMessage = { text: string };

const ALLOWED_WEBHOOK_HOST = /(^|\.)(webhook\.office\.com|logic\.azure\.com|api\.powerplatform\.com)$/;
export const NOTIFY_MAX_RETRIES = 3;

function httpsUrl(link: string): string {
  const u = new URL(link);
  // Ngoại lệ của bản cài máy Ubuntu (D-26): http chỉ cho localhost, 127.0.0.1.
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new RangeError("notify: link must be https");
  return u.href;
}

export function queueReadyMessage(queueDate: string, baseUrl: string): TeamsMessage {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(queueDate)) throw new RangeError("notify: bad date");
  const link = httpsUrl(`${baseUrl.replace(/\/+$/, "")}/queue?date=${queueDate}`);
  return { text: `Hàng chờ ngày ${ddmm(queueDate)} đã sẵn sàng: ${link}` };
}

// Digest tuần (CRON-08, 08:30 thứ Hai): tuần bắt đầu từ thứ Hai weekStart.
export function digestReadyMessage(weekStart: string, baseUrl: string): TeamsMessage {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new RangeError("notify: bad date");
  const link = httpsUrl(`${baseUrl.replace(/\/+$/, "")}/digest?week=${weekStart}`);
  return { text: `Digest tuần từ ${ddmm(weekStart)} đã sẵn sàng: ${link}` };
}

// Báo cáo tháng (CRON-09, 07:00 ngày 1).
export function monthlyReadyMessage(month: string, baseUrl: string): TeamsMessage {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new RangeError("notify: bad month");
  const link = httpsUrl(`${baseUrl.replace(/\/+$/, "")}/monthly?m=${month}`);
  return { text: `Báo cáo tháng ${m[2]}/${m[1]} đã sẵn sàng: ${link}` };
}

export function escalationMessage(itemLink: string): TeamsMessage {
  return { text: `Amy cần anh xem một mục: ${httpsUrl(itemLink)}` };
}

export function isAllowedWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_WEBHOOK_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

// Gửi tin; lỗi thì thử lại 3 lần, không bao giờ ném lỗi (không chặn hàng chờ, design doc mục 8).
export async function postTeams(
  webhookUrl: string,
  message: TeamsMessage,
  opts: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  if (!isAllowedWebhook(webhookUrl)) {
    log({ event: "notify.rejected", error_code: "WEBHOOK_HOST_NOT_ALLOWED" });
    return false;
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt <= NOTIFY_MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await doFetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message.text }),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
    } catch {
      // thử lại
    }
  }
  log({ event: "notify.failed", error_code: "TEAMS_WEBHOOK_FAILED" });
  return false;
}
