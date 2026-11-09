// T-SUM-01, T-SUM-02: câu báo sau khi dán, nạp (D-73): tạo mới theo loại, bỏ qua vì trùng, đã che PII, NBA 0 mục thì vì sao.
import { describe, expect, test } from "bun:test";
import { describeSa01 } from "../../src/agents/sa-01/run.ts";
import { summarizeRun } from "../../src/metrics/run-summary.ts";

describe("T-SUM câu báo kết quả", () => {
  test("T-SUM-01 summarizeRun đếm mục tạo mới theo loại, mục trùng, chỗ che PII", () => {
    const items = [{ item_type: "self_report" }, { item_type: "reason_code" }, { item_type: "nba" }, { item_type: "nba" }, { item_type: "system_notice" }];
    expect(summarizeRun(items, [true, true, true, false, true], [{ email: 2, phone: 1 }, { url: 1 }]))
      .toEqual({ byType: { self_report: 1, reason_code: 1, nba: 1 }, duplicates: 1, piiMasked: 4 });
  });

  test("T-SUM-02 câu báo nói rõ lý do khi NBA 0 mục", () => {
    const base = { created: {}, duplicates: 0, notices: [], reports: 0, piiMasked: 0, nbaCandidates: 0 };
    expect(describeSa01({ itemsCreated: 0, summary: base }, "nba")).toBe("Không tạo mục mới nào. NBA 0 mục: không Opportunity nào còn mở có Close Date trong tháng này qua luật NBA.");
    expect(describeSa01({ itemsCreated: 0, summary: { ...base, nbaCandidates: 3, duplicates: 3 } }, "nba")).toContain("đã có trên Hàng chờ");
    expect(describeSa01({ itemsCreated: 1, summary: { ...base, created: { system_notice: 0 }, notices: ["NBA tạm tắt: bộ eval NBA chưa pass 100%"], nbaCandidates: null } }, "nba")).toContain("NBA tạm tắt");
    expect(describeSa01({ itemsCreated: 2, summary: { ...base, created: { self_report: 1, reason_code: 1 }, reports: 1, piiMasked: 2, nbaCandidates: null } }, "paste"))
      .toBe("Đã tạo 2 mục mới trên Hàng chờ (1 tự báo, 1 mã lý do). Đọc được 1 bản tự báo. Đã che 2 email, số điện thoại, giấy tờ hoặc đường dẫn.");
  });
});
