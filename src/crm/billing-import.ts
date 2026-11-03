// Nạp file đơn hàng cho Mi1-sa-01 (D-30): SalesOrder (SO), PurchaseOrder (PO), Invoice. Có file nào nạp file đó.
// Cổng "Đơn hàng và invoice", adapter tải file (docs/context/ports.md). Chỉ đọc file Amy tải lên, không gọi CRM.
// [ĐỐI CHIẾU SCHEMA] tên cột mặc định là tên tạm; đổi bằng bảng ghép (crm-columns.json, mục SalesOrder, PurchaseOrder, Invoice).
// Allowlist: không đọc tên khách, số tiền, ghi chú.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError } from "./csv.ts";
import { readCsvRows, type BILLING_RESOURCES, type ColumnMap, type ColumnSpec, type Detail } from "./csv-import.ts";
import { parseWoDate } from "./wo-import.ts";

export type BillingResource = (typeof BILLING_RESOURCES)[number];
export type BillingFiles = Partial<Record<BillingResource, string>>;

export const DEFAULT_BILLING_COLUMNS: Record<BillingResource, Record<string, ColumnSpec>> = {
  SalesOrder: { OrderNumber: "Order Number", AccountId: "Account ID", OwnerId: "Owner ID", Status: "Status", NeedsPo: "Needs PO" },
  PurchaseOrder: { PoNumber: "PO Number", OrderNumber: "Order Number", Status: "Status" },
  Invoice: { InvoiceNumber: "Invoice Number", OrderNumber: "Order Number", OwnerId: "Owner ID", DueDate: { column: "Due Date", format: "dd/mm/yyyy" }, Status: "Status" },
};
const REQUIRED: Record<BillingResource, string[]> = {
  SalesOrder: ["OrderNumber", "Status"],
  PurchaseOrder: ["PoNumber", "Status"],
  Invoice: ["InvoiceNumber", "Status"],
};
const YES = new Set(["1", "true", "yes", "y", "có", "co", "x"]);

const cut = (v: unknown, max = 64): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};

export type BillingImportResult = { importId: string | null; status: "succeeded" | "failed"; counts: Record<BillingResource, number>; errorCode?: string; detail?: string };

export function importBilling(db: Database, files: BillingFiles, opts: { columns: ColumnMap; now: Date; actor: string }): BillingImportResult {
  const counts: Record<BillingResource, number> = { SalesOrder: 0, PurchaseOrder: 0, Invoice: 0 };
  if (!files.SalesOrder && !files.PurchaseOrder && !files.Invoice) return { importId: null, status: "failed", counts, errorCode: "BILLING_FILE_REQUIRED" };
  try {
    const rows = {} as Record<BillingResource, Record<string, unknown>[]>;
    const formats: Record<string, string | undefined> = {};
    for (const r of ["SalesOrder", "PurchaseOrder", "Invoice"] as const) {
      const spec = opts.columns[r] ?? DEFAULT_BILLING_COLUMNS[r];
      const plain = Object.fromEntries(Object.entries(spec).map(([f, s]) => [f, typeof s === "string" ? s : s.column]));
      for (const [f, s] of Object.entries(spec)) if (typeof s !== "string") formats[`${r}.${f}`] = s.format;
      rows[r] = files[r] ? readCsvRows(r, files[r]!, plain, REQUIRED[r]) : [];
    }
    const importId = Bun.randomUUIDv7();
    db.transaction(() => {
      db.run("INSERT INTO billing_imports (id, actor, imported_at) VALUES (?, ?, ?)", [importId, opts.actor, opts.now.toISOString()]);
      const so = db.prepare("INSERT OR IGNORE INTO billing_sales_orders (import_id, so_number, account_id, owner_rm_id, status, needs_po) VALUES (?, ?, ?, ?, ?, ?)");
      for (const x of rows.SalesOrder) {
        const n = cut(x.OrderNumber); const st = cut(x.Status, 40);
        if (n && st && so.run(importId, n, cut(x.AccountId), cut(x.OwnerId), st, YES.has(String(x.NeedsPo ?? "").trim().toLowerCase()) ? 1 : 0).changes) counts.SalesOrder++;
      }
      const po = db.prepare("INSERT OR IGNORE INTO billing_purchase_orders (import_id, po_number, so_number, status) VALUES (?, ?, ?, ?)");
      for (const x of rows.PurchaseOrder) {
        const n = cut(x.PoNumber); const st = cut(x.Status, 40);
        if (n && st && po.run(importId, n, cut(x.OrderNumber), st).changes) counts.PurchaseOrder++;
      }
      const inv = db.prepare("INSERT OR IGNORE INTO billing_invoices (import_id, invoice_number, so_number, owner_rm_id, due_date, status) VALUES (?, ?, ?, ?, ?, ?)");
      for (const x of rows.Invoice) {
        const n = cut(x.InvoiceNumber); const st = cut(x.Status, 40);
        const due = parseWoDate(x.DueDate, formats["Invoice.DueDate"] as Parameters<typeof parseWoDate>[1]);
        if (n && st && inv.run(importId, n, cut(x.OrderNumber), cut(x.OwnerId), due, st).changes) counts.Invoice++;
      }
    })();
    log({ event: "billing_import.succeeded", run_id: importId, count: counts.SalesOrder + counts.PurchaseOrder + counts.Invoice });
    return { importId, status: "succeeded", counts };
  } catch (e) {
    const d: Detail = e instanceof CsvError ? { code: e.code, detail: "" } : typeof e === "object" && e !== null && "code" in e ? (e as Detail) : { code: "CSV_IMPORT_FAILED", detail: "" };
    log({ event: "billing_import.failed", error_code: d.code });
    return { importId: null, status: "failed", counts, errorCode: d.code, detail: d.detail };
  }
}

export function billingImportMessage(r: BillingImportResult): string {
  if (r.status === "succeeded") return `Đã nạp ${r.counts.SalesOrder} SO, ${r.counts.PurchaseOrder} PO, ${r.counts.Invoice} invoice.`;
  const why: Record<string, string> = { BILLING_FILE_REQUIRED: "Cần ít nhất một file.", CSV_MISSING_COLUMN: "File thiếu cột cần thiết", CSV_INVALID: "File không đúng dạng CSV." };
  return `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."}${r.detail ? `: ${r.detail}` : ""}. Dữ liệu cũ vẫn giữ nguyên.`;
}
