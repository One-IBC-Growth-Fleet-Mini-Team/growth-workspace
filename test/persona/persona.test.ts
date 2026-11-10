// T-PERSONA-01 tới T-PERSONA-03: nạp Closed Won cho persona MKT (D-86). Không lưu tên khách, mã khách;
// chưa nạp dữ liệu thật thì trang hiện "Chờ dữ liệu thật", không dựng persona từ dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { closedWonMessage, importClosedWon, latestClosedWon } from "../../src/crm/closed-won-import.ts";
import { createDemo } from "../../src/demo/server.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, session } from "../helpers/queue.ts";

const by = { now: new Date("2026-11-02T01:00:00Z"), actor: "amy" };
const sample = (n: string) => readFileSync(new URL(`../../deploy/samples/${n}`, import.meta.url), "utf8");
const OPP = [
  "Opportunity ID,Opportunity Name,Account ID,Account Name,Stage,Close Date,Jurisdiction,Service Family,Amount,Email,Phone",
  "OPP-1,CANARY_DEAL_7f3a,ACC-1,CANARY_NAME_7f3a,Closed Won,15/09/2026,Hong Kong,IBC,\"1,500\",canary+1@example.invalid,+44 7700 900123",
  "OPP-2,x,ACC-2,CANARY_NAME_8b1c,Closed Lost,16/09/2026,Singapore,BANK,900,,",
  "OPP-3,x,ACC-2,CANARY_NAME_8b1c,Closed Won,31/31/2026,Singapore,BANK,900,,",
  "OPP-4,x,ACC-2,CANARY_NAME_8b1c,Closed Won,01/10/2026,Singapore,BANK,,,",
].join("\n");
const ACC = "Account ID,Account Name,Industry,Billing Country,Reseller End Client\nACC-1,CANARY_NAME_7f3a,Phần mềm,VN,No\nACC-2,CANARY_NAME_8b1c,Thương mại,SG,Yes\n";

describe("T-PERSONA nạp Closed Won", () => {
  test("T-PERSONA-01 chỉ đọc cột trong danh sách: không lưu tên, email, số điện thoại, mã Account hay Opportunity; bỏ dòng không Closed Won và dòng sai ngày", () => {
    const db = freshDb();
    const r = importClosedWon(db, { opportunity: OPP, account: ACC }, by);
    expect(r).toMatchObject({ status: "succeeded", deals: 2, notWon: 1 });
    expect(r.skipped).toEqual([{ resource: "Opportunity", row: 4, column: "Close Date" }]);
    expect(closedWonMessage(r)).toBe("Đã nạp 2 deal Closed Won. Bỏ 1 dòng không phải Closed Won. Bỏ qua 1 dòng: Opportunity dòng 4 cột Close Date.");
    const rows = db.query("SELECT close_date, jurisdiction, service_family, industry, country, reseller, amount_usd FROM closed_won_deals ORDER BY close_date").all();
    expect(rows).toEqual([
      { close_date: "2026-09-15", jurisdiction: "Hong Kong", service_family: "IBC", industry: "Phần mềm", country: "VN", reseller: 0, amount_usd: 1500 },
      { close_date: "2026-10-01", jurisdiction: "Singapore", service_family: "BANK", industry: "Thương mại", country: "SG", reseller: 1, amount_usd: null },
    ]);
    const dump = JSON.stringify([db.query("SELECT * FROM closed_won_deals").all(), db.query("SELECT * FROM closed_won_imports").all()]);
    for (const leak of ["CANARY", "canary", "7700", "OPP-1", "ACC-1"]) expect(dump).not.toContain(leak);
    expect(importClosedWon(db, { account: ACC }, by)).toMatchObject({ status: "failed", errorCode: "CLOSED_WON_OPPORTUNITY_REQUIRED" });
    expect(importClosedWon(db, { opportunity: "Account ID,Stage\nA,Closed Won" }, by)).toMatchObject({ status: "failed", errorCode: "CSV_MISSING_COLUMN" });
  });

  test("T-PERSONA-02 chưa nạp thì 'Chờ dữ liệu thật' cho mọi vai trò kể cả demo; MKT xem được, không có ô nạp; file mẫu nạp được", async () => {
    const { app } = makeApp(freshDb());
    for (const u of [AMY, { id: "mark", role: "viewer" } as const, { id: "mkt", role: "mkt" } as const]) {
      const res = await get(app, "/persona", session(u).cookie);
      expect(res.status).toBe(200);
      const page = await res.text();
      expect(page).toContain("Chờ dữ liệu thật.");
      expect(page.includes('action="/persona"')).toBe(u.role === "approver");
    }
    const demo = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
    expect(latestClosedWon(demo.db)).toBeNull();
    const db = freshDb();
    expect(importClosedWon(db, { opportunity: sample("closed-won-opportunity.csv"), account: sample("closed-won-account.csv") }, by)).toMatchObject({ status: "succeeded", deals: 2, notWon: 1, skipped: [] });
  });

  test("T-PERSONA-03 Amy nạp có CSRF thì trang báo đã nạp; Mark và MKT không nạp được", async () => {
    const db = freshDb();
    const { app } = makeApp(db);
    const send = (u: Parameters<typeof session>[0]) => {
      const s = session(u);
      const fd = new FormData();
      fd.append("csrf", s.csrf);
      fd.append("opportunity", new File([OPP], "o.csv", { type: "text/csv" }));
      fd.append("account", new File([ACC], "a.csv", { type: "text/csv" }));
      return app.fetch(new Request(`${BASE}/persona`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    };
    expect((await send({ id: "mark", role: "viewer" })).status).toBe(403);
    expect((await send({ id: "mkt", role: "mkt" })).status).toBe(403);
    const res = await send(AMY);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 2 deal Closed Won.");
    expect(page).not.toContain("Chờ dữ liệu thật.");
    expect(page).not.toContain("CANARY");
  });
});
