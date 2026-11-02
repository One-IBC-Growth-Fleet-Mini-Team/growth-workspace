// T-HASH-01 tới T-HASH-03: chuẩn hoá và băm email, SĐT bằng HMAC-SHA256 (D-05).
// Khoá dưới đây chỉ dùng cho test, không phải secret.
import { describe, expect, test } from "bun:test";
import { createPiiHasher, normalizeEmail, normalizePhone } from "../../src/pii/hash.ts";

const TEST_KEY = "test-only-key-not-a-secret-0123456789abcdef";

describe("T-HASH-01 chuẩn hoá email", () => {
  test("T-HASH-01 hoa thường và khoảng trắng cho cùng mã băm", () => {
    const h = createPiiHasher(TEST_KEY);
    const a = h.hashEmail("canary+1@example.invalid");
    expect(h.hashEmail("  Canary+1@EXAMPLE.invalid ")).toBe(a);
    expect(h.hashEmail("\tCANARY+1@example.INVALID\n")).toBe(a);
    expect(h.hashEmail("canary+2@example.invalid")).not.toBe(a);
  });

  test("T-HASH-01 email rỗng hoặc không hợp lệ trả null, không băm", () => {
    const h = createPiiHasher(TEST_KEY);
    expect(normalizeEmail("   ")).toBeNull();
    expect(h.hashEmail("")).toBeNull();
    expect(h.hashEmail(null)).toBeNull();
    expect(h.hashEmail("not-an-email")).toBeNull();
  });
});

describe("T-HASH-02 chuẩn hoá SĐT", () => {
  test("T-HASH-02 các định dạng của cùng một số cho cùng mã băm", () => {
    // Dải thử nghiệm Ofcom (UK) 07700 900xxx.
    const h = createPiiHasher(TEST_KEY, { defaultCountryCode: "44" });
    const a = h.hashPhone("+44 7700 900123");
    for (const v of ["+447700900123", "0044 7700 900 123", "(+44) 7700-900-123", "07700 900123", "+44.7700.900.123"]) {
      expect(h.hashPhone(v)).toBe(a);
    }
  });

  test("T-HASH-02 số khác cho mã khác", () => {
    const h = createPiiHasher(TEST_KEY, { defaultCountryCode: "44" });
    expect(h.hashPhone("+44 7700 900124")).not.toBe(h.hashPhone("+44 7700 900123"));
    // Dải thử nghiệm Bắc Mỹ 555-01xx.
    expect(h.hashPhone("+1 202 555 0142")).not.toBe(h.hashPhone("+44 7700 900123"));
  });

  test("T-HASH-02 không có mã quốc gia mặc định thì số nội địa chỉ giữ chữ số (chờ đối chiếu schema)", () => {
    expect(normalizePhone("07700 900123")).toBe("07700900123");
    expect(normalizePhone("07700 900123", { defaultCountryCode: "44" })).toBe("447700900123");
    expect(normalizePhone("+1 (202) 555-0142")).toBe("12025550142");
  });

  test("T-HASH-02 chuỗi quá ngắn hoặc rỗng trả null", () => {
    const h = createPiiHasher(TEST_KEY);
    expect(normalizePhone("12-34")).toBeNull();
    expect(h.hashPhone("")).toBeNull();
    expect(h.hashPhone(undefined)).toBeNull();
  });
});

describe("T-HASH-03 vector cố định", () => {
  test("T-HASH-03 đầu vào tổng hợp biết trước cho mã băm biết trước (HMAC-SHA256)", () => {
    // Giá trị kỳ vọng tính độc lập bằng Python hmac + hashlib.sha256.
    const h = createPiiHasher(TEST_KEY);
    expect(h.hashEmail("canary+1@example.invalid")).toBe(
      "cb8986f93bfc90d384024f2b69d784d770cd4c294bbed9db00dfbc5d23c96443",
    );
    expect(h.hashPhone("+44 7700 900123")).toBe("6c4c3c6544defe0ab05a1f071161e3e89cd92cc002eaac9f8f6080fcbec5a12f");
  });

  test("T-HASH-03 không phải SHA-256 trần (lệch spec có chủ đích, D-05)", () => {
    const h = createPiiHasher(TEST_KEY);
    expect(h.hashEmail("canary+1@example.invalid")).not.toBe(
      "cedcf455d81cdb0f3a6105b868078de30780f3f2a77cadbcd6470be0f1b50ccf",
    );
  });

  test("T-HASH-03 khoá ngắn hơn 32 ký tự bị từ chối", () => {
    expect(() => createPiiHasher("short-key")).toThrow();
  });
});
