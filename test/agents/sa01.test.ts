// T-SA-01 tới T-SA-05 và T-PII-05: phần code bao quanh LLM của Mi1-sa-01 (LLM giả, Graph giả).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import type { Database } from "bun:sqlite";
import { runSa01, type Sa01Deps } from "../../src/agents/sa-01/run.ts";
import { structureReport } from "../../src/agents/sa-01/structure.ts";
import { directCrmReadTools } from "../../src/mcp/crm-read/client.ts";
import { createGraphClient } from "../../src/teams/graph-read.ts";
import { setLogSink } from "../../src/log.ts";
import { client, freshDb, opp, seedSnapshot } from "../helpers/db.ts";
import { deterministicOutput, extractDataBlock, fakeLlm } from "../helpers/fake-llm.ts";
import { CHANNEL_ID, TEAM_ID, reply, rootMessage } from "../fixtures/synthetic/teams.ts";

const NOW = new Date("2026-11-02T01:00:00.000Z"); // 08:00 giờ Việt Nam, thứ Hai
const PRICE = { model: "fake-model", inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const EVAL_OK = {
  self_report_parse: { passRate: 1, caseCount: 30 },
  reason_code: { passRate: 1, caseCount: 30 },
  nba: { passRate: 1, caseCount: 30 },
};

const CANARY_REPLY =
  "<p>[31/10] [RM] RM_A</p><p>TIẾP CẬN: 5 lead</p><p>KHÁCH NÓI: CANARY_NAME_7f3a nói Cost wise its expensive, mail canary+1@example.invalid, gọi +44 7700 900123</p>";

function graphFor(replies: ReturnType<typeof reply>[]) {
  const base = `/v1.0/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages`;
  const routes: Record<string, unknown> = {
    [`${base}?$top=50`]: { value: [rootMessage("root_0111", "31/10")] },
    [`${base}/root_0111/replies?$top=50`]: { value: replies },
  };
  const impl = (async (input: string | URL | Request) => {
    const key = String(input).replace("https://graph.microsoft.com", "");
    return key in routes ? Response.json(routes[key]) : new Response("nf", { status: 404 });
  }) as typeof fetch;
  return { client: createGraphClient({ getToken: async () => "t", fetchImpl: impl }), teamId: TEAM_ID, channelId: CHANNEL_ID };
}

let db: Database;
let logs: string[];
let restore: ReturnType<typeof setLogSink>;

beforeEach(() => {
  db = freshDb();
  db.run("INSERT INTO rm_directory (rm_id, display_name, teams_user_id) VALUES ('RM_A', 'RM_A', 'aad_a'), ('RM_B', 'RM_B', 'aad_b')");
  logs = [];
  restore = setLogSink((l) => logs.push(l));
});
afterEach(() => setLogSink(restore));

function deps(over: Partial<Sa01Deps> = {}): Sa01Deps {
  return {
    db,
    crm: directCrmReadTools(db),
    graph: graphFor([reply("r1", "aad_a", CANARY_REPLY, "html")]),
    llm: fakeLlm(),
    pricing: PRICE,
    evalStats: EVAL_OK,
    now: () => NOW,
    ...over,
  };
}

const items = (type?: string) =>
  db.query(`SELECT item_type, payload, rules_fired, confidence FROM queue_items ${type ? "WHERE item_type = ?" : ""} ORDER BY id`).all(...(type ? [type] : [])) as {
    item_type: string; payload: string; rules_fired: string; confidence: number;
  }[];

function seedFresh() {
  seedSnapshot(db, {
    opportunities: [opp("O1", { close_date: "2026-11-20" })],
    clients: [client("C1", { first_won_at: "2025-01-01" })],
  }, { at: "2026-11-01T23:30:00.000Z" });
}

describe("T-SA-01 sai schema", () => {
  test("T-SA-01 đầu ra sai schema: thử lại đúng 1 lần rồi parse_failed", async () => {
    const llm = fakeLlm(() => '{"not":"the schema"}');
    const r = await structureReport(llm, { reportDate: "2026-10-31", parsed: { headerDate: null, sections: {}, unlabeled: ["x"], flags: ["unstructured"], redactionStats: { email: 0, phone: 0, id_doc: 0, dob: 0, url: 0 } } });
    expect(r.status).toBe("parse_failed");
    expect(llm.calls.length).toBe(2);
    expect(r.usages.length).toBe(2);
  });

  test("T-SA-01 lần thử lại đúng schema thì ok; JSON hỏng cũng tính là sai schema", async () => {
    const llm = fakeLlm((req, n) => (n === 1 ? "không phải JSON" : JSON.stringify(deterministicOutput(extractDataBlock(req.user)))));
    const r = await structureReport(llm, { reportDate: "2026-10-31", parsed: { headerDate: "31/10", sections: { outreach: ["5"] }, unlabeled: [], flags: [], redactionStats: { email: 0, phone: 0, id_doc: 0, dob: 0, url: 0 } } });
    expect(r.status).toBe("ok");
    expect(llm.calls.length).toBe(2);
  });

  test("T-SA-01 cả lượt chạy: mục tự báo parse_failed chỉ còn link Teams", async () => {
    seedFresh();
    await runSa01("2026-11-02", deps({ llm: fakeLlm(() => "{}") }));
    const [sr] = items("self_report");
    expect(JSON.parse(sr!.payload)).toEqual({ status: "parse_failed", report_date: "2026-10-31", rm_id: "RM_A", source_link: "https://teams.example.invalid/l/message/r1" });
    expect(items("reason_code")).toEqual([]);
  });
});

describe("T-SA-01 lỗi LLM tạm thời", () => {
  test("T-SA-01 LLM lỗi mạng: không ghi rm_reports, có mục hệ thống; lượt sau đọc lại được", async () => {
    seedFresh();
    const broken = fakeLlm(() => { throw new Error("timeout"); });
    const clean = graphFor([reply("r1", "aad_a", "TIẾP CẬN: 5 lead")]);
    await runSa01("2026-11-02", deps({ llm: broken, graph: clean }));
    expect(db.query("SELECT COUNT(*) AS n FROM rm_reports").get()).toEqual({ n: 0 });
    expect(items("self_report")).toEqual([]);
    expect(items("system_notice").map((i) => JSON.parse(i.payload).kind)).toContain("llm_error");
    await runSa01("2026-11-02", deps({ graph: clean, now: () => new Date("2026-11-02T02:00:00.000Z") }));
    expect(JSON.parse(items("self_report")[0]!.payload).status).toBe("ok");
  });

  test("T-SA-01 parse_failed không lưu nội dung và đánh dấu pii_check blocked (không có gì được kiểm)", async () => {
    seedFresh();
    await runSa01("2026-11-02", deps({ llm: fakeLlm(() => "{}") }));
    expect(db.query("SELECT parsed, pii_check FROM rm_reports").all()).toEqual([{ parsed: null, pii_check: "blocked" }]);
  });
});

describe("T-SA-02 danh mục mã lý do", () => {
  const parsed = { headerDate: "31/10", sections: { customer_said: ["x"] }, unlabeled: [], flags: [] as "unstructured"[], redactionStats: { email: 0, phone: 0, id_doc: 0, dob: 0, url: 0 } };
  const withProposal = (p: Record<string, unknown>) => (req: { user: string }) => {
    const out = deterministicOutput(extractDataBlock(req.user));
    out.reason_code_proposals = [{ customer_ref: "KHACH_1", primary: "PRICE_TOO_HIGH", secondary: null, is_final: true, evidence_quote: "x", opportunity_hint: { jurisdiction_code: null, service_family: null }, ...p }];
    return JSON.stringify(out);
  };

  test("T-SA-02 mã ngoài danh mục bị từ chối", async () => {
    const r = await structureReport(fakeLlm(withProposal({ primary: "TOO_EXPENSIVE" })), { reportDate: "2026-10-31", parsed });
    expect(r.status).toBe("parse_failed");
  });

  test("T-SA-02 OTHER thiếu evidence_quote bị từ chối; có trích dẫn thì nhận", async () => {
    expect((await structureReport(fakeLlm(withProposal({ primary: "OTHER", evidence_quote: null })), { reportDate: "2026-10-31", parsed })).status).toBe("parse_failed");
    expect((await structureReport(fakeLlm(withProposal({ primary: "OTHER", evidence_quote: "  " })), { reportDate: "2026-10-31", parsed })).status).toBe("parse_failed");
    expect((await structureReport(fakeLlm(withProposal({ primary: "OTHER", evidence_quote: "khách tự làm" })), { reportDate: "2026-10-31", parsed })).status).toBe("ok");
  });
});

describe("T-SA-03 không tự cộng số", () => {
  test("T-SA-03 số đếm trong payload bằng đúng số trong đầu ra đã kiểm schema", async () => {
    seedFresh();
    const clean = "TIẾP CẬN: 12 lead\nHỘI THOẠI: 4\nCHƯA LÊN HỆ THỐNG: 2\nKHÁCH NÓI: Cost wise its expensive";
    await runSa01("2026-11-02", deps({ graph: graphFor([reply("r1", "aad_a", clean)]) }));
    const payload = JSON.parse(items("self_report")[0]!.payload);
    expect(payload.sections.outreach.count).toBe(12);
    expect(payload.sections.conversations.count).toBe(4);
    expect(payload.sections.not_in_crm.count).toBe(2);
  });

  test("T-SA-03 (tĩnh) src/agents/ và src/queue/ không có reduce, +=, ++", async () => {
    const root = new URL("../../", import.meta.url).pathname;
    for (const dir of ["src/agents", "src/queue"]) {
      for await (const path of new Glob(`${dir}/**/*.ts`).scan({ cwd: root })) {
        const code = (await Bun.file(root + path).text()).replace(/\/\/.*$/gm, "");
        expect({ path, hit: /\.reduce\s*\(|\+=|\+\+/.test(code) }).toEqual({ path, hit: false });
      }
    }
  });
});

describe("T-SA-04 nhật ký phiên và trần chi phí", () => {
  test("T-SA-04 ghi agent_runs với token và chi phí tính bằng hàm", async () => {
    seedFresh();
    const r = await runSa01("2026-11-02", deps());
    const run = db.query("SELECT * FROM agent_runs WHERE id = ?").get(r.agentRunId) as Record<string, unknown>;
    expect(run).toMatchObject({ agent: "mi1-sa-01", input_tokens: 1000, output_tokens: 200, model: "fake-model", status: "succeeded" });
    expect(run.cost_usd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6, 10);
    expect(run.prompt_version).toMatch(/^sa01-prompt\//);
  });

  test("T-SA-04 chạm trần chi phí tháng thì dừng gọi LLM, vẫn sinh NBA, có mục hệ thống", async () => {
    seedFresh();
    db.run(
      `INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens, cost_usd, status, started_at, finished_at)
       VALUES ('old', 'mi1-sa-01', 'cron-05', 'p', 'e', 'm', 0, 0, 100, 'succeeded', '2026-11-01T01:00:00Z', '2026-11-01T01:05:00Z')`,
    );
    const llm = fakeLlm();
    await runSa01("2026-11-02", deps({ llm }));
    expect(llm.calls.length).toBe(0);
    expect(items("nba").length).toBeGreaterThan(0);
    expect(items("system_notice").map((i) => JSON.parse(i.payload).kind)).toContain("llm_cost_cap");
  });

  test("T-SA-04 chi phí tháng trước không tính vào trần tháng này", async () => {
    seedFresh();
    db.run(
      `INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens, cost_usd, status, started_at, finished_at)
       VALUES ('old', 'mi1-sa-01', 'cron-05', 'p', 'e', 'm', 0, 0, 100, 'succeeded', '2026-10-30T01:00:00Z', '2026-10-30T01:05:00Z')`,
    );
    const llm = fakeLlm();
    await runSa01("2026-11-02", deps({ llm }));
    expect(llm.calls.length).toBe(1);
  });
});

describe("T-SA-04 lỗi giữa chừng", () => {
  test("T-SA-04 lỗi sau khi đã gọi LLM vẫn ghi agent_runs với token đã tiêu (trần chi phí không bị đếm thiếu)", async () => {
    seedFresh();
    const crm = directCrmReadTools(db);
    const failing = { ...crm, getPipelineByCloseDate: async () => { throw new TypeError("boom"); } };
    await expect(runSa01("2026-11-02", deps({ crm: failing }))).rejects.toThrow();
    expect(db.query("SELECT status, input_tokens FROM agent_runs").all()).toEqual([{ status: "failed", input_tokens: 1000 }]);
  });

  test("T-SA-04 cờ reseller lấy từ cùng snapshot với pipeline, không gọi MCP từng khách", async () => {
    seedFresh();
    const crm = directCrmReadTools(db);
    let calls = 0;
    const counting = { ...crm, checkResellerFlag: async (a: { client_id: string }) => { calls = calls + 1; return crm.checkResellerFlag(a); } };
    await runSa01("2026-11-02", deps({ crm: counting }));
    expect(calls).toBe(0);
    expect(items("nba").length).toBeGreaterThan(0);
  });
});

describe("T-SA-05 điều kiện bật", () => {
  test("T-SA-05 không có snapshot succeeded trong 24 giờ thì không sinh NBA, sinh mục hệ thống", async () => {
    seedSnapshot(db, { opportunities: [opp("O1")] }, { at: "2026-10-31T23:30:00.000Z" });
    await runSa01("2026-11-02", deps());
    expect(items("nba")).toEqual([]);
    expect(items("system_notice").map((i) => JSON.parse(i.payload).kind)).toContain("crm_snapshot_missing");
    expect(items("self_report").length).toBe(1);
  });

  test("T-SA-05 không đọc được Teams thì không sinh mục tự báo, vẫn sinh NBA", async () => {
    seedFresh();
    await runSa01("2026-11-02", deps({ graph: null }));
    expect(items("self_report")).toEqual([]);
    expect(items("nba").length).toBeGreaterThan(0);
    expect(items("system_notice").map((i) => JSON.parse(i.payload).kind)).toContain("teams_unavailable");
  });

  test("T-SA-05 bộ eval NBA chưa pass 100% thì không sinh NBA", async () => {
    seedFresh();
    await runSa01("2026-11-02", deps({ evalStats: { ...EVAL_OK, nba: { passRate: 0.9, caseCount: 30 } } }));
    expect(items("nba")).toEqual([]);
    expect(items("system_notice").map((i) => JSON.parse(i.payload).kind)).toContain("nba_eval_gate");
  });

  test("T-SA-05 sáng thứ Hai đọc tự báo thứ Bảy (A-06)", async () => {
    seedFresh();
    const r = await runSa01("2026-11-02", deps());
    expect(r.reportDate).toBe("2026-10-31");
  });
});

describe("T-PII-05 đầu cuối", () => {
  test("T-PII-05 bộ tin tổng hợp chứa canary: dump DB, log và đầu vào LLM không chứa canary", async () => {
    seedFresh();
    const llm = fakeLlm((req) => {
      // LLM giả "lỡ" chép tên khách vào đầu ra: R3 phải chặn.
      const out = deterministicOutput(extractDataBlock(req.user));
      return JSON.stringify(out);
    });
    await runSa01("2026-11-02", deps({
      llm,
      graph: graphFor([
        reply("r1", "aad_a", CANARY_REPLY, "html"),
        reply("r2", "aad_b", "TIẾP CẬN: 3\nKHÁCH NÓI: CANARY_NAME_b21c (canary+2@example.invalid, +1 202 555 0142) chê giá"),
      ]),
    }));
    const sent = llm.calls.map((c) => c.user).join("\n");
    for (const c of ["canary+1@example.invalid", "canary+2@example.invalid", "7700 900123", "555 0142"]) expect(sent).not.toContain(c);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const dump = JSON.stringify(tables.map((t) => db.query(`SELECT * FROM "${t.name}"`).all())).toLowerCase();
    const bytes = new TextDecoder().decode(db.serialize()).toLowerCase();
    for (const c of ["canary_name_7f3a", "canary_name_b21c", "canary+1@example.invalid", "canary+2@example.invalid", "900123", "5550142", "555 0142"]) {
      expect(dump).not.toContain(c);
      expect(bytes).not.toContain(c);
      expect(logs.join("\n").toLowerCase()).not.toContain(c);
    }
    const blocked = db.query("SELECT pii_check, parsed FROM rm_reports ORDER BY rm_id").all();
    expect(blocked).toEqual([
      { pii_check: "blocked", parsed: null },
      { pii_check: "blocked", parsed: null },
    ]);
  });
});
