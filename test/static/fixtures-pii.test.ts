// T-PII-07 (repo): test/fixtures/ và evals/ không chứa email ngoài đuôi example.invalid,
// không có chuỗi giống SĐT ngoài dải thử nghiệm.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const ROOT = new URL("../../", import.meta.url).pathname;

// Dải SĐT dành cho thử nghiệm, so trên chuỗi chữ số đã bỏ ký tự phân cách:
// Ofcom UK 07700 900000..900999; Bắc Mỹ NXX-555-0100..0199; ACMA Úc 0491 570 xxx.
const TEST_PHONE_RANGES = [/7700900\d{3}$/, /55501\d{2}$/, /491570\d{3}$/];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE_RE = /(?<![\w])(?:\(\+?\d{1,4}\)|\+)?[ \t.-]*\d[\d \t().-]{6,}\d(?![\w])/g;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

async function scanFiles(): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  for (const dir of ["test/fixtures", "evals"]) {
    for await (const path of new Glob(`${dir}/**/*`).scan({ cwd: ROOT, onlyFiles: true })) {
      out.push({ path, text: await Bun.file(ROOT + path).text() });
    }
  }
  return out;
}

describe("T-PII-07 quét fixture và eval", () => {
  test("T-PII-07 có file để quét", async () => {
    expect((await scanFiles()).length).toBeGreaterThan(0);
  });

  test("T-PII-07 email chỉ có đuôi example.invalid", async () => {
    for (const f of await scanFiles()) {
      const bad = [...f.text.matchAll(EMAIL_RE)].map((m) => m[0]).filter((e) => !/@example\.invalid$/i.test(e));
      expect({ path: f.path, bad }).toEqual({ path: f.path, bad: [] });
    }
  });

  test("T-PII-07 chuỗi giống SĐT chỉ nằm trong dải thử nghiệm", async () => {
    for (const f of await scanFiles()) {
      const bad = [...f.text.matchAll(PHONE_RE)]
        .map((m) => m[0].trim())
        .filter((s) => !DATE_LIKE.test(s))
        .map((s) => s.replace(/\D/g, ""))
        .filter((d) => d.length >= 8 && d.length <= 15)
        .filter((d) => !TEST_PHONE_RANGES.some((re) => re.test(d)));
      expect({ path: f.path, bad }).toEqual({ path: f.path, bad: [] });
    }
  });
});

// T-PII-08 (repo public, D-95): không email đuôi @oneibc.com và không tên RM thật trong fixture, eval, tài liệu, file mẫu,
// cấu hình, dữ liệu demo và test. Tên RM ghi bằng mã (RM 01...).
const PUBLIC_DIRS = ["test", "evals", "docs", "deploy", "config", "src/demo"];
const RM_NAMES = /\b(Adele|Mel|Freya|Dierick|Tony|Dominic|Brian|Briona)\b/;
async function scanPublic(): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  for (const dir of PUBLIC_DIRS) {
    for await (const path of new Glob(`${dir}/**/*.{md,ts,json,csv,txt,html,sh,example,yml}`).scan({ cwd: ROOT, onlyFiles: true })) {
      if (path === "test/static/fixtures-pii.test.ts") continue; // file này chứa chính các mẫu cần chặn
      out.push({ path, text: await Bun.file(ROOT + path).text() });
    }
  }
  return out;
}
describe("T-PII-08 repo public", () => {
  test("T-PII-08 không email @oneibc.com, không tên RM thật", async () => {
    const files = await scanPublic();
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      expect({ path: f.path, oneibc: /@oneibc\.com/i.test(f.text), rmName: RM_NAMES.exec(f.text)?.[0] ?? null }).toEqual({ path: f.path, oneibc: false, rmName: null });
    }
  });
});
