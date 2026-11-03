// T-BILL-01 tới T-BILL-05: đối soát đơn hàng của Mi1-sa-01 (D-30). Dữ liệu tổng hợp; tên khách dùng canary để chứng minh không vào DB.
import { describe, expect, test } from "bun:test";
import { importBilling } from "../../src/crm/billing-import.ts";
import { buildBillingBoard, invoiceReminderTexts } from "../../src/db/billing.ts";
import { invoiceOverdueDays } from "../../src/metrics/invoice-overdue.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-02T02:00:00Z"); // 09:00 giờ VN
const SO = "Order Number,Account ID,Account Name,Owner ID,Status,Needs PO,Amount\nSO1,C1,CANARY_NAME_7f3a,RM_A,Activated,Có,899\nSO2,C2,x,RM_B,Activated,,10\nSO3,C3,x,RM_A,Cancelled,có,0\nSO4,C4,x,RM_B,Activated,x,1\n";
const PO = "PO Number,Order Number,Status\nPO1,SO4,Open\nPO2,,Open\nPO3,SO9,Open\n";
const INV = "Invoice Number,Order Number,Owner ID,Due Date,Status,Amount\nI1,SO1,RM_A,01/11/2026,Unpaid,899\nI2,SO2,RM_B,10/10/2026,Unpaid,10\nI3,SO4,RM_B,01/10/2026,Paid,1\nI4,SO1,RM_A,05/11/2026,Unpaid,5\nI5,SO2,,15/10/2026,Unpaid,5\n";
const load = (db = freshDb()) => (importBilling(db, { SalesOrder: SO, PurchaseOrder: PO, Invoice: INV }, { columns: {}, now: NOW, actor: "amy" }), db);

describe("T-BILL đối soát đơn hàng", () => {
  test("T-BILL-01 invoice_overdue_days theo ngày giờ VN; chưa tới hạn hoặc không có hạn là null", () => {
    expect(invoiceOverdueDays("2026-11-01", NOW)).toBe(1);
    expect(invoiceOverdueDays("2026-11-02", NOW)).toBeNull();
    expect(invoiceOverdueDays(null, NOW)).toBeNull();
    expect(invoiceOverdueDays("2026-11-01", new Date("2026-11-01T17:30:00Z"))).toBe(1); // 00:30 ngày 02/11 giờ VN
  });

  test("T-BILL-02 invoice quá hạn chưa trả chia nhóm theo 14 ngày; đã trả hoặc chưa tới hạn bị bỏ", () => {
    const b = buildBillingBoard(load(), NOW);
    expect(b.escalate.map((r) => [r.invoice_number, r.overdue_days])).toEqual([["I2", 23], ["I5", 18]]);
    expect(b.remind.map((r) => [r.invoice_number, r.overdue_days])).toEqual([["I1", 1]]);
    const t = invoiceReminderTexts([...b.escalate, ...b.remind]);
    expect(t.map((x) => x.rm)).toEqual(["RM_A", "RM_B", "Chưa rõ RM"]);
    expect(t[1]!.text).toContain("Invoice I2 (SO SO2): quá hạn 23 ngày");
  });

  test("T-BILL-03 SO cần PO mà chưa có PO; SO đã huỷ bỏ qua; PO không gắn hoặc gắn SO không có", () => {
    const b = buildBillingBoard(load(), NOW);
    expect(b.soMissingPo.map((s) => s.so_number)).toEqual(["SO1"]);
    expect(b.poWithoutSo.map((p) => p.po_number)).toEqual(["PO2", "PO3"]);
  });

  test("T-BILL-04 tên khách và số tiền không vào DB; bảng chỉ thêm; thiếu cột thì không ghi gì", () => {
    const db = load();
    const bytes = new TextDecoder().decode(db.serialize());
    expect(bytes).not.toContain("CANARY_NAME_7f3a");
    expect(() => db.run("DELETE FROM billing_invoices")).toThrow("append_only:billing_invoices");
    const db2 = freshDb();
    expect(importBilling(db2, { Invoice: "Invoice Number,Due Date\nI1,01/11/2026\n" }, { columns: {}, now: NOW, actor: "amy" })).toMatchObject({ status: "failed", errorCode: "CSV_MISSING_COLUMN", detail: "Invoice: Status" });
    expect((db2.query("SELECT COUNT(*) AS n FROM billing_imports").get() as { n: number }).n).toBe(0);
  });

  test("T-BILL-05 trang /billing: Amy nạp được có CSRF; Mark chỉ xem; Hàng chờ có link", async () => {
    const db = freshDb();
    const { app } = makeApp(db);
    const s = session(AMY);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("invoice", new File([INV], "inv.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/billing`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp 0 SO, 0 PO, 5 invoice");
    expect(page).toContain("báo Amy (2)");
    const m = session(MARK);
    const markPage = await (await get(app, "/billing", m.cookie)).text();
    expect(markPage).toContain("I2");
    expect(markPage).not.toContain('action="/billing"');
    expect((await post(app, "/billing", { csrf: m.csrf }, m.cookie)).status).toBe(403);
    expect((await post(app, "/billing", { csrf: "sai" }, s.cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/billing"');
  });
});
