// hook_score (Mi1-mkt-02, spec mục 6; D-43). Tính bằng code, không do LLM.
// = tổng (trọng số_i x điểm_i) / 100, điểm từng tiêu chí trên thang 0 tới 100 do nguồn chấm gửi về
// (hệ thống SEO/AIO hoặc file Team MKT). Trọng số 25/25/20/15/15 theo thứ tự tiêu chí. Thiếu điểm thì không chấm.
export function hookScore(scores: (number | null)[], weights: readonly number[]): number | null {
  if (scores.length !== weights.length) return null;
  if (scores.some((s) => s === null || !Number.isFinite(s) || s < 0 || s > 100)) return null;
  return scores.reduce<number>((a, s, i) => a + (s as number) * weights[i]!, 0) / 100;
}
