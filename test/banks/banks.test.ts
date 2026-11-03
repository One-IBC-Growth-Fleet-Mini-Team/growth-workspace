// T-BANK-01 tới T-BANK-04: gợi ý ngân hàng theo ma trận của Bank Team (D-34). Dữ liệu tổng hợp,
// cùng dạng CSV xuất từ sheet "Product Matrix - Bank Name X Support" và "Bank ( Core Information for Clients)".
import { describe, expect, test } from "bun:test";
import { importBankFiles } from "../../src/crm/bank-import.ts";
import { buildBankAdvice } from "../../src/db/banks.ts";
import { suggestBanks } from "../../src/metrics/bank-suggest.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-03T02:00:00Z");
const MATRIX = [
  "Ngày cập nhật: 19 May 2026",
  ",Category,BANK NAME,Where you would like to open the business account?,,,,Bank name",
  ",,,Những Nước One IBC hỗ trợ Incorp,,,,,Others",
  ",,,Hong Kong,BVI,UK,USA,,Luxembourg",
  ",Digital/EMIs,EMI Slow,YES,YES,YES,YES,EMI Slow,YES",
  ",,Airwallex**,YES,YES,YES,NO,Airwallex**,YES",
  ",,EMI Fast,YES,NO,YES,YES,EMI Fast,NO",
  ",Traditional,Bank Local HK,YES,NO,NO,NO,Bank Local HK,NO",
  ",,Bank Island,NO,YES,NO,NO,Bank Island,NO",
].join("\n");
const CORE = [
  "Ngày cập nhật: 19 May 2026",
  "Category,Bank Name,Complexity Level,Processing Time - Internal,Processing Time,Initial Deposit,Currencies Support,Meeting Requirement (Online/Physical)",
  "Digital/EMIs,EMI Slow,HIGH,1-2 month,1-2 week,Not required,USD,Online",
  ",Airwallex**,MEDIUM,1-2 week,1-2 week,Not required,USD,Online",
  ",EMI Fast,LOW,within 7 days,2-5 days,Not required,USD,Online",
  "Traditional,Bank Local HK,HIGH,4-6 month,4-6 week,HKD 10000,HKD,Personal Visit",
  ",Bank Island,HIGH,1-2 month,1-2 week,USD 1000,USD,Remote Application",
].join("\n");
const P = { priorityEmi: ["Airwallex", "Payoneer", "Aspire"], minAccounts: 2 };

function load() {
  const db = freshDb();
  importBankFiles(db, { matrix: MATRIX, core: CORE }, { now: NOW, actor: "amy" });
  return db;
}

describe("T-BANK gợi ý ngân hàng", () => {
  test("T-BANK-01 hàm gợi ý: lọc theo nơi thành lập, EMI ưu tiên Airwallex rồi độ khó, công ty mới để ngân hàng truyền thống sau", () => {
    const banks = [
      { bank: "EMI Slow", category: "emi" as const, complexity: "HIGH", supported: true },
      { bank: "Airwallex", category: "emi" as const, complexity: "MEDIUM", supported: true },
      { bank: "EMI Fast", category: "emi" as const, complexity: "LOW", supported: true },
      { bank: "Bank Island", category: "traditional" as const, complexity: "HIGH", supported: true },
      { bank: "Bank Local HK", category: "traditional" as const, complexity: "HIGH", supported: false },
    ];
    const s = suggestBanks(banks, { newCompany: true }, P);
    expect(s.emi.map((b) => b.bank)).toEqual(["Airwallex", "EMI Fast", "EMI Slow"]);
    expect(s.traditional.map((b) => b.bank)).toEqual(["Bank Island"]);
    expect(s.notSupported).toEqual(["Bank Local HK"]);
    expect(s.plan).toEqual(["Mở ngay 2 tài khoản EMI: Airwallex, EMI Fast", "Sau 6 tới 12 tháng hoạt động: nộp Bank Island"]);
    expect(suggestBanks(banks, { newCompany: false }, P).plan).toEqual(["Mở ngay 2 tài khoản EMI: Airwallex, EMI Fast", "Nộp song song ngân hàng truyền thống: Bank Island"]);
    expect(suggestBanks(banks.map((b) => ({ ...b, supported: false })), { newCompany: true }, P).plan).toEqual(["Không có tổ chức nào trong ma trận nhận công ty ở nơi này. Hỏi Bank Team."]);
  });

  test("T-BANK-02 nạp file: đọc cột tài phán kể cả nhóm Others, bỏ cột tên lặp, gộp tên có dấu *, nối độ khó từ Core Info", () => {
    const a = buildBankAdvice(load(), { jurisdiction: "British Virgin Islands", newCompany: true }, P);
    expect(a.jurisdictions).toEqual(["British Virgin Islands", "Hong Kong", "Luxembourg", "United Kingdom", "United States"]);
    expect(a.suggestion!.emi.map((b) => [b.bank, b.complexity])).toEqual([["Airwallex", "MEDIUM"], ["EMI Slow", "HIGH"]]);
    expect(a.suggestion!.traditional.map((b) => b.bank)).toEqual(["Bank Island"]);
    expect(a.details.get("Bank Island")).toMatchObject({ deposit: "USD 1000", meeting: "Remote Application" });
  });

  test("T-BANK-03 lỗi file: thiếu ma trận; không thấy dòng tiêu đề; bảng chỉ thêm", () => {
    const db = load();
    expect(importBankFiles(db, { core: CORE }, { now: NOW, actor: "amy" }).errorCode).toBe("BANK_MATRIX_REQUIRED");
    expect(importBankFiles(db, { matrix: "a,b\n1,2" }, { now: NOW, actor: "amy" }).errorCode).toBe("BANK_MATRIX_HEADER_NOT_FOUND");
    expect(() => db.run("DELETE FROM bank_support")).toThrow("append_only:bank_support");
  });

  test("T-BANK-04 trang /banks: Amy nạp được có CSRF, Mark chỉ xem; chọn tài phán; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const s = session(AMY);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("matrix", new File([MATRIX], "m.csv", { type: "text/csv" }));
    fd.append("core", new File([CORE], "c.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/banks`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Đã nạp 5 tổ chức, 5 tài phán.");
    const page = await (await get(app, "/banks?j=Hong%20Kong&new=1", session(MARK).cookie)).text();
    expect(page).toContain("Mở ngay 2 tài khoản EMI: Airwallex, EMI Fast");
    expect(page).not.toContain('method="post" action="/banks"');
    const mark = session(MARK);
    const fd2 = new FormData();
    fd2.append("csrf", mark.csrf);
    expect((await app.fetch(new Request(`${BASE}/banks`, { method: "POST", headers: { cookie: mark.cookie, origin: BASE }, body: fd2 }))).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/banks"');
  });
});
