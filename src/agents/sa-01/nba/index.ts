// Điểm vào của luật NBA: ứng viên → luật → xếp hạng. Dùng chung cho runSa01 và bộ chạy eval.
import { NBA_PARAMS } from "../../../config.ts";
import type { ClientRow, ClientServiceRow, OpportunityRow } from "../../../db/types.ts";
import type { PipelineStageGroup } from "../../../metrics/pipeline-in-period.ts";
import { buildCandidates } from "./candidates.ts";
import { applyRules, type NbaContext } from "./rules.ts";
import { rankDrafts } from "./rank.ts";
import type { RankedNba } from "./types.ts";

export type NbaInput = NbaContext & {
  today: string;
  pipeline: readonly PipelineStageGroup[];
  opportunities: readonly OpportunityRow[];
  clients: readonly ClientRow[];
  clientServices: readonly ClientServiceRow[];
  cap?: number;
};

export function proposeNba(input: NbaInput): RankedNba[] {
  const candidates = buildCandidates(input);
  const drafts = applyRules(candidates, input);
  return rankDrafts(drafts, {
    cap: input.cap ?? NBA_PARAMS.maxItemsPerMorning,
    today: input.today,
    opportunities: input.opportunities,
  });
}
