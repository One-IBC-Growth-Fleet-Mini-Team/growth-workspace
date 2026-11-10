// T-SAMPLE-01: mỗi file mẫu trong deploy/samples nạp được bằng đúng bộ nạp của nó, với bảng ghép bản cài dùng (D-72).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { importAdReport } from "../../src/crm/ad-report-import.ts";
import { importBankFiles } from "../../src/crm/bank-import.ts";
import { importBilling } from "../../src/crm/billing-import.ts";
import { importCampaignCsv } from "../../src/crm/campaign-import.ts";
import { importCompetitorPrices } from "../../src/crm/competitor-import.ts";
import { importCrmCsv, loadColumnMap } from "../../src/crm/csv-import.ts";
import { importEvents } from "../../src/crm/event-import.ts";
import { importHookCsv } from "../../src/crm/hook-import.ts";
import { importPriceSheet, importSkdList } from "../../src/crm/jurisdiction-import.ts";
import { importMarketCsv } from "../../src/crm/market-import.ts";
import { importPartners } from "../../src/crm/partner-import.ts";
import { importSandboxLog } from "../../src/crm/sandbox-import.ts";
import { importWorkOrders } from "../../src/crm/wo-import.ts";
import { checkAdBatch } from "../../src/ads/check.ts";
import { adRules } from "../../src/config.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { SAMPLE_FILES } from "../../src/queue/samples.ts";
import { freshDb } from "../helpers/db.ts";

const DIR = new URL("../../deploy/samples/", import.meta.url).pathname;
const f = (n: string) => readFileSync(DIR + n, "utf8");
const NOW = new Date("2026-11-09T02:00:00Z");
const by = { now: NOW, actor: "amy" };
const MAP = loadColumnMap(new URL("../../deploy/crm-columns.example.json", import.meta.url).pathname);

describe("T-SAMPLE file mẫu", () => {
  test("T-SAMPLE-01 mọi file mẫu nạp được, đúng 3 dòng; danh sách tải về khớp thư mục", () => {
    const db = freshDb();
    const crm = importCrmCsv(db, { Opportunity: f("opportunity.csv"), Client: f("client.csv"), Lead: f("lead.csv"), OrderItem: f("orderitem.csv") }, { hasher: createPiiHasher("test-only-key-0123456789abcdef0123"), columns: MAP, now: NOW });
    expect(crm).toMatchObject({ status: "succeeded", rowCounts: { opportunity: 3, client: 3, lead: 3, client_service: 3 } });
    expect(importWorkOrders(db, { WorkOrder: f("workorder.csv"), WorkOrderPic: f("wopic.csv") }, { columns: MAP, now: NOW, actor: "amy" }).status).toBe("succeeded");
    expect(importBilling(db, { SalesOrder: f("salesorder.csv"), PurchaseOrder: f("purchaseorder.csv"), Invoice: f("invoice.csv") }, { columns: {}, ...by }).status).toBe("succeeded");
    expect(importPartners(db, { Partner: f("partner.csv"), Referral: f("referral.csv") }, { columns: {}, ...by }).status).toBe("succeeded");
    expect(importPriceSheet(db, f("price-final.csv"), by)).toMatchObject({ status: "succeeded" });
    expect(importSkdList(db, f("skd-files.txt"), by).status).toBe("succeeded");
    expect(importSandboxLog(db, { bugs: f("sandbox-bugs.csv"), cases: f("sandbox-cases.csv") }, by).status).toBe("succeeded");
    expect(importBankFiles(db, { matrix: f("bank-matrix.csv"), core: f("bank-core.csv") }, by).status).toBe("succeeded");
    expect(importEvents(db, f("events.csv"), by)).toMatchObject({ status: "succeeded", events: 3 });
    expect(importCampaignCsv(db, f("campaigns.csv"), by).status).toBe("succeeded");
    expect(importAdReport(db, f("meta-ads.csv"), { platform: "meta", weekStart: "2026-11-02", ...by }).status).toBe("succeeded");
    expect(importAdReport(db, f("google-ads.csv"), { platform: "google", weekStart: "2026-11-02", ...by }).status).toBe("succeeded");
    expect(importCompetitorPrices(db, f("competitor-prices.csv"), by).status).toBe("succeeded");
    expect(importHookCsv(db, f("hooks.csv"), by).status).toBe("succeeded");
    expect(importMarketCsv(db, "regulation", f("market-regulation.csv"), by).status).toBe("succeeded");
    expect(importMarketCsv(db, "reviews", f("market-reviews.csv"), by).status).toBe("succeeded");
    expect(checkAdBatch(db, f("ads-check-batch.csv"), adRules()).rows).toHaveLength(3);
    expect(Object.keys(SAMPLE_FILES).sort()).toEqual(readdirSync(DIR).filter((n) => n !== "README.md").sort());
  });
});

describe("T-SAMPLE-02 tải file mẫu", () => {
  test("T-SAMPLE-02 đã đăng nhập thì tải được; tên lạ, đường dẫn lùi thư mục thì 404; trang /import có link", async () => {
    const { BASE, makeApp, session, AMY } = await import("../helpers/queue.ts");
    const { app } = makeApp(freshDb(), { onImport: async () => ({ ok: true, message: "" }) });
    const c = session(AMY).cookie;
    const r = await app.fetch(new Request(`${BASE}/samples/opportunity.csv`, { headers: { cookie: c } }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain("opportunity.csv");
    expect((await r.text()).split("\n")[0]).toContain("Opportunity ID");
    expect((await app.fetch(new Request(`${BASE}/samples/..%2F..%2Fpackage.json`, { headers: { cookie: c } }))).status).toBe(404);
    expect((await app.fetch(new Request(`${BASE}/samples/opportunity.csv`))).status).toBe(302);
    expect(await (await app.fetch(new Request(`${BASE}/import`, { headers: { cookie: c } }))).text()).toContain('href="/samples/lead.csv"');
  });
});
