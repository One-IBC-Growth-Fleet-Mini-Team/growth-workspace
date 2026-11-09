// T-COMM-01, T-COMM-02: đề xuất hoa hồng (chưa chi) và tên bundle (D-71). Đổi config thì kết quả đổi theo, không sửa code.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importPartners } from "../../src/crm/partner-import.ts";
import { buildPartnerBoard } from "../../src/db/partners.ts";
import { bundleName } from "../../src/metrics/bundle-name.ts";
import { proposeCommission } from "../../src/metrics/commission.ts";
import { getProvisional, setProvisionalPaths } from "../../src/provisional.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const REPO = new URL("../../config/provisional.json", import.meta.url).pathname;
function isolate(edit?: (j: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "prov-"));
  const j = JSON.parse(readFileSync(REPO, "utf8"));
  edit?.(j);
  writeFileSync(join(dir, "p.json"), JSON.stringify(j));
  setProvisionalPaths({ file: join(dir, "p.json"), overrides: join(dir, "o.jsonl") });
}
afterEach(() => isolate());

describe("T-COMM hoa hồng và tên bundle", () => {
  test("T-COMM-01 hàm: tỉ lệ theo loại đối tác; loại chưa có tỉ lệ, deal chưa có lợi nhuận thì không tính; tên bundle theo mẫu", () => {
    const rates = getProvisional("commission").value.rates;
    expect(proposeCommission([
      { deal_id: "D1", partner_id: "P1", partner_type: "Premier", profit_usd: 1000 },
      { deal_id: "D2", partner_id: "P2", partner_type: "referrer", profit_usd: 333.33 },
      { deal_id: "D3", partner_id: "P3", partner_type: "reseller", profit_usd: 500 },
      { deal_id: "D4", partner_id: "P4", partner_type: "partner", profit_usd: null },
    ], rates).map((l) => [l.deal_id, l.status, l.amount_usd])).toEqual([["D1", "proposed", 200], ["D2", "proposed", 33.33], ["D3", "no_rate", null], ["D4", "no_profit", null]]);
    expect(bundleName(getProvisional("bundle_name").value.pattern, { channel: "Meta Stories", jurisdiction: "Hong Kong", hookId: "H-12", date: "2026-11-09", n: 2 })).toBe("oneibc_meta-stories_hong-kong_h-12_20261109_v2");
  });

  test("T-COMM-02 từ file đối tác; đổi tỉ lệ và mẫu tên trong config thì kết quả đổi", () => {
    const db = freshDb();
    importPartners(db, { Partner: "Partner ID,Partner Type\nP1,partner\n", Referral: "Opportunity ID,Partner ID,Account ID,Stage,Close Date,Net Profit\nD1,P1,C1,Closed Won,03/11/2026,2000\n" }, { columns: {}, now: NOW, actor: "amy" });
    const period = { start: "2026-11-01", end: "2026-11-30" };
    isolate();
    expect(buildPartnerBoard(db, period).commissionReview[0]).toMatchObject({ rate: 0.15, amount_usd: 300, status: "proposed" });
    isolate((j) => { j.commission.value.rates.partner = 0.12; j.bundle_name.value.pattern = "{channel}-{n}"; });
    expect(buildPartnerBoard(db, period).commissionReview[0]).toMatchObject({ rate: 0.12, amount_usd: 240 });
    expect(bundleName(getProvisional("bundle_name").value.pattern, { channel: "tiktok", jurisdiction: null, hookId: null, date: "2026-11-09", n: 1 })).toBe("tiktok-1");
  });
});
