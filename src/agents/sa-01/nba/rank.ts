// Xếp hạng và giới hạn số mục NBA (design doc mục 5.5). Điểm tính bằng hàm trong src/metrics.
// Lời giải thích ghép từ mẫu câu cố định theo luật đã kích hoạt, không dùng LLM.
import { METRIC_PARAMS, NBA_PARAMS } from "../../../config.ts";
import type { OpportunityRow } from "../../../db/types.ts";
import { daysBetween, nbaPriorityScore } from "../../../metrics/nba-priority.ts";
import { rmActiveOnDeal } from "../../../metrics/rm-active-on-deal.ts";
import type { NbaDraft, RankedNba } from "./types.ts";

const ACTION_TEXT: Record<NbaDraft["action"], string> = {
  follow_up: "RM theo tiếp deal có Close Date trong kỳ",
  follow_up_unresponsive: "RM follow up khách chưa phản hồi",
  remind_invoice: "RM nhắc khách thanh toán invoice",
  upsell_bank: "RM chào dịch vụ Bank cho khách cũ",
  upsell_other: "Đề xuất bán thêm",
  handoff_team: "Đề xuất chuyển giao cho team sở hữu",
  confirm_reseller_flag: "Nhờ RM xác nhận cờ reseller của khách",
};

const RULE_TEXT: Record<string, string> = {
  NBA_R1: "khách cũ: RM chỉ bán thêm Bank",
  NBA_R2: "cờ reseller chưa rõ nên chưa upsell",
  NBA_R3: "ngành hạn chế: đã hạ ưu tiên",
  NBA_R5: "lọc theo Close Date trong kỳ",
  NBA_X_STALL: "deal đang kẹt theo mã lý do đã xác nhận",
  NBA_X_DUP: "có Lead trùng với RM khác",
};

export function explain(d: NbaDraft): string {
  const parts = [d.handoffTeam ? `${ACTION_TEXT[d.action]} (${d.handoffTeam})` : ACTION_TEXT[d.action]];
  for (const r of d.rulesFired) if (RULE_TEXT[r]) parts.push(RULE_TEXT[r]!);
  parts.push("nháp chờ RM xác nhận");
  return parts.join("; ");
}

export function rankDrafts(
  drafts: readonly NbaDraft[],
  opts: { cap: number; today: string; opportunities: readonly OpportunityRow[] },
): RankedNba[] {
  const byId = new Map(opts.opportunities.map((o) => [o.opportunity_id, o]));
  const ranked = drafts.map((d) => {
    const o = d.subjectKind === "opportunity" ? byId.get(d.subjectRef) : undefined;
    const stageWeight =
      d.stage === undefined ? 1 : (NBA_PARAMS.stageWeights[d.stage] ?? NBA_PARAMS.unknownStageWeight);
    const priority = nbaPriorityScore({
      stageWeight,
      daysToClose: d.closeDate ? daysBetween(opts.today, d.closeDate) : null,
      rmActive: o ? rmActiveOnDeal(o, opts.opportunities, { bulkThreshold: METRIC_PARAMS.rmActiveBulkThreshold }) : null,
      factor: d.priorityFactor,
    });
    return { ...d, priority, explanation: explain(d) };
  });
  ranked.sort((a, b) => b.priority - a.priority || a.subjectRef.localeCompare(b.subjectRef) || a.action.localeCompare(b.action));
  return ranked.slice(0, opts.cap);
}
