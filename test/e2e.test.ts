// T-E2E-01 và T-Q-09: đường đi chính với CRM giả, Graph giả, LLM giả, MCP qua InMemoryTransport.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Database } from "bun:sqlite";
import { runCrmEtl } from "../src/crm/etl.ts";
import { runSa01, type Sa01Deps } from "../src/agents/sa-01/run.ts";
import { connectCrmReadMcp } from "../src/mcp/crm-read/client.ts";
import { createCrmReadServer, openCrmReadDb } from "../src/mcp/crm-read/server.ts";
import { createGraphClient } from "../src/teams/graph-read.ts";
import { createPiiHasher } from "../src/pii/hash.ts";
import { freshDb, tempDbPath } from "./helpers/db.ts";
import { fakeLlm } from "./helpers/fake-llm.ts";
import { AMY, events, get, makeApp, post, session } from "./helpers/queue.ts";
import { startFakeCrm } from "./crm/fake-crm.ts";
import { CHANNEL_ID, TEAM_ID, reply, rootMessage } from "./fixtures/synthetic/teams.ts";

const tmp = tempDbPath();
let db: Database;
let ro: Database;
let deps: Sa01Deps;

beforeAll(async () => {
  db = freshDb(tmp.path);
  db.run("INSERT INTO rm_directory (rm_id, display_name, teams_user_id) VALUES ('RM_A', 'RM_A', 'aad_a')");
  const crm = startFakeCrm({ pageSize: 2 });
  const etl = await runCrmEtl({
    db,
    crm: { baseUrl: crm.baseUrl, token: "t", sleep: async () => {} },
    hasher: createPiiHasher("test-only-key-not-a-secret-0123456789abcdef"),
    now: () => new Date("2026-11-01T23:30:00.000Z"),
  });
  crm.stop();
  expect(etl.status).toBe("succeeded");

  ro = openCrmReadDb(tmp.path);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createCrmReadServer(ro).connect(a);
  const base = `/v1.0/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages`;
  const routes: Record<string, unknown> = {
    [`${base}?$top=50`]: { value: [rootMessage("root_0111", "31/10")] },
    [`${base}/root_0111/replies?$top=50`]: { value: [reply("r1", "aad_a", "TIẾP CẬN: 5 lead\nKHÁCH NÓI: Cost wise its expensive")] },
  };
  const graphFetch = (async (u: string | URL | Request) => Response.json(routes[String(u).replace("https://graph.microsoft.com", "")] ?? {})) as typeof fetch;
  deps = {
    db,
    crm: await connectCrmReadMcp(b),
    graph: { client: createGraphClient({ getToken: async () => "t", fetchImpl: graphFetch }), teamId: TEAM_ID, channelId: CHANNEL_ID },
    llm: fakeLlm(),
    pricing: { model: "fake-model", inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    evalStats: { self_report_parse: { passRate: 1, caseCount: 30 }, reason_code: { passRate: 1, caseCount: 30 }, nba: { passRate: 1, caseCount: 30 } },
    now: () => new Date("2026-11-02T01:00:00.000Z"),
  };
});

afterAll(() => {
  ro.close();
  db.close();
  tmp.cleanup();
});

describe("T-E2E-01 đường đi chính", () => {
  test("T-E2E-01 etl-crm → sa01-morning → GET /queue thấy đủ 3 loại mục; xác nhận NBA và ghi phản hồi RM", async () => {
    const r = await runSa01("2026-11-02", deps);
    expect(r.itemsCreated).toBeGreaterThan(0);
    const { app } = makeApp(db);
    const s = session(AMY);
    const html = await (await get(app, "/queue?date=2026-11-02", s.cookie)).text();
    for (const title of ["Tự báo RM (1)", "Mã lý do (1)", "NBA ("]) expect(html).toContain(title);
    expect(html).not.toContain("NBA (0)");

    const nba = db.query("SELECT id FROM queue_items WHERE item_type = 'nba' ORDER BY id LIMIT 1").get() as { id: string };
    expect((await post(app, `/queue/items/${nba.id}/confirm`, { csrf: s.csrf }, s.cookie)).status).toBe(303);
    expect((await post(app, `/queue/items/${nba.id}/rm_outcome`, { csrf: s.csrf, outcome: "rm_accepted" }, s.cookie)).status).toBe(303);
    expect(events(db).map((e) => e.action)).toEqual(["queue_opened", "confirm", "rm_outcome"]);
  });
});

describe("T-Q-09 chạy lại không sinh mục trùng", () => {
  test("T-Q-09 chạy sa01-morning hai lần cùng ngày không sinh mục trùng, không gọi lại LLM cho tin đã xử lý", async () => {
    const before = (db.query("SELECT COUNT(*) AS n FROM queue_items").get() as { n: number }).n;
    const llm = fakeLlm();
    const r = await runSa01("2026-11-02", { ...deps, llm });
    expect(r.itemsCreated).toBe(0);
    expect(llm.calls.length).toBe(0);
    expect((db.query("SELECT COUNT(*) AS n FROM queue_items").get() as { n: number }).n).toBe(before);
  });
});
