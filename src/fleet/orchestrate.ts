// Điều phối của Mi1 (PHẦN 7B, D-82): mỗi yêu cầu (/ask, CRON-06) là một lượt chạy cha; mỗi lần gọi thuyền viên là
// một lượt chạy con có ghi thuyền viên, tool, tóm tắt đầu vào không PII, kết quả, độ tự tin, các cổng đã qua, chi phí,
// thời gian. Trước mỗi lần gọi kiểm bốn cổng: thuyền viên có trong danh bạ, đang bật, tool thuộc danh sách của thuyền
// viên đó, chi phí tháng của cả fleet chưa chạm trần. Chạm trần thì dừng cả phiên, không gọi thêm bước nào.
// Không thêm quyền ghi ra ngoài: bước nào cần người duyệt thì đi vào Hàng chờ như trước (CLAUDE.md quy tắc 4).
import type { Database } from "bun:sqlite";
import { agentRunCosts } from "../db/queue.ts";
import { monthToDateCostUsd } from "../metrics/cost.ts";
import { CREW } from "./registry.ts";

export type StepOutcome<T> = { value: T; ok?: boolean; resultSummary: string; confidence?: number | null; costUsd?: number; agentRunId?: string; gates?: string[] };
export type CallResult<T> = { ok: true; value: T } | { ok: false; errorCode: string; value?: T };

const BASE_GATES = ["crew_registered", "crew_enabled", "tool_allowed", "cost_cap"];
const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

export class FleetSession {
  readonly id = Bun.randomUUIDv7();
  private seq = 0;
  ended: { status: string; reason: string | null } | null = null;

  constructor(private db: Database, private opts: { trigger: string; actor: string; inputSummary: string; now: () => Date; disabled: ReadonlySet<string>; capUsd: number }) {
    db.query("INSERT INTO fleet_sessions (id, trigger, actor, input_summary, started_at) VALUES (?, ?, ?, ?, ?)").run(this.id, opts.trigger, opts.actor, short(opts.inputSummary), opts.now().toISOString());
    if (this.overCap()) this.end("blocked", "COST_CAP");
  }

  private overCap(): boolean {
    return monthToDateCostUsd(agentRunCosts(this.db), this.opts.now()) >= this.opts.capUsd;
  }

  private record(crewId: string, tool: string, input: string, status: "succeeded" | "failed" | "blocked", result: string, extra: { confidence?: number | null; gates: string[]; costUsd?: number; agentRunId?: string; startedAt: string }): void {
    this.seq += 1;
    this.db.query(
      `INSERT INTO fleet_steps (id, session_id, seq, crew_id, tool, input_summary, status, result_summary, confidence, gates, cost_usd, agent_run_id, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(Bun.randomUUIDv7(), this.id, this.seq, crewId, tool, short(input), status, short(result), extra.confidence ?? null, JSON.stringify(extra.gates), extra.costUsd ?? 0, extra.agentRunId ?? null, extra.startedAt, this.opts.now().toISOString());
  }

  async call<T>(crewId: string, tool: string, inputSummary: string, fn: () => Promise<StepOutcome<T>> | StepOutcome<T>): Promise<CallResult<T>> {
    if (this.ended) return { ok: false, errorCode: this.ended.reason ?? "SESSION_ENDED" };
    const startedAt = this.opts.now().toISOString();
    const crew = CREW.find((c) => c.id === crewId);
    const block = (code: string, gates: string[]): CallResult<T> => {
      this.record(crewId, tool, inputSummary, "blocked", code, { gates, startedAt });
      return { ok: false, errorCode: code };
    };
    if (!crew) return block("CREW_UNKNOWN", []);
    if (this.opts.disabled.has(crew.id)) return block("CREW_DISABLED", BASE_GATES.slice(0, 1));
    if (!crew.tools.includes(tool)) return block("TOOL_NOT_ALLOWED", BASE_GATES.slice(0, 2));
    if (this.overCap()) {
      const r = block("COST_CAP", BASE_GATES.slice(0, 3));
      this.end("blocked", "COST_CAP");
      return r;
    }
    let out: StepOutcome<T>;
    try {
      out = await fn();
    } catch {
      this.record(crewId, tool, inputSummary, "failed", "STEP_THREW", { gates: BASE_GATES, startedAt });
      return { ok: false, errorCode: "STEP_THREW" };
    }
    const ok = out.ok ?? true;
    this.record(crewId, tool, inputSummary, ok ? "succeeded" : "failed", out.resultSummary, { confidence: out.confidence, gates: [...BASE_GATES, ...(out.gates ?? [])], costUsd: out.costUsd, agentRunId: out.agentRunId, startedAt });
    return ok ? { ok: true, value: out.value } : { ok: false, errorCode: out.resultSummary, value: out.value };
  }

  end(status: "succeeded" | "failed" | "blocked", reason: string | null = null): void {
    if (this.ended) return;
    this.ended = { status, reason };
    this.db.query("INSERT INTO fleet_session_ends (session_id, status, reason, finished_at) VALUES (?, ?, ?, ?)").run(this.id, status, reason, this.opts.now().toISOString());
  }
}

export type SessionView = { id: string; trigger: string; actor: string; inputSummary: string; startedAt: string; status: string; reason: string | null; finishedAt: string | null;
  steps: { seq: number; crewId: string; tool: string; inputSummary: string; status: string; resultSummary: string; confidence: number | null; gates: string[]; costUsd: number; startedAt: string; finishedAt: string }[] };

// Phiên gần nhất (đang chạy hoặc vừa xong) cho /command.
export function latestSession(db: Database): SessionView | null {
  const s = db.query(
    `SELECT s.id, s.trigger, s.actor, s.input_summary, s.started_at, e.status, e.reason, e.finished_at
     FROM fleet_sessions s LEFT JOIN fleet_session_ends e ON e.session_id = s.id ORDER BY s.started_at DESC, s.id DESC LIMIT 1`,
  ).get() as { id: string; trigger: string; actor: string; input_summary: string; started_at: string; status: string | null; reason: string | null; finished_at: string | null } | null;
  if (!s) return null;
  const steps = db.query("SELECT * FROM fleet_steps WHERE session_id = ? ORDER BY seq").all(s.id) as Record<string, unknown>[];
  return {
    id: s.id, trigger: s.trigger, actor: s.actor, inputSummary: s.input_summary, startedAt: s.started_at, status: s.status ?? "running", reason: s.reason, finishedAt: s.finished_at,
    steps: steps.map((r) => ({ seq: r.seq as number, crewId: r.crew_id as string, tool: r.tool as string, inputSummary: r.input_summary as string, status: r.status as string, resultSummary: r.result_summary as string,
      confidence: r.confidence as number | null, gates: JSON.parse(r.gates as string) as string[], costUsd: r.cost_usd as number, startedAt: r.started_at as string, finishedAt: r.finished_at as string })),
  };
}
