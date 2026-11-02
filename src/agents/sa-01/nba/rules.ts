// Áp 5 luật NBA của spec mục 11 và 2 luật bổ sung, theo thứ tự ở design doc mục 5.5. Hoàn toàn bằng code.
import { NBA_PARAMS } from "../../../config.ts";
import type { ResellerFlag } from "../../../metrics/reseller-flag.ts";
import type { NbaCandidate, NbaDraft } from "./types.ts";

export type NbaContext = {
  resellerFlag: (clientId: string) => ResellerFlag;
  // RM sở hữu các Lead trùng (email hoặc SĐT) với khách này. Chưa có liên kết Lead với Client
  // trong snapshot ([ĐỐI CHIẾU SCHEMA]); khi chạy thật hàm này trả rỗng cho tới khi đối chiếu xong.
  duplicateOwnersForClient: (clientId: string) => readonly string[];
};

// Luật 1: bán thêm khác Bank chuyển cho team sở hữu (Division theo metric-definitions).
const HANDOFF_TEAM: Record<string, string> = { IBC11: "Renewal", IBC14: "ATA" };
const DEFAULT_HANDOFF_TEAM = "Service & Formation";

const isUpsell = (a: NbaCandidate["action"]) => a === "upsell_bank" || a === "upsell_other" || a === "handoff_team";

export function applyRules(candidates: readonly NbaCandidate[], ctx: NbaContext): NbaDraft[] {
  const out: NbaDraft[] = [];
  const confirmAsked = new Set<string>();
  const restricted = new Set(NBA_PARAMS.restrictedIndustryCodes);

  for (const c of candidates) {
    const d: NbaDraft = { ...c, rulesFired: [], warnings: [], priorityFactor: 1, defaultAction: "giữ nháp" };

    // NBA_R5: ứng viên nguồn 1 chỉ đến từ get_pipeline_by_close_date.
    if (d.source === "pipeline") d.rulesFired.push("NBA_R5");

    // NBA_R2: reseller true thì bỏ mọi upsell; unknown thì thay bằng xác nhận cờ (D-06).
    if (isUpsell(d.action) && d.clientId !== null) {
      const flag = ctx.resellerFlag(d.clientId);
      if (flag === true) continue;
      if (flag === "unknown") {
        if (confirmAsked.has(d.clientId)) continue;
        confirmAsked.add(d.clientId);
        d.action = "confirm_reseller_flag";
        delete d.family;
        d.rulesFired.push("NBA_R2");
      }
    }

    // NBA_R1: khách cũ chỉ được RM bán thêm Bank; loại khác thành chuyển giao.
    if (d.source === "old_client" && (d.action === "upsell_bank" || d.action === "upsell_other")) {
      d.rulesFired.push("NBA_R1");
      if (d.action === "upsell_other") {
        d.action = "handoff_team";
        d.handoffTeam = HANDOFF_TEAM[d.family ?? ""] ?? DEFAULT_HANDOFF_TEAM;
      }
    }

    // NBA_R3: ngành cấm hoặc mã RESTRICTED_INDUSTRY chỉ hạ ưu tiên.
    if ((d.industryCode && restricted.has(d.industryCode)) || d.rejectionCode === "RESTRICTED_INDUSTRY") {
      d.priorityFactor = NBA_PARAMS.restrictedIndustryFactor;
      d.rulesFired.push("NBA_R3");
    }

    // NBA_X_STALL: deal kẹt đã có mã xác nhận thì gợi ý hành động tương ứng.
    if (d.action === "follow_up" && d.rejectionCode === "UNRESPONSIVE") {
      d.action = "follow_up_unresponsive";
      d.rulesFired.push("NBA_X_STALL");
    } else if (d.action === "follow_up" && d.rejectionCode === "PAYMENT_PENDING") {
      d.action = "remind_invoice";
      d.rulesFired.push("NBA_X_STALL");
    }

    // NBA_X_DUP: Lead trùng thuộc RM khác.
    if (d.clientId !== null) {
      const others = ctx.duplicateOwnersForClient(d.clientId).filter((rm) => rm !== d.ownerRmId);
      if (others.length > 0) {
        d.rulesFired.push("NBA_X_DUP");
        for (const rm of others) d.warnings.push(`có thể trùng khách với ${rm}`);
      }
    }

    // NBA_R4: mọi mục là nháp chờ RM xác nhận.
    d.rulesFired.push("NBA_R4");
    out.push(d);
  }
  return out;
}
