// Quyền chỉnh ngưỡng (spec mục 6; D-53): chỉ Mark đổi ngưỡng escalate 0,8 và trọng số chấm Hook 25/25/20/15/15.
// Ngưỡng tiền và gửi ra ngoài không có trong danh sách nên không chỉnh được. Giá trị mới có hiệu lực khi Mark kích hoạt,
// và chỉ kích hoạt được khi bộ eval đã chạy lại sau lúc đề xuất và pass.
import type { Database } from "bun:sqlite";
import { HOOK_PARAMS, METRIC_PARAMS } from "../config.ts";

const TUNER = "mark";
const PARAMS = ["confidence_escalate_below", "hook_weights"] as const;
type Param = (typeof PARAMS)[number];
export type EvalRun = { ranAt: string | null; passed: boolean };

function parseValue(param: Param, raw: string): number | number[] | null {
  if (param === "confidence_escalate_below") {
    const v = Number(raw.trim().replace(",", "."));
    return Number.isFinite(v) && v > 0 && v < 1 ? v : null;
  }
  const w = raw.split(/[,;\s]+/).filter(Boolean).map(Number);
  return w.length === HOOK_PARAMS.weights.length && w.every((x) => Number.isInteger(x) && x >= 0) && w.reduce((a, b) => a + b, 0) === 100 ? w : null;
}

export function proposeTuning(db: Database, param: string, raw: string, opts: { now: Date; actor: string; actorRole?: string }) {
  if ((opts.actorRole ?? opts.actor) !== TUNER) return { status: "refused" as const, errorCode: "ONLY_MARK" };
  if (!(PARAMS as readonly string[]).includes(param)) return { status: "refused" as const, errorCode: "PARAM_NOT_TUNABLE" };
  const value = parseValue(param as Param, raw);
  if (value === null) return { status: "refused" as const, errorCode: "VALUE_INVALID" };
  const id = Bun.randomUUIDv7();
  db.run("INSERT INTO tuning_changes (id, param, value, proposed_at, actor) VALUES (?, ?, ?, ?, ?)", [id, param, JSON.stringify(value), opts.now.toISOString(), opts.actor]);
  return { status: "ok" as const, id };
}

export function activateTuning(db: Database, id: string, evalRun: EvalRun, opts: { now: Date; actor: string; actorRole?: string }): "ok" | "ONLY_MARK" | "NOT_FOUND" | "ALREADY_ACTIVE" | "EVAL_NOT_RERUN" | "EVAL_FAILED" {
  if ((opts.actorRole ?? opts.actor) !== TUNER) return "ONLY_MARK";
  const c = db.query("SELECT proposed_at FROM tuning_changes WHERE id = ?").get(id) as { proposed_at: string } | null;
  if (!c) return "NOT_FOUND";
  if (db.query("SELECT 1 FROM tuning_activations WHERE change_id = ?").get(id)) return "ALREADY_ACTIVE";
  if (!evalRun.ranAt || Date.parse(evalRun.ranAt) <= Date.parse(c.proposed_at)) return "EVAL_NOT_RERUN";
  if (!evalRun.passed) return "EVAL_FAILED";
  db.run("INSERT INTO tuning_activations (change_id, activated_at, eval_ran_at, actor) VALUES (?, ?, ?, ?)", [id, opts.now.toISOString(), evalRun.ranAt, opts.actor]);
  return "ok";
}

// Giá trị đang hiệu lực: lần kích hoạt mới nhất của mỗi tham số, chưa có thì giá trị mặc định trong config.
export function currentTuning(db: Database): { confidenceEscalateBelow: number; hookWeights: readonly number[] } {
  const latest = (param: Param) => (db.query(`SELECT c.value FROM tuning_changes c JOIN tuning_activations a ON a.change_id = c.id
    WHERE c.param = ? ORDER BY a.activated_at DESC, c.id DESC LIMIT 1`).get(param) as { value: string } | null)?.value;
  const t = latest("confidence_escalate_below");
  const w = latest("hook_weights");
  return { confidenceEscalateBelow: t ? (JSON.parse(t) as number) : METRIC_PARAMS.confidenceEscalateBelow, hookWeights: w ? (JSON.parse(w) as number[]) : HOOK_PARAMS.weights };
}

export function listTuning(db: Database) {
  return db.query(`SELECT c.id, c.param, c.value, c.proposed_at AS proposedAt, a.activated_at AS activatedAt FROM tuning_changes c
    LEFT JOIN tuning_activations a ON a.change_id = c.id ORDER BY c.proposed_at DESC, c.id DESC LIMIT 50`).all() as { id: string; param: string; value: string; proposedAt: string; activatedAt: string | null }[];
}
