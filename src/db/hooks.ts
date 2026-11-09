// Bảng Hook (Mi1-mkt-02; D-43): lượt nạp mới nhất, xếp theo hook_score, kèm kết quả cổng tuân thủ (D-38).
// Đề xuất Hook card đầu tuần: các Hook có điểm, đạt cổng hoặc cần người duyệt, điểm cao nhất. Team MKT chọn.
import type { Database } from "bun:sqlite";
import { checkOne } from "../ads/check.ts";
import { adRules, HOOK_PARAMS } from "../config.ts";
import { hookScore } from "../metrics/hook-score.ts";
import { currentTuning } from "./tuning.ts";
import type { AdIssue, Verdict } from "../metrics/ad-compliance.ts";

export type HookRow = { hookId: string; text: string; jurisdiction: string | null; scores: (number | null)[]; score: number | null; verdict: Verdict; issues: AdIssue[]; source: string };

export function buildHookBoard(db: Database) {
  const imp = db.query("SELECT id, imported_at AS at, source, labels FROM hook_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { id: string; at: string; source: string; labels: string } | null;
  if (!imp) return { importedAt: null, labels: [...HOOK_PARAMS.defaultLabels], hooks: [] as HookRow[], proposed: [] as HookRow[] };
  const weights = currentTuning(db).hookWeights;
  const rows = db.query("SELECT hook_id, text, jurisdiction, s1, s2, s3, s4, s5 FROM hook_candidates WHERE import_id = ? ORDER BY hook_id").all(imp.id) as
    { hook_id: string; text: string; jurisdiction: string | null; s1: number | null; s2: number | null; s3: number | null; s4: number | null; s5: number | null }[];
  const hooks: HookRow[] = rows.map((r) => {
    const scores = [r.s1, r.s2, r.s3, r.s4, r.s5];
    const c = checkOne(db, { primaryText: r.text, headline: "", description: "", jurisdiction: r.jurisdiction }, adRules());
    return { hookId: r.hook_id, text: r.text, jurisdiction: r.jurisdiction, scores, score: hookScore(scores, weights), ...c, source: imp.source };
  });
  hooks.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.hookId.localeCompare(b.hookId));
  return {
    importedAt: imp.at,
    labels: JSON.parse(imp.labels) as string[],
    hooks,
    proposed: hooks.filter((h) => h.score !== null && (h.verdict === "pass" || h.verdict === "review")).slice(0, HOOK_PARAMS.proposeTop),
  };
}
