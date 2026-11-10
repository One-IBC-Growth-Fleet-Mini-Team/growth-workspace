// T-HARD-01 tới T-HARD-03: file CSV xuất từ Excel (D-78). Mọi file mẫu biến thành kiểu Excel hay xuất ra
// (BOM, dấu ;, CRLF, dòng trống, cột thừa) vẫn nạp được đúng số dòng; ngày d/m/yy đọc được; ô sai thì bỏ dòng, báo tên cột và số dòng.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { importAdReport } from "../../src/crm/ad-report-import.ts";
import { importBankFiles } from "../../src/crm/bank-import.ts";
import { importBilling } from "../../src/crm/billing-import.ts";
import { importCampaignCsv } from "../../src/crm/campaign-import.ts";
import { importCompetitorPrices } from "../../src/crm/competitor-import.ts";
import { importCrmCsv, importMessage, loadColumnMap } from "../../src/crm/csv-import.ts";
import { parseCsv } from "../../src/crm/csv.ts";
import { importEvents } from "../../src/crm/event-import.ts";
import { importHookCsv } from "../../src/crm/hook-import.ts";
import { importPriceSheet } from "../../src/crm/jurisdiction-import.ts";
import { importMarketCsv } from "../../src/crm/market-import.ts";
import { importPartners } from "../../src/crm/partner-import.ts";
import { importSandboxLog } from "../../src/crm/sandbox-import.ts";
import { importWorkOrders } from "../../src/crm/wo-import.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { freshDb } from "../helpers/db.ts";

const DIR = new URL("../../deploy/samples/", import.meta.url).pathname;
const NOW = new Date("2026-11-09T02:00:00Z");
const by = { now: NOW, actor: "amy" };
const MAP = loadColumnMap(new URL("../../deploy/crm-columns.example.json", import.meta.url).pathname);
const hasher = createPiiHasher("test-only-key-0123456789abcdef0123");

// Kiểu Excel: BOM, dấu ; (giữ ngoặc kép), CRLF, dòng trống giữa và cuối, thêm một cột thừa cuối mỗi dòng.
function excel(name: string): string {
  const csv = parseCsv(readFileSync(DIR + name, "utf8"));
  const q = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const lines = [csv.header, ...csv.rows].map((r, i) => [...r, i === 0 ? "Ghi chú thêm" : "x"].map(q).join(";"));
  return "﻿" + lines.slice(0, 2).join("\r\n") + "\r\n;;\r\n" + lines.slice(2).join("\r\n") + "\r\n\r\n";
}

describe("T-HARD file kiểu Excel", () => {
  test("T-HARD-01 file của Amy (CRM, WO, đơn hàng, đối tác) kiểu Excel vẫn nạp đủ 3 dòng", () => {
    const db = freshDb();
    const crm = importCrmCsv(db, { Opportunity: excel("opportunity.csv"), Client: excel("client.csv"), Lead: excel("lead.csv"), OrderItem: excel("orderitem.csv") }, { hasher, columns: MAP, now: NOW });
    expect(crm).toMatchObject({ status: "succeeded", rowCounts: { opportunity: 3, client: 3, lead: 3, client_service: 3 } });
    expect(importWorkOrders(db, { WorkOrder: excel("workorder.csv") }, { columns: MAP, ...by })).toMatchObject({ status: "succeeded", workOrders: 3 });
    expect(importBilling(db, { SalesOrder: excel("salesorder.csv"), Invoice: excel("invoice.csv") }, { columns: {}, ...by }).status).toBe("succeeded");
    expect(importPartners(db, { Partner: excel("partner.csv"), Referral: excel("referral.csv") }, { columns: {}, ...by }).status).toBe("succeeded");
  });

  test("T-HARD-02 file của MKT (Meta, Google, sự kiện GA4, giá đối thủ, sheet FINAL, tab Bug sandbox8, Hook, chiến dịch, thị trường, ngân hàng) kiểu Excel vẫn nạp", () => {
    const db = freshDb();
    expect(importAdReport(db, excel("meta-ads.csv"), { platform: "meta", weekStart: "2026-11-02", ...by }).status).toBe("succeeded");
    expect(importAdReport(db, excel("google-ads.csv"), { platform: "google", weekStart: "2026-11-02", ...by }).status).toBe("succeeded");
    expect(importEvents(db, excel("events.csv"), by)).toMatchObject({ status: "succeeded", events: 3 });
    expect(importCompetitorPrices(db, excel("competitor-prices.csv"), by).status).toBe("succeeded");
    expect(importPriceSheet(db, excel("price-final.csv"), by).status).toBe("succeeded");
    expect(importSandboxLog(db, { bugs: excel("sandbox-bugs.csv"), cases: excel("sandbox-cases.csv") }, by).status).toBe("succeeded");
    expect(importHookCsv(db, excel("hooks.csv"), by).status).toBe("succeeded");
    expect(importCampaignCsv(db, excel("campaigns.csv"), by).status).toBe("succeeded");
    expect(importMarketCsv(db, "regulation", excel("market-regulation.csv"), by).status).toBe("succeeded");
    expect(importBankFiles(db, { matrix: excel("bank-matrix.csv"), core: excel("bank-core.csv") }, by).status).toBe("succeeded");
  });

  test("T-HARD-03 ngày d/m/yy đọc được; ô sai thì bỏ dòng đó, nạp phần còn lại, báo tên cột và số dòng", () => {
    const db = freshDb();
    const opp = readFileSync(DIR + "opportunity.csv", "utf8").replace("20/11/2026", "5/1/27").replace("25/11/2026", "không phải ngày");
    const r = importCrmCsv(db, { Opportunity: opp }, { hasher, columns: MAP, now: NOW });
    expect(r).toMatchObject({ status: "succeeded", rowCounts: { opportunity: 2 } });
    expect(r.skipped).toEqual([{ resource: "Opportunity", row: 3, column: "Close Date" }]);
    expect(importMessage(r)).toContain("Bỏ qua 1 dòng: Opportunity dòng 3 cột Close Date.");
    expect((db.query("SELECT close_date FROM crm_opportunities ORDER BY opportunity_id LIMIT 1").get() as { close_date: string }).close_date).toBe("2027-01-05");
  });
});
