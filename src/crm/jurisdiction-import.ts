// Nạp dữ liệu cho Mi1-mkt-05 (D-32, D-33). Cổng "Bảng giá và SKD", adapter tải file và dán tay. Chỉ đọc đầu vào.
// (1) File CSV xuất từ sheet "FINAL - Gói & Giá năm 2 & năm 3" (Google Sheets: Tệp, Tải xuống, CSV).
//     Đọc theo vị trí cột sau dòng tiêu đề "Jurisdiction": A tài phán, B loại hình, C tới H sáu cột giá.
//     Không đọc cột từ I trở đi (thời gian thực hiện, ghi chú).
// (2) Danh sách tên file trong thư mục Userguide eKYC, mỗi dòng một tên.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError, parseCsv } from "./csv.ts";

// Tên viết khác nhau trong sheet cho cùng một tài phán.
const ALIASES: Record<string, string> = {
  "UK": "United Kingdom",
  "U.S.A": "United States",
  "BVI": "British Virgin Islands",
  "Cayman": "Cayman Islands",
  "UAE": "UAE - RAK ICC",
};
export function canonicalJurisdiction(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim().replace(/\s*-\s*/g, " - ");
  return ALIASES[s] ?? s;
}
function money(cell: string | undefined): number | null {
  const s = String(cell ?? "").replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

type Result = { status: "succeeded" | "failed"; count: number; jurisdictions?: number; errorCode?: string };

export function importPriceSheet(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  try {
    const csv = parseCsv(text);
    const all = [csv.header, ...csv.rows];
    const h = all.findIndex((r) => (r[0] ?? "").trim() === "Jurisdiction" && /^starter/i.test((r[2] ?? "").trim()));
    if (h < 0) return { status: "failed", count: 0, errorCode: "PRICE_HEADER_NOT_FOUND" };
    const rows = all.slice(h + 1).map((r, i) => ({ r, rowNo: h + i + 2 })).filter(({ r }) => (r[0] ?? "").trim() && (r[1] ?? "").trim() && (r[2] ?? "").trim());
    if (!rows.length) return { status: "failed", count: 0, errorCode: "PRICE_NO_ROWS" };
    const id = Bun.randomUUIDv7();
    db.transaction(() => {
      db.run("INSERT INTO jurisdiction_imports (id, actor, imported_at) VALUES (?, ?, ?)", [id, opts.actor, opts.now.toISOString()]);
      const q = db.prepare("INSERT INTO jurisdiction_prices (import_id, row_no, jurisdiction, company_type, starter, grow, premium, renewal, renewal_2y, renewal_3y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const { r, rowNo } of rows) q.run(id, rowNo, canonicalJurisdiction(r[0]!).slice(0, 64), r[1]!.replace(/\s+/g, " ").trim().slice(0, 120), ...r.slice(2, 8).map(money));
    })();
    const jurisdictions = new Set(rows.map(({ r }) => canonicalJurisdiction(r[0]!))).size;
    log({ event: "price_import.succeeded", run_id: id, count: rows.length });
    return { status: "succeeded", count: rows.length, jurisdictions };
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "PRICE_IMPORT_FAILED";
    log({ event: "price_import.failed", error_code: code });
    return { status: "failed", count: 0, errorCode: code };
  }
}

export function importSkdList(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  const names = [...new Set(text.split(/\r?\n/).map((n) => n.trim().slice(0, 200)).filter(Boolean))];
  if (!names.length) return { status: "failed", count: 0, errorCode: "SKD_LIST_EMPTY" };
  const id = Bun.randomUUIDv7();
  db.transaction(() => {
    db.run("INSERT INTO jurisdiction_imports (id, actor, imported_at) VALUES (?, ?, ?)", [id, opts.actor, opts.now.toISOString()]);
    const q = db.prepare("INSERT INTO skd_files (import_id, file_name) VALUES (?, ?)");
    for (const n of names) q.run(id, n);
  })();
  log({ event: "skd_import.succeeded", run_id: id, count: names.length });
  return { status: "succeeded", count: names.length };
}

const WHY: Record<string, string> = {
  PRICE_HEADER_NOT_FOUND: "Không thấy dòng tiêu đề Jurisdiction, Loại hình công ty, Starter. Hãy tải CSV của sheet FINAL.",
  PRICE_NO_ROWS: "File không có dòng giá nào.",
  CSV_INVALID: "File không đúng dạng CSV.",
  SKD_LIST_EMPTY: "Danh sách file SKD đang trống.",
};
export function jurisdictionImportMessage(price: Result | null, skd: Result | null): string {
  const parts: string[] = [];
  for (const [r, ok] of [
    [price, (x: Result) => `Đã nạp ${x.count} dòng giá của ${x.jurisdictions} tài phán.`],
    [skd, (x: Result) => `Đã nạp danh sách ${x.count} file SKD.`],
  ] as const) {
    if (!r) continue;
    parts.push(r.status === "succeeded" ? ok(r) : `Chưa nạp. ${WHY[r.errorCode ?? ""] ?? "Không nạp được."} Dữ liệu cũ vẫn giữ nguyên.`);
  }
  return parts.length ? parts.join(" ") : "Chưa nạp. Cần file giá hoặc danh sách file SKD. Dữ liệu cũ vẫn giữ nguyên.";
}
