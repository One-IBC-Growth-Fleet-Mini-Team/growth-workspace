// Đọc tự báo RM từ channel Teams "Đồng bộ dữ liệu" qua Microsoft Graph (design doc mục 5.3).
// Chỉ đọc: client chỉ có hàm get, phương thức gán cứng "GET"; host phải là graph.microsoft.com,
// đường dẫn phải nằm dưới /v1.0/teams/; chuyển hướng bị từ chối.
// Văn bản thô chỉ tồn tại trong bộ nhớ; hàm này không ghi gì xuống đĩa hay log.
// [ĐỐI CHIẾU SCHEMA] id team, id channel, cách nhận diện thread ngày (tin gốc chứa dd/mm của D-1, A-05).
// Lấy token (quyền application hay delegated) chờ admin tenant chốt (Q-02); ở đây nhận qua getToken.
import { createHash } from "node:crypto";

const GRAPH_HOST = "graph.microsoft.com";
const PATH_PREFIX = "/v1.0/teams/";
const MAX_PAGES = 20;

export type GraphErrorCode =
  | "GRAPH_HOST_NOT_ALLOWED"
  | "GRAPH_REDIRECT"
  | "GRAPH_AUTH"
  | "GRAPH_HTTP_ERROR"
  | "GRAPH_NETWORK"
  | "GRAPH_BAD_RESPONSE"
  | "GRAPH_PAGE_LIMIT";

export class GraphError extends Error {
  constructor(
    readonly code: GraphErrorCode,
    readonly status?: number,
  ) {
    super(status === undefined ? code : `${code} ${status}`);
  }
}

export type GraphClient = { get(pathOrUrl: string): Promise<unknown> };

export type GraphClientOptions = {
  // force = true: bỏ token đang giữ, lấy token mới (token hết hạn sớm hơn dự tính, D-96).
  getToken: (force?: boolean) => Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};
const MAX_RETRIES = 3;

function checkedUrl(pathOrUrl: string): URL {
  let url: URL;
  try {
    url = new URL(pathOrUrl, `https://${GRAPH_HOST}`);
  } catch {
    throw new GraphError("GRAPH_HOST_NOT_ALLOWED");
  }
  if (url.protocol !== "https:" || url.host !== GRAPH_HOST || !url.pathname.startsWith(PATH_PREFIX)) {
    throw new GraphError("GRAPH_HOST_NOT_ALLOWED");
  }
  return url;
}

export function createGraphClient(opts: GraphClientOptions): GraphClient {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async get(pathOrUrl) {
      const url = checkedUrl(pathOrUrl);
      const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      let refreshed = false;
      for (let attempt = 0; ; ) {
        const token = await opts.getToken();
        let res: Response;
        try {
          res = await doFetch(url.href, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            redirect: "manual",
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
          });
        } catch {
          throw new GraphError("GRAPH_NETWORK");
        }
        if (res.status >= 300 && res.status < 400) throw new GraphError("GRAPH_REDIRECT", res.status);
        // Token hết hạn: lấy token mới một lần rồi gọi lại (D-96).
        if (res.status === 401 && !refreshed) { refreshed = true; await opts.getToken(true); continue; }
        if (res.status === 401 || res.status === 403) throw new GraphError("GRAPH_AUTH", res.status);
        // Giới hạn tần suất của Graph (429, 503, 504): chờ theo Retry-After rồi thử lại (D-96).
        if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < MAX_RETRIES) {
          attempt += 1;
          const ra = res.headers.get("retry-after");
          await sleep(ra && /^\d+$/.test(ra) ? Math.min(Number(ra), 120) * 1000 : 500 * 2 ** attempt);
          continue;
        }
        if (!res.ok) throw new GraphError("GRAPH_HTTP_ERROR", res.status);
        try {
          return await res.json();
        } catch {
          throw new GraphError("GRAPH_BAD_RESPONSE", res.status);
        }
      }
    },
  };
}

// Tin đã rút gọn về đúng các trường cần dùng.
export type TeamsMessage = {
  messageId: string;
  rootId: string;
  authorTeamsUserId: string | null;
  createdAt: string;
  lastModifiedAt: string;
  contentType: "text" | "html";
  content: string;
  webUrl: string;
};

export type DailyThread = { rootId: string; rootWebUrl: string; replies: TeamsMessage[] };

type GraphMessage = {
  id?: unknown;
  createdDateTime?: unknown;
  lastModifiedDateTime?: unknown;
  deletedDateTime?: unknown;
  from?: { user?: { id?: unknown } | null } | null;
  body?: { contentType?: unknown; content?: unknown } | null;
  webUrl?: unknown;
};

// Đọc lần lượt từng trang; dừng khi hết trang hoặc khi stop() thấy thứ cần tìm.
async function listPages(
  client: GraphClient,
  firstPath: string,
  stop: (page: GraphMessage[]) => boolean = () => false,
): Promise<{ messages: GraphMessage[]; complete: boolean }> {
  const messages: GraphMessage[] = [];
  let next: string | null = firstPath;
  let pages = 0;
  while (next) {
    if (pages >= MAX_PAGES) return { messages, complete: false };
    const body = (await client.get(next)) as { value?: unknown; "@odata.nextLink"?: unknown } | null;
    pages++;
    if (!body || !Array.isArray(body.value)) throw new GraphError("GRAPH_BAD_RESPONSE");
    const page = body.value as GraphMessage[];
    messages.push(...page);
    if (stop(page)) return { messages, complete: true };
    next = typeof body["@odata.nextLink"] === "string" ? body["@odata.nextLink"] : null;
  }
  return { messages, complete: true };
}

function toTeamsMessage(m: GraphMessage, rootId: string): TeamsMessage | null {
  if (m.deletedDateTime) return null;
  const ct = m.body?.contentType;
  if (typeof m.id !== "string" || typeof m.body?.content !== "string" || (ct !== "text" && ct !== "html")) {
    return null;
  }
  const created = typeof m.createdDateTime === "string" ? m.createdDateTime : "";
  const author = m.from?.user?.id;
  return {
    messageId: m.id,
    rootId,
    authorTeamsUserId: typeof author === "string" ? author : null,
    createdAt: created,
    lastModifiedAt: typeof m.lastModifiedDateTime === "string" ? m.lastModifiedDateTime : created,
    contentType: ct,
    content: m.body.content,
    webUrl: typeof m.webUrl === "string" ? m.webUrl : "",
  };
}

// reportDate là ngày D-1 (YYYY-MM-DD, giờ Việt Nam). Tin gốc nhận diện bằng chuỗi dd/mm (A-05, chờ đối chiếu).
function rootMatchesDate(m: GraphMessage, reportDate: string): boolean {
  const [, mm, dd] = reportDate.split("-");
  const text = typeof m.body?.content === "string" ? m.body.content : "";
  const day = String(Number(dd));
  const month = String(Number(mm));
  const re = new RegExp(`(?<!\\d)0?${day}\\/0?${month}(?!\\d)`);
  return re.test(text);
}

export async function readDailyThread(
  client: GraphClient,
  params: { teamId: string; channelId: string; reportDate: string },
): Promise<DailyThread | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.reportDate)) throw new RangeError("reportDate must be YYYY-MM-DD");
  const base = `${PATH_PREFIX}${encodeURIComponent(params.teamId)}/channels/${encodeURIComponent(params.channelId)}/messages`;
  const isRoot = (m: GraphMessage) =>
    !m.deletedDateTime && typeof m.id === "string" && rootMatchesDate(m, params.reportDate);
  // Tin gốc: dừng ngay khi thấy; quá MAX_PAGES trang mà chưa thấy thì coi như không có thread.
  // [ĐỐI CHIẾU SCHEMA] Giả định Graph trả tin mới trước; cần kiểm khi có quyền đọc (STATUS b).
  const roots = await listPages(client, `${base}?$top=50`, (page) => page.some(isRoot));
  const root = roots.messages.find(isRoot);
  if (!root) return null;
  const rootId = root.id as string;
  const replyPages = await listPages(client, `${base}/${encodeURIComponent(rootId)}/replies?$top=50`);
  if (!replyPages.complete) throw new GraphError("GRAPH_PAGE_LIMIT");
  const raw = replyPages.messages;
  const replies = raw.map((m) => toTeamsMessage(m, rootId)).filter((m): m is TeamsMessage => m !== null);
  return { rootId, rootWebUrl: typeof root.webUrl === "string" ? root.webUrl : "", replies };
}

// rm_reports.source_message_ref: SHA-256 của (team, channel, message id); không lưu nội dung.
export function sourceMessageRef(teamId: string, channelId: string, messageId: string): string {
  return createHash("sha256").update(`${teamId}\n${channelId}\n${messageId}`, "utf8").digest("hex");
}
