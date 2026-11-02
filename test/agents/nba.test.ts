// T-NBA-R1a tới T-NBA-CAP: luật NBA bằng code (design doc mục 5.5). Mỗi luật một ca dương, một ca âm.
import { describe, expect, test } from "bun:test";
import { applyRules, type NbaContext } from "../../src/agents/sa-01/nba/rules.ts";
import { buildCandidates } from "../../src/agents/sa-01/nba/candidates.ts";
import { rankDrafts } from "../../src/agents/sa-01/nba/rank.ts";
import { proposeNba, type NbaInput } from "../../src/agents/sa-01/nba/index.ts";
import { nbaPriorityScore } from "../../src/metrics/nba-priority.ts";
import { client, opp } from "../helpers/db.ts";

function input(over: Partial<NbaInput> = {}): NbaInput {
  return {
    today: "2026-11-02",
    pipeline: [],
    opportunities: [],
    clients: [],
    clientServices: [],
    resellerFlag: () => false,
    duplicateOwnersForClient: () => [],
    ...over,
  };
}

const actions = (items: ReturnType<typeof proposeNba>) => items.map((i) => `${i.subjectRef}:${i.action}`);

describe("T-NBA-R1 khách cũ chỉ bán thêm Bank", () => {
  test("T-NBA-R1a khách cũ chưa có Bank thì có hành động RM chào Bank", () => {
    const out = proposeNba(input({
      clients: [client("C1", { first_won_at: "2025-01-01" })],
      clientServices: [{ client_id: "C1", product_family: "IBC01" }],
    }));
    expect(actions(out)).toEqual(["C1:upsell_bank"]);
    expect(out[0]!.rulesFired).toContain("NBA_R1");
  });

  test("T-NBA-R1a (âm) khách đã có Bank hoặc chưa phải khách cũ thì không chào Bank", () => {
    const out = proposeNba(input({
      clients: [client("C1", { first_won_at: "2025-01-01" }), client("C2", { first_won_at: null })],
      clientServices: [{ client_id: "C1", product_family: "IBC13" }],
    }));
    expect(out).toEqual([]);
  });

  test("T-NBA-R1b upsell Renew, ATA, Service cho khách cũ thành chuyển giao team, không bao giờ là RM bán", () => {
    const ctx: NbaContext = { resellerFlag: () => false, duplicateOwnersForClient: () => [] };
    const base = { subjectKind: "client" as const, source: "old_client" as const, ownerRmId: "RM_A", clientId: "C1" };
    const drafts = applyRules([
      { ...base, subjectRef: "C1", action: "upsell_other", family: "IBC11" },
      { ...base, subjectRef: "C1", action: "upsell_other", family: "IBC14" },
      { ...base, subjectRef: "C1", action: "upsell_other", family: "IBC01" },
    ], ctx);
    expect(drafts.map((d) => [d.action, d.handoffTeam])).toEqual([
      ["handoff_team", "Renewal"],
      ["handoff_team", "ATA"],
      ["handoff_team", "Service & Formation"],
    ]);
    for (const d of drafts) expect(d.rulesFired).toContain("NBA_R1");
  });
});

describe("T-NBA-R2 reseller", () => {
  const oldClient = { clients: [client("C1", { first_won_at: "2025-01-01" })], clientServices: [] };

  test("T-NBA-R2a reseller true thì không có hành động upsell nào", () => {
    const out = proposeNba(input({ ...oldClient, resellerFlag: () => true }));
    expect(out.filter((o) => o.action.startsWith("upsell") || o.action === "handoff_team")).toEqual([]);
  });

  test("T-NBA-R2a (âm) reseller false thì vẫn chào Bank", () => {
    expect(actions(proposeNba(input({ ...oldClient, resellerFlag: () => false })))).toEqual(["C1:upsell_bank"]);
  });

  test("T-NBA-R2b reseller unknown thì không upsell, có hành động xác nhận cờ reseller (D-06)", () => {
    const out = proposeNba(input({ ...oldClient, resellerFlag: () => "unknown" }));
    expect(actions(out)).toEqual(["C1:confirm_reseller_flag"]);
    expect(out[0]!.rulesFired).toContain("NBA_R2");
  });
});

describe("T-NBA-R3 ngành cấm chỉ hạ ưu tiên", () => {
  test("T-NBA-R3a ngành cấm thì điểm ưu tiên giảm", () => {
    const o1 = opp("O1", { industry_code: "FOREX", close_date: "2026-11-10" });
    const o2 = opp("O2", { close_date: "2026-11-10" });
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 2, opportunity_ids: ["O1", "O2"] }],
      opportunities: [o1, o2],
    }));
    expect(out.map((o) => o.subjectRef)).toEqual(["O2", "O1"]);
    const fx = out.find((o) => o.subjectRef === "O1")!;
    expect(fx.rulesFired).toContain("NBA_R3");
    expect(fx.priority).toBeLessThan(out.find((o) => o.subjectRef === "O2")!.priority);
  });

  test("T-NBA-R3a mã RESTRICTED_INDUSTRY đã xác nhận cũng hạ ưu tiên; ngành thường thì không", () => {
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 2, opportunity_ids: ["O1", "O2"] }],
      opportunities: [opp("O1", { rejection_reason_code: "RESTRICTED_INDUSTRY" }), opp("O2", { industry_code: "TRADING" })],
    }));
    expect(out.find((o) => o.subjectRef === "O1")!.rulesFired).toContain("NBA_R3");
    expect(out.find((o) => o.subjectRef === "O2")!.rulesFired).not.toContain("NBA_R3");
  });

  test("T-NBA-R3b (thuộc tính) với mọi đầu vào ngẫu nhiên, luật 3 không bao giờ làm điểm tăng", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i += 1) {
      const args = {
        stageWeight: rnd() * 5,
        daysToClose: rnd() < 0.2 ? null : Math.floor(rnd() * 60) - 10,
        rmActive: rnd() < 0.3 ? null : rnd() < 0.5,
      };
      const without = nbaPriorityScore({ ...args, factor: 1 });
      const withR3 = nbaPriorityScore({ ...args, factor: 0.5 });
      expect(withR3).toBeLessThanOrEqual(without);
    }
    expect(() => nbaPriorityScore({ stageWeight: 1, daysToClose: 1, rmActive: null, factor: 1.5 })).toThrow();
  });
});

describe("T-NBA-R4 nháp chờ RM xác nhận", () => {
  test("T-NBA-R4 mọi mục NBA có default_action giữ nháp và luật NBA_R4", () => {
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 1, opportunity_ids: ["O1"] }],
      opportunities: [opp("O1")],
      clients: [client("C1", { first_won_at: "2025-01-01" })],
    }));
    expect(out.length).toBe(2);
    for (const o of out) {
      expect(o.defaultAction).toBe("giữ nháp");
      expect(o.rulesFired).toContain("NBA_R4");
    }
  });
  // Phần "sau confirm hiển thị chờ RM xác nhận tới khi có rm_outcome" kiểm ở test/queue (bước 7).
});

describe("T-NBA-R5 chỉ theo Close Date trong kỳ", () => {
  test("T-NBA-R5 Opportunity ngoài kỳ theo Close Date không bao giờ thành ứng viên dù tạo trong kỳ", () => {
    // O_OUT có trong snapshot (tạo trong kỳ) nhưng không có trong kết quả get_pipeline_by_close_date.
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 1, opportunity_ids: ["O_IN"] }],
      opportunities: [opp("O_IN"), { ...opp("O_OUT", { close_date: "2026-12-15" }), created_at: "2026-11-01" } as never],
    }));
    expect(actions(out)).toEqual(["O_IN:follow_up"]);
    expect(out[0]!.rulesFired).toContain("NBA_R5");
  });

  test("T-NBA-R5 buildCandidates không nhận tham số nào về ngày tạo", async () => {
    const src = await Bun.file(new URL("../../src/agents/sa-01/nba/candidates.ts", import.meta.url)).text();
    expect(src.replace(/\/\/.*$/gm, "")).not.toMatch(/created/i);
    expect(buildCandidates.length).toBe(1);
  });
});

describe("T-NBA-DUP và STALL", () => {
  test("T-NBA-DUP Lead trùng với RM khác gắn cảnh báo; trùng cùng RM thì không", () => {
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 2, opportunity_ids: ["O1", "O2"] }],
      opportunities: [opp("O1", { client_id: "C1", owner_rm_id: "RM_A" }), opp("O2", { client_id: "C2", owner_rm_id: "RM_A" })],
      duplicateOwnersForClient: (c) => (c === "C1" ? ["RM_A", "RM_B"] : ["RM_A"]),
    }));
    const o1 = out.find((o) => o.subjectRef === "O1")!;
    const o2 = out.find((o) => o.subjectRef === "O2")!;
    expect(o1.rulesFired).toContain("NBA_X_DUP");
    expect(o1.warnings).toEqual(["có thể trùng khách với RM_B"]);
    expect(o2.warnings).toEqual([]);
  });

  test("T-NBA-DUP (STALL) mã UNRESPONSIVE, PAYMENT_PENDING đổi hành động gợi ý", () => {
    const out = proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 2, opportunity_ids: ["O1", "O2"] }],
      opportunities: [opp("O1", { rejection_reason_code: "UNRESPONSIVE" }), opp("O2", { rejection_reason_code: "PAYMENT_PENDING" })],
    }));
    expect(actions(out).sort()).toEqual(["O1:follow_up_unresponsive", "O2:remind_invoice"]);
  });
});

describe("T-NBA-CAP giới hạn và thứ tự", () => {
  test("T-NBA-CAP không quá giới hạn mục mỗi sáng; thứ tự xác định với cùng đầu vào", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `O${String(i).padStart(2, "0")}`);
    const opportunities = ids.map((id, i) => opp(id, { stage: i % 2 ? "Negotiation" : "Quotation", close_date: `2026-11-${String(1 + (i % 28)).padStart(2, "0")}` }));
    const make = () => proposeNba(input({
      pipeline: [{ stage: "Quotation", count: 30, opportunity_ids: ids }],
      opportunities,
      cap: 20,
    }));
    const a = make();
    expect(a.length).toBe(20);
    expect(actions(a)).toEqual(actions(make()));
    expect(actions(a)).toEqual(actions(proposeNba(input({ pipeline: [{ stage: "Quotation", count: 30, opportunity_ids: [...ids].reverse() }], opportunities: [...opportunities].reverse(), cap: 20 }))));
    for (let i = 1; i < a.length; i += 1) expect(a[i - 1]!.priority).toBeGreaterThanOrEqual(a[i]!.priority);
  });

  test("T-NBA-CAP Stage gần chốt xếp trước; rankDrafts không làm mất mục khi dưới giới hạn", () => {
    const out = proposeNba(input({
      pipeline: [{ stage: "x", count: 2, opportunity_ids: ["O1", "O2"] }],
      opportunities: [opp("O1", { stage: "Quotation" }), opp("O2", { stage: "Negotiation" })],
    }));
    expect(out.map((o) => o.subjectRef)).toEqual(["O2", "O1"]);
    expect(rankDrafts([], { cap: 5, today: "2026-11-02", opportunities: [] })).toEqual([]);
  });
});
