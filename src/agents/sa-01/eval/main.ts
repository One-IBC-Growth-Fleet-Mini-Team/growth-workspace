// Chạy eval với Claude API thật: `bun run eval:sa01`. Tốn tiền token; người vận hành chạy tay
// mỗi khi đổi prompt, danh mục mã hoặc luật (spec mục 6). Không chạy trong bun test.
import { join } from "node:path";
import { getEvalResultsDir, getLlmPricing, getPrivateEvalDir } from "../../../config.ts";
import { log } from "../../../log.ts";
import { createAnthropicLlm } from "../llm.ts";
import { loadCases, runEval, writeResults } from "./runner.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const dirs = [join(ROOT, "evals/sa-01/cases")];
const priv = getPrivateEvalDir();
if (priv) dirs.push(join(priv, "cases"));

const summary = await runEval(loadCases(dirs), createAnthropicLlm({ model: getLlmPricing().model }));
writeResults(getEvalResultsDir(ROOT), summary);
for (const [task, t] of Object.entries(summary.tasks)) {
  log({ event: `eval.${task}`, count: t.passed, error_code: t.hard_failures > 0 ? "HARD_GATE_FAILED" : undefined });
}
