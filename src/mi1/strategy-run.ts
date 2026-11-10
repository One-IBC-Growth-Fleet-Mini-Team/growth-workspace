// Soạn, lưu và duyệt đề xuất chiến lược tuần (D-91). Qua bộ điều phối: một lượt cha "strategy", bước Mi1 viết lời dẫn
// (tool draft_strategy). Eval chưa pass hoặc chạm trần chi phí thì không gọi LLM. Chỉ Mark duyệt.
import type { Database } from "bun:sqlite";
import type { LlmClient } from "../agents/sa-01/llm.ts";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { insertAgentRun } from "../db/queue.ts";
import { FleetSession } from "../fleet/orchestrate.ts";
import { computeCostUsd, type TokenPrice } from "../metrics/cost.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { buildStrategyPack, STRATEGY_PROMPT_VERSION, writeStatements, type Statement, type StrategyPack } from "./strategy.ts";

export async function generateStrategy(db: Database, llm: LlmClient, opts: { now: Date; actor: string; price: TokenPrice; evalGate: { passed: boolean; version: string }; disabled?: ReadonlySet<string> }):
  Promise<{ status: "created"; id: string; kept: number; dropped: number } | { status: "failed"; errorCode: string }> {
  const s = new FleetSession(db, { trigger: "strategy", actor: opts.actor, inputSummary: "gói số 7 câu hỏi đầu ra", now: () => opts.now, disabled: opts.disabled ?? new Set(), capUsd: LLM_MONTHLY_CAP_USD });
  if (s.ended) return { status: "failed", errorCode: "COST_CAP" };
  if (!opts.evalGate.passed) {
    s.end("blocked", "EVAL_NOT_PASSED");
    return { status: "failed", errorCode: "EVAL_NOT_PASSED" };
  }
  const pack = buildStrategyPack(db, opts.now);
  const runId = Bun.randomUUIDv7();
  const at = opts.now.toISOString();
  const r = await s.call("mi1", "draft_strategy", "gói số đã tính (không PII)", async () => {
    const w = await writeStatements(llm, pack);
    const cost = w.res ? computeCostUsd(w.res, opts.price) : 0;
    insertAgentRun(db, { id: runId, agent: "mi1", trigger: "strategy", prompt_version: STRATEGY_PROMPT_VERSION, eval_version: opts.evalGate.version, model: w.res?.model ?? "none",
      input_tokens: w.res?.inputTokens ?? 0, output_tokens: w.res?.outputTokens ?? 0, cost_usd: cost, status: w.errorCode ? "failed" : "succeeded", started_at: at, finished_at: at });
    return { value: w, ok: !w.errorCode, resultSummary: w.errorCode ?? `${w.kept.length} câu giữ, ${w.dropped} câu loại`, costUsd: cost, agentRunId: runId, gates: ["eval_gate", "numbers_from_pack"] };
  });
  if (!r.ok) {
    s.end("failed", r.errorCode);
    return { status: "failed", errorCode: r.errorCode };
  }
  const id = Bun.randomUUIDv7();
  db.run("INSERT INTO strategy_drafts (id, week_start, pack, statements, dropped, agent_run_id, created_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, pack.weekStart, JSON.stringify(pack), JSON.stringify(r.value.kept), r.value.dropped, runId, at, opts.actor]);
  s.end("succeeded");
  return { status: "created", id, kept: r.value.kept.length, dropped: r.value.dropped };
}

export function decideStrategy(db: Database, id: string, decision: string, note: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "INVALID" | "ONLY_MARK" {
  if (opts.actor !== "mark") return "ONLY_MARK";
  if (decision !== "approve" && decision !== "reject") return "INVALID";
  if (!db.query("SELECT 1 FROM strategy_drafts WHERE id = ?").get(id)) return "NOT_FOUND";
  db.run("INSERT INTO strategy_decisions (id, draft_id, decision, note, decided_at, actor) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), id, decision, redactR1(note.trim().slice(0, 300)).text || null, opts.now.toISOString(), opts.actor]);
  return "ok";
}

export type StrategyDraft = { id: string; weekStart: string; createdAt: string; pack: StrategyPack; statements: Statement[]; dropped: number; status: "pending" | "approved" | "rejected"; decidedBy: string | null };

function load(db: Database, where: string, args: string[]): StrategyDraft | null {
  const d = db.query(`SELECT id, week_start AS weekStart, created_at AS createdAt, pack, statements, dropped FROM strategy_drafts ${where} ORDER BY created_at DESC, id DESC LIMIT 1`).get(...args) as
    { id: string; weekStart: string; createdAt: string; pack: string; statements: string; dropped: number } | null;
  if (!d) return null;
  const x = db.query("SELECT decision, actor FROM strategy_decisions WHERE draft_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(d.id) as { decision: string; actor: string } | null;
  return { ...d, pack: JSON.parse(d.pack) as StrategyPack, statements: JSON.parse(d.statements) as Statement[], status: x ? (x.decision === "approve" ? "approved" : "rejected") : "pending", decidedBy: x?.actor ?? null };
}
export const latestStrategy = (db: Database) => load(db, "", []);
// Bản Mark đã duyệt của một tuần, cho Digest tuần gửi anh Jimmy.
export function approvedStrategy(db: Database, weekStart: string): StrategyDraft | null {
  const ids = db.query("SELECT id FROM strategy_drafts WHERE week_start = ? ORDER BY created_at DESC, id DESC").all(weekStart) as { id: string }[];
  for (const { id } of ids) { const d = load(db, "WHERE id = ?", [id]); if (d?.status === "approved") return d; }
  return null;
}
