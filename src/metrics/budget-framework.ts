// Khung quyết định Awareness/Traffic vs Conversion (docs/spec/khung-quyet-dinh-awareness-conversion.md bản Tạm v0.1;
// metric-definitions.md `budget_framework`; D-90). Tính bằng code, không do LLM. Tham số là giá trị tạm budget_framework.
// Thứ tự: G1 đè mọi thứ; rồi G4, G3; khoảng cách 7 ngày; quy tắc R theo mục tiêu hiện tại; G2 chặn C; biên ±max_step
// cho mọi dòng trừ R5. Đầu ra chỉ là nháp: không có code nào áp lên nền tảng quảng cáo.
export type Objective = "A" | "C";
export type BudgetFrameworkParams = {
  a_share: number; test_budget_share: number; max_step: number; r5_cut: number; min_days_between_changes: number; jimmy_total_change_share: number;
  r2_min_impressions: number; r2_min_contacts: number; r3_flag_weeks: number; r5_stop_after_cycles: number; weekly_total_usd: number | null;
};
export type ComboInput = {
  channel: string; jurisdiction: string;
  objective: Objective | null;          // mục tiêu đang chạy; null = tổ hợp mới
  budgetUsd: number;                    // ngân sách tuần hiện tại (chi tiêu tuần gần nhất)
  daysSinceChange: number | null;       // số ngày từ lần đổi đã duyệt gần nhất; null = chưa đổi lần nào
  trackingDegraded: boolean;            // G1, tầng 3A
  priceLocked: boolean;                 // G2, tầng 1B
  qaPass: boolean;                      // G3, tầng 1A
  resellerFiltered: boolean;            // G4
  winGate: "win" | "not_win" | "insufficient_data";
  impressions: number | null; contacts: number | null;
  tier3bFlagWeeks: number;              // số tuần liền tầng 3B bật cờ, tính tới tuần này
  cplBelowMedian: boolean | null; conversionBelowMedian: boolean | null;
  cycleComplete: boolean; netUsd: number | null; negativeCycles: number;
};
export type Rule = "G1" | "G2" | "G3" | "G4" | "INTERVAL" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "KEEP";
export type PlanLine = {
  channel: string; jurisdiction: string; objectiveOld: Objective | null; objectiveNew: Objective; budgetOld: number; budgetNew: number;
  rules: Rule[]; notes: string[]; evidence: Record<string, number | string | boolean | null>; confidence: number;
};
export type Plan = { lines: PlanLine[]; totalOld: number; totalNew: number; totalChange: number; base: number; needsJimmy: boolean; aShare: number | null; aShareTarget: number };

const round = (x: number) => Math.round(x * 100) / 100;

function confidence(c: ComboInput): number {
  return [c.impressions !== null, c.contacts !== null, c.cycleComplete && c.netUsd !== null, c.winGate !== "insufficient_data", !c.trackingDegraded].filter(Boolean).length / 5;
}

function decide(c: ComboInput, p: BudgetFrameworkParams, testCap: number): Omit<PlanLine, "channel" | "jurisdiction" | "objectiveOld" | "budgetOld" | "evidence" | "confidence"> {
  const old = c.objective ?? "A";
  const hold = (rule: Rule, note: string) => ({ objectiveNew: old, budgetNew: c.budgetUsd, rules: [rule], notes: [note] });
  if (c.trackingDegraded) return hold("G1", "TRACKING_DEGRADED: đóng băng, không đổi mục tiêu, không đổi ngân sách, không đánh giá xấu");
  if (!c.resellerFiltered) return hold("G4", "Mẫu chưa lọc khách cuối của reseller: không dùng để quyết định");
  if (!c.qaPass) return hold("G3", "Chưa có asset QA PASS: không vào lịch phân phối");
  if (c.daysSinceChange !== null && c.daysSinceChange < p.min_days_between_changes) return hold("INTERVAL", `Chưa đủ ${p.min_days_between_changes} ngày từ lần đổi trước`);

  let r: { objectiveNew: Objective; budgetNew: number; rules: Rule[]; notes: string[] };
  if (c.objective === "C") {
    if (c.cycleComplete && c.netUsd !== null && c.netUsd < 0) {
      const stop = c.negativeCycles >= p.r5_stop_after_cycles;
      r = { objectiveNew: "C", budgetNew: stop ? 0 : c.budgetUsd * (1 - p.r5_cut), rules: ["R5"], notes: [stop ? `Lợi nhuận ròng âm ${c.negativeCycles} chu kỳ liền: đề xuất dừng` : `Lợi nhuận ròng âm: giảm ${p.r5_cut * 100}%`] };
    } else if (c.tier3bFlagWeeks >= p.r3_flag_weeks) {
      r = { objectiveNew: "A", budgetNew: c.budgetUsd, rules: ["R3"], notes: [`Tầng 3B bật cờ ${c.tier3bFlagWeeks} tuần liền: lùi về A, ticket trang đích cho Team MKT và Content`] };
    } else if (c.cycleComplete && c.cplBelowMedian === true && c.conversionBelowMedian === true) {
      r = { objectiveNew: "C", budgetNew: c.budgetUsd, rules: ["R4"], notes: ["CPL dưới trung vị nhưng chuyển đổi dưới trung vị: giữ C, không tăng tiền, đẩy mã lý do từ chối lặp lại về Creative"] };
    } else if (c.winGate === "win" && c.netUsd !== null && c.netUsd > 0) {
      r = { objectiveNew: "C", budgetNew: c.budgetUsd * (1 + p.max_step), rules: ["R6"], notes: ["Win gate PASS và lợi nhuận ròng dương: đề xuất tăng"] };
    } else r = { objectiveNew: "C", budgetNew: c.budgetUsd, rules: ["KEEP"], notes: ["Giữ C"] };
  } else if ((c.impressions ?? 0) >= p.r2_min_impressions && (c.contacts ?? 0) >= p.r2_min_contacts && c.tier3bFlagWeeks === 0) {
    r = { objectiveNew: "C", budgetNew: c.budgetUsd, rules: ["R2"], notes: [`Đủ mẫu tầng 2 (impressions từ ${p.r2_min_impressions}), tầng 3B không cờ, contact từ ${p.r2_min_contacts}: chuyển sang C`] };
  } else if (c.objective === null || c.winGate === "insufficient_data") {
    r = { objectiveNew: "A", budgetNew: c.budgetUsd > 0 ? Math.min(c.budgetUsd, testCap) : testCap, rules: ["R1"], notes: [`Tổ hợp mới hoặc thiếu mẫu: A, ngân sách thử nghiệm tối đa ${p.test_budget_share * 100}% tổng tuần`] };
  } else r = { objectiveNew: "A", budgetNew: c.budgetUsd, rules: ["KEEP"], notes: ["Giữ A"] };

  if (r.objectiveNew === "C" && !c.priceLocked) {
    r = { objectiveNew: "A", budgetNew: c.budgetUsd, rules: ["G2", ...r.rules], notes: ["Tài phán chưa khoá giá: không chạy C; chỉ chạy A khi nội dung không nêu giá", ...r.notes] };
  }
  // Biên đổi mỗi tuần, trừ R5 và tổ hợp chưa có ngân sách.
  if (!r.rules.includes("R5") && c.budgetUsd > 0) {
    r.budgetNew = Math.min(c.budgetUsd * (1 + p.max_step), Math.max(c.budgetUsd * (1 - p.max_step), r.budgetNew));
  }
  return { ...r, budgetNew: round(r.budgetNew) };
}

export function budgetPlan(combos: readonly ComboInput[], p: BudgetFrameworkParams): Plan {
  let totalOld = 0;
  for (const c of combos) totalOld += c.budgetUsd;
  const base = p.weekly_total_usd ?? totalOld;
  const testCap = round(base * p.test_budget_share);
  const lines: PlanLine[] = combos.map((c) => ({
    channel: c.channel, jurisdiction: c.jurisdiction, objectiveOld: c.objective, budgetOld: c.budgetUsd, ...decide(c, p, testCap), confidence: confidence(c),
    evidence: { impressions: c.impressions, contacts: c.contacts, win_gate: c.winGate, net_usd: c.netUsd, negative_cycles: c.negativeCycles, tier3b_flag_weeks: c.tier3bFlagWeeks, price_locked: c.priceLocked, qa_pass: c.qaPass, cycle_complete: c.cycleComplete },
  }));
  let totalNew = 0;
  let totalChange = 0;
  let aNew = 0;
  for (const l of lines) {
    totalNew += l.budgetNew;
    totalChange += Math.abs(l.budgetNew - l.budgetOld);
    if (l.objectiveNew === "A") aNew += l.budgetNew;
  }
  return {
    lines, totalOld: round(totalOld), totalNew: round(totalNew), totalChange: round(totalChange), base: round(base),
    needsJimmy: base > 0 && totalChange > base * p.jimmy_total_change_share, aShare: totalNew > 0 ? Math.round((aNew / totalNew) * 1000) / 1000 : null, aShareTarget: p.a_share,
  };
}
