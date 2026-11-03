// T-PTN-01 tới T-PTN-04: đối tác và reseller cho Mi1-ptn-01 (D-31). Dữ liệu tổng hợp; tên đối tác, khách là canary.
import { describe, expect, test } from "bun:test";
import { importPartners } from "../../src/crm/partner-import.ts";
import { buildPartnerBoard } from "../../src/db/partners.ts";
import { partnerPeriodStats } from "../../src/metrics/partner.ts";
import { client, freshDb, opp } from "../helpers/db.ts";
import { insertEtlRun, insertSnapshotSucceeded } from "../../src/db/crm-snapshot.ts";
import { AMY, BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-02T02:00:00Z");
const NOV = { start: "2026-11-01", end: "2026-11-30" };
const PARTNERS = "Partner ID,Partner Name,Partner Type\nP1,CANARY_NAME_7f3a,Reseller\nP2,CANARY_NAME_b21c,Referrer\n";
const REFS = [
  "Opportunity ID,Partner ID,Account ID,Account Name,Stage,Close Date,Net Profit",
  "O1,P1,C1,CANARY_NAME_c0de,Closed Won,05/11/2026,300",
  "O2,P1,C2,x,Closed Won,10/11/2026,",
  "O3,P1,C1,x,Quotation,20/11/2026,",
  "O4,P2,C3,x,Closed Won,12/11/2026,\"1,250.50\"",
  "O5,P2,C4,x,Closed Won,15/10/2026,999",
].join("\n");

function load() {
  const db = freshDb();
  insertEtlRun(db, "run1", "crm_csv", "2026-11-02T00:00:00Z");
  insertSnapshotSucceeded(db, "run1", { opportunities: [opp("O1")], clients: [client("C1", { is_reseller_end_client: 1 }), client("C2", { is_reseller_end_client: 0 })], leads: [], clientServices: [] }, "2026-11-02T00:00:00Z");
  importPartners(db, { Partner: PARTNERS, Referral: REFS }, { columns: {}, now: NOW, actor: "amy" });
  return db;
}

describe("T-PTN đối tác", () => {
  test("T-PTN-01 hàm theo kỳ: lọc theo Close Date, chỉ cộng lợi nhuận deal chốt thắng, đếm deal thiếu lợi nhuận", () => {
    const s = partnerPeriodStats([
      { stage: "Closed Won", close_date: "2026-11-05", profit_usd: 300 },
      { stage: "Closed Won", close_date: "2026-11-10", profit_usd: null },
      { stage: "Quotation", close_date: "2026-11-20", profit_usd: 50 },
      { stage: "Closed Won", close_date: "2026-10-31", profit_usd: 999 },
    ], NOV, ["Closed Won"]);
    expect(s).toEqual({ referred: 3, won: 2, profitUsd: 300, wonMissingProfit: 1 });
  });

  test("T-PTN-02 bảng: xếp theo lợi nhuận; deal cần xét hoa hồng; khách reseller thiếu cờ", () => {
    const b = buildPartnerBoard(load(), NOV);
    expect(b.stats).toEqual([
      { partner_id: "P2", partner_type: "referrer", referred: 1, won: 1, profitUsd: 1250.5, wonMissingProfit: 0 },
      { partner_id: "P1", partner_type: "reseller", referred: 3, won: 2, profitUsd: 300, wonMissingProfit: 1 },
    ]);
    expect(b.commissionReview.map((r) => r.deal_id)).toEqual(["O1", "O2", "O4"]);
    expect(b.resellerFlagMissing).toEqual([{ client_id: "C2", partner_id: "P1" }]);
  });

  test("T-PTN-03 tên đối tác và tên khách không vào DB; bảng chỉ thêm", () => {
    const db = load();
    expect(new TextDecoder().decode(db.serialize())).not.toContain("CANARY_NAME");
    expect(() => db.run("DELETE FROM partner_referrals")).toThrow("append_only:partner_referrals");
  });

  test("T-PTN-04 trang /partners: Amy nạp được có CSRF; Mark chỉ xem; chọn tháng; Hàng chờ có link", async () => {
    const db = freshDb();
    const { app } = makeApp(db);
    const s = session(AMY);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("referral", new File([REFS], "r.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/partners`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Đã nạp 0 đối tác, 5 deal giới thiệu");
    const oct = await (await get(app, "/partners?month=2026-10", session(MARK).cookie)).text();
    expect(oct).toContain("Đối tác 01/10 tới 31/10");
    expect(oct).toContain("O5");
    expect(oct).not.toContain('action="/partners"');
    expect((await post(app, "/partners", { csrf: session(MARK).csrf }, session(MARK).cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/partners"');
  });
});
