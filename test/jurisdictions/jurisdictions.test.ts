// T-JUR-01 tới T-JUR-04: tiến độ 45 tài phán và bộ SKD cho Mi1-mkt-05 (D-32). Dữ liệu tổng hợp; số tiền và ghi chú là canary.
import { describe, expect, test } from "bun:test";
import { importJurisdictions } from "../../src/crm/jurisdiction-import.ts";
import { buildJurisdictionBoard } from "../../src/db/jurisdictions.ts";
import { jurisdictionReadiness } from "../../src/metrics/jurisdiction-ready.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-03T02:00:00Z");
const P = { total: 45, skdFiles: 3, lockedPriceStatuses: ["Approved"], doneSkdStatuses: ["Done"] };
const PRICES = [
  "Jurisdiction Code,Price Status,Price Version,Price USD,Note",
  "hk,Approved,v2,CANARY_PRICE_9911,CANARY_NOTE_a1",
  "SG,Draft,v1,1200,x",
  "BVI,approved,v3,900,x",
].join("\n");
const SKD = [
  "Jurisdiction Code,File Type,Status,Owner",
  "HK,eKYC guide,Done,CANARY_NOTE_b2",
  "HK,Checklist,Done,x",
  "HK,Checklist,Done,x",
  "HK,FAQ,Done,x",
  "SG,eKYC guide,Done,x",
  "SG,FAQ,Draft,x",
  "BVI,eKYC guide,Done,x",
  "BVI,FAQ,Done,x",
  "KY,eKYC guide,Done,x",
].join("\n");

function load() {
  const db = freshDb();
  importJurisdictions(db, { Price: PRICES, Skd: SKD }, { columns: {}, now: NOW, actor: "mark" });
  return db;
}

async function upload(app: ReturnType<typeof makeApp>["app"], who: typeof AMY, files: Record<string, string>) {
  const s = session(who);
  const fd = new FormData();
  fd.append("csrf", s.csrf);
  for (const [k, v] of Object.entries(files)) fd.append(k, new File([v], `${k}.csv`, { type: "text/csv" }));
  return app.fetch(new Request(`${BASE}/jurisdictions`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
}

describe("T-JUR tài phán và SKD", () => {
  test("T-JUR-01 hàm sẵn sàng: cần chốt giá và đủ số loại file SKD đã xong", () => {
    expect(jurisdictionReadiness({ priceStatus: "Approved", skdDoneTypes: 3 }, P)).toEqual({ priceLocked: true, skdMissing: 0, ready: true });
    expect(jurisdictionReadiness({ priceStatus: " approved ", skdDoneTypes: 1 }, P)).toEqual({ priceLocked: true, skdMissing: 2, ready: false });
    expect(jurisdictionReadiness({ priceStatus: "Draft", skdDoneTypes: 5 }, P)).toEqual({ priceLocked: false, skdMissing: 0, ready: false });
    expect(jurisdictionReadiness({ priceStatus: null, skdDoneTypes: 0 }, P)).toEqual({ priceLocked: false, skdMissing: 3, ready: false });
  });

  test("T-JUR-02 bảng: đếm loại file khác nhau, gộp mã viết thường, tài phán chỉ có SKD, số còn thiếu so với 45", () => {
    const b = buildJurisdictionBoard(load(), P);
    expect(b.summary).toEqual({ total: 45, listed: 4, priceLocked: 2, ready: 1, notListed: 41 });
    expect(b.rows.map((r) => [r.code, r.priceStatus, r.skdDoneTypes, r.ready])).toEqual([
      ["BVI", "approved", 2, false],
      ["KY", null, 1, false],
      ["SG", "Draft", 1, false],
      ["HK", "Approved", 3, true],
    ]);
    expect(b.rows.find((r) => r.code === "BVI")?.skdMissing).toBe(1);
  });

  test("T-JUR-03 số tiền và ghi chú không vào DB; bảng chỉ thêm; lượt nạp mới thay lượt cũ theo từng file", () => {
    const db = load();
    expect(new TextDecoder().decode(db.serialize())).not.toContain("CANARY_");
    expect(() => db.run("DELETE FROM jurisdiction_prices")).toThrow("append_only:jurisdiction_prices");
    importJurisdictions(db, { Price: "Jurisdiction Code,Price Status,Price Version\nSG,Approved,v2\n" }, { columns: {}, now: new Date("2026-11-04T02:00:00Z"), actor: "mark" });
    const b = buildJurisdictionBoard(db, P);
    expect(b.rows.find((r) => r.code === "SG")?.priceStatus).toBe("Approved");
    expect(b.rows.find((r) => r.code === "HK")?.priceStatus).toBeNull(); // file giá mới không có HK
    expect(b.rows.find((r) => r.code === "HK")?.skdDoneTypes).toBe(3); // SKD giữ lượt cũ
    expect(importJurisdictions(db, {}, { columns: {}, now: NOW, actor: "mark" }).errorCode).toBe("JURISDICTION_FILE_REQUIRED");
    expect(importJurisdictions(db, { Skd: "Jurisdiction Code,Status\nHK,Done\n" }, { columns: {}, now: NOW, actor: "mark" }).errorCode).toBe("CSV_MISSING_COLUMN");
  });

  test("T-JUR-04 trang /jurisdictions: Mark và Amy nạp được có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const res = await upload(app, MARK, { price: PRICES, skd: SKD });
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 3 tài phán trong bảng giá, 8 dòng SKD");
    expect(page).toContain("0/45 tài phán sẵn sàng"); // trang dùng ngưỡng thật 10 file
    expect(page).toContain("Đã chốt giá: 2/45");
    expect(page).toContain("chưa chốt giá, thiếu 9 file SKD");
    expect((await upload(app, AMY, { skd: SKD })).status).toBe(200);
    expect((await upload(app, AMY, {})).status).toBe(422);
    const bad = await app.fetch(new Request(`${BASE}/jurisdictions`, { method: "POST", headers: { cookie: session(AMY).cookie, origin: BASE }, body: new URLSearchParams({ csrf: "sai" }) }));
    expect(bad.status).toBe(403);
    expect((await get(app, "/jurisdictions")).status).toBe(302);
    expect(await (await get(app, "/queue", session(AMY).cookie)).text()).toContain('href="/jurisdictions"');
  });
});
