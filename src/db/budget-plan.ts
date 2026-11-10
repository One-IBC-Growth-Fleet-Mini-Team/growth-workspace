// Kế hoạch ngân sách tuần theo khung quyết định (D-90): dựng đầu vào theo tổ hợp Kênh × Tài phán từ dữ liệu đã nạp,
// gọi `budgetPlan`, lưu nháp (chỉ thêm) và ghi quyết định của Mark. Không gọi nền tảng quảng cáo.
// Nguồn: kết quả chiến dịch mới nhất (kênh = platform, tài phán = cột jurisdiction), chi tiêu tuần gần nhất trong báo
// cáo Meta/Google (ngân sách hiện tại), Win gate, tầng 1A, 1B, 3A, 3B, 5; mục tiêu hiện tại = kế hoạch đã duyệt gần nhất.
import type { Database } from "bun:sqlite";
import { holdIssue } from "../ads/check.ts";
import { listStoryboards } from "../creative/factory.ts";
import { budgetPlan, type ComboInput, type Objective } from "../metrics/budget-framework.ts";
import { median } from "../metrics/queue-health.ts";
import { tier5Flag } from "../metrics/tier5.ts";
import { mondayOf } from "../mi1/core.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { getProvisional } from "../provisional.ts";
import { vnDate } from "../time.ts";
import { buildWinGate } from "./budget.ts";
import { buildDataBoard, tier3bWindow } from "./data01.ts";

const key = (s: string | null) => (s ?? "").trim().toLowerCase();
type Camp = { campaign: string; platform: string | null; jurisdiction: string | null; spend: number; leads: number | null; gm: number; cycle: number };

function imports(db: Database): string[] {
  return (db.query("SELECT id FROM campaign_imports ORDER BY imported_at DESC, id DESC LIMIT 2").all() as { id: string }[]).map((r) => r.id);
}
function camps(db: Database, importId: string): Camp[] {
  return db.query("SELECT campaign, platform, jurisdiction, spend_usd AS spend, leads, gross_margin_usd AS gm, cycle_complete AS cycle FROM campaign_results WHERE import_id = ?").all(importId) as Camp[];
}
function comboNet(cs: Camp[]): number | null {
  if (!cs.length || cs.some((c) => c.cycle !== 1)) return null;
  let net = 0;
  for (const c of cs) net += tier5Flag({ spendUsd: c.spend, grossMarginUsd: c.gm, cycleComplete: true }).netUsd!;
  return Math.round(net * 100) / 100;
}

export function buildFrameworkInputs(db: Database, now: Date): ComboInput[] {
  const [latest, previous] = imports(db);
  if (!latest) return [];
  const rows = camps(db, latest);
  const prev = previous ? camps(db, previous) : [];
  const groups = new Map<string, Camp[]>();
  for (const r of rows) {
    const k = `${r.platform ?? "chưa rõ kênh"}\u0000${r.jurisdiction ?? "chưa rõ tài phán"}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const degraded = buildDataBoard(db, now).window.degraded;
  const t3 = tier3bWindow(db, now).status === "flag" ? (tier3bWindow(db, new Date(now.getTime() - 7 * 86_400_000)).status === "flag" ? 2 : 1) : 0;
  const win = buildWinGate(db, now);
  const eligible = win.filter((w) => w.status !== "insufficient_data");
  const medCpl = median(eligible.map((w) => w.cpl!));
  const medConv = median(eligible.map((w) => w.winRate!));
  const boards = listStoryboards(db);
  const week = db.query("SELECT MAX(week_start) AS w FROM ad_imports").get() as { w: string | null };
  const spendQ = db.prepare("SELECT SUM(a.spend) AS s, SUM(a.impressions) AS n FROM ad_rows a JOIN ad_imports i ON i.id = a.import_id WHERE i.week_start = ? AND i.platform = ? AND a.campaign = ?");
  const lastQ = db.prepare(`SELECT l.objective_new AS objective, d.decided_at AS at FROM budget_plan_lines l JOIN budget_plans p ON p.id = l.plan_id
    JOIN budget_plan_decisions d ON d.plan_id = p.id AND d.id = (SELECT id FROM budget_plan_decisions x WHERE x.plan_id = p.id ORDER BY decided_at DESC, id DESC LIMIT 1)
    WHERE d.decision = 'approve' AND l.channel = ? AND l.jurisdiction = ? ORDER BY d.decided_at DESC LIMIT 1`);
  return [...groups].map(([k, cs]) => {
    const [channel, jurisdiction] = k.split("\u0000") as [string, string];
    let budget = 0;
    let impressions: number | null = null;
    let contacts: number | null = null;
    for (const c of cs) {
      const s = week.w ? (spendQ.get(week.w, channel, c.campaign) as { s: number | null; n: number | null }) : { s: null, n: null };
      budget += s.s ?? 0;
      if (s.n !== null) impressions = (impressions ?? 0) + s.n;
      if (c.leads !== null) contacts = (contacts ?? 0) + c.leads;
    }
    const ws = win.filter((w) => cs.some((c) => c.campaign === w.campaign));
    const status = ws.some((w) => w.status === "win") ? "win" : ws.some((w) => w.status === "not_win") ? "not_win" : "insufficient_data";
    const best = ws.find((w) => w.status !== "insufficient_data");
    const net = comboNet(cs);
    const prevNet = comboNet(prev.filter((c) => (c.platform ?? "chưa rõ kênh") === channel && (c.jurisdiction ?? "chưa rõ tài phán") === jurisdiction));
    const last = lastQ.get(channel, jurisdiction) as { objective: Objective; at: string } | null;
    return {
      channel, jurisdiction, objective: last?.objective ?? null, budgetUsd: Math.round(budget * 100) / 100,
      daysSinceChange: last ? Math.floor((now.getTime() - Date.parse(last.at)) / 86_400_000) : null,
      trackingDegraded: degraded, priceLocked: holdIssue(db, jurisdiction) === null,
      qaPass: boards.some((b) => key(b.jurisdiction) === key(jurisdiction) && b.lastRun?.qaStatus === "PASS"), resellerFiltered: true,
      winGate: status, impressions, contacts, tier3bFlagWeeks: t3,
      cplBelowMedian: best && medCpl !== null && best.cpl !== null ? best.cpl < medCpl : null,
      conversionBelowMedian: best && medConv !== null && best.winRate !== null ? best.winRate < medConv : null,
      cycleComplete: net !== null, netUsd: net, negativeCycles: net !== null && net < 0 ? (prevNet !== null && prevNet < 0 ? 2 : 1) : 0,
    } satisfies ComboInput;
  });
}

// Tạo kế hoạch của tuần hiện tại (giờ Việt Nam). Đã có kế hoạch tuần này thì giữ nguyên, trả về mã cũ.
export function createWeeklyPlan(db: Database, now: Date, actor: string): { id: string; created: boolean; lines: number } {
  const week = mondayOf(vnDate(now));
  const had = db.query("SELECT id, (SELECT COUNT(*) FROM budget_plan_lines WHERE plan_id = budget_plans.id) AS n FROM budget_plans WHERE week_start = ?").get(week) as { id: string; n: number } | null;
  if (had) return { id: had.id, created: false, lines: had.n };
  const params = getProvisional("budget_framework").value;
  const plan = budgetPlan(buildFrameworkInputs(db, now), params);
  const id = Bun.randomUUIDv7();
  db.transaction(() => {
    db.run("INSERT INTO budget_plans (id, week_start, total_old, total_new, needs_jimmy, params, created_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, week, plan.totalOld, plan.totalNew, plan.needsJimmy ? 1 : 0, JSON.stringify(params), now.toISOString(), actor]);
    const q = db.prepare("INSERT INTO budget_plan_lines (plan_id, seq, channel, jurisdiction, objective_old, objective_new, budget_old, budget_new, rules, evidence, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    plan.lines.forEach((l, i) => q.run(id, i + 1, l.channel, l.jurisdiction, l.objectiveOld, l.objectiveNew, l.budgetOld, l.budgetNew, JSON.stringify({ rules: l.rules, notes: l.notes }), JSON.stringify(l.evidence), l.confidence));
  })();
  return { id, created: true, lines: plan.lines.length };
}

export function decidePlan(db: Database, id: string, decision: string, note: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "INVALID" {
  if (decision !== "approve" && decision !== "reject") return "INVALID";
  if (!db.query("SELECT 1 FROM budget_plans WHERE id = ?").get(id)) return "NOT_FOUND";
  db.run("INSERT INTO budget_plan_decisions (id, plan_id, decision, note, decided_at, actor) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), id, decision, redactR1(note.trim().slice(0, 300)).text || null, opts.now.toISOString(), opts.actor]);
  return "ok";
}

export function latestPlan(db: Database) {
  const p = db.query("SELECT id, week_start AS weekStart, total_old AS totalOld, total_new AS totalNew, needs_jimmy AS needsJimmy, created_at AS createdAt FROM budget_plans ORDER BY week_start DESC LIMIT 1").get() as
    { id: string; weekStart: string; totalOld: number; totalNew: number; needsJimmy: number; createdAt: string } | null;
  if (!p) return null;
  const d = db.query("SELECT decision, actor, note FROM budget_plan_decisions WHERE plan_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(p.id) as { decision: string; actor: string; note: string | null } | null;
  const lines = (db.query("SELECT * FROM budget_plan_lines WHERE plan_id = ? ORDER BY seq").all(p.id) as Record<string, unknown>[]).map((l) => ({
    channel: l.channel as string, jurisdiction: l.jurisdiction as string, objectiveOld: l.objective_old as Objective | null, objectiveNew: l.objective_new as Objective,
    budgetOld: l.budget_old as number, budgetNew: l.budget_new as number, confidence: l.confidence as number,
    ...(JSON.parse(l.rules as string) as { rules: string[]; notes: string[] }), evidence: JSON.parse(l.evidence as string) as Record<string, unknown>,
  }));
  return { ...p, needsJimmy: p.needsJimmy === 1, status: d ? (d.decision === "approve" ? "approved" : "rejected") : "pending", decidedBy: d?.actor ?? null, note: d?.note ?? null, lines };
}
