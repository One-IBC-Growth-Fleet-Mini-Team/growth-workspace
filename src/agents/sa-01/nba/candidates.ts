// Ứng viên NBA từ hai nguồn (design doc mục 5.5):
// 1. Opportunity trong kết quả get_pipeline_by_close_date (luật 5: không có đường nào khác).
// 2. Khách cũ (first_won_at có giá trị, A-09) chưa có IBC13 trong services_purchased.
import type { ClientRow, ClientServiceRow, OpportunityRow } from "../../../db/types.ts";
import type { PipelineStageGroup } from "../../../metrics/pipeline-in-period.ts";
import { servicesPurchased } from "../../../metrics/services-purchased.ts";
import type { NbaCandidate } from "./types.ts";

export const BANK_FAMILY = "IBC13";

export type CandidateSource = {
  pipeline: readonly PipelineStageGroup[];
  opportunities: readonly OpportunityRow[]; // chỉ để tra trường bổ sung theo opportunity_id
  clients: readonly ClientRow[];
  clientServices: readonly ClientServiceRow[];
};

export function buildCandidates(src: CandidateSource): NbaCandidate[] {
  const byId = new Map(src.opportunities.map((o) => [o.opportunity_id, o]));
  const out: NbaCandidate[] = [];
  for (const group of src.pipeline) {
    for (const id of group.opportunity_ids) {
      const o = byId.get(id);
      out.push({
        subjectRef: id,
        subjectKind: "opportunity",
        source: "pipeline",
        action: "follow_up",
        ownerRmId: o?.owner_rm_id ?? null,
        clientId: o?.client_id ?? null,
        stage: o?.stage ?? group.stage,
        closeDate: o?.close_date ?? null,
        industryCode: o?.industry_code ?? null,
        rejectionCode: o?.rejection_reason_code ?? null,
      });
    }
  }
  for (const c of src.clients) {
    if (c.first_won_at === null) continue;
    if (servicesPurchased(src.clientServices, c.client_id).includes(BANK_FAMILY)) continue;
    out.push({
      subjectRef: c.client_id,
      subjectKind: "client",
      source: "old_client",
      action: "upsell_bank",
      ownerRmId: null,
      clientId: c.client_id,
      family: BANK_FAMILY,
      industryCode: c.industry_code,
    });
  }
  return out;
}
