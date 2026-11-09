// `bun run eval:mi1`: chạy bộ eval Mi1 hỏi đáp với Claude thật (tốn token, vài cent). Người vận hành chạy tay mỗi khi
// đổi prompt Mi1 hoặc danh sách truy vấn mẫu. Không chạy trong bun test.
import { join } from "node:path";
import { createAnthropicLlm } from "../agents/sa-01/llm.ts";
import { getEvalResultsDir, getLlmPricing } from "../config.ts";
import { log } from "../log.ts";
import { loadAskEval, runAskEval, writeAskEval } from "./eval.ts";

const ROOT = new URL("../../", import.meta.url).pathname;
const s = await runAskEval(loadAskEval(join(ROOT, "evals/mi1-ask/EVAL_mi1-ask.json")), createAnthropicLlm({ model: getLlmPricing().model }));
writeAskEval(getEvalResultsDir(ROOT), s);
log({ event: "eval.mi1_ask", count: s.passed, error_code: s.gate_passed ? undefined : "GATE_FAILED" });
for (const f of s.failures) log({ event: "eval.mi1_ask.case_failed", run_id: f.id, error_code: f.reasons[0]?.slice(0, 60) });
if (!s.gate_passed) process.exitCode = 1;
