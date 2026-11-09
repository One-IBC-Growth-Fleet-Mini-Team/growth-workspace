// Bộ truy vấn mẫu đã duyệt (spec mục 4, mục 9 growth-mcp execute_approved_cypher; D-51). Agent chỉ hỏi câu vận hành qua
// các mẫu này; mỗi mẫu gắn một trong bảy câu hỏi đầu ra (spec mục 1) và trả kết quả đã tính bằng hàm có test, không để
// LLM tự cộng số. Chưa có Neo4j nên mẫu chạy trên Growth DB; tên tool giữ như spec. Thêm hay đổi mẫu phải qua PR.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { buildChannelBoard } from "../db/channels.ts";
import { buildHookBoard } from "../db/hooks.ts";
import { buildJurisdictionBoard } from "../db/jurisdictions.ts";
import { searchKnowledge } from "../db/knowledge.ts";
import { buildRunLog } from "../db/runs.ts";
import { buildSandboxBoard } from "../db/sandbox.ts";
import { vnDate } from "../time.ts";
import { buildDigest, mondayOf } from "./core.ts";

type Template = { question: number; description: string; params: z.ZodType; run: (db: Database, p: any, now: Date) => unknown };
const NONE = z.strictObject({});

export const APPROVED_QUERIES: Record<string, Template> = {
  output_readiness: {
    question: 3, description: "Đầu ra đã sẵn sàng chưa: tài phán đã chốt giá, bộ SKD, nghiệm thu sandbox8.", params: NONE,
    run: (db) => {
      const j = buildJurisdictionBoard(db);
      const s = buildSandboxBoard(db);
      return { prices: j.summary, skd: { done: j.skd.done, missing: j.skd.missing }, sandbox: { ready: s.ready, bySeverity: s.bySeverity, cases: s.cases } };
    },
  },
  hook_board: {
    question: 4, description: "Hook đề xuất tuần này theo điểm 25/25/20/15/15 và cổng tuân thủ.", params: NONE,
    run: (db) => ({ proposed: buildHookBoard(db).proposed.map((h) => ({ hookId: h.hookId, text: h.text, score: h.score, verdict: h.verdict })) }),
  },
  lessons: {
    question: 5, description: "Bài học và quyết định đã ghi, mỗi mục kèm bằng chứng truy vấn lại được.", params: z.strictObject({ query: z.string().max(200).default("") }),
    run: (db, p: { query: string }) => ({ entries: searchKnowledge(db, p.query).map((e) => ({ kind: e.kind, title: e.title, evidence: e.evidence, createdAt: e.createdAt })) }),
  },
  fleet_operations: {
    question: 7, description: "Fleet vận hành ra sao: chi phí LLM tháng so với trần, phiên chưa ai xem, tuổi hàng chờ của tuần.",
    params: z.strictObject({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    run: (db, p: { week?: string }, now) => {
      const l = buildRunLog(db, now);
      const d = buildDigest(db, mondayOf(p.week ?? vnDate(new Date(now.getTime() - 7 * 86_400_000))), now);
      return { monthCostUsd: l.monthCostUsd, capUsd: l.capUsd, unseenRuns: l.unseen,
        queue: { weekStart: d.weekStart, decisionRate: d.decisionRate, medianAgeHours: d.medianAgeHours, maxAgeHours: d.maxAgeHours, defaultsApplied: d.defaultsApplied } };
    },
  },
  channel_health: {
    question: 3, description: "Sức khoẻ BM, số WhatsApp, Fanpage theo lần kiểm mới nhất.", params: NONE,
    run: (db, _p, now) => {
      const c = buildChannelBoard(db, now);
      return { lastCheckedAt: c.lastCheckedAt, ok: c.summary.ok, issues: c.summary.issues.map((x) => ({ kind: x.kind, label: x.label, status: x.status })), stale: c.summary.stale.map((x) => x.label), notTracked: c.summary.notTracked };
    },
  },
};

export type ApprovedQueryResult =
  | { errorCode: "TEMPLATE_NOT_APPROVED" | "PARAMS_INVALID" }
  | { template: string; question: number; verified: true; result: unknown };

export function runApprovedQuery(db: Database, template: string, params: unknown, now: Date): ApprovedQueryResult {
  const t = Object.hasOwn(APPROVED_QUERIES, template) ? APPROVED_QUERIES[template]! : null;
  if (!t) return { errorCode: "TEMPLATE_NOT_APPROVED" };
  const p = t.params.safeParse(params ?? {});
  if (!p.success) return { errorCode: "PARAMS_INVALID" };
  return { template, question: t.question, verified: true, result: t.run(db, p.data, now) };
}
