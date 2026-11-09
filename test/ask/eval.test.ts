// T-ASK-05 tới T-ASK-07: Eval Gate của Mi1 hỏi đáp theo chuẩn repo Mi1 (EVAL_<skill>.json, ít nhất 10 ca; D-62).
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmRequest } from "../../src/agents/sa-01/llm.ts";
import { askMi1 } from "../../src/mi1/ask.ts";
import { APPROVED_QUERIES } from "../../src/mi1/approved-queries.ts";
import { checkCase, loadAskEval, MIN_CASES, readAskEvalGate, runAskEval, writeAskEval } from "../../src/mi1/eval.ts";
import { freshDb } from "../helpers/db.ts";

const FILE = loadAskEval(new URL("../../evals/mi1-ask/EVAL_mi1-ask.json", import.meta.url).pathname);
const NOW = new Date("2026-11-09T02:00:00Z");
// LLM giả trả đúng đáp án của từng ca (tra theo câu hỏi trong khối <cau_hoi>).
function oracle(wrongIds: string[] = []) {
  const calls: LlmRequest[] = [];
  return { calls, async complete(req: LlmRequest) {
    calls.push(req);
    const tc = FILE.test_cases.find((c) => req.user.includes(c.input.question))!;
    const e = tc.expected_output as Record<string, unknown>;
    const params: Record<string, unknown> = {};
    if (typeof e.week === "string") params.week = e.week;
    if (typeof e.query_contains === "string") params.query = `về ${e.query_contains}`;
    if (e.query_not_null) params.query = "ngân sách";
    const template = wrongIds.includes(tc.id) ? "hook_board" : e.template;
    return { text: JSON.stringify({ template, params }), inputTokens: 1, outputTokens: 1, model: "fake", refused: false };
  } };
}

describe("T-ASK eval gate", () => {
  test("T-ASK-05 file eval đúng chuẩn: ít nhất 10 ca, mẫu kỳ vọng đều có thật, có ca phải trả null, ngưỡng từ 0,9", () => {
    expect(FILE.test_cases.length).toBeGreaterThanOrEqual(MIN_CASES);
    expect(FILE.minimum_pass_rate).toBeGreaterThanOrEqual(0.9);
    for (const tc of FILE.test_cases) {
      const t = tc.expected_output.template;
      expect(t === null || Object.hasOwn(APPROVED_QUERIES, String(t))).toBe(true);
    }
    expect(FILE.test_cases.some((c) => c.expected_output.template === null)).toBe(true);
    expect(new Set(FILE.test_cases.map((c) => c.id)).size).toBe(FILE.test_cases.length);
    expect(checkCase({ template: "lessons", query_contains: "GIÁ" }, { template: "lessons", query: "về giá gói" })).toEqual([]);
    expect(checkCase({ template: null, week_not_null: true }, { template: "x" })).toEqual(['template: muốn null, được "x"', "week trống"]);
  });

  test("T-ASK-06 chạy eval: đúng hết thì đạt cổng; sai 2 trên 14 thì dưới 0,9 nên trượt, ghi mã ca", async () => {
    const ok = await runAskEval(FILE, oracle(), NOW);
    expect(ok).toMatchObject({ total: FILE.test_cases.length, passed: FILE.test_cases.length, gate_passed: true, failures: [] });
    const bad = await runAskEval(FILE, oracle(["TC-001", "TC-012"]), NOW);
    expect(bad.gate_passed).toBe(false);
    expect(bad.failures.map((f) => f.id)).toEqual(["TC-001", "TC-012"]);
  });

  test("T-ASK-07 /ask chỉ gọi LLM khi lượt eval gần nhất đạt cổng và đúng phiên bản prompt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mi1-eval-"));
    expect(readAskEvalGate(dir)).toEqual({ passed: false, version: "none" });
    const llm = oracle();
    const opts = { now: NOW, actor: "mark", price: { inputUsdPerMTok: 1, outputUsdPerMTok: 1 }, evalGate: readAskEvalGate(dir) };
    expect(await askMi1(freshDb(), llm, "Chi phí LLM tháng này bao nhiêu so với trần?", opts)).toMatchObject({ status: "failed", errorCode: "EVAL_NOT_PASSED" });
    expect(llm.calls).toHaveLength(0);
    writeAskEval(dir, await runAskEval(FILE, oracle(), NOW));
    expect(readAskEvalGate(dir).passed).toBe(true);
    writeAskEval(dir, { ...(await runAskEval(FILE, oracle(), NOW)), prompt_version: "mi1-ask-v0" });
    expect(readAskEvalGate(dir)).toEqual({ passed: false, version: "stale" });
  });
});
