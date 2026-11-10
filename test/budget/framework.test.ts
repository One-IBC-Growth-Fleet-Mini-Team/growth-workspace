// T-BF-01 tới T-BF-05: khung quyết định Awareness/Conversion bản Tạm (D-90). Mỗi cổng, mỗi quy tắc một ca; G1 đè mọi
// quy tắc; không dòng nào vượt biên ±max_step trừ R5; đổi tham số thì kết quả đổi theo.
import { describe, expect, test } from "bun:test";
import { budgetPlan, type BudgetFrameworkParams, type ComboInput } from "../../src/metrics/budget-framework.ts";

const P: BudgetFrameworkParams = { a_share: 0.25, test_budget_share: 0.05, max_step: 0.2, r5_cut: 0.5, min_days_between_changes: 7, jimmy_total_change_share: 0.1,
  r2_min_impressions: 3000, r2_min_contacts: 10, r3_flag_weeks: 2, r5_stop_after_cycles: 2, weekly_total_usd: null };
const base: ComboInput = { channel: "meta", jurisdiction: "Hong Kong", objective: "C", budgetUsd: 1000, daysSinceChange: 14, trackingDegraded: false, priceLocked: true, qaPass: true,
  resellerFiltered: true, winGate: "not_win", impressions: 5000, contacts: 20, tier3bFlagWeeks: 0, cplBelowMedian: null, conversionBelowMedian: null, cycleComplete: true, netUsd: 100, negativeCycles: 0 };
const one = (c: Partial<ComboInput>, p = P) => budgetPlan([{ ...base, ...c }], p).lines[0]!;

describe("T-BF khung quyết định", () => {
  test("T-BF-01 cổng G1 tới G4 và khoảng cách 7 ngày giữ nguyên mục tiêu và ngân sách", () => {
    expect(one({ trackingDegraded: true })).toMatchObject({ rules: ["G1"], objectiveNew: "C", budgetNew: 1000 });
    expect(one({ resellerFiltered: false })).toMatchObject({ rules: ["G4"], budgetNew: 1000 });
    expect(one({ qaPass: false })).toMatchObject({ rules: ["G3"], budgetNew: 1000 });
    expect(one({ daysSinceChange: 3, winGate: "win" })).toMatchObject({ rules: ["INTERVAL"], budgetNew: 1000 });
    // G2: tài phán chưa khoá giá thì không chạy C (kể cả khi R2 hay R6 muốn C).
    expect(one({ priceLocked: false, winGate: "win" })).toMatchObject({ objectiveNew: "A", budgetNew: 1000, rules: ["G2", "R6"] });
    expect(one({ priceLocked: false, objective: "A" })).toMatchObject({ objectiveNew: "A", rules: ["G2", "R2"] });
  });

  test("T-BF-02 G1 đè mọi quy tắc: R5, R6, R2, R1 đều không chạy khi TRACKING_DEGRADED", () => {
    for (const c of [{ netUsd: -500 }, { winGate: "win" as const }, { objective: "A" as const }, { objective: null, budgetUsd: 0 }, { priceLocked: false, qaPass: false, resellerFiltered: false }]) {
      const l = one({ ...c, trackingDegraded: true });
      expect(l.rules).toEqual(["G1"]);
      expect(l.budgetNew).toBe(l.budgetOld);
    }
  });

  test("T-BF-03 quy tắc R1 tới R6", () => {
    expect(one({ objective: null, budgetUsd: 0, impressions: 100, contacts: 1 }, { ...P, weekly_total_usd: 10000 })).toMatchObject({ rules: ["R1"], objectiveNew: "A", budgetNew: 500 });
    expect(one({ objective: "A", winGate: "insufficient_data", impressions: 100, budgetUsd: 2000 }, { ...P, weekly_total_usd: 20000 })).toMatchObject({ rules: ["R1"], budgetNew: 1600 });
    expect(one({ objective: "A" })).toMatchObject({ rules: ["R2"], objectiveNew: "C", budgetNew: 1000 });
    expect(one({ objective: "A", tier3bFlagWeeks: 1 })).toMatchObject({ rules: ["KEEP"], objectiveNew: "A" });
    expect(one({ tier3bFlagWeeks: 2 })).toMatchObject({ rules: ["R3"], objectiveNew: "A", budgetNew: 1000 });
    expect(one({ cplBelowMedian: true, conversionBelowMedian: true, winGate: "win" })).toMatchObject({ rules: ["R4"], objectiveNew: "C", budgetNew: 1000 });
    expect(one({ netUsd: -50, negativeCycles: 1 })).toMatchObject({ rules: ["R5"], budgetNew: 500 });
    const stop = one({ netUsd: -50, negativeCycles: 2 });
    expect(stop).toMatchObject({ rules: ["R5"], budgetNew: 0 });
    expect(stop.notes[0]).toContain("đề xuất dừng");
    expect(one({ winGate: "win" })).toMatchObject({ rules: ["R6"], budgetNew: 1200 });
    expect(one({ winGate: "win", netUsd: -1, cycleComplete: true, negativeCycles: 1 }).rules).toEqual(["R5"]);
  });

  test("T-BF-04 không dòng nào vượt ±20% trừ R5; cờ anh Jimmy khi tổng thay đổi vượt 10% tổng tuần; tỷ trọng A", () => {
    const combos: ComboInput[] = [
      { ...base, jurisdiction: "A", winGate: "win" }, { ...base, jurisdiction: "B", netUsd: -10, negativeCycles: 2 }, { ...base, jurisdiction: "C", objective: "A", winGate: "insufficient_data", impressions: 10, budgetUsd: 5000 },
      { ...base, jurisdiction: "D", tier3bFlagWeeks: 3 }, { ...base, jurisdiction: "E", objective: null, budgetUsd: 0, impressions: 0 },
    ];
    const plan = budgetPlan(combos, P);
    for (const l of plan.lines) if (!l.rules.includes("R5") && l.budgetOld > 0) expect(Math.abs(l.budgetNew - l.budgetOld)).toBeLessThanOrEqual(l.budgetOld * 0.2 + 0.001);
    expect(plan.lines.map((l) => l.budgetNew)).toEqual([1200, 0, 4000, 1000, 400]);
    expect(plan).toMatchObject({ totalOld: 8000, totalNew: 6600, totalChange: 2600, base: 8000, needsJimmy: true, aShareTarget: 0.25 });
    expect(plan.aShare).toBeCloseTo((4000 + 1000 + 400) / 6600, 3);
    expect(budgetPlan([{ ...base, winGate: "win" }], { ...P, jimmy_total_change_share: 0.5 }).needsJimmy).toBe(false);
  });

  test("T-BF-05 đổi tham số trong config thì kết quả đổi theo", () => {
    expect(one({ winGate: "win" }, { ...P, max_step: 0.1 }).budgetNew).toBe(1100);
    expect(one({ netUsd: -5, negativeCycles: 1 }, { ...P, r5_cut: 0.3 }).budgetNew).toBe(700);
    expect(one({ objective: "A", impressions: 5000 }, { ...P, r2_min_impressions: 6000 }).rules).toEqual(["KEEP"]);
    expect(one({ tier3bFlagWeeks: 1 }, { ...P, r3_flag_weeks: 1 }).rules).toEqual(["R3"]);
    expect(one({ daysSinceChange: 3, winGate: "win" }, { ...P, min_days_between_changes: 2 }).rules).toEqual(["R6"]);
    expect(one({ netUsd: -5, negativeCycles: 1 }, { ...P, r5_stop_after_cycles: 1 }).budgetNew).toBe(0);
  });
});
