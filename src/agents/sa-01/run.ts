// runSa01(queueDate): một lượt sáng của Mi1-sa-01 (design doc mục 3.2 bước 2). Cron gọi thẳng (D-08); Mi1 gọi sau.
// Thứ tự: đọc tự báo D-1 → R1 (trong parse-report) → LLM → R3 → nháp self_report, reason_code
// → NBA bằng luật (qua crm-read-mcp) → điểm tự tin bằng hàm đã khoá → ghi một lần trong transaction → thông báo.
// Agent không có tool ghi nào ra ngoài; chỉ ghi Growth DB (WRITE_INTERNAL, DRAFT_ONLY).
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD, NBA_PARAMS } from "../../config.ts";
import { snapshotClients, snapshotClientServices, snapshotOpportunities } from "../../db/crm-read.ts";
import {
  agentRunCosts,
  insertAgentRun,
  insertQueueItem,
  listRmDirectory,
  rmReportExists,
  type QueueItemInsert,
} from "../../db/queue.ts";
import { insertRmReport, type RmReportInsert } from "../../db/rm-reports.ts";
import { log } from "../../log.ts";
import type { CrmReadTools } from "../../mcp/crm-read/client.ts";
import { computeConfidence, fieldCoverage, type ConfidenceFlag } from "../../metrics/confidence.ts";
import { computeCostUsd, monthToDateCostUsd, sumUsage, type TokenPrice, type TokenUsage } from "../../metrics/cost.ts";
import type { ResellerFlag } from "../../metrics/reseller-flag.ts";
import { servicesPurchased } from "../../metrics/services-purchased.ts";
import { guardOutput } from "../../pii/name-guard.ts";
import { readDailyThread, sourceMessageRef, type GraphClient } from "../../teams/graph-read.ts";
import { PARSER_VERSION, parseDailyReplies, resolveRmId, type AuthorReport } from "../../teams/parse-report.ts";
import { ddmm, endOfVnWorkday, monthPeriod, previousWorkingDay } from "../../time.ts";
import { CATALOG_VERSION } from "./catalog.ts";
import type { LlmClient } from "./llm.ts";
import { proposeNba } from "./nba/index.ts";
import { PROMPT_VERSION, structureReport } from "./structure.ts";

export const AGENT_ID = "mi1-sa-01";

export type EvalTask = "self_report_parse" | "reason_code" | "nba";
export type EvalStats = Record<EvalTask, { passRate: number; caseCount: number }>;

export type Sa01Deps = {
  db: Database;
  crm: CrmReadTools;
  graph: { client: GraphClient; teamId: string; channelId: string } | null;
  llm: LlmClient | null;
  pricing: TokenPrice & { model: string };
  evalStats: EvalStats;
  evalVersion?: string;
  now?: () => Date;
  trigger?: string;
  notify?: (queueDate: string) => Promise<unknown>;
  // Chưa có liên kết Lead với Client trong snapshot ([ĐỐI CHIẾU SCHEMA]); mặc định không có cảnh báo trùng.
  duplicateOwnersForClient?: (clientId: string) => readonly string[];
};

export type Sa01Result = { agentRunId: string; reportDate: string; itemsCreated: number };

const SNAPSHOT_MAX_AGE_MS = 24 * 3600 * 1000;
const ASSIGNEE = "amy";
const DEFAULT_ACTION = "giữ nháp";

type Ctx = {
  deps: Sa01Deps;
  queueDate: string;
  reportDate: string;
  agentRunId: string;
  createdAt: string;
  items: QueueItemInsert[];
  reports: RmReportInsert[];
  usages: TokenUsage[];
  models: string[];
};

function confidenceOf(ctx: Ctx, task: EvalTask, coverage: Record<string, unknown>, flags: ConfidenceFlag[] = []) {
  const s = ctx.deps.evalStats[task];
  const r = computeConfidence({ evalPassRate: s.passRate, fieldCoverage: fieldCoverage(coverage), evalCaseCount: s.caseCount, flags });
  return { confidence: r.confidence, confidence_inputs: JSON.stringify({ task, ...r.components, escalate: r.escalate }) };
}

function pushItem(
  ctx: Ctx,
  i: Pick<QueueItemInsert, "item_type" | "dedupe_key" | "subject_ref" | "payload" | "rules_fired" | "confidence" | "confidence_inputs" | "etl_run_id">,
): void {
  ctx.items.push({
    ...i,
    id: Bun.randomUUIDv7(),
    queue_date: ctx.queueDate,
    assignee: ASSIGNEE,
    default_action: DEFAULT_ACTION,
    due_at: endOfVnWorkday(ctx.queueDate),
    agent_run_id: ctx.agentRunId,
    created_at: ctx.createdAt,
  });
}

// Mục hệ thống: chỉ có mã loại và câu cố định, không có dữ liệu.
function notice(ctx: Ctx, kind: string, message: string): void {
  pushItem(ctx, {
    item_type: "system_notice",
    dedupe_key: `system:${ctx.queueDate}:${kind}`,
    subject_ref: null,
    payload: JSON.stringify({ kind, message }),
    rules_fired: "[]",
    confidence: 1,
    confidence_inputs: "{}",
    etl_run_id: null,
  });
}

function costSoFar(ctx: Ctx, prior: number): number {
  return prior + computeCostUsd(sumUsage(ctx.usages), ctx.deps.pricing);
}

async function handleReport(
  ctx: Ctx,
  report: AuthorReport,
  meta: { ref: string; version: string; link: string; rmId: string | null; rmNames: string[] },
): Promise<void> {
  const llm = ctx.deps.llm!;
  const res = await structureReport(llm, { reportDate: ctx.reportDate, parsed: report.parsed });
  ctx.usages.push(...res.usages);
  if (res.model) ctx.models.push(res.model);

  const reportId = Bun.randomUUIDv7();
  const guard = res.status === "ok" ? guardOutput(res.output, { rmNames: meta.rmNames }) : null;
  const passed = res.status === "ok" && guard?.pii_check === "passed";
  ctx.reports.push({
    id: reportId,
    report_date: ctx.reportDate,
    rm_id: meta.rmId,
    source_message_ref: meta.ref,
    source_link: meta.link,
    source_version: meta.version,
    parsed: passed ? JSON.stringify(res.output) : null,
    pii_check: guard?.pii_check === "blocked" ? "blocked" : "passed",
    redaction_stats: JSON.stringify({ r1: report.parsed.redactionStats, r3: guard?.stats ?? null }),
    parser_version: PARSER_VERSION,
    agent_run_id: ctx.agentRunId,
    created_at: ctx.createdAt,
  });

  const status = passed ? "ok" : guard?.pii_check === "blocked" ? "pii_blocked" : res.status;
  const base = { report_date: ctx.reportDate, rm_id: meta.rmId, source_link: meta.link };
  const flags = new Set<ConfidenceFlag>(report.parsed.flags);
  if (passed) for (const f of res.output.flags) flags.add(f);
  pushItem(ctx, {
    item_type: "self_report",
    dedupe_key: `self_report:${meta.ref}:${meta.version}`,
    subject_ref: reportId,
    payload: JSON.stringify(passed ? { status, ...base, sections: res.output.sections, flags: [...flags] } : { status, ...base }),
    rules_fired: "[]",
    ...confidenceOf(ctx, "self_report_parse", { rm_id: meta.rmId, header_date: report.parsed.headerDate, structured: passed ? true : null }, [...flags]),
    etl_run_id: null,
  });
  if (!passed) return;

  // Nối mã lý do với Opportunity: tên khách đã bị xoá nên Amy chọn Opportunity trên trang (Q-04).
  for (const p of res.output.reason_code_proposals) {
    pushItem(ctx, {
      item_type: "reason_code",
      dedupe_key: `reason_code:${meta.ref}:${meta.version}:${p.customer_ref}`,
      subject_ref: reportId,
      payload: JSON.stringify({ ...base, catalog_version: CATALOG_VERSION, proposal: p }),
      rules_fired: "[]",
      ...confidenceOf(ctx, "reason_code", {
        primary: p.primary,
        evidence_quote: p.evidence_quote,
        jurisdiction_code: p.opportunity_hint.jurisdiction_code,
        service_family: p.opportunity_hint.service_family,
      }),
      etl_run_id: null,
    });
  }
}

async function selfReports(ctx: Ctx, priorCost: number): Promise<void> {
  const { deps } = ctx;
  if (!deps.graph) return notice(ctx, "teams_unavailable", "Không đọc được Teams");
  let thread;
  try {
    thread = await readDailyThread(deps.graph.client, { teamId: deps.graph.teamId, channelId: deps.graph.channelId, reportDate: ctx.reportDate });
  } catch (e) {
    log({ event: "sa01.teams_failed", run_id: ctx.agentRunId, error_code: e instanceof Error && "code" in e ? String(e.code) : "GRAPH_UNKNOWN" });
    return notice(ctx, "teams_unavailable", "Không đọc được Teams");
  }
  if (!thread) return notice(ctx, "no_self_report", `Không có tự báo ngày ${ddmm(ctx.reportDate)}`);
  if (!deps.llm) return notice(ctx, "llm_unavailable", "Chưa cấu hình LLM, chưa đọc được tự báo");

  const directory = listRmDirectory(deps.db);
  const rmNames = directory.map((d) => d.display_name);
  const byId = new Map(thread.replies.map((m) => [m.messageId, m]));
  for (const report of parseDailyReplies(thread.replies)) {
    const msgs = report.messageIds.map((id) => byId.get(id)!);
    const first = msgs[0]!;
    const lastModified = msgs.map((m) => m.lastModifiedAt).sort().at(-1)!;
    const meta = {
      ref: sourceMessageRef(deps.graph.teamId, deps.graph.channelId, first.messageId),
      version: `${lastModified}#${msgs.length}`,
      link: first.webUrl,
      rmId: resolveRmId(report.authorTeamsUserId, directory),
      rmNames,
    };
    if (rmReportExists(deps.db, meta.ref, meta.version)) continue;
    if (costSoFar(ctx, priorCost) >= LLM_MONTHLY_CAP_USD) {
      notice(ctx, "llm_cost_cap", "Tạm dừng đọc tự báo do chạm trần chi phí");
      return;
    }
    await handleReport(ctx, report, meta);
  }
}

async function nbaItems(ctx: Ctx): Promise<void> {
  const { deps } = ctx;
  if (deps.evalStats.nba.passRate < NBA_PARAMS.requiredNbaPassRate) {
    return notice(ctx, "nba_eval_gate", "NBA tạm tắt: bộ eval NBA chưa pass 100%");
  }
  const period = monthPeriod(ctx.queueDate);
  let pipeline;
  try {
    pipeline = await deps.crm.getPipelineByCloseDate({ period_start: period.start, period_end: period.end });
  } catch {
    return notice(ctx, "crm_snapshot_missing", "Thiếu dữ liệu CRM: chưa có snapshot thành công");
  }
  const now = (deps.now ?? (() => new Date()))();
  if (now.getTime() - Date.parse(pipeline.snapshot_at) > SNAPSHOT_MAX_AGE_MS) {
    return notice(ctx, "crm_snapshot_missing", "Thiếu dữ liệu CRM: snapshot cũ hơn 24 giờ, không sinh NBA");
  }
  const runId = pipeline.etl_run_id;
  const opportunities = snapshotOpportunities(deps.db, runId);
  const clients = snapshotClients(deps.db, runId);
  const clientServices = snapshotClientServices(deps.db, runId);

  const clientIds = new Set<string>();
  const oppById = new Map(opportunities.map((o) => [o.opportunity_id, o]));
  for (const g of pipeline.groups) for (const id of g.opportunity_ids) { const c = oppById.get(id)?.client_id; if (c) clientIds.add(c); }
  for (const c of clients) if (c.first_won_at !== null) clientIds.add(c.client_id);
  const flags = new Map<string, ResellerFlag>();
  for (const id of clientIds) flags.set(id, (await deps.crm.checkResellerFlag({ client_id: id })).is_reseller_end_client);

  const ranked = proposeNba({
    today: ctx.queueDate,
    pipeline: pipeline.groups,
    opportunities,
    clients,
    clientServices,
    resellerFlag: (id) => flags.get(id) ?? "unknown",
    duplicateOwnersForClient: deps.duplicateOwnersForClient ?? (() => []),
  });
  for (const n of ranked) {
    pushItem(ctx, {
      item_type: "nba",
      dedupe_key: `nba:${ctx.queueDate}:${n.subjectRef}:${n.action}`,
      subject_ref: n.subjectRef,
      payload: JSON.stringify({
        action: n.action,
        subject_kind: n.subjectKind,
        subject_ref: n.subjectRef,
        owner_rm_id: n.ownerRmId,
        client_id: n.clientId,
        stage: n.stage ?? null,
        close_date: n.closeDate ?? null,
        handoff_team: n.handoffTeam ?? null,
        warnings: n.warnings,
        explanation: n.explanation,
        priority: n.priority,
      }),
      rules_fired: JSON.stringify(n.rulesFired),
      ...confidenceOf(ctx, "nba", {
        reseller: n.clientId ? (flags.get(n.clientId) ?? "unknown") : "unknown",
        industry: n.industryCode ?? null,
        services: n.clientId ? servicesPurchased(clientServices, n.clientId) : null,
      }),
      etl_run_id: runId,
    });
  }
}

export async function runSa01(queueDate: string, deps: Sa01Deps): Promise<Sa01Result> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const ctx: Ctx = {
    deps,
    queueDate,
    reportDate: previousWorkingDay(queueDate),
    agentRunId: Bun.randomUUIDv7(),
    createdAt: startedAt.toISOString(),
    items: [],
    reports: [],
    usages: [],
    models: [],
  };
  log({ event: "sa01.started", run_id: ctx.agentRunId });
  const priorCost = monthToDateCostUsd(agentRunCosts(deps.db, AGENT_ID), startedAt);

  await selfReports(ctx, priorCost);
  await nbaItems(ctx);

  const usage = sumUsage(ctx.usages);
  let created: boolean[] = [];
  deps.db.transaction(() => {
    insertAgentRun(deps.db, {
      id: ctx.agentRunId,
      agent: AGENT_ID,
      trigger: deps.trigger ?? "manual",
      prompt_version: PROMPT_VERSION,
      eval_version: deps.evalVersion ?? "none",
      model: ctx.models.at(-1) ?? deps.pricing.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cost_usd: computeCostUsd(usage, deps.pricing),
      status: "succeeded",
      started_at: ctx.createdAt,
      finished_at: now().toISOString(),
    });
    for (const r of ctx.reports) insertRmReport(deps.db, r);
    created = ctx.items.map((i) => insertQueueItem(deps.db, i));
  })();
  const itemsCreated = created.filter(Boolean).length;
  log({ event: "sa01.finished", run_id: ctx.agentRunId, count: itemsCreated });

  if (deps.notify) await deps.notify(queueDate);
  return { agentRunId: ctx.agentRunId, reportDate: ctx.reportDate, itemsCreated };
}
