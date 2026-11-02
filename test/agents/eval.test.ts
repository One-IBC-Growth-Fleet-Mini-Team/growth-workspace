// Bộ chạy eval với ca synthetic và LLM giả (không gọi Claude API thật).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCases, readEvalStats, runEval, writeResults, type EvalCase } from "../../src/agents/sa-01/eval/runner.ts";
import { fakeLlm } from "../../src/demo/fake-llm.ts";

const CASES_DIR = new URL("../../evals/sa-01/cases", import.meta.url).pathname;

describe("eval Mi1-sa-01 với ca synthetic", () => {
  test("T-NBA-R1a (eval) mọi ca synthetic hợp lệ, chỉ provenance synthetic, ca nba và pii là hard", () => {
    const cases = loadCases([CASES_DIR]);
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(c.provenance).toBe("synthetic");
      if (c.task === "nba" || c.task === "pii") expect(c.gate).toBe("hard");
    }
  });

  test("T-NBA-R5 (eval) ca NBA pass 100% bằng đúng hàm luật; ca hỏng bị báo hard failure", async () => {
    const cases = loadCases([CASES_DIR]);
    const s = await runEval(cases, fakeLlm());
    expect(s.tasks.nba).toMatchObject({ pass_rate: 1, hard_failures: 0 });
    const broken: EvalCase = { ...cases.find((c) => c.task === "nba")!, case_id: "sa01-nba-9999", expected: { must_include: [{ subject_ref: "C1", action: "handoff_team" }] } };
    const s2 = await runEval([broken], fakeLlm());
    expect(s2.tasks.nba).toMatchObject({ pass_rate: 0, hard_failures: 1 });
  });

  test("T-PII-05 (eval) ca PII: bản lưu không chứa chuỗi must_not_contain", async () => {
    const s = await runEval(loadCases([CASES_DIR]).filter((c) => c.task === "pii"), fakeLlm());
    expect(s.tasks.pii).toMatchObject({ passed: 2, hard_failures: 0 });
  });

  test("T-MET-06 (eval) tỷ lệ pass cho compute_confidence đọc từ kết quả eval; thiếu hoặc lệch phiên bản thì 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-eval-"));
    try {
      expect(readEvalStats(dir).stats.nba.passRate).toBe(0);
      const s = await runEval(loadCases([CASES_DIR]), fakeLlm());
      writeResults(dir, s);
      const { stats, evalVersion } = readEvalStats(dir);
      expect(stats.nba).toEqual({ passRate: 1, caseCount: 4 });
      expect(stats.self_report_parse.caseCount).toBe(2);
      expect(evalVersion).toMatch(/^sa01-prompt\//);
      writeResults(dir, { ...s, prompt_version: "sa01-prompt/0.0.0" });
      expect(readEvalStats(dir).stats.self_report_parse.passRate).toBe(0);
      writeResults(dir, { ...s, tasks: { ...s.tasks, pii: { ...s.tasks.pii!, hard_failures: 1 } } });
      expect(readEvalStats(dir).stats.reason_code.passRate).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("T-PII-07 (eval) kết quả eval chỉ chứa mã ca và lý do, không chép đầu vào", async () => {
    const s = await runEval(loadCases([CASES_DIR]), fakeLlm());
    expect(JSON.stringify(s)).not.toMatch(/CANARY|canary\+|7700/);
  });
});
