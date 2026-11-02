// cost_usd của một phiên agent (design doc mục 4.5, T-MET-07): tính từ số token và bảng giá
// cấu hình (getLlmPricing trong config.ts). Không do LLM tự báo.
export type TokenUsage = { inputTokens: number; outputTokens: number };
export type TokenPrice = { inputUsdPerMTok: number; outputUsdPerMTok: number };

function assertTokens(name: string, n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`cost_usd: ${name} must be a non-negative integer`);
}

export function computeCostUsd(usage: TokenUsage, price: TokenPrice): number {
  assertTokens("inputTokens", usage.inputTokens);
  assertTokens("outputTokens", usage.outputTokens);
  for (const v of [price.inputUsdPerMTok, price.outputUsdPerMTok]) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError("cost_usd: price must be non-negative");
  }
  return (usage.inputTokens * price.inputUsdPerMTok + usage.outputTokens * price.outputUsdPerMTok) / 1_000_000;
}
