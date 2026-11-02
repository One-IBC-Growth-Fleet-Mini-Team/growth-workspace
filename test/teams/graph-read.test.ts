// T-TEAMS-01: đọc Graph chỉ bằng GET (fetch giả, không gọi Microsoft Graph thật).
import { describe, expect, test } from "bun:test";
import { createGraphClient, GraphError, readDailyThread, sourceMessageRef } from "../../src/teams/graph-read.ts";
import { CHANNEL_ID, TEAM_ID, reply, rootMessage, type SyntheticGraphMessage } from "../fixtures/synthetic/teams.ts";

type Call = { url: string; init: RequestInit | undefined };

function fakeGraph(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = url.replace("https://graph.microsoft.com", "");
    if (!(key in routes)) return new Response("not found", { status: 404 });
    return Response.json(routes[key]);
  }) as typeof fetch;
  return { calls, impl };
}

const BASE = `/v1.0/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages`;

function routes(extra: SyntheticGraphMessage[] = []) {
  const otherRoot = rootMessage("root_3110", "31/10");
  const root = rootMessage("root_0111", "01/11");
  return {
    [`${BASE}?$top=50`]: { value: [otherRoot], "@odata.nextLink": `https://graph.microsoft.com${BASE}?$top=50&$skiptoken=p2` },
    [`${BASE}?$top=50&$skiptoken=p2`]: { value: [root] },
    [`${BASE}/root_0111/replies?$top=50`]: {
      value: [reply("r1", "aad_a", "TIẾP CẬN: 3")],
      "@odata.nextLink": `https://graph.microsoft.com${BASE}/root_0111/replies?$top=50&$skiptoken=r2`,
    },
    [`${BASE}/root_0111/replies?$top=50&$skiptoken=r2`]: {
      value: [reply("r2", "aad_b", "HỘI THOẠI: 2"), { ...reply("r3", "aad_b", "x"), deletedDateTime: "2026-11-01T11:00:00Z" }, ...extra],
    },
  };
}

describe("T-TEAMS-01 Graph chỉ GET", () => {
  test("T-TEAMS-01 mọi request là GET, không body, chỉ tới graph.microsoft.com", async () => {
    const g = fakeGraph(routes());
    const client = createGraphClient({ getToken: async () => "test-token", fetchImpl: g.impl });
    const thread = await readDailyThread(client, { teamId: TEAM_ID, channelId: CHANNEL_ID, reportDate: "2026-11-01" });
    expect(thread).not.toBeNull();
    expect(g.calls.length).toBe(4);
    for (const c of g.calls) {
      expect(c.init?.method).toBe("GET");
      expect(c.init?.body ?? null).toBeNull();
      expect(new URL(c.url).host).toBe("graph.microsoft.com");
      expect(c.init?.redirect).toBe("manual");
    }
  });

  test("T-TEAMS-01 client chỉ có hàm get", () => {
    const client = createGraphClient({ getToken: async () => "t", fetchImpl: fetch });
    expect(Object.keys(client)).toEqual(["get"]);
  });

  test("T-TEAMS-01 tìm đúng thread ngày D-1, gom reply qua nhiều trang, bỏ tin đã xoá", async () => {
    const g = fakeGraph(routes());
    const client = createGraphClient({ getToken: async () => "t", fetchImpl: g.impl });
    const thread = await readDailyThread(client, { teamId: TEAM_ID, channelId: CHANNEL_ID, reportDate: "2026-11-01" });
    expect(thread!.rootId).toBe("root_0111");
    expect(thread!.replies.map((r) => r.messageId)).toEqual(["r1", "r2"]);
    expect(thread!.replies[0]!.authorTeamsUserId).toBe("aad_a");
  });

  test("T-TEAMS-01 không có thread ngày đó thì trả null", async () => {
    const g = fakeGraph(routes());
    const client = createGraphClient({ getToken: async () => "t", fetchImpl: g.impl });
    expect(await readDailyThread(client, { teamId: TEAM_ID, channelId: CHANNEL_ID, reportDate: "2026-10-25" })).toBeNull();
  });

  test("T-TEAMS-01 nextLink sang host khác hoặc đường dẫn lạ bị từ chối", async () => {
    const g = fakeGraph({ [`${BASE}?$top=50`]: { value: [], "@odata.nextLink": "https://evil.example/steal" } });
    const client = createGraphClient({ getToken: async () => "t", fetchImpl: g.impl });
    await expect(
      readDailyThread(client, { teamId: TEAM_ID, channelId: CHANNEL_ID, reportDate: "2026-11-01" }),
    ).rejects.toMatchObject({ code: "GRAPH_HOST_NOT_ALLOWED" });
    await expect(client.get("/v1.0/users")).rejects.toBeInstanceOf(GraphError);
  });

  test("T-TEAMS-01 401/403 ném GRAPH_AUTH, redirect bị từ chối", async () => {
    for (const [status, code] of [
      [401, "GRAPH_AUTH"],
      [302, "GRAPH_REDIRECT"],
    ] as const) {
      const impl = (async () => new Response(null, { status, headers: { Location: "https://evil.example" } })) as unknown as typeof fetch;
      const client = createGraphClient({ getToken: async () => "t", fetchImpl: impl });
      await expect(client.get(`${BASE}?$top=50`)).rejects.toMatchObject({ code });
    }
  });

  test("T-TEAMS-01 sourceMessageRef là SHA-256 ổn định của (team, channel, message id)", () => {
    const a = sourceMessageRef(TEAM_ID, CHANNEL_ID, "r1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceMessageRef(TEAM_ID, CHANNEL_ID, "r1")).toBe(a);
    expect(sourceMessageRef(TEAM_ID, CHANNEL_ID, "r2")).not.toBe(a);
  });
});
