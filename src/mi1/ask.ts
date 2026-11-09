// Mi1 nhận câu hỏi (spec mục 6 "Nhận câu hỏi, gọi thuyền viên, gom kết quả"; mục 4 Cypher mẫu đã duyệt; D-58).
// LLM chỉ chọn một truy vấn mẫu trong APPROVED_QUERIES và tham số; số liệu do hàm có test tính (CLAUDE.md quy tắc 3).
// Câu hỏi qua lọc R1 trước khi gửi LLM. Không có mẫu phù hợp thì trả no_template, không để LLM tự trả lời.
// Mỗi lần hỏi ghi một agent_runs của Mi1 (token, chi phí); chạm trần chi phí tháng của cả fleet thì không gọi LLM.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { LlmClient } from "../agents/sa-01/llm.ts";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { agentRunCosts, insertAgentRun } from "../db/queue.ts";
import { computeCostUsd, monthToDateCostUsd, type TokenPrice } from "../metrics/cost.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { APPROVED_QUERIES, runApprovedQuery } from "./approved-queries.ts";

export const ASK_PROMPT_VERSION = "mi1-ask-v1";
const Choice = z.object({ template: z.string().max(64).nullable(), params: z.record(z.string(), z.unknown()).optional() });

const SYSTEM = () => `Bạn là Mi1, điều phối của Growth Workspace One IBC. Việc duy nhất: chọn MỘT truy vấn mẫu đã duyệt trả lời được câu hỏi, và tham số của nó.
Không tự tính hay đoán số. Không có mẫu nào trả lời được thì chọn null.
Mẫu (khoá: câu hỏi đầu ra số, mô tả):
${Object.entries(APPROVED_QUERIES).map(([k, t]) => `- ${k}: câu ${t.question}. ${t.description}`).join("\n")}
Tham số: lessons nhận {"query": chuỗi tìm}; fleet_operations nhận {"week": "yyyy-mm-dd" ngày thứ Hai của tuần}, bỏ trống là tuần trước; mẫu khác không có tham số.
Chỉ trả JSON đúng dạng {"template": "<khoá>" hoặc null, "params": {}}.`;

export type AskResult =
  | { status: "answered"; template: string; question: number; result: unknown; agentRunId: string }
  | { status: "no_template"; agentRunId: string }
  | { status: "failed"; errorCode: string; agentRunId?: string };

export async function askMi1(db: Database, llm: LlmClient, question: string, opts: { now: Date; actor: string; price: TokenPrice }): Promise<AskResult> {
  const q = redactR1(question.trim().slice(0, 500)).text;
  if (!q) return { status: "failed", errorCode: "QUESTION_REQUIRED" };
  // Trần 100 USD/tháng là của cả fleet (spec mục 10), nên cộng mọi agent.
  if (monthToDateCostUsd(agentRunCosts(db), opts.now) >= LLM_MONTHLY_CAP_USD) return { status: "failed", errorCode: "COST_CAP" };
  const agentRunId = Bun.randomUUIDv7();
  const started = opts.now.toISOString();
  const record = (status: string, r?: { inputTokens: number; outputTokens: number; model: string }) => insertAgentRun(db, {
    id: agentRunId, agent: "mi1", trigger: "ask", prompt_version: ASK_PROMPT_VERSION, eval_version: "none", model: r?.model ?? "none",
    input_tokens: r?.inputTokens ?? 0, output_tokens: r?.outputTokens ?? 0, cost_usd: r ? computeCostUsd(r, opts.price) : 0, status, started_at: started, finished_at: started,
  });
  let res;
  try {
    res = await llm.complete({ system: SYSTEM(), user: q, maxTokens: 200 });
  } catch {
    record("failed");
    return { status: "failed", errorCode: "ASK_LLM_FAILED", agentRunId };
  }
  let choice: z.infer<typeof Choice>;
  try {
    const m = /\{[\s\S]*\}/.exec(res.text);
    choice = Choice.parse(JSON.parse(m ? m[0] : res.text));
  } catch {
    record("failed", res);
    return { status: "failed", errorCode: "ASK_BAD_OUTPUT", agentRunId };
  }
  if (!choice.template || !Object.hasOwn(APPROVED_QUERIES, choice.template)) {
    record("succeeded", res);
    return { status: "no_template", agentRunId };
  }
  const r = runApprovedQuery(db, choice.template, choice.params ?? {}, opts.now);
  record("result" in r ? "succeeded" : "failed", res);
  if (!("result" in r)) return { status: "failed", errorCode: r.errorCode, agentRunId };
  return { status: "answered", template: r.template, question: r.question, result: r.result, agentRunId };
}
