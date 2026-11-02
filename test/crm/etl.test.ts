// T-CRM-05, T-MAP-01, T-MAP-02: ETL với CRM giả; allowlist cột; không lưu PII.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openReadWrite } from "../../src/db/open.ts";
import { migrate } from "../../src/db/migrate.ts";
import { runCrmEtl } from "../../src/crm/etl.ts";
import { CrmMappingError, mapClient, mapLead, mapOpportunity, mapOrderItem } from "../../src/crm/mappers.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { setLogSink } from "../../src/log.ts";
import { CANARIES, RAW_BY_RESOURCE, RAW_CLIENTS, RAW_LEADS, RAW_OPPORTUNITIES, RAW_ORDER_ITEMS } from "../fixtures/synthetic/crm.ts";
import { startFakeCrm, type FakeCrm } from "./fake-crm.ts";

const TEST_KEY = "test-only-key-not-a-secret-0123456789abcdef";
const hasher = createPiiHasher(TEST_KEY, { defaultCountryCode: "44" });
const NOW = () => new Date("2026-11-02T06:30:00.000Z");
const noSleep = async () => {};

let db: Database;
let crm: FakeCrm | undefined;
let logLines: string[];
let restoreSink: ReturnType<typeof setLogSink>;

beforeEach(() => {
  db = openReadWrite(":memory:");
  migrate(db);
  logLines = [];
  restoreSink = setLogSink((l) => logLines.push(l));
});

afterEach(() => {
  crm?.stop();
  crm = undefined;
  setLogSink(restoreSink);
});

function dumpDb(d: Database): string {
  const tables = d.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
  const rows = tables.map((t) => d.query(`SELECT * FROM "${t.name}"`).all());
  return JSON.stringify(rows);
}

function bytesContain(haystack: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= haystack.length; i++) {
    for (let j = 0; j < n.length; j++) if (haystack[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

function count(table: string): number {
  return (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe("T-CRM-05 ETL với CRM giả", () => {
  test("T-CRM-05 100% request là GET, chỉ tới resource cho phép, số request có giới hạn", async () => {
    crm = startFakeCrm({ pageSize: 1 });
    const result = await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    expect(result.status).toBe("succeeded");
    const allowedPaths = new Set(["/api/Opportunity", "/api/Client", "/api/Lead", "/api/OrderItem"]);
    expect(crm.requests.length).toBeGreaterThan(0);
    for (const r of crm.requests) {
      expect(r.method).toBe("GET");
      expect(r.hasBody).toBe(false);
      expect(allowedPaths.has(r.path)).toBe(true);
    }
    // Mỗi resource: số trang = số bản ghi (pageSize 1).
    const expected = Object.values(RAW_BY_RESOURCE).reduce((s, rows) => s + rows.length, 0);
    expect(crm.requests.length).toBe(expected);
    expect(result.rowCounts).toEqual({ opportunity: 2, client: 2, lead: 2, client_service: 2 });
  });

  test("T-CRM-05 vượt giới hạn trang thì run failed, không ghi snapshot", async () => {
    crm = startFakeCrm({ pageSize: 1 });
    const result = await runCrmEtl({
      db,
      crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep },
      hasher,
      now: NOW,
      maxPagesPerResource: 1,
    });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("CRM_PAGE_LIMIT");
    expect(crm.requests.length).toBeLessThanOrEqual(4);
    expect(count("crm_opportunities")).toBe(0);
  });

  test("T-CRM-05 phạm vi kéo theo D-09 nằm trong query", async () => {
    crm = startFakeCrm({ pageSize: 10 });
    await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    const q = (path: string) => new URLSearchParams(crm!.requests.find((r) => r.path === path)!.query);
    expect(q("/api/Opportunity").get("close_date_from")).toBe("2025-10-02");
    expect(q("/api/Opportunity").get("include_open")).toBe("true");
    expect(q("/api/Lead").get("created_from")).toBe("2026-05-06");
    expect(q("/api/Client").get("has_order")).toBe("true");
  });

  test("T-CRM-05 401 từ CRM: run failed với CRM_AUTH, snapshot cũ giữ nguyên", async () => {
    crm = startFakeCrm({ pageSize: 10 });
    const first = await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    crm.stop();
    crm = startFakeCrm({ respond: () => new Response("no", { status: 401 }) });
    const second = await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    expect(second.status).toBe("failed");
    expect(second.errorCode).toBe("CRM_AUTH");
    const rows = db.query("SELECT DISTINCT etl_run_id FROM crm_opportunities").all() as { etl_run_id: string }[];
    expect(rows).toEqual([{ etl_run_id: first.etlRunId }]);
    expect(logLines.some((l) => l.includes('"error_code":"CRM_AUTH"'))).toBe(true);
  });
});

describe("T-MAP-01 không PII sau map và ghi DB", () => {
  test("T-MAP-01 dump toàn bộ DB và log không chứa canary nào", async () => {
    crm = startFakeCrm({ pageSize: 1 });
    const result = await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    expect(result.status).toBe("succeeded");
    const dump = dumpDb(db).toLowerCase();
    const bytes = db.serialize();
    const logs = logLines.join("\n").toLowerCase();
    for (const c of CANARIES) {
      expect(dump).not.toContain(c.toLowerCase());
      expect(bytesContain(bytes, c)).toBe(false);
      expect(logs).not.toContain(c.toLowerCase());
    }
  });

  test("T-MAP-01 email và SĐT chỉ còn mã băm, khớp hàm băm", async () => {
    crm = startFakeCrm({ pageSize: 10 });
    await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    const lead = db.query("SELECT * FROM crm_leads WHERE lead_id = 'LEAD_001'").get() as Record<string, unknown>;
    expect(lead.email_hash).toBe(hasher.hashEmail("canary+1@example.invalid"));
    expect(lead.phone_hash).toBe(hasher.hashPhone("07700 900123"));
  });

  test("T-MAP-01 NextStep chỉ còn cờ 0/1", () => {
    expect(mapOpportunity(RAW_OPPORTUNITIES[0]).has_next_step).toBe(1);
    expect(mapOpportunity(RAW_OPPORTUNITIES[1]).has_next_step).toBe(0);
  });
});

describe("T-MAP-02 allowlist và thiếu trường", () => {
  test("T-MAP-02 trường lạ bị bỏ qua: đầu ra chỉ có cột allowlist", () => {
    expect(Object.keys(mapOpportunity(RAW_OPPORTUNITIES[0])).sort()).toEqual(
      [
        "opportunity_id",
        "client_id",
        "owner_rm_id",
        "stage",
        "close_date",
        "last_modified_at",
        "has_next_step",
        "jurisdiction_code",
        "service_family",
        "industry_code",
        "rejection_reason_code",
      ].sort(),
    );
    expect(Object.keys(mapClient(RAW_CLIENTS[0])).sort()).toEqual(
      ["client_id", "is_reseller_end_client", "industry_code", "first_won_at"].sort(),
    );
    expect(Object.keys(mapLead(RAW_LEADS[0], hasher)).sort()).toEqual(
      ["lead_id", "owner_rm_id", "created_at", "status", "email_hash", "phone_hash"].sort(),
    );
    expect(Object.keys(mapOrderItem(RAW_ORDER_ITEMS[0])).sort()).toEqual(["client_id", "product_family"]);
  });

  test("T-MAP-02 cờ reseller: true → 1, false → 0, trống → NULL", () => {
    expect(mapClient(RAW_CLIENTS[0]).is_reseller_end_client).toBeNull();
    expect(mapClient(RAW_CLIENTS[1]).is_reseller_end_client).toBe(1);
    expect(mapClient({ Id: "C", Is_Reseller_End_Client__c: false }).is_reseller_end_client).toBe(0);
  });

  test("T-MAP-02 thiếu trường bắt buộc hoặc sai kiểu ném lỗi kiểu, không lộ giá trị", () => {
    const cases: Array<() => unknown> = [
      () => mapOpportunity({ Id: "X" }),
      () => mapOpportunity({ Id: 5, StageName: "S1" }),
      () => mapOpportunity({ Id: "X", StageName: "S1", CloseDate: "CANARY_NAME_7f3a" }),
      () => mapClient({}),
      () => mapLead({ Email: "canary+1@example.invalid" }, hasher),
      () => mapOrderItem({ Order: { AccountId: "C" } }),
      () => mapOpportunity(null),
    ];
    for (const run of cases) {
      let err: unknown;
      try {
        run();
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(CrmMappingError);
      expect(String((err as Error).message)).not.toContain("CANARY");
      expect(String((err as Error).message)).not.toContain("canary");
    }
  });

  test("T-MAP-02 ETL gặp bản ghi thiếu trường: run failed, không có dòng snapshot dở", async () => {
    const data = { ...RAW_BY_RESOURCE, Lead: [...RAW_LEADS, { FirstName: "CANARY_NAME_7f3a" }] };
    crm = startFakeCrm({ pageSize: 1, data });
    const result = await runCrmEtl({ db, crm: { baseUrl: crm.baseUrl, token: "t", sleep: noSleep }, hasher, now: NOW });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("CRM_MAP_INVALID");
    for (const t of ["crm_opportunities", "crm_clients", "crm_leads", "crm_client_services"]) expect(count(t)).toBe(0);
    const status = db.query("SELECT status, error_code FROM etl_run_status").all();
    expect(status).toEqual([{ status: "failed", error_code: "CRM_MAP_INVALID" }]);
    expect(logLines.join("\n")).not.toContain("CANARY");
  });
});
