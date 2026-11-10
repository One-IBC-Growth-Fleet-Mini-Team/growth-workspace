// Đề xuất chiến lược tuần (GĐ3 việc 2; D-91). Mi1 gom câu trả lời 7 câu hỏi đầu ra (spec mục 1) từ các hàm đã có thành
// một gói số; mỗi số có mã. LLM chỉ viết lời dẫn, mỗi câu trỏ tới mã trong gói; câu không trỏ được, trỏ vào câu hỏi
// thiếu dữ liệu, hoặc có số không nằm trong các mã được trỏ thì bị loại (CLAUDE.md quy tắc 3). Câu hỏi thiếu dữ liệu
// ghi "chưa đủ dữ liệu" kèm lý do do code viết. Không tự áp thay đổi nào.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { LlmClient, LlmResponse } from "../agents/sa-01/llm.ts";
import { latestPlan } from "../db/budget-plan.ts";
import { buildWinGate } from "../db/budget.ts";
import { buildChannelBoard } from "../db/channels.ts";
import { buildHookBoard } from "../db/hooks.ts";
import { buildJurisdictionBoard } from "../db/jurisdictions.ts";
import { buildPartnerBoard } from "../db/partners.ts";
import { buildPersonaBoard } from "../db/persona.ts";
import { buildRunLog } from "../db/runs.ts";
import { buildSandboxBoard } from "../db/sandbox.ts";
import { searchKnowledge } from "../db/knowledge.ts";
import { monthPeriod, vnDate } from "../time.ts";
import { buildDigest, mondayOf } from "./core.ts";

export const STRATEGY_PROMPT_VERSION = "mi1-strategy-v1";
export type Fact = { id: string; label: string; value: number | string | boolean | null };
export type Answer = { question: number; title: string; status: "ok" | "insufficient"; reason?: string; facts: Fact[] };
export type StrategyPack = { weekStart: string; answers: Answer[] };

const TITLES = ["Khách hiện tại là ai?", "Khách tiềm năng là ai?", "Đầu ra, bảng giá 45 tài phán và kênh đã sẵn sàng chưa?", "Hook và kênh nào thực sự hoạt động?",
  "Bài học sau mỗi chu kỳ?", "Điều chỉnh chiến lược và ngân sách?", "Fleet đang vận hành ra sao?"];
const ans = (q: number, facts: Fact[], reason: string | null): Answer =>
  reason ? { question: q, title: TITLES[q - 1]!, status: "insufficient", reason, facts: [] } : { question: q, title: TITLES[q - 1]!, status: "ok", facts };

export function buildStrategyPack(db: Database, now: Date): StrategyPack {
  const persona = buildPersonaBoard(db);
  const j = buildJurisdictionBoard(db);
  const s = buildSandboxBoard(db);
  const ch = buildChannelBoard(db, now);
  const win = buildWinGate(db, now);
  const hooks = buildHookBoard(db);
  const plan = latestPlan(db);
  const lessons = searchKnowledge(db, "").filter((e) => e.evidence && Date.parse(e.createdAt) >= now.getTime() - 7 * 86_400_000);
  const runs = buildRunLog(db, now);
  const digest = buildDigest(db, mondayOf(vnDate(new Date(now.getTime() - 7 * 86_400_000))), now);
  const partners = buildPartnerBoard(db, monthPeriod(vnDate(now))).stats.filter((p) => p.profitUsd > 0).sort((a, b) => b.profitUsd - a.profitUsd);
  const nbaPending = (db.query("SELECT COUNT(*) AS n FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE i.item_type = 'nba' AND s.state = 'pending'").get() as { n: number }).n;
  const top = persona?.segments[0];
  const count = (st: string) => win.filter((w) => w.status === st).length;
  return {
    weekStart: mondayOf(vnDate(now)),
    answers: [
      ans(1, persona ? [{ id: "q1.deals", label: "Deal Closed Won đã nạp", value: persona.total }, { id: "q1.direct", label: "Deal khách trực tiếp", value: persona.direct }, { id: "q1.reseller", label: "Deal khách cuối của reseller", value: persona.reseller }] : [],
        persona ? null : "Chưa nạp file Closed Won thật."),
      ans(2, top ? [{ id: "q2.segments", label: "Persona đủ mẫu", value: persona!.segments.length }, { id: "q2.top", label: "Nhóm lớn nhất", value: `${top.jurisdiction} · ${top.serviceFamily}` }, { id: "q2.top_deals", label: "Deal của nhóm lớn nhất", value: top.deals }] : [],
        top ? null : persona ? `Chưa nhóm nào đủ ${persona.minDeals} deal.` : "Chưa nạp file Closed Won thật."),
      ans(3, [{ id: "q3.price_locked", label: "Tài phán đã khoá giá", value: j.summary.priceLocked }, { id: "q3.price_total", label: "Tổng tài phán", value: j.summary.total }, { id: "q3.skd_done", label: "File SKD đã có", value: j.skd.done },
        { id: "q3.sandbox_ready", label: "Sandbox8 sẵn sàng nghiệm thu", value: s.ready }, { id: "q3.channel_issues", label: "Tài khoản kênh có vấn đề", value: ch.summary.issues.length }], null),
      ans(4, win.length ? [{ id: "q4.win", label: "Chiến dịch thắng Win gate", value: count("win") }, { id: "q4.not_win", label: "Chiến dịch chưa thắng", value: count("not_win") }, { id: "q4.insufficient", label: "Chiến dịch thiếu mẫu", value: count("insufficient_data") },
        { id: "q4.scale", label: "Tổ hợp đề xuất tăng (R6)", value: plan?.lines.filter((l) => l.rules.includes("R6")).length ?? 0 }, { id: "q4.stop", label: "Tổ hợp đề xuất giảm hoặc dừng (R5)", value: plan?.lines.filter((l) => l.rules.includes("R5")).length ?? 0 },
        { id: "q4.hooks_proposed", label: "Hook đề xuất tuần", value: hooks.proposed.length }] : [], win.length ? null : "Chưa có kết quả theo chiến dịch."),
      ans(5, lessons.length ? [{ id: "q5.lessons_7d", label: "Bài học có bằng chứng 7 ngày qua", value: lessons.length }, { id: "q5.latest", label: "Bài học mới nhất", value: lessons[0]!.title }] : [], lessons.length ? null : "Chưa có bài học mới kèm bằng chứng trong 7 ngày."),
      ans(6, plan ? [{ id: "q6.week", label: "Tuần của kế hoạch", value: plan.weekStart }, { id: "q6.total_old", label: "Ngân sách tuần hiện tại (USD)", value: plan.totalOld }, { id: "q6.total_new", label: "Ngân sách tuần đề xuất (USD)", value: plan.totalNew },
        { id: "q6.needs_jimmy", label: "Cần anh Jimmy duyệt", value: plan.needsJimmy }, { id: "q6.status", label: "Trạng thái kế hoạch", value: plan.status }, { id: "q6.nba_pending", label: "NBA còn chờ Amy", value: nbaPending },
        { id: "q6.partner_top", label: "Đối tác lợi nhuận cao nhất tháng", value: partners[0]?.partner_id ?? null }, { id: "q6.partner_top_usd", label: "Lợi nhuận của đối tác đó (USD)", value: partners[0]?.profitUsd ?? null }] : [],
        plan ? null : "Chưa có kế hoạch ngân sách tuần (khung quyết định)."),
      ans(7, [{ id: "q7.cost_usd", label: "Chi phí LLM tháng (USD)", value: Math.round(runs.monthCostUsd * 100) / 100 }, { id: "q7.cap_usd", label: "Trần chi phí tháng (USD)", value: runs.capUsd },
        { id: "q7.unseen_runs", label: "Phiên chưa ai xem", value: runs.unseen }, { id: "q7.decision_rate", label: "Tỷ lệ Amy quyết tuần trước", value: digest.decisionRate === null ? null : Math.round(digest.decisionRate * 100) / 100 }], null),
    ],
  };
}

// Dạng chung lỏng; từng câu sai (thiếu mã, quá dài) chỉ loại câu đó, không làm hỏng cả bản.
const Out = z.object({ statements: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })).max(20) });
export type Statement = { text: string; refs: string[] };

// Số trong câu (bỏ dấu phẩy nghìn) phải trùng một giá trị số của các mã được trỏ, hoặc là số câu hỏi 1 tới 7.
function numbersOk(text: string, facts: Fact[]): boolean {
  const allowed = new Set<string>();
  for (const f of facts) for (const n of String(f.value ?? "").match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(String(Number(n)));
  return (text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(String(Number(n))) || /^[1-7]$/.test(n));
}

export function validateStatements(pack: StrategyPack, raw: unknown): { kept: Statement[]; dropped: number } {
  const p = Out.safeParse(raw);
  if (!p.success) return { kept: [], dropped: 0 };
  const facts = new Map(pack.answers.flatMap((a) => a.facts.map((f) => [f.id, f] as const)));
  const kept = p.data.statements.filter((st) => st.text.trim() !== "" && st.text.length <= 400 && st.refs.length > 0 && st.refs.length <= 8 && st.refs.every((r) => facts.has(r)) && numbersOk(st.text, st.refs.map((r) => facts.get(r)!)));
  return { kept, dropped: p.data.statements.length - kept.length };
}

const SYSTEM = `Bạn là Mi1, viết lời dẫn cho đề xuất chiến lược tuần của One IBC gửi Mark. Chỉ dùng số trong gói số ở khối <goi_so>.
Mỗi câu phải trỏ tới mã số liệu (refs) chứa mọi con số trong câu; không tự tính, không cộng trừ, không ước lượng. Bỏ qua câu hỏi có status "insufficient".
Tối đa 12 câu, tiếng Việt, ngắn. Chỉ trả JSON {"statements":[{"text":"...","refs":["q3.price_locked"]}]}.`;

export async function writeStatements(llm: LlmClient, pack: StrategyPack): Promise<{ kept: Statement[]; dropped: number; res: LlmResponse | null; errorCode?: string }> {
  let res: LlmResponse;
  try {
    res = await llm.complete({ system: SYSTEM, user: `<goi_so>\n${JSON.stringify(pack)}\n</goi_so>`, maxTokens: 1200 });
  } catch {
    return { kept: [], dropped: 0, res: null, errorCode: "STRATEGY_LLM_FAILED" };
  }
  if (res.refused) return { kept: [], dropped: 0, res, errorCode: "STRATEGY_REFUSED" };
  try {
    return { ...validateStatements(pack, JSON.parse(res.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))), res };
  } catch {
    return { kept: [], dropped: 0, res, errorCode: "STRATEGY_BAD_OUTPUT" };
  }
}
