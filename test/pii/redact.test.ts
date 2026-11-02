// T-PII-01 tới T-PII-04: lớp R1 (regex) và R3 (quét sau LLM) của design doc mục 7.3.
// LLM được thay bằng hàm giả; không gọi LLM thật.
import { describe, expect, test } from "bun:test";
import { redactR1 } from "../../src/pii/redact-regex.ts";
import { guardOutput } from "../../src/pii/name-guard.ts";
import { parseReport } from "../../src/teams/parse-report.ts";
import { HTML_VARIANT, UNSTRUCTURED_TEXT } from "../fixtures/synthetic/teams.ts";

describe("T-PII-01 R1 regex", () => {
  test("T-PII-01 xoá email", () => {
    const r = redactR1("liên hệ canary+1@example.invalid hoặc CANARY.two@sub.example.invalid.");
    expect(r.text).toBe("liên hệ [EMAIL] hoặc [EMAIL].");
    expect(r.stats.email).toBe(2);
  });

  test("T-PII-01 xoá SĐT ở ít nhất 6 định dạng quốc tế (dải thử nghiệm)", () => {
    const phones = [
      "+44 7700 900123",
      "07700 900123",
      "(+44) 7700-900-123",
      "0044-7700-900-456",
      "+1 (202) 555-0142",
      "202.555.0199",
      "+61 491 570 156",
      "+447700900789",
    ];
    for (const p of phones) {
      const r = redactR1(`gọi ${p} nhé`);
      expect({ p, text: r.text }).toEqual({ p, text: "gọi [SĐT] nhé" });
      expect(r.stats.phone).toBe(1);
    }
  });

  test("T-PII-01 không xoá số đếm, ngày báo cáo, mã sản phẩm", () => {
    const text = "TIẾP CẬN: 12 lead, BÁO GIÁ: 2 IBC01, ngày 01/11, 2026-11-01, giá 2,500 USD";
    expect(redactR1(text).text).toBe(text);
  });

  test("T-PII-01 xoá chuỗi giống số hộ chiếu", () => {
    const r = redactR1("passport: Z0000001, hộ chiếu số ZZ0000002, CCCD 000000000003");
    expect(r.text).not.toMatch(/Z0000001|ZZ0000002|000000000003/);
    expect(r.stats.id_doc).toBe(3);
  });

  test("T-PII-01 xoá ngày sinh có ngữ cảnh, giữ ngày không có ngữ cảnh sinh", () => {
    const r = redactR1("DOB: 01/02/1990; sinh ngày 3-4-1985; năm sinh 1979; born 5 May 1980; họp 30/10/2026");
    expect(r.text).toBe(
      "DOB: [NGÀY_SINH]; sinh ngày [NGÀY_SINH]; năm sinh [NGÀY_SINH]; born [NGÀY_SINH]; họp 30/10/2026",
    );
    expect(r.stats.dob).toBe(4);
  });

  test("T-PII-01 xoá URL (có tham số và không có)", () => {
    const r = redactR1("xem https://example.invalid/form?name=CANARY_NAME_7f3a&x=1 và http://example.invalid/in/abc");
    expect(r.text).toBe("xem [URL] và [URL]");
    expect(r.stats.url).toBe(2);
  });
});

describe("T-PII-02 văn bản gửi LLM giả", () => {
  test("T-PII-02 đầu vào LLM giả không chứa canary email, SĐT", () => {
    const received: string[] = [];
    const fakeLlm = (input: string) => {
      received.push(input);
      return "{}";
    };
    for (const [content, type] of [
      [HTML_VARIANT, "html"],
      [UNSTRUCTURED_TEXT, "text"],
    ] as const) {
      fakeLlm(JSON.stringify(parseReport(content, type)));
    }
    const all = received.join("\n");
    for (const canary of ["canary+1@example.invalid", "canary+2@example.invalid", "7700 900123", "555 0142", "900123", "5550142"]) {
      expect(all).not.toContain(canary);
    }
  });
});

describe("T-PII-03 R3 chặn tên còn sót", () => {
  test("T-PII-03 đầu ra LLM giả còn canary tên thì blocked", () => {
    const fakeLlmOutput = {
      report_date: "2026-11-01",
      sections: { customer_said: [{ customer_ref: "KHACH_1", quote_vi: "CANARY_NAME_7f3a chê giá", quote_original: "too expensive" }] },
    };
    const g = guardOutput(fakeLlmOutput, { rmNames: ["RM_A"] });
    expect(g.pii_check).toBe("blocked");
    expect(g.stats.name_suspects).toBeGreaterThan(0);
    expect(JSON.stringify(g)).not.toContain("CANARY");
  });

  test("T-PII-03 tên riêng viết hoa giữa câu hoặc chuỗi tên liên tiếp thì blocked", () => {
    expect(guardOutput({ note: "khách tên Johnathan hỏi giá" }).pii_check).toBe("blocked");
    expect(guardOutput({ note: "Johnathan Doe hỏi giá" }).pii_check).toBe("blocked");
  });

  test("T-PII-03 họ, tên Việt trùng từ nhãn mẫu (Hồ, Nam, Bảo, Đăng, Thông) vẫn bị chặn", () => {
    for (const note of ["chị Bảo Nam hỏi giá", "anh Hồ chê phí", "khách Đăng Thông cần gấp", "anh Gia hỏi lại"]) {
      expect({ note, r: guardOutput({ note }).pii_check }).toEqual({ note, r: "blocked" });
    }
  });

  test("T-PII-03 R1 được chạy lại: email hoặc SĐT sót trong đầu ra thì blocked", () => {
    expect(guardOutput({ note: "gửi canary+1@example.invalid" }).pii_check).toBe("blocked");
    expect(guardOutput({ a: [{ b: "gọi +44 7700 900123" }] }).pii_check).toBe("blocked");
  });
});

describe("T-PII-04 R3 không chặn danh sách cho phép", () => {
  test("T-PII-04 tên tài phán, sản phẩm, tên RM, mã lý do, nhãn mẫu, placeholder đi qua", () => {
    const out = {
      report_date: "2026-11-01",
      sections: {
        outreach: { count: 12, channels: ["linkedin"], note: "Tiếp cận qua LinkedIn và WhatsApp" },
        quotes: [{ jurisdiction_code: "WS", service_family: "IBC01", status: "sent" }],
        customer_said: [
          { customer_ref: "KHACH_1", quote_vi: "Khách thấy phí Samoa cao hơn Hong Kong và BVI", quote_original: "Cost wise its expensive" },
        ],
        needs_support: [{ topic: "Bank", note: "RM_A cần bảng so sánh phí Bank và ATA, gọi [SĐT]" }],
      },
      reason_code_proposals: [{ customer_ref: "KHACH_1", primary: "PRICE_TOO_HIGH", evidence_quote: "Cost wise its expensive" }],
    };
    const g = guardOutput(out, { rmNames: ["RM_A"] });
    expect(g).toEqual({ pii_check: "passed", stats: { r1_hits: 0, name_suspects: 0 } });
  });

  test("T-PII-04 tên RM chỉ được phép khi có trong rm_directory truyền vào", () => {
    expect(guardOutput({ note: "giao cho RM_Z" }, { rmNames: ["RM_A"] }).pii_check).toBe("blocked");
    expect(guardOutput({ note: "giao cho RM_Z" }, { rmNames: ["RM_Z"] }).pii_check).toBe("passed");
  });
});
