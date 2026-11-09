// T-JUR-01 tới T-JUR-05: tiến độ chốt giá 45 tài phán và bộ SKD eKYC cho Mi1-mkt-05 (D-32, D-33).
// Dữ liệu tổng hợp, cùng dạng file CSV xuất từ sheet "FINAL - Gói & Giá năm 2 & năm 3".
import { describe, expect, test } from "bun:test";
import { importPriceSheet, importSkdList } from "../../src/crm/jurisdiction-import.ts";
import { buildJurisdictionBoard } from "../../src/db/jurisdictions.ts";
import { priceRowStatus, skdKitStatus } from "../../src/metrics/jurisdiction-ready.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-03T02:00:00Z");
const P = { total: 45, absTolerance: 150, relTolerance: 0.05, skdFiles: 10, skdClips: 2 };
const SHEET = [
  ',,,,,,,,Chỉ áp dụng cho gói Starter',
  'Jurisdiction,Loại hình công ty,Starter,Grow,"Premium - \nGiá bán giảm giá 7%","Renewal\nper year ","2 year Renewal \nStarter","3 year Renewal\nStarter",Thời gian thực hiện',
  'Alpha,Private Limited,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"',
  'Alpha ,Branch,"$2,000","$3,000","$4,000","$5,000","$1,000","$6,000"', // năm 2 và năm 1 bị đảo
  'Beta,LLC,"$1,000","$2,000","$3,000",$800,"$1,799","$2,599"', // website: giảm nhẹ, làm tròn về 99
  'Gamma,Company,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote',
  'Delta,LLC,"$1,199","$1,499","$1,899",Get a Quote,Get a Quote,Get a Quote',
  'UK,LLP,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"',
  'United Kingdom,Ltd,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"',
  ',,,,,,,,',
  'Quy tắc',
  'GROW:,Giá bán gốc',
].join("\n");
const SKD = ["Guide.pdf", "Guide.html", "eKYC-A-16x9-clean.mp4", "eKYC-A-16x9-subtitled.mp4", "eKYC-A-9x16-clean.mp4", "eKYC-A-9x16-subtitled.mp4", "Thumbs.db", ""].join("\n");

function load() {
  const db = freshDb();
  importPriceSheet(db, SHEET, { now: NOW, actor: "mark" });
  importSkdList(db, SKD, { now: NOW, actor: "mark" });
  return db;
}

async function upload(app: ReturnType<typeof makeApp>["app"], who: typeof AMY, price?: string, skd?: string) {
  const s = session(who);
  const fd = new FormData();
  fd.append("csrf", s.csrf);
  if (price) fd.append("price", new File([price], "final.csv", { type: "text/csv" }));
  if (skd) fd.append("skd", skd);
  return app.fetch(new Request(`${BASE}/jurisdictions`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
}

describe("T-JUR tài phán và SKD", () => {
  test("T-JUR-01 trạng thái một dòng giá: thiếu giá, lệch công thức gia hạn, đã chốt (cho phép giảm nhẹ khi làm tròn)", () => {
    const row = (s: number, r: number, y2: number, y3: number) => ({ starter: s, grow: 1, premium: 1, renewal: r, renewal2y: y2, renewal3y: y3 });
    expect(priceRowStatus(row(1000, 500, 1500, 2000), P)).toEqual({ status: "locked" });
    expect(priceRowStatus(row(1000, 800, 1799, 2599), P).status).toBe("locked");
    expect(priceRowStatus(row(2000, 5000, 1000, 6000), P)).toEqual({ status: "formula_mismatch", expected2y: 7000, expected3y: 12000 });
    expect(priceRowStatus({ ...row(1, 1, 2, 3), renewal: null }, P)).toEqual({ status: "no_price" });
  });

  test("T-JUR-02 bộ SKD: đủ PDF, HTML và 2 clip x 2 khổ x 2 bản; báo đúng phần thiếu", () => {
    const s = skdKitStatus(SKD.split("\n"), P);
    expect(s.done).toBe(6);
    expect(s.missing).toEqual(["Thiếu 1 clip (mỗi clip 4 file: 16x9 và 9x16, bản sạch và bản phụ đề)"]);
    expect(skdKitStatus(["a-16x9-clean.mp4"], P).missing).toEqual([
      "Thiếu file PDF hướng dẫn", "Thiếu file HTML hướng dẫn", "Clip a: thiếu 16x9-subtitled, 9x16-clean, 9x16-subtitled", "Thiếu 1 clip (mỗi clip 4 file: 16x9 và 9x16, bản sạch và bản phụ đề)",
    ]);
  });

  test("T-JUR-03 bảng: gộp tên viết khác (UK), tài phán chốt khi mọi loại hình đã chốt, dòng lệch kèm số kỳ vọng", () => {
    const b = buildJurisdictionBoard(load(), P);
    expect(b.summary).toEqual({ total: 45, listed: 5, priceLocked: 2, notListed: 40 });
    expect(b.jurisdictions.map((j) => [j.name, j.locked, j.rows.length])).toEqual([
      ["Alpha", false, 2], ["Delta", false, 1], ["Gamma", false, 1], ["Beta", true, 1], ["United Kingdom", true, 2],
    ]);
    const branch = b.jurisdictions[0]!.rows.find((r) => r.companyType === "Branch")!;
    expect(branch).toMatchObject({ status: "formula_mismatch", expected2y: 7000, expected3y: 12000 });
    expect(b.skd.done).toBe(6);
  });

  test("T-JUR-04 lỗi file: thiếu dòng tiêu đề, file rỗng; bảng chỉ thêm; lượt nạp mới thay lượt cũ", () => {
    const db = load();
    expect(importPriceSheet(db, "a,b\n1,2\n", { now: NOW, actor: "mark" }).errorCode).toBe("PRICE_HEADER_NOT_FOUND");
    expect(importSkdList(db, " \n", { now: NOW, actor: "mark" }).errorCode).toBe("SKD_LIST_EMPTY");
    expect(() => db.run("DELETE FROM jurisdiction_prices")).toThrow("append_only:jurisdiction_prices");
    importPriceSheet(db, SHEET.replace('"$5,000","$1,000","$6,000"', '"$1,000","$3,000","$4,000"'), { now: new Date("2026-11-04T02:00:00Z"), actor: "mark" });
    expect(buildJurisdictionBoard(db, P).summary.priceLocked).toBe(3);
  });

  test("T-JUR-05 trang /jurisdictions: Mark và Amy nạp được có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const res = await upload(app, MARK, SHEET, SKD);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 7 dòng giá của 5 tài phán. Đã nạp danh sách 7 file SKD.");
    expect(page).toContain("2/45 tài phán đã chốt giá");
    expect(page).toContain("Bộ SKD eKYC: 6/10 file");
    expect(page).toContain("Starter + 1 năm gia hạn = 7,000");
    expect((await upload(app, AMY, undefined, SKD)).status).toBe(200);
    expect((await upload(app, AMY)).status).toBe(422);
    const bad = await app.fetch(new Request(`${BASE}/jurisdictions`, { method: "POST", headers: { cookie: session(AMY).cookie, origin: BASE }, body: new URLSearchParams({ csrf: "sai" }) }));
    expect(bad.status).toBe(403);
    expect((await get(app, "/jurisdictions")).status).toBe(302);
    expect(await (await get(app, "/queue", session(AMY).cookie)).text()).toContain('href="/jurisdictions"');
  });
});
