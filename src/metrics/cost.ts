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

// Tổng token của nhiều lượt gọi trong một phiên (để ghi agent_runs).
export function sumUsage(usages: readonly TokenUsage[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of usages) {
    assertTokens("inputTokens", u.inputTokens);
    assertTokens("outputTokens", u.outputTokens);
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
  }
  return { inputTokens, outputTokens };
}

// Chi phí LLM từ đầu tháng (UTC) tới nay, so với trần tháng (spec mục 10, C7).
export function monthToDateCostUsd(runs: readonly { cost_usd: number; started_at: string }[], now: Date): number {
  const month = now.toISOString().slice(0, 7);
  let total = 0;
  for (const r of runs) if (r.started_at.slice(0, 7) === month) total += r.cost_usd;
  return total;
}

// Tổng chi phí các bước của một phiên điều phối (D-82), làm tròn tới 0,0001 USD.
export function sumCostUsd(items: readonly { costUsd: number }[]): number {
  let total = 0;
  for (const i of items) total += i.costUsd;
  return Math.round(total * 10_000) / 10_000;
}
