// Bộ chạy eval Mi1-sa-01 (design doc mục 12). Chấm bằng code, không dùng LLM chấm LLM.
// Ca trong repo chỉ là synthetic; ca derived đọc thêm từ SA01_PRIVATE_EVAL_DIR (D-13).
// Kết quả ghi vào evals/sa-01/results/ (bị .gitignore chặn); runSa01 đọc tỷ lệ pass từ đó cho compute_confidence.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { NBA_PARAMS } from "../../../config.ts";
import { pipelineInPeriod } from "../../../metrics/pipeline-in-period.ts";
import { isResellerEndClient } from "../../../metrics/reseller-flag.ts";
import { guardOutput } from "../../../pii/name-guard.ts";
import { parseReport } from "../../../teams/parse-report.ts";
import { CATALOG_VERSION } from "../catalog.ts";
import type { LlmClient } from "../llm.ts";
import { proposeNba } from "../nba/index.ts";
import type { RankedNba } from "../nba/types.ts";
import type { EvalStats, EvalTask } from "../run.ts";
import { PROMPT_VERSION, structureReport } from "../structure.ts";

const TASKS = ["self_report_parse", "reason_code", "nba", "pii"] as const;

const CaseSchema = z.object({
  case_id: z.string().regex(/^sa01-[a-z_]+-\d{4}$/),
  task: z.enum(TASKS),
  rules_checked: z.array(z.string()).min(1),
  gate: z.enum(["hard", "scored"]),
  provenance: z.enum(["synthetic", "derived"]),
  anonymized_by: z.string().optional(),
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
  catalog_version: z.string(),
  input: z.record(z.string(), z.unknown()),
  expected: z.record(z.string(), z.unknown()),
  must_not_contain: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).refine((c) => c.provenance === "synthetic" || (c.anonymized_by && c.reviewed_by && c.reviewed_at), "DERIVED_NEEDS_REVIEW")
  .refine((c) => !["nba", "pii"].includes(c.task) || c.gate === "hard", "NBA_PII_MUST_BE_HARD");

export type EvalCase = z.infer<typeof CaseSchema>;
export type CaseResult = { case_id: string; task: EvalCase["task"]; gate: EvalCase["gate"]; passed: boolean; reason: string };
export type EvalSummary = {
  prompt_version: string;
  catalog_version: string;
  eval_version: string;
  ran_at: string;
  tasks: Record<string, { passed: number; total: number; pass_rate: number; hard_failures: number }>;
  results: CaseResult[];
};

export function loadCases(dirs: readonly string[]): EvalCase[] {
  const out: EvalCase[] = [];
  for (const dir of dirs) {
    for (const task of TASKS) {
      const d = join(dir, task);
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
        out.push(CaseSchema.parse(JSON.parse(readFileSync(join(d, f), "utf8"))));
      }
    }
  }
  return out;
}

type NbaCaseInput = {
  today: string;
  period: { start: string; end: string };
  snapshot: { opportunities: never[]; clients: { client_id: string; is_reseller_end_client: 0 | 1 | null }[]; client_services: never[] };
};

function runNbaCase(input: NbaCaseInput, strip = false): RankedNba[] {
  const closed = new Set(NBA_PARAMS.closedStages);
  const opps = (input.snapshot.opportunities as Record<string, unknown>[]).map((o) =>
    strip ? { ...o, industry_code: null, rejection_reason_code: o.rejection_reason_code === "RESTRICTED_INDUSTRY" ? null : o.rejection_reason_code } : o,
  ) as never[];
  const clients = input.snapshot.clients.map((c) => (strip ? { ...c, industry_code: null } : c)) as never[];
  const flags = new Map(input.snapshot.clients.map((c) => [c.client_id, isResellerEndClient(c.is_reseller_end_client)]));
  return proposeNba({
    today: input.today,
    pipeline: pipelineInPeriod((opps as { stage: string }[]).filter((o) => !closed.has(o.stage)) as never[], { periodStart: input.period.start, periodEnd: input.period.end }),
    opportunities: opps,
    clients,
    clientServices: input.snapshot.client_services,
    resellerFlag: (id) => flags.get(id) ?? "unknown",
    duplicateOwnersForClient: () => [],
    cap: 1000,
  });
}

function gradeNba(c: EvalCase): string | null {
  const input = c.input as unknown as NbaCaseInput;
  const exp = c.expected as {
    must_include?: { subject_ref: string; action: string }[];
    must_exclude?: { subject_ref: string; action: string }[];
    order?: [string, string][];
    never_raised_by?: string[];
  };
  const out = runNbaCase(input);
  const has = (s: { subject_ref: string; action: string }) => out.some((o) => o.subjectRef === s.subject_ref && o.action === s.action);
  for (const s of exp.must_include ?? []) if (!has(s)) return `missing ${s.subject_ref}:${s.action}`;
  for (const s of exp.must_exclude ?? []) if (has(s)) return `unexpected ${s.subject_ref}:${s.action}`;
  const pos = (ref: string) => out.findIndex((o) => o.subjectRef === ref);
  for (const [a, b] of exp.order ?? []) if (!(pos(a) >= 0 && pos(b) >= 0 && pos(a) < pos(b))) return `order ${a} before ${b}`;
  if ((exp.never_raised_by ?? []).includes("NBA_R3")) {
    const baseline = runNbaCase(input, true);
    for (const o of out.filter((x) => x.rulesFired.includes("NBA_R3"))) {
      const b = baseline.find((x) => x.subjectRef === o.subjectRef);
      if (b && o.priority > b.priority) return `NBA_R3 raised ${o.subjectRef}`;
    }
  }
  return null;
}

async function structured(llm: LlmClient, text: string, reportDate: string) {
  const parsed = parseReport(text, /<[a-z][\s\S]*>/i.test(text) ? "html" : "text");
  return { parsed, res: await structureReport(llm, { reportDate, parsed }) };
}

async function gradeLlmCase(c: EvalCase, llm: LlmClient): Promise<string | null> {
  const reportDate = String(c.input.report_date ?? "2026-10-31");
  if (c.task === "pii") {
    const { res } = await structured(llm, String(c.input.message_html), reportDate);
    const stored = res.status === "ok" && guardOutput(res.output).pii_check === "passed" ? JSON.stringify(res.output) : "";
    for (const s of c.must_not_contain ?? []) if (stored.toLowerCase().includes(s.toLowerCase())) return "pii leak";
    return null;
  }
  if (c.task === "self_report_parse") {
    const { parsed, res } = await structured(llm, String(c.input.message_html), reportDate);
    if (res.status !== "ok") return res.status;
    const exp = c.expected as { sections?: Record<string, { count: number | null }>; flags?: string[] };
    for (const [k, v] of Object.entries(exp.sections ?? {})) {
      const got = (res.output.sections as Record<string, { count?: number | null } | null>)[k];
      if ((got?.count ?? null) !== v.count) return `count ${k}`;
    }
    const flags = [...new Set([...parsed.flags, ...res.output.flags])].sort();
    if (JSON.stringify(flags) !== JSON.stringify([...(exp.flags ?? [])].sort())) return "flags";
    return null;
  }
  const text = `KHÁCH NÓI: ${String(c.input.customer_said)}\n${String(c.input.context ?? "")}`;
  const { res } = await structured(llm, text, reportDate);
  if (res.status !== "ok") return res.status;
  const p = res.output.reason_code_proposals[0];
  const exp = c.expected as { acceptable_primary: string[]; is_final: boolean };
  if (!p || !exp.acceptable_primary.includes(p.primary)) return "primary";
  if (p.is_final !== exp.is_final) return "is_final";
  return null;
}

export async function runEval(cases: readonly EvalCase[], llm: LlmClient, now: Date = new Date()): Promise<EvalSummary> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const reason = c.task === "nba" ? gradeNba(c) : await gradeLlmCase(c, llm);
    results.push({ case_id: c.case_id, task: c.task, gate: c.gate, passed: reason === null, reason: reason ?? "" });
  }
  const tasks: EvalSummary["tasks"] = {};
  for (const t of TASKS) {
    const rs = results.filter((r) => r.task === t);
    const passed = rs.filter((r) => r.passed).length;
    tasks[t] = {
      passed,
      total: rs.length,
      pass_rate: rs.length === 0 ? 0 : passed / rs.length,
      hard_failures: rs.filter((r) => r.gate === "hard" && !r.passed).length,
    };
  }
  const evalVersion = `${PROMPT_VERSION}+${CATALOG_VERSION}+${cases.length}`;
  return { prompt_version: PROMPT_VERSION, catalog_version: CATALOG_VERSION, eval_version: evalVersion, ran_at: now.toISOString(), tasks, results };
}

// Chỉ ghi kết quả tổng hợp theo mã ca và lý do (không chép đầu vào hay đầu ra của ca).
export function writeResults(dir: string, summary: EvalSummary): string {
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(summary, null, 2);
  writeFileSync(join(dir, `${summary.ran_at.replace(/[:.]/g, "-")}.json`), body);
  writeFileSync(join(dir, "latest.json"), body);
  return join(dir, "latest.json");
}

// Tỷ lệ pass cho compute_confidence. Thiếu kết quả, khác prompt_version hoặc khác danh mục thì coi như 0.
export function readEvalStats(dir: string): { stats: EvalStats; evalVersion: string } {
  const zero: EvalStats = {
    self_report_parse: { passRate: 0, caseCount: 0 },
    reason_code: { passRate: 0, caseCount: 0 },
    nba: { passRate: 0, caseCount: 0 },
  };
  const file = join(dir, "latest.json");
  if (!existsSync(file)) return { stats: zero, evalVersion: "none" };
  const s = JSON.parse(readFileSync(file, "utf8")) as EvalSummary;
  if (s.prompt_version !== PROMPT_VERSION || s.catalog_version !== CATALOG_VERSION) return { stats: zero, evalVersion: "stale" };
  const pick = (t: EvalTask) => ({ passRate: s.tasks[t]?.pass_rate ?? 0, caseCount: s.tasks[t]?.total ?? 0 });
  // Ca PII là hard: còn một ca PII hỏng thì mọi tác vụ dùng LLM coi như chưa pass.
  const piiBroken = (s.tasks.pii?.hard_failures ?? 1) > 0 || (s.tasks.pii?.total ?? 0) === 0;
  return {
    stats: {
      self_report_parse: piiBroken ? zero.self_report_parse : pick("self_report_parse"),
      reason_code: piiBroken ? zero.reason_code : pick("reason_code"),
      nba: (s.tasks.nba?.hard_failures ?? 1) > 0 ? zero.nba : pick("nba"),
    },
    evalVersion: s.eval_version,
  };
}
