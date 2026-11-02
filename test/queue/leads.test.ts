// T-DUP-01, T-DUP-02: trang Lead trùng (spec mục 11, D-29). Chỉ xem; dữ liệu tổng hợp, email và SĐT canary.
import { describe, expect, test } from "bun:test";
import { importCrmCsv } from "../../src/crm/csv-import.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, MARK, session } from "../helpers/queue.ts";

const hasher = createPiiHasher("test-only-key-not-a-secret-0123456789abcdef", { defaultCountryCode: "44" });
const OPP = "Id,StageName\nO1,Quotation\n";
const LEADS = [
  "Id,OwnerId,Email,Phone",
  "L1,RM_A,canary+1@example.invalid,",
  "L2,RM_B,Canary+1@Example.invalid,",
  "L3,RM_A,,+44 7700 900123",
  "L4,RM_A,,07700 900123",
  "L5,RM_B,canary+2@example.invalid,",
].join("\n");

describe("T-DUP Lead trùng", () => {
  test("T-DUP-01 nhóm trùng khác RM lên trước; không lộ email, SĐT hay mã băm; Amy và Mark đều xem được", async () => {
    const db = freshDb();
    importCrmCsv(db, { Opportunity: OPP, Lead: LEADS }, { hasher, columns: {}, now: new Date("2026-11-02T01:00:00Z") });
    const { app } = makeApp(db);
    for (const u of [AMY, MARK]) {
      const page = await (await get(app, "/leads", session(u).cookie)).text();
      expect(page).toContain("Trùng giữa các RM khác nhau (1)");
      expect(page).toContain("L1, L2");
      expect(page).toContain("Trùng trong cùng một RM (1)");
      expect(page).toContain("L3, L4");
      expect(page).not.toContain("L5");
      expect(page.toLowerCase()).not.toContain("canary");
      expect(page).not.toContain("900123");
      expect(page).not.toContain(hasher.hashEmail("canary+1@example.invalid")!);
    }
  });

  test("T-DUP-02 chưa nạp CRM thì báo chưa có dữ liệu; chưa đăng nhập thì về trang đăng nhập", async () => {
    const { app } = makeApp(freshDb());
    expect(await (await get(app, "/leads", session(AMY).cookie)).text()).toContain("chưa nạp file Lead");
    expect((await get(app, "/leads")).status).toBe(302);
  });
});
