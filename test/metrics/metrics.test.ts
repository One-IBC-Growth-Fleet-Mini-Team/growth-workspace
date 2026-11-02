// T-MET-01 tới T-MET-07: hàm chỉ số khớp docs/spec/metric-definitions.md.
import { describe, expect, test } from "bun:test";
import { pipelineInPeriod } from "../../src/metrics/pipeline-in-period.ts";
import { isResellerEndClient } from "../../src/metrics/reseller-flag.ts";
import { servicesPurchased } from "../../src/metrics/services-purchased.ts";
import { rmActiveOnDeal } from "../../src/metrics/rm-active-on-deal.ts";
import { computeConfidence, fieldCoverage } from "../../src/metrics/confidence.ts";
import { computeCostUsd } from "../../src/metrics/cost.ts";
import type { OpportunityRow } from "../../src/db/types.ts";

function opp(id: string, over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    opportunity_id: id,
    client_id: null,
    owner_rm_id: "RM_A",
    stage: "S1",
    close_date: null,
    last_modified_at: null,
    has_next_step: 0,
    jurisdiction_code: null,
    service_family: null,
    industry_code: null,
    rejection_reason_code: null,
    ...over,
  };
}

const PERIOD = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };

describe("T-MET-01 pipeline_in_period", () => {
  test("T-MET-01 deal tạo trước kỳ nhưng Close Date trong kỳ được tính", () => {
    // created_at không có trong snapshot; giữ ở dữ liệu thử để chứng minh hàm không đọc nó.
    const rows = [{ ...opp("o1", { close_date: "2026-11-10" }), created_at: "2026-06-01" }];
    const result = pipelineInPeriod(rows, PERIOD);
    expect(result).toEqual([{ stage: "S1", count: 1, opportunity_ids: ["o1"] }]);
  });

  test("T-MET-01 deal tạo trong kỳ nhưng Close Date ngoài kỳ không tính", () => {
    const rows = [{ ...opp("o2", { close_date: "2026-12-05" }), created_at: "2026-11-03" }];
    expect(pipelineInPeriod(rows, PERIOD)).toEqual([]);
  });

  test("T-MET-01 nhóm theo Stage, biên đầu và cuối kỳ tính cả hai đầu", () => {
    const rows = [
      opp("o1", { stage: "S2", close_date: "2026-11-01" }),
      opp("o2", { stage: "S1", close_date: "2026-11-30" }),
      opp("o3", { stage: "S2", close_date: "2026-11-15" }),
      opp("o4", { stage: "S1", close_date: "2026-10-31" }),
      opp("o5", { stage: "S1", close_date: "2026-12-01" }),
      opp("o6", { stage: "S1", close_date: null }),
    ];
    expect(pipelineInPeriod(rows, PERIOD)).toEqual([
      { stage: "S1", count: 1, opportunity_ids: ["o2"] },
      { stage: "S2", count: 2, opportunity_ids: ["o1", "o3"] },
    ]);
  });

  test("T-MET-01 lọc tuỳ chọn theo owner_rm_id", () => {
    const rows = [
      opp("o1", { close_date: "2026-11-02", owner_rm_id: "RM_A" }),
      opp("o2", { close_date: "2026-11-02", owner_rm_id: "RM_B" }),
    ];
    expect(pipelineInPeriod(rows, { ...PERIOD, ownerRmId: "RM_B" })).toEqual([
      { stage: "S1", count: 1, opportunity_ids: ["o2"] },
    ]);
  });

  test("T-MET-01 ngày kỳ sai định dạng hoặc đảo ngược thì ném lỗi", () => {
    expect(() => pipelineInPeriod([], { periodStart: "01/11/2026", periodEnd: "2026-11-30" })).toThrow();
    expect(() => pipelineInPeriod([], { periodStart: "2026-11-30", periodEnd: "2026-11-01" })).toThrow();
  });
});

describe("T-MET-02 pipeline_in_period không nhận Created Date", () => {
  test("T-MET-02 tham số kỳ chỉ có periodStart, periodEnd, ownerRmId; khoá lạ bị từ chối", () => {
    const bad = { ...PERIOD, createdFrom: "2026-11-01" } as unknown as typeof PERIOD;
    expect(() => pipelineInPeriod([], bad)).toThrow(/created|unknown/i);
    const bad2 = { ...PERIOD, created_date: "2026-11-01" } as unknown as typeof PERIOD;
    expect(() => pipelineInPeriod([], bad2)).toThrow();
  });

  test("T-MET-02 mã nguồn hàm không nhắc tới created", async () => {
    const src = await Bun.file(new URL("../../src/metrics/pipeline-in-period.ts", import.meta.url)).text();
    const code = src.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/created/i);
  });
  // Phần "schema tool" của T-MET-02 kiểm ở bước 5 (crm-read-mcp).
});

describe("T-MET-03 is_reseller_end_client", () => {
  test("T-MET-03 1 → true, 0 → false, NULL → unknown", () => {
    expect(isResellerEndClient(1)).toBe(true);
    expect(isResellerEndClient(0)).toBe(false);
    expect(isResellerEndClient(null)).toBe("unknown");
  });

  test("T-MET-03 không có nhánh suy đoán: giá trị lạ ném lỗi, không đoán", () => {
    expect(() => isResellerEndClient(2 as never)).toThrow();
    expect(() => isResellerEndClient("1" as never)).toThrow();
  });
});

describe("T-MET-04 services_purchased", () => {
  test("T-MET-04 lấy từ crm_client_services của đúng client, không trùng", () => {
    const rows = [
      { client_id: "c1", product_family: "IBC01" },
      { client_id: "c1", product_family: "IBC13" },
      { client_id: "c2", product_family: "IBC14" },
    ];
    expect(servicesPurchased(rows, "c1")).toEqual(["IBC01", "IBC13"]);
    expect(servicesPurchased(rows, "c3")).toEqual([]);
  });

  test("T-MET-04 không đọc WorkOrder", async () => {
    const src = await Bun.file(new URL("../../src/metrics/services-purchased.ts", import.meta.url)).text();
    const code = src.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/work_?order/i);
  });
});

describe("T-MET-05 rm_active_on_deal", () => {
  const params = { bulkThreshold: 3 };

  test("T-MET-05 nhiều Opportunity trùng last_modified_at tới từng giây là hàng loạt, không tính", () => {
    const snapshot = [
      opp("o1", { last_modified_at: "2026-10-30T03:15:42.120Z" }),
      opp("o2", { last_modified_at: "2026-10-30T03:15:42.870Z" }),
      opp("o3", { last_modified_at: "2026-10-30T03:15:42.000Z" }),
    ];
    for (const o of snapshot) expect(rmActiveOnDeal(o, snapshot, params)).toBe(false);
  });

  test("T-MET-05 last_modified_at lẻ, riêng biệt thì tính", () => {
    const snapshot = [
      opp("o1", { last_modified_at: "2026-10-30T03:15:42.000Z" }),
      opp("o2", { last_modified_at: "2026-10-30T03:15:43.000Z" }),
      opp("o3", { last_modified_at: "2026-10-30T09:00:00.000Z" }),
    ];
    for (const o of snapshot) expect(rmActiveOnDeal(o, snapshot, params)).toBe(true);
  });

  test("T-MET-05 has_next_step = 1 thì tính, kể cả khi nằm trong lô hàng loạt", () => {
    const ts = "2026-10-30T03:15:42.000Z";
    const snapshot = [
      opp("o1", { last_modified_at: ts, has_next_step: 1 }),
      opp("o2", { last_modified_at: ts }),
      opp("o3", { last_modified_at: ts }),
    ];
    expect(rmActiveOnDeal(snapshot[0]!, snapshot, params)).toBe(true);
    expect(rmActiveOnDeal(snapshot[1]!, snapshot, params)).toBe(false);
  });

  test("T-MET-05 không có last_modified_at và không có NextStep thì không tính", () => {
    const o = opp("o1");
    expect(rmActiveOnDeal(o, [o], params)).toBe(false);
  });

  test("T-MET-05 ngưỡng hàng loạt là tham số (Q-09): dưới ngưỡng thì vẫn tính", () => {
    const ts = "2026-10-30T03:15:42.000Z";
    const snapshot = [opp("o1", { last_modified_at: ts }), opp("o2", { last_modified_at: ts })];
    expect(rmActiveOnDeal(snapshot[0]!, snapshot, { bulkThreshold: 3 })).toBe(true);
    expect(rmActiveOnDeal(snapshot[0]!, snapshot, { bulkThreshold: 2 })).toBe(false);
  });
});

describe("T-MET-06 compute_confidence", () => {
  test("T-MET-06 công thức D-07: pass_rate × coverage × min(1, n/30)", () => {
    const r = computeConfidence({ evalPassRate: 0.9, fieldCoverage: 1, evalCaseCount: 15, flags: [] });
    expect(r.confidence).toBeCloseTo(0.45, 10);
    expect(r.components).toEqual({ evalPassRate: 0.9, fieldCoverage: 1, sampleFactor: 0.5, flagFactor: 1 });
    const full = computeConfidence({ evalPassRate: 1, fieldCoverage: 1, evalCaseCount: 60, flags: [] });
    expect(full.confidence).toBe(1);
  });

  test("T-MET-06 cờ truncated, unstructured mỗi cờ nhân thêm 0,8", () => {
    const one = computeConfidence({ evalPassRate: 1, fieldCoverage: 1, evalCaseCount: 30, flags: ["truncated"] });
    expect(one.confidence).toBeCloseTo(0.8, 10);
    const two = computeConfidence({
      evalPassRate: 1,
      fieldCoverage: 1,
      evalCaseCount: 30,
      flags: ["truncated", "unstructured"],
    });
    expect(two.confidence).toBeCloseTo(0.64, 10);
  });

  test("T-MET-06 dưới 0,8 bật cờ escalate; đúng 0,8 thì không", () => {
    expect(computeConfidence({ evalPassRate: 0.8, fieldCoverage: 1, evalCaseCount: 30, flags: [] }).escalate).toBe(
      false,
    );
    expect(computeConfidence({ evalPassRate: 0.79, fieldCoverage: 1, evalCaseCount: 30, flags: [] }).escalate).toBe(
      true,
    );
  });

  test("T-MET-06 không có đầu vào nào từ đầu ra của LLM: khoá lạ bị từ chối", () => {
    const withSelfScore = {
      evalPassRate: 1,
      fieldCoverage: 1,
      evalCaseCount: 30,
      flags: [],
      model_self_score: 0.99,
    } as unknown as Parameters<typeof computeConfidence>[0];
    expect(() => computeConfidence(withSelfScore)).toThrow();
  });

  test("T-MET-06 đầu vào ngoài [0, 1] hoặc cờ lạ bị từ chối", () => {
    expect(() => computeConfidence({ evalPassRate: 1.2, fieldCoverage: 1, evalCaseCount: 30, flags: [] })).toThrow();
    expect(() => computeConfidence({ evalPassRate: 1, fieldCoverage: -0.1, evalCaseCount: 30, flags: [] })).toThrow();
    expect(() => computeConfidence({ evalPassRate: 1, fieldCoverage: 1, evalCaseCount: -1, flags: [] })).toThrow();
    expect(() =>
      computeConfidence({ evalPassRate: 1, fieldCoverage: 1, evalCaseCount: 30, flags: ["high_confidence" as never] }),
    ).toThrow();
  });

  test("T-MET-06 field_coverage: mỗi trường unknown hoặc null làm giảm", () => {
    expect(fieldCoverage({ reseller: true, industry: "FX", services: ["IBC01"] })).toBe(1);
    expect(fieldCoverage({ reseller: "unknown", industry: "FX", services: ["IBC01"] })).toBeCloseTo(2 / 3, 10);
    expect(fieldCoverage({ reseller: "unknown", industry: null, services: undefined })).toBe(0);
    expect(() => fieldCoverage({})).toThrow();
  });
});

describe("T-MET-07 cost_usd", () => {
  test("T-MET-07 cost_usd tính từ token và bảng giá cấu hình", () => {
    const price = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };
    expect(computeCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }, price)).toBe(3);
    expect(computeCostUsd({ inputTokens: 2_000, outputTokens: 1_000 }, price)).toBeCloseTo(0.021, 10);
    expect(computeCostUsd({ inputTokens: 0, outputTokens: 0 }, price)).toBe(0);
  });

  test("T-MET-07 token âm hoặc không nguyên bị từ chối", () => {
    const price = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };
    expect(() => computeCostUsd({ inputTokens: -1, outputTokens: 0 }, price)).toThrow();
    expect(() => computeCostUsd({ inputTokens: 1.5, outputTokens: 0 }, price)).toThrow();
  });
});
