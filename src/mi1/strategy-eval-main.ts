// `bun run eval:strategy`: chạy bộ eval đề xuất chiến lược với Claude thật (tốn token). Chạy tay khi đổi prompt. Không chạy trong bun test.
import { join } from "node:path";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { getEvalResultsDir, getLlmPricing } from "../config.ts";
import { log } from "../log.ts";
import { loadStrategyEval, runStrategyEval, writeStrategyEval } from "./strategy-eval.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const s = await runStrategyEval(loadStrategyEval(join(ROOT, "evals/mi1-strategy/EVAL_mi1-strategy.json")), createAnthropicLlm({ model: getLlmPricing().model }));
writeStrategyEval(getEvalResultsDir(ROOT), s);
log({ event: "eval.mi1_strategy", count: s.passed, error_code: s.gate_passed ? undefined : "GATE_FAILED" });
for (const f of s.failures) log({ event: "eval.mi1_strategy.case_failed", run_id: f.id, error_code: f.reasons[0]?.slice(0, 60) });
if (!s.gate_passed) process.exitCode = 1;
