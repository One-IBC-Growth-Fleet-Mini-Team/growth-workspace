// Nạp file CSV xuất từ trang quản trị CRM thay cho API khi MobCEC chưa mở (D-24).
// CRM vẫn chỉ đọc: không có lời gọi mạng nào; chỉ cột trong allowlist được đọc; email, SĐT băm ngay.
import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { parseCsv } from "../../src/crm/csv.ts";
import { DEFAULT_COLUMN_MAP, importCrmCsv, type ColumnMap } from "../../src/crm/csv-import.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { latestSucceededSnapshot } from "../../src/db/crm-read.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, session } from "../helpers/queue.ts";

const hasher = createPiiHasher("test-only-key-not-a-secret-0123456789abcdef", { defaultCountryCode: "44" });
const NOW = new Date("2026-11-02T00:30:00.000Z");
let db: Database;
beforeEach(() => {
  db = freshDb();
});

// Bảng ghép theo tên cột kiểu file xuất (tổng hợp), có định dạng ngày dd/mm/yyyy.
const MAP: ColumnMap = {
  Opportunity: {
    Id: "Opportunity ID", AccountId: "Account ID", OwnerId: "Owner ID", StageName: "Stage",
    CloseDate: { column: "Close Date", format: "dd/mm/yyyy" },
    LastModifiedDate: { column: "Last Modified", format: "dd/mm/yyyy hh:mm" },
    NextStep: "Next Step", Industry__c: "Industry",
  },
  Client: { Id: "Account ID", Is_Reseller_End_Client__c: "Reseller", First_Won_Date__c: { column: "First Won", format: "dd/mm/yyyy" } },
  Lead: { Id: "Lead ID", OwnerId: "Owner ID", CreatedDate: { column: "Created", format: "dd/mm/yyyy hh:mm" }, Status: "Status", Email: "Email", Phone: "Phone" },
  OrderItem: { "Order.AccountId": "Account ID", "Product2.Family": "Product Family" },
};

const OPP_CSV = [
  "﻿Opportunity ID,Opportunity Name,Account ID,Owner ID,Stage,Close Date,Last Modified,Next Step,Industry,Description",
  'O1,"CANARY_NAME_7f3a, Samoa",C1,RM_A,Quotation,20/11/2026,30/10/2026 10:15,"Gọi lại CANARY_NAME_b21c",,"ghi chú ""nhiều dòng""',
  'dòng 2"',
  "O2,CANARY_NAME_c0de,,RM_B,Negotiation,25/11/2026,,,FOREX,",
].join("\r\n");
const CLIENT_CSV = "Account ID;Account Name;Reseller;First Won\nC1;CANARY_NAME_7f3a Holdings;Có;01/03/2025\nC2;x;;\n";
const LEAD_CSV = "Lead ID,Full Name,Owner ID,Created,Status,Email,Phone\nL1,CANARY_NAME_44aa,RM_A,01/10/2026 09:00,Open,Canary+1@Example.invalid,07700 900123\n";
const ORDER_CSV = "Order Item ID,Account ID,Product Family,Product Name\nI1,C1,IBC01,CANARY_NAME_44aa\nI2,C1,IBC01,x\n";

describe("Đọc CSV", () => {
  test("T-MAP-02 (csv) ngoặc kép, dấu phẩy và xuống dòng trong ô, BOM, CRLF, dấu chấm phẩy", () => {
    const opp = parseCsv(OPP_CSV);
    expect(opp.header[0]).toBe("Opportunity ID");
    expect(opp.rows.length).toBe(2);
    expect(opp.rows[0]![1]).toBe("CANARY_NAME_7f3a, Samoa");
    expect(opp.rows[0]![9]).toBe('ghi chú "nhiều dòng"\r\ndòng 2');
    expect(parseCsv(CLIENT_CSV).rows[0]).toEqual(["C1", "CANARY_NAME_7f3a Holdings", "Có", "01/03/2025"]);
    expect(() => parseCsv('a,b\n"chưa đóng')).toThrow(/CSV_INVALID/);
  });
});

describe("Nạp CSV vào snapshot", () => {
  test("T-MAP-01 (csv) đủ bốn file: snapshot thành công, ngày đổi đúng dạng, cờ reseller, dịch vụ khử trùng", () => {
    const r = importCrmCsv(db, { Opportunity: OPP_CSV, Client: CLIENT_CSV, Lead: LEAD_CSV, OrderItem: ORDER_CSV }, { hasher, columns: MAP, now: NOW });
    expect(r).toMatchObject({ status: "succeeded", rowCounts: { opportunity: 2, client: 2, lead: 1, client_service: 1 } });
    expect(latestSucceededSnapshot(db)?.etl_run_id).toBe(r.etlRunId!);
    const o1 = db.query("SELECT * FROM crm_opportunities WHERE opportunity_id = 'O1'").get() as Record<string, unknown>;
    expect(o1).toMatchObject({ close_date: "2026-11-20", last_modified_at: "2026-10-30T03:15:00.000Z", has_next_step: 1, client_id: "C1" });
    expect(db.query("SELECT client_id, is_reseller_end_client, first_won_at FROM crm_clients ORDER BY client_id").all()).toEqual([
      { client_id: "C1", is_reseller_end_client: 1, first_won_at: "2025-03-01" },
      { client_id: "C2", is_reseller_end_client: null, first_won_at: null },
    ]);
    const lead = db.query("SELECT * FROM crm_leads").get() as Record<string, unknown>;
    expect(lead.email_hash).toBe(hasher.hashEmail("canary+1@example.invalid"));
    expect(lead.phone_hash).toBe(hasher.hashPhone("+44 7700 900123"));
  });

  test("T-MAP-01 (csv) cột ngoài allowlist (tên khách, mô tả, tên sản phẩm) không bao giờ vào DB; email, SĐT chỉ còn mã băm", () => {
    importCrmCsv(db, { Opportunity: OPP_CSV, Client: CLIENT_CSV, Lead: LEAD_CSV, OrderItem: ORDER_CSV }, { hasher, columns: MAP, now: NOW });
    const bytes = new TextDecoder().decode(db.serialize()).toLowerCase();
    for (const c of ["canary_name_7f3a", "canary_name_b21c", "canary_name_c0de", "canary_name_44aa", "canary+1@example.invalid", "900123", "nhiều dòng"]) {
      expect(bytes).not.toContain(c);
    }
  });

  test("T-MAP-02 (csv) thiếu cột bắt buộc: failed, báo tên cột, không có dòng snapshot dở", () => {
    const r = importCrmCsv(db, { Opportunity: "Opportunity ID,Close Date\nO1,20/11/2026\n" }, { hasher, columns: MAP, now: NOW });
    expect(r).toMatchObject({ status: "failed", errorCode: "CSV_MISSING_COLUMN", detail: "Opportunity: Stage" });
    expect((db.query("SELECT COUNT(*) AS n FROM crm_opportunities").get() as { n: number }).n).toBe(0);
  });

  test("T-MAP-02 (csv) ngày sai định dạng: failed, báo dòng và cột, không lộ giá trị", () => {
    const bad = "Opportunity ID,Stage,Close Date\nO1,Quotation,CANARY_NAME_7f3a\n";
    const r = importCrmCsv(db, { Opportunity: bad }, { hasher, columns: MAP, now: NOW });
    expect(r).toMatchObject({ status: "failed", errorCode: "CSV_BAD_VALUE", detail: "Opportunity dòng 2: Close Date" });
    expect(JSON.stringify(r)).not.toContain("CANARY");
  });

  test("T-MAP-02 (csv) bảng ghép mặc định dùng đúng tên trường của bộ ánh xạ; chỉ file Opportunity là bắt buộc", () => {
    const csv = "Id,StageName,CloseDate\nO1,Quotation,2026-11-20\n";
    const r = importCrmCsv(db, { Opportunity: csv }, { hasher, columns: DEFAULT_COLUMN_MAP, now: NOW });
    expect(r).toMatchObject({ status: "succeeded", rowCounts: { opportunity: 1, client: 0, lead: 0, client_service: 0 } });
    expect(importCrmCsv(db, { Client: CLIENT_CSV }, { hasher, columns: MAP, now: NOW })).toMatchObject({ status: "failed", errorCode: "CSV_OPPORTUNITY_REQUIRED" });
  });
});

describe("Trang nạp CSV", () => {
  function multipart(fields: Record<string, string>, files: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const [k, v] of Object.entries(files)) fd.append(k, new File([v], `${k}.csv`, { type: "text/csv" }));
    return fd;
  }

  test("T-Q-02 (nạp CSV) chỉ Amy nạp được; có CSRF; nội dung file đi thẳng vào hàm xử lý; người xem bị chặn", async () => {
    const got: string[] = [];
    const { app } = makeApp(db, { onImport: async (files) => { got.push(Object.keys(files).sort().join(",")); return { ok: true, message: "Đã nạp" }; } });
    const s = session(AMY);
    expect(await (await get(app, "/import", s.cookie)).text()).toContain('type="file"');
    const send = (cookie: string, csrf: string) =>
      app.fetch(new Request(`${BASE}/import`, { method: "POST", headers: { cookie, origin: BASE }, body: multipart({ csrf }, { opportunity: OPP_CSV, lead: LEAD_CSV }) }));
    const ok = await send(s.cookie, s.csrf);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Đã nạp");
    expect(got).toEqual(["Lead,Opportunity"]);
    expect((await send(s.cookie, "sai")).status).toBe(403);
    const mark = session({ id: "mark", role: "viewer" });
    expect((await send(mark.cookie, mark.csrf)).status).toBe(403);
    expect(got.length).toBe(1);
  });
});
