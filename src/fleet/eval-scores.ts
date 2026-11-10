// Điểm eval gần nhất của thuyền viên LLM cho /command (D-82). null: chưa có lượt eval đúng phiên bản prompt.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readEvalStats } from "../agents/sa-01/eval/runner.ts";
import { ASK_PROMPT_VERSION } from "../mi1/ask.ts";

export function readEvalScores(dir: string): Record<string, number | null> {
  const f = join(dir, "mi1-ask-latest.json");
  const ask = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { prompt_version?: string; pass_rate?: number }) : null;
  const sa = readEvalStats(dir);
  const rates = Object.values(sa.stats).filter((t) => t.caseCount > 0).map((t) => t.passRate);
  return {
    mi1: ask && ask.prompt_version === ASK_PROMPT_VERSION && typeof ask.pass_rate === "number" ? ask.pass_rate : null,
    // Mi1-sa-01 có ba việc; lấy điểm thấp nhất để không che việc yếu.
    "mi1-sa-01": sa.evalVersion === "none" || sa.evalVersion === "stale" || rates.length === 0 ? null : Math.min(...rates),
  };
}
