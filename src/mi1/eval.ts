// Eval Gate của Mi1 hỏi đáp (spec mục 6; D-62). Định dạng EVAL_<skill>.json và luật cổng theo repo Mi1
// (ai-native-professional-services, L4_Skills/evals, Design Principle #4): ít nhất 10 ca, tỷ lệ pass tối thiểu riêng.
// Chạy với Claude thật bằng `bun run eval:mi1` (tốn token), gọi đúng chooseTemplate mà /ask dùng.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { LlmClient } from "../agents/sa-01/llm.ts";
import { ASK_PROMPT_VERSION, chooseTemplate } from "./ask.ts";

export const MIN_CASES = 10;
const EvalFile = z.object({
  skill_id: z.literal("mi1-ask"),
  version: z.string().min(1),
  minimum_pass_rate: z.number().min(0).max(1),
  test_cases: z.array(z.object({ id: z.string(), description: z.string(), input: z.object({ question: z.string().min(1) }), expected_output: z.record(z.string(), z.unknown()), pass_criteria: z.string() })),
});
export type AskEvalFile = z.infer<typeof EvalFile>;

export function loadAskEval(path: string): AskEvalFile {
  return EvalFile.parse(JSON.parse(readFileSync(path, "utf8")));
}

// Bộ từ khoá so khớp của repo Mi1 (src/evals/matcher.py), phần cần cho Mi1: <field> bằng nhau (kể cả null),
// <field>_contains (chuỗi con, không phân biệt hoa thường), <field>_not_null.
export function checkCase(expected: Record<string, unknown>, actual: Record<string, unknown>): string[] {
  const fails: string[] = [];
  for (const [key, want] of Object.entries(expected)) {
    if (key.endsWith("_contains")) {
      const f = key.slice(0, -"_contains".length);
      if (!String(actual[f] ?? "").toLowerCase().includes(String(want).toLowerCase())) fails.push(`${f} không chứa "${String(want)}"`);
    } else if (key.endsWith("_not_null")) {
      const f = key.slice(0, -"_not_null".length);
      if (actual[f] === undefined || actual[f] === null || actual[f] === "") fails.push(`${f} trống`);
    } else if ((actual[key] ?? null) !== want) {
      fails.push(`${key}: muốn ${JSON.stringify(want)}, được ${JSON.stringify(actual[key] ?? null)}`);
    }
  }
  return fails;
}

export type AskEvalSummary = { skill_id: "mi1-ask"; version: string; prompt_version: string; ran_at: string; total: number; passed: number; pass_rate: number; minimum_pass_rate: number; gate_passed: boolean; failures: { id: string; reasons: string[] }[] };

export async function runAskEval(file: AskEvalFile, llm: LlmClient, now: Date = new Date()): Promise<AskEvalSummary> {
  const failures: { id: string; reasons: string[] }[] = [];
  for (const tc of file.test_cases) {
    const c = await chooseTemplate(llm, tc.input.question);
    const actual = c.kind === "chosen" ? { template: c.template, ...c.params } : { error: c.errorCode };
    const reasons = c.kind === "error" ? [c.errorCode] : checkCase(tc.expected_output, actual);
    if (reasons.length) failures.push({ id: tc.id, reasons });
  }
  const total = file.test_cases.length;
  const passed = total - failures.length;
  const rate = total ? passed / total : 0;
  return { skill_id: "mi1-ask", version: file.version, prompt_version: ASK_PROMPT_VERSION, ran_at: now.toISOString(), total, passed, pass_rate: rate, minimum_pass_rate: file.minimum_pass_rate,
    gate_passed: total >= MIN_CASES && rate >= file.minimum_pass_rate, failures };
}

const LATEST = "mi1-ask-latest.json";
export function writeAskEval(dir: string, s: AskEvalSummary): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LATEST), JSON.stringify(s, null, 2));
}

// Cổng của /ask: pass khi lượt gần nhất đạt cổng VÀ đúng phiên bản prompt đang chạy (đổi prompt phải chạy lại eval).
export function readAskEvalGate(dir: string): { passed: boolean; version: string } {
  const f = join(dir, LATEST);
  if (!existsSync(f)) return { passed: false, version: "none" };
  const s = JSON.parse(readFileSync(f, "utf8")) as Partial<AskEvalSummary>;
  if (s.prompt_version !== ASK_PROMPT_VERSION) return { passed: false, version: "stale" };
  return { passed: s.gate_passed === true, version: `${s.version ?? "?"}@${s.ran_at ?? "?"}` };
}
