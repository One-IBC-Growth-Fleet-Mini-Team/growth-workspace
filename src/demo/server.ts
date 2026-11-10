// Bản demo Hàng chờ chạy trên máy cá nhân: `bun run demo`, rồi mở http://localhost:3000 bằng Chrome hoặc Edge.
// Chỉ dữ liệu tổng hợp (không khách thật), LLM giả (không gọi Claude API), CRM và Teams giả (không gọi mạng),
// đăng nhập giả (vào thẳng bằng Amy hoặc Mark), DB nằm trong bộ nhớ (tắt là mất). Chỉ nghe trên 127.0.0.1.
// Mã chạy thật không import thư mục này (có test).
import { openReadWrite } from "../db/open.ts";
import { migrate } from "../db/migrate.ts";
import { insertEtlRun, insertSnapshotSucceeded } from "../db/crm-snapshot.ts";
import { runSa01, describeSa01 } from "../agents/sa-01/run.ts";
import { directCrmReadTools } from "../mcp/crm-read/client.ts";
import { createQueueApp } from "../queue/server.ts";
import type { QueueUser } from "../queue/auth.ts";
import { createGraphClient } from "../teams/graph-read.ts";
import { ddmm, monthPeriod, previousWorkingDay, vnDate } from "../time.ts";
import { fakeLlm } from "./fake-llm.ts";
import { importCrmCsv, importMessage, loadColumnMap } from "../crm/csv-import.ts";
import { createPiiHasher } from "../pii/hash.ts";
import { importWorkOrders, woImportMessage } from "../crm/wo-import.ts";
import { seedDemoSamples, withSampleBanner } from "./samples.ts";
import { runCron06 } from "../fleet/cron06.ts";
import type { LlmClient } from "../agents/sa-01/llm.ts";

// LLM giả cho /ask của demo: chọn truy vấn mẫu theo từ khoá trong câu hỏi.
function demoAskLlm(): LlmClient {
  const rules: [RegExp, string][] = [[/hook/i, "hook_board"], [/kênh|whatsapp|fanpage/i, "channel_health"], [/bài học|quyết định/i, "lessons"], [/sẵn sàng|tài phán|skd/i, "output_readiness"], [/fleet|chi phí|hàng chờ/i, "fleet_operations"]];
  return { complete: async ({ user }) => ({ text: JSON.stringify({ template: rules.find(([r]) => r.test(user))?.[1] ?? null, params: {} }), inputTokens: 0, outputTokens: 0, model: "demo-fake-llm", refused: false }) };
}
import type { OpportunityRow } from "../db/types.ts";

export const DEMO_HOST = "127.0.0.1";
export const DEMO_PORT = 3000;
const BASE = `http://localhost:${DEMO_PORT}`;
const SECRET = "demo-only-session-secret-not-for-production";

// Hai bản tự báo tổng hợp theo mẫu của RM (không có tên, email, SĐT khách).
function demoReplies(reportDdmm: string, at: string) {
  const mk = (id: string, author: string, text: string) => ({
    id,
    createdDateTime: at,
    lastModifiedDateTime: at,
    from: { user: { id: author } },
    body: { contentType: "text", content: text },
    webUrl: `https://teams.example.invalid/l/message/${id}`,
  });
  return [
    mk("demo-r1", "aad_rm_a", [
      `[${reportDdmm}] [RM] RM_A`,
      "TIẾP CẬN: 12 lead qua LinkedIn",
      "ĐĂNG BÀI: 1 bài về Samoa IBC",
      "HỘI THOẠI: 4",
      "BÁO GIÁ: 2 báo giá WS IBC01",
      "KHÁCH NÓI: Cost wise its expensive",
      "KHÁCH NÓI: We are still comparing with other providers",
      "CHƯA LÊN HỆ THỐNG: 2",
      "CẦN HỖ TRỢ: cần bảng so sánh phí",
    ].join("\n")),
    mk("demo-r2", "aad_rm_b", [
      `[${reportDdmm}] [RM] RM_B`,
      "TIẾP CẬN: 8",
      "HỘI THOẠI: 3",
      "KHÁCH NÓI: need it next month",
    ].join("\n")),
  ];
}

function demoOpportunities(month: { start: string; end: string }): OpportunityRow[] {
  const day = (d: number) => `${month.start.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const base = { has_next_step: 0 as const, jurisdiction_code: "WS", service_family: "IBC01", industry_code: null, rejection_reason_code: null, last_modified_at: null };
  return [
    { ...base, opportunity_id: "DEMO-OPP-01", client_id: "DEMO-CLI-02", owner_rm_id: "RM_A", stage: "Negotiation", close_date: day(20) },
    { ...base, opportunity_id: "DEMO-OPP-02", client_id: null, owner_rm_id: "RM_A", stage: "Quotation", close_date: day(25), industry_code: "FOREX" },
    { ...base, opportunity_id: "DEMO-OPP-03", client_id: null, owner_rm_id: "RM_B", stage: "Quotation", close_date: day(15), rejection_reason_code: "UNRESPONSIVE" },
    { ...base, opportunity_id: "DEMO-OPP-04", client_id: null, owner_rm_id: "RM_B", stage: "Nurturing", close_date: "2027-03-01" },
  ];
}

export async function createDemo(now: Date = new Date()) {
  const db = openReadWrite(":memory:");
  migrate(db);
  db.run("INSERT INTO rm_directory (rm_id, display_name, teams_user_id) VALUES ('RM_A', 'RM_A', 'aad_rm_a'), ('RM_B', 'RM_B', 'aad_rm_b')");

  const queueDate = vnDate(now);
  const runId = "demo-etl-run";
  insertEtlRun(db, runId, "crm", new Date(now.getTime() - 3600_000).toISOString());
  insertSnapshotSucceeded(db, runId, {
    opportunities: demoOpportunities(monthPeriod(queueDate)),
    clients: [
      { client_id: "DEMO-CLI-01", is_reseller_end_client: 0, industry_code: null, first_won_at: "2025-03-01" },
      { client_id: "DEMO-CLI-02", is_reseller_end_client: null, industry_code: null, first_won_at: "2025-06-01" },
    ],
    leads: [],
    clientServices: [{ client_id: "DEMO-CLI-01", product_family: "IBC01" }],
  }, new Date(now.getTime() - 3600_000).toISOString());

  const reportDate = previousWorkingDay(queueDate);
  const base = "/v1.0/teams/demo-team/channels/demo-channel/messages";
  const routes: Record<string, unknown> = {
    [`${base}?$top=50`]: { value: [{ id: "demo-root", body: { contentType: "text", content: `Tự báo ngày ${ddmm(reportDate)}` }, webUrl: "https://teams.example.invalid/root" }] },
    [`${base}/demo-root/replies?$top=50`]: { value: demoReplies(ddmm(reportDate), new Date(now.getTime() - 12 * 3600_000).toISOString()) },
  };
  const graphFetch = (async (u: string | URL | Request) =>
    Response.json(routes[String(u).replace("https://graph.microsoft.com", "")] ?? { value: [] })) as typeof fetch;

  await runSa01(queueDate, {
    db,
    crm: directCrmReadTools(db),
    graph: { client: createGraphClient({ getToken: async () => "demo", fetchImpl: graphFetch }), teamId: "demo-team", channelId: "demo-channel" },
    llm: fakeLlm(),
    pricing: { model: "demo-fake-llm", inputUsdPerMTok: 0, outputUsdPerMTok: 0 },
    // Cỡ mẫu eval thật hiện có (10 ca synthetic): điểm tự tin thấp, nên nhiều mục có nút Escalate.
    evalStats: { self_report_parse: { passRate: 1, caseCount: 2 }, reason_code: { passRate: 1, caseCount: 2 }, nba: { passRate: 1, caseCount: 4 } },
    now: () => now,
    trigger: "demo",
  });

  seedDemoSamples(db, now);
  // Một lượt CRON-06 qua bộ điều phối để /command có vết ngay (D-82).
  await runCron06(db, now, new Set());
  // Tài khoản demo cho 4 vai trò (D-75): /login?as=amy|mark|mkt|bod.
  const users: [string, QueueUser][] = [["amy", { id: "amy", role: "approver" }], ["mark", { id: "mark", role: "viewer" }], ["mkt", { id: "mkt", role: "mkt" }], ["bod", { id: "bod", role: "viewer" }]];
  const inner = createQueueApp({
    // Hỏi Mi1 với LLM giả (D-82): chọn mẫu theo từ khoá, chi phí 0. Bản thật dùng ANTHROPIC_API_KEY.
    askLlm: { llm: demoAskLlm(), price: { inputUsdPerMTok: 0, outputUsdPerMTok: 0 }, evalGate: () => ({ passed: true, version: "demo" }) },
    db,
    sessionSecret: SECRET,
    baseUrl: BASE,
    users: new Map(users),
    // Đăng nhập giả: "code" chính là tên người dùng.
    oidc: {
      authorizationUrl: ({ state }) => `/auth/callback?state=${state}`,
      exchange: async (code) => ({ oid: code, nonce: "demo" }),
    },
    // Thử trang nạp CSV với bảng ghép mặc định (tên cột trùng tên trường).
    onWoImport: async (files, actor) => {
      const r = importWorkOrders(db, files, { columns: {}, now: new Date(), actor });
      return { ok: r.status === "succeeded", message: woImportMessage(r) };
    },
    onImport: async (files) => {
      const r = importCrmCsv(db, files, { hasher: createPiiHasher("demo-only-hash-key-not-for-production-0123"), columns: loadColumnMap(new URL("../../deploy/crm-columns.example.json", import.meta.url).pathname), now: new Date() });
      if (r.status !== "succeeded") return { ok: false, message: importMessage(r) };
      const run = await runSa01(queueDate, { db, crm: directCrmReadTools(db), graph: null, parts: { selfReports: false, nba: true }, llm: null,
        pricing: { model: "demo-fake-llm", inputUsdPerMTok: 0, outputUsdPerMTok: 0 },
        evalStats: { self_report_parse: { passRate: 1, caseCount: 2 }, reason_code: { passRate: 1, caseCount: 2 }, nba: { passRate: 1, caseCount: 4 } }, trigger: "demo-import" });
      return { ok: true, message: `${importMessage(r)} ${describeSa01(run, "nba")}` };
    },
    // Thử trang dán tự báo với LLM giả.
    onPaste: async (text, reportDate) => {
      const r = await runSa01(queueDate, {
        db,
        crm: directCrmReadTools(db),
        graph: null,
        pasted: { text, reportDate },
        parts: { selfReports: true, nba: false },
        llm: fakeLlm(),
        pricing: { model: "demo-fake-llm", inputUsdPerMTok: 0, outputUsdPerMTok: 0 },
        evalStats: { self_report_parse: { passRate: 1, caseCount: 2 }, reason_code: { passRate: 1, caseCount: 2 }, nba: { passRate: 1, caseCount: 4 } },
        trigger: "demo-paste",
      });
      return { created: r.itemsCreated, message: describeSa01(r, "paste") };
    },
  });

  // /login?as=amy|mark: chạy luôn cả luồng đăng nhập giả, trả cookie phiên.
  const app = {
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      if (url.pathname !== "/login") {
        const res = await inner.fetch(req);
        if (!res.headers.get("content-type")?.startsWith("text/html")) return res;
        const headers = new Headers();
        res.headers.forEach((v, k) => headers.append(k, v));
        return new Response(withSampleBanner(await res.text()), { status: res.status, headers });
      }
      const who = url.searchParams.get("as") ?? "amy";
      const start = await inner.fetch(new Request(`${BASE}/login`));
      const oidcCookie = start.headers.get("set-cookie")!.split(";")[0]!;
      const state = new URL(start.headers.get("location")!, BASE).searchParams.get("state")!;
      return inner.fetch(new Request(`${BASE}/auth/callback?code=${encodeURIComponent(who)}&state=${state}`, { headers: { cookie: oidcCookie } }));
    },
  };
  return { app, db, queueDate };
}

if (import.meta.main) {
  const { app } = await createDemo();
  Bun.serve({ hostname: DEMO_HOST, port: DEMO_PORT, fetch: app.fetch });
  process.stdout.write(
    [
      "",
      "Bản demo Hàng chờ đang chạy (dữ liệu tổng hợp, không gọi CRM, Teams hay Claude API).",
      `  Vào bằng Amy (người duyệt):  ${BASE}/login`,
      `  Vào bằng Mark (chỉ xem):     ${BASE}/login?as=mark`,
      `  Vào bằng Team MKT:           ${BASE}/login?as=mkt`,
      `  Vào bằng BOD:                ${BASE}/login?as=bod`,
      "Mở bằng Chrome hoặc Edge. Nhấn Ctrl+C ở cửa sổ này để tắt; tắt là mất dữ liệu demo.",
      "",
    ].join("\n"),
  );
}
