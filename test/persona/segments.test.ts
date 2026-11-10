// T-PERSONA-04 tới T-PERSONA-05: `persona_segments` (D-88). Bỏ khách cuối của reseller, gom (tài phán, dịch vụ),
// ngưỡng mẫu là giá trị tạm, kèm tín hiệu thị trường; trang hiện persona khi có dữ liệu thật đủ mẫu.
import { describe, expect, test } from "bun:test";
import { importClosedWon } from "../../src/crm/closed-won-import.ts";
import { personaSegments, type PersonaDeal } from "../../src/metrics/persona.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, session } from "../helpers/queue.ts";

const d = (j: string | null, s: string | null, extra: Partial<PersonaDeal> = {}): PersonaDeal => ({ jurisdiction: j, serviceFamily: s, industry: null, country: null, reseller: 0, amountUsd: null, ...extra });

describe("T-PERSONA persona_segments", () => {
  test("T-PERSONA-04 bỏ reseller; nhóm dưới ngưỡng chỉ đếm; tỉ lệ trên deal trực tiếp; giá trị giữa; top ngành, quốc gia", () => {
    const deals = [
      d("Hong Kong", "IBC", { amountUsd: 1000, industry: "Phần mềm", country: "VN" }),
      d("Hong Kong", "IBC", { amountUsd: 2000, industry: "Phần mềm", country: "VN" }),
      d("Hong Kong", "IBC", { amountUsd: 4000, industry: "Thương mại", country: "SG", reseller: null }),
      d("Hong Kong", "IBC", { industry: "Thương mại", reseller: 1 }),
      d("Singapore", "BANK", { amountUsd: 500 }),
      d(null, null),
    ];
    const r = personaSegments(deals, 3);
    expect([r.total, r.direct, r.reseller, r.resellerUnknown]).toEqual([6, 5, 1, 1]);
    expect(r.segments).toEqual([{ jurisdiction: "Hong Kong", serviceFamily: "IBC", deals: 3, share: 0.6, medianAmountUsd: 2000,
      industries: [{ name: "Phần mềm", count: 2 }, { name: "Thương mại", count: 1 }], countries: [{ name: "VN", count: 2 }, { name: "SG", count: 1 }] }]);
    expect(r.thin).toEqual({ segments: 2, deals: 2 });
    expect(personaSegments([d("A", "X", { amountUsd: 1 }), d("A", "X", { amountUsd: 2 })], 1).segments[0]!.medianAmountUsd).toBe(1.5);
    expect(personaSegments([], 5)).toEqual({ total: 0, direct: 0, reseller: 0, resellerUnknown: 0, segments: [], thin: { segments: 0, deals: 0 } });
  });

  test("T-PERSONA-05 trang /persona hiện persona đủ mẫu (Tạm), tín hiệu thị trường, không tên khách; MKT xem được", async () => {
    const db = freshDb();
    const rows = ["Opportunity ID,Opportunity Name,Account ID,Stage,Close Date,Jurisdiction,Service Family,Amount"];
    const acc = ["Account ID,Account Name,Industry,Billing Country,Reseller End Client"];
    for (let i = 1; i <= 6; i += 1) {
      rows.push(`O-${i},CANARY_DEAL_${i},A-${i},Closed Won,0${i}/10/2026,Hong Kong,IBC,${i}000`);
      acc.push(`A-${i},CANARY_NAME_${i},Phần mềm,VN,${i === 6 ? "Yes" : "No"}`);
    }
    rows.push("O-7,x,A-7,Closed Won,07/10/2026,Singapore,BANK,900");
    importClosedWon(db, { opportunity: rows.join("\n"), account: acc.join("\n") }, { now: new Date("2026-11-02T01:00:00Z"), actor: "amy" });
    db.run("INSERT INTO market_imports (id, actor, imported_at, kind, source) VALUES ('M1', 'mark', '2026-11-01T00:00:00Z', 'regulation', 'file')");
    db.run("INSERT INTO market_items (import_id, row_no, jurisdiction, title) VALUES ('M1', 2, 'Hong Kong', 'Báo cáo năm mới')");
    const { app } = makeApp(db);
    const page = await (await get(app, "/persona", session({ id: "mkt", role: "mkt" }).cookie)).text();
    expect(page).toContain("Từ 7 deal Closed Won");
    expect(page).toContain("6 deal khách trực tiếp, 1 deal khách cuối của reseller");
    expect(page).toContain("Hong Kong · IBC");
    expect(page).toContain("5 deal, 83% deal trực tiếp");
    expect(page).toContain("Giá trị giữa: 3000 USD");
    expect(page).toContain("quy định mới: Báo cáo năm mới");
    expect(page).toContain("có từ 5 deal (Tạm)");
    expect(page).toContain("1 nhóm khác (1 deal) chưa đủ mẫu");
    expect(page).not.toContain("CANARY");
    expect(page).not.toContain("Chờ dữ liệu thật.");
  });
});
