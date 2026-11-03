// Bảng đối soát đơn hàng (Mi1-sa-01, D-30): đọc lượt nạp mới nhất của từng loại file, chỉ đọc.
import type { Database } from "bun:sqlite";
import { BILLING_PARAMS } from "../config.ts";
import { invoiceOverdueDays } from "../metrics/invoice-overdue.ts";

export type OverdueInvoice = { invoice_number: string; so_number: string | null; owner_rm_id: string | null; due_date: string; overdue_days: number };
export type BillingBoard = {
  importedAt: string | null;
  escalate: OverdueInvoice[]; // quá hạn từ escalateOverdueDays: báo Amy
  remind: OverdueInvoice[]; // quá hạn ít hơn: RM nhắc khách
  soMissingPo: { so_number: string; owner_rm_id: string | null; status: string }[];
  poWithoutSo: { po_number: string; so_number: string | null }[];
};

function latestImport(db: Database, table: string): string | null {
  return (db.query(`SELECT i.id FROM billing_imports i WHERE EXISTS (SELECT 1 FROM ${table} t WHERE t.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1`).get() as { id: string } | null)?.id ?? null;
}

const inList = (v: string, list: readonly string[]) => list.some((x) => x.toLowerCase() === v.trim().toLowerCase());

export function buildBillingBoard(db: Database, now: Date, p = BILLING_PARAMS): BillingBoard {
  const at = (db.query("SELECT MAX(imported_at) AS v FROM billing_imports").get() as { v: string | null }).v;
  const board: BillingBoard = { importedAt: at, escalate: [], remind: [], soMissingPo: [], poWithoutSo: [] };
  const invId = latestImport(db, "billing_invoices");
  if (invId) {
    const rows = db.query("SELECT invoice_number, so_number, owner_rm_id, due_date, status FROM billing_invoices WHERE import_id = ?").all(invId) as
      (Omit<OverdueInvoice, "overdue_days" | "due_date"> & { due_date: string | null; status: string })[];
    for (const r of rows) {
      if (inList(r.status, p.paidInvoiceStatuses) || inList(r.status, p.closedInvoiceStatuses)) continue;
      const d = invoiceOverdueDays(r.due_date, now);
      if (d === null) continue;
      const row = { invoice_number: r.invoice_number, so_number: r.so_number, owner_rm_id: r.owner_rm_id, due_date: r.due_date!, overdue_days: d };
      (d >= p.escalateOverdueDays ? board.escalate : board.remind).push(row);
    }
    const byDays = (a: OverdueInvoice, b: OverdueInvoice) => b.overdue_days - a.overdue_days || a.invoice_number.localeCompare(b.invoice_number);
    board.escalate.sort(byDays);
    board.remind.sort(byDays);
  }
  const soId = latestImport(db, "billing_sales_orders");
  const poId = latestImport(db, "billing_purchase_orders");
  const sos = soId ? (db.query("SELECT so_number, owner_rm_id, status, needs_po FROM billing_sales_orders WHERE import_id = ? ORDER BY so_number").all(soId) as { so_number: string; owner_rm_id: string | null; status: string; needs_po: number }[]) : [];
  const pos = poId ? (db.query("SELECT po_number, so_number FROM billing_purchase_orders WHERE import_id = ? ORDER BY po_number").all(poId) as { po_number: string; so_number: string | null }[]) : [];
  if (soId && poId) {
    const linked = new Set(pos.map((x) => x.so_number).filter(Boolean));
    board.soMissingPo = sos.filter((s) => s.needs_po === 1 && !inList(s.status, p.closedOrderStatuses) && !linked.has(s.so_number)).map(({ so_number, owner_rm_id, status }) => ({ so_number, owner_rm_id, status }));
    const known = new Set(sos.map((s) => s.so_number));
    board.poWithoutSo = pos.filter((x) => !x.so_number || !known.has(x.so_number));
  }
  return board;
}

// Tin nhắc theo RM cho invoice quá hạn; Amy chép và tự gửi. Chỉ có mã invoice, mã SO, số ngày.
export function invoiceReminderTexts(rows: OverdueInvoice[]): { rm: string; text: string }[] {
  const by = new Map<string, OverdueInvoice[]>();
  for (const r of rows) (by.get(r.owner_rm_id ?? "") ?? by.set(r.owner_rm_id ?? "", []).get(r.owner_rm_id ?? "")!).push(r);
  return [...by.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))).map(([rm, list]) => ({
    rm: rm || "Chưa rõ RM",
    text: [
      `${rm ? `Chào ${rm}` : "Chào bạn"}, các invoice dưới đây đã quá hạn thanh toán:`,
      ...list.map((r) => `- Invoice ${r.invoice_number}${r.so_number ? ` (SO ${r.so_number})` : ""}: quá hạn ${r.overdue_days} ngày`),
      "Bạn nhắc khách thanh toán và cập nhật trên CRM giúp nhé.",
    ].join("\n"),
  }));
}
