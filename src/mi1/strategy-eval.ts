// Eval Gate của đề xuất chiến lược tuần (D-91), cùng khuôn với Mi1 hỏi đáp (D-62): ít nhất 10 ca, tỷ lệ pass tối thiểu
// 0,8. Một ca pass khi LLM trả đúng dạng, không câu nào bị loại (số ngoài gói, mã sai), đủ số câu và có câu cho mỗi câu
// hỏi bắt buộc. Chạy với Claude thật bằng `bun run eval:strategy`; gọi đúng writeStatements mà /strategy dùng.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { LlmClient } from "../agents/sa-01/llm.ts";
import { STRATEGY_PROMPT_VERSION, writeStatements, type StrategyPack } from "./strategy.ts";

const MIN_CASES = 10;
const EvalFile = z.object({
  skill_id: z.literal("mi1-strategy"), version: z.string().min(1), minimum_pass_rate: z.number().min(0).max(1),
  test_cases: z.array(z.object({ id: z.string(), description: z.string(), input: z.object({ pack: z.custom<StrategyPack>((v) => typeof v === "object" && v !== null) }),
    expected_output: z.object({ min_statements: z.number().int().nonnegative(), must_cover: z.array(z.number().int().min(1).max(7)) }), pass_criteria: z.string() })),
});
export type StrategyEvalFile = z.infer<typeof EvalFile>;
export type StrategyEvalSummary = { skill_id: "mi1-strategy"; version: string; prompt_version: string; ran_at: string; total: number; passed: number; pass_rate: number; gate_passed: boolean; failures: { id: string; reasons: string[] }[] };

export function loadStrategyEval(path: string): StrategyEvalFile {
  return EvalFile.parse(JSON.parse(readFileSync(path, "utf8")));
}

export async function runStrategyEval(file: StrategyEvalFile, llm: LlmClient, now: Date = new Date()): Promise<StrategyEvalSummary> {
  const failures: { id: string; reasons: string[] }[] = [];
  for (const tc of file.test_cases) {
    const r = await writeStatements(llm, tc.input.pack);
    const reasons: string[] = [];
    if (r.errorCode) reasons.push(r.errorCode);
    if (r.dropped) reasons.push(`${r.dropped} câu bị loại`);
    if (r.kept.length < tc.expected_output.min_statements) reasons.push(`chỉ ${r.kept.length} câu`);
    const covered = new Set(r.kept.flatMap((s) => s.refs.map((x) => Number(x.slice(1, x.indexOf("."))))));
    for (const q of tc.expected_output.must_cover) if (!covered.has(q)) reasons.push(`thiếu câu hỏi ${q}`);
    if (reasons.length) failures.push({ id: tc.id, reasons });
  }
  const total = file.test_cases.length;
  const passed = total - failures.length;
  const rate = total ? passed / total : 0;
  return { skill_id: "mi1-strategy", version: file.version, prompt_version: STRATEGY_PROMPT_VERSION, ran_at: now.toISOString(), total, passed, pass_rate: rate,
    gate_passed: total >= MIN_CASES && rate >= file.minimum_pass_rate, failures };
}

const LATEST = "mi1-strategy-latest.json";
export function writeStrategyEval(dir: string, s: StrategyEvalSummary): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LATEST), JSON.stringify(s, null, 2));
}

// Cổng của /strategy: lượt gần nhất đạt cổng và đúng phiên bản prompt đang chạy.
export function readStrategyEvalGate(dir: string): { passed: boolean; version: string } {
  const f = join(dir, LATEST);
  if (!existsSync(f)) return { passed: false, version: "none" };
  const s = JSON.parse(readFileSync(f, "utf8")) as Partial<StrategyEvalSummary>;
  if (s.prompt_version !== STRATEGY_PROMPT_VERSION) return { passed: false, version: "stale" };
  return { passed: s.gate_passed === true, version: `${s.version ?? "?"}@${s.ran_at ?? "?"}` };
}
