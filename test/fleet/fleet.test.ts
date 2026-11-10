// T-FLEET-01 tới T-FLEET-06: điều phối Mi1 (PHẦN 7B, D-82). Lượt chạy cha và con, thuyền viên tắt không bị gọi,
// tool ngoài danh sách bị chặn, chạm trần chi phí thì chặn cả phiên, trang /command cho Mark và BOD.
import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { LlmRequest } from "../../src/agents/sa-01/llm.ts";
import { insertAgentRun } from "../../src/db/queue.ts";
import { runCron06 } from "../../src/fleet/cron06.ts";
import { FleetSession, latestSession } from "../../src/fleet/orchestrate.ts";
import { CREW, crewForTool, parseDisabled } from "../../src/fleet/registry.ts";
import { sumCostUsd } from "../../src/metrics/cost.ts";
import { APPROVED_QUERIES } from "../../src/mi1/approved-queries.ts";
import { askMi1 } from "../../src/mi1/ask.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const PRICE = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const GATE = { passed: true, version: "1.0.0@t" };
function fakeLlm(text: string, tokens = 1000) {
  const calls: LlmRequest[] = [];
  return { calls, async complete(req: LlmRequest) { calls.push(req); return { text, inputTokens: tokens, outputTokens: 0, model: "fake", refused: false }; } };
}
const count = (db: Database, t: string) => (db.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
const bigRun = (db: Database) => insertAgentRun(db, { id: "big", agent: "mi1-sa-01", trigger: "cron-05", prompt_version: "p", eval_version: "e", model: "m", input_tokens: 1, output_tokens: 1, cost_usd: 100, status: "succeeded", started_at: "2026-11-05T01:00:00Z", finished_at: "2026-11-05T01:00:00Z" });

describe("T-FLEET điều phối Mi1", () => {
  test("T-FLEET-01 một câu /ask tạo đúng một lượt chạy cha và hai lượt con có đủ vết; không lưu PII", async () => {
    const db = freshDb();
    const r = await askMi1(db, fakeLlm('{"template":"channel_health","params":{}}'), "Kênh ổn không? gửi canary.person@example.com", { now: NOW, actor: "mark", price: PRICE, evalGate: GATE });
    expect(r.status).toBe("answered");
    expect(count(db, "fleet_sessions")).toBe(1);
    const s = latestSession(db)!;
    expect(s.status).toBe("succeeded");
    expect(s.steps.map((x) => [x.crewId, x.tool, x.status])).toEqual([["mi1", "choose_template", "succeeded"], ["mi1-mkt-05", "query:channel_health", "succeeded"]]);
    expect(s.steps[0]!.gates).toEqual(["crew_registered", "crew_enabled", "tool_allowed", "cost_cap", "r1_pii", "eval_gate"]);
    expect(s.steps[0]!.costUsd).toBeCloseTo(0.002);
    expect(JSON.stringify(db.query("SELECT * FROM fleet_sessions").all()) + JSON.stringify(db.query("SELECT * FROM fleet_steps").all())).not.toContain("canary");
  });

  test("T-FLEET-02 thuyền viên đang tắt không bị gọi; phiên ghi bị chặn", async () => {
    const db = freshDb();
    const r = await askMi1(db, fakeLlm('{"template":"channel_health","params":{}}'), "Kênh ổn không?", { now: NOW, actor: "mark", price: PRICE, evalGate: GATE, disabled: parseDisabled("mi1-mkt-05, x") });
    expect(r).toMatchObject({ status: "failed", errorCode: "CREW_DISABLED" });
    const s = latestSession(db)!;
    expect([s.status, s.reason]).toEqual(["blocked", "CREW_DISABLED"]);
    expect(s.steps[1]).toMatchObject({ crewId: "mi1-mkt-05", status: "blocked" });
    let called = 0;
    const fs = new FleetSession(db, { trigger: "test", actor: "mark", inputSummary: "x", now: () => NOW, disabled: new Set(["mi1-ptn-01"]), capUsd: 100 });
    expect(await fs.call("mi1-ptn-01", "calc_commission", "x", () => { called = 1; return { value: 1, resultSummary: "ok" }; })).toEqual({ ok: false, errorCode: "CREW_DISABLED" });
    expect(called).toBe(0);
  });

  test("T-FLEET-03 tool ngoài danh sách của thuyền viên bị chặn, không chạy; thuyền viên lạ bị chặn", async () => {
    const db = freshDb();
    let called = 0;
    const fs = new FleetSession(db, { trigger: "test", actor: "mark", inputSummary: "x", now: () => NOW, disabled: new Set(), capUsd: 100 });
    const fn = () => { called += 1; return { value: 1, resultSummary: "ok" }; };
    expect(await fs.call("mi1-mkt-05", "calc_commission", "x", fn)).toEqual({ ok: false, errorCode: "TOOL_NOT_ALLOWED" });
    expect(await fs.call("mi1-sa-01", "send_email", "x", fn)).toEqual({ ok: false, errorCode: "TOOL_NOT_ALLOWED" });
    expect(await fs.call("ai-do", "query:lessons", "x", fn)).toEqual({ ok: false, errorCode: "CREW_UNKNOWN" });
    expect(called).toBe(0);
    expect((await fs.call("mi1-ptn-01", "calc_commission", "x", fn)).ok).toBe(true);
    expect(called).toBe(1);
    expect(latestSession(db)!.steps.map((s) => s.status)).toEqual(["blocked", "blocked", "blocked", "succeeded"]);
  });

  test("T-FLEET-04 chạm trần chi phí tháng thì chặn cả phiên: không gọi LLM, không bước nào; giữa phiên thì dừng bước sau", async () => {
    const db = freshDb();
    bigRun(db);
    const llm = fakeLlm('{"template":"channel_health","params":{}}');
    expect(await askMi1(db, llm, "Kênh ổn không?", { now: NOW, actor: "mark", price: PRICE, evalGate: GATE })).toMatchObject({ status: "failed", errorCode: "COST_CAP" });
    expect(llm.calls.length).toBe(0);
    expect(latestSession(db)).toMatchObject({ status: "blocked", reason: "COST_CAP", steps: [] });
    const db2 = freshDb();
    // Bước 1 tốn 100 USD (50 triệu token vào x 2 USD) nên bước 2 bị chặn.
    const r = await askMi1(db2, fakeLlm('{"template":"channel_health","params":{}}', 50_000_000), "Kênh?", { now: NOW, actor: "mark", price: PRICE, evalGate: GATE });
    expect(r).toMatchObject({ status: "failed", errorCode: "COST_CAP" });
    const s = latestSession(db2)!;
    expect([s.status, s.steps.map((x) => x.status)]).toEqual(["blocked", ["succeeded", "blocked"]]);
    expect(await runCron06(db, NOW, new Set())).toMatchObject({ applied: null, errorCode: "COST_CAP" });
  });

  test("T-FLEET-05 danh bạ: đủ thuyền viên trong spec, mỗi tool một chủ, mọi mẫu truy vấn có chủ; tổng chi phí qua hàm", () => {
    expect(CREW.map((c) => c.id)).toEqual(["mi1", "mi1-data-01", "mi1-sa-01", "mi1-ptn-01", "mi1-mkt-01", "mi1-mkt-02", "mi1-mkt-03", "mi1-mkt-04", "mi1-mkt-05"]);
    const tools = CREW.flatMap((c) => c.tools);
    expect(new Set(tools).size).toBe(tools.length);
    for (const k of Object.keys(APPROVED_QUERIES)) expect(crewForTool(`query:${k}`)).not.toBeNull();
    expect(tools.some((t) => /send|post|publish|write|update|delete/i.test(t))).toBe(false);
    expect(sumCostUsd([{ costUsd: 0.1 }, { costUsd: 0.2 }])).toBe(0.3);
    expect(sumCostUsd([])).toBe(0);
  });

  test("T-FLEET-06 /command: Mark và BOD xem vết CRON-06 và /ask, tự tải lại 5 giây; Amy và MKT không thấy việc chờ Mark", async () => {
    const db = freshDb();
    await runCron06(db, NOW, new Set());
    const { app } = makeApp(db, { fleetDisabled: new Set(["mi1-mkt-03"]), evalScores: () => ({ mi1: 0.9 }) });
    for (const who of ["mark", "bod"] as const) {
      const res = await get(app, "/command", session({ id: who, role: "viewer" }).cookie);
      expect(res.status).toBe(200);
      expect(res.headers.get("refresh")).toBe("5");
      const page = await res.text();
      expect(page).toContain("CRON-06");
      expect(page).toContain("apply_defaults");
      expect(page).toContain("áp mặc định 0 mục");
      expect(page).toContain("(đang tắt)");
      expect(page).toContain("Eval: 90%");
      expect(page).toContain("trần 100 USD");
    }
    // Từ D-92: mọi vai trò vào được (module theo vai), nhưng việc chờ Mark chỉ Mark, BOD thấy.
    for (const u of [AMY, { id: "mkt", role: "mkt" } as const]) {
      const r = await get(app, "/command", session(u).cookie);
      expect(r.status).toBe(200);
      expect(await r.text()).not.toContain("Việc chờ Mark");
    }
  });
});
