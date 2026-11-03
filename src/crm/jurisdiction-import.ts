// Nạp file cho Mi1-mkt-05 (D-32): trạng thái bảng giá từng tài phán và danh sách file SKD. Có file nào nạp file đó.
// Cổng "Bảng giá và SKD", adapter tải file. Chỉ đọc file tải lên. [ĐỐI CHIẾU SCHEMA] tên cột mặc định là tên tạm.
// Allowlist: không đọc số tiền, ghi chú, người phụ trách.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError } from "./csv.ts";
import { readCsvRows, type ColumnMap, type ColumnSpec, type Detail } from "./csv-import.ts";

export const DEFAULT_JURISDICTION_COLUMNS: Record<"Price" | "Skd", Record<string, ColumnSpec>> = {
  Price: { Code: "Jurisdiction Code", Status: "Price Status", Version: "Price Version" },
  Skd: { Code: "Jurisdiction Code", FileType: "File Type", Status: "Status" },
};
const cut = (v: unknown, max = 40): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};

export type JurisdictionImportResult = { importId: string | null; status: "succeeded" | "failed"; prices: number; skd: number; errorCode?: string; detail?: string };

export function importJurisdictions(db: Database, files: { Price?: string; Skd?: string }, opts: { columns: ColumnMap; now: Date; actor: string }): JurisdictionImportResult {
  const fail = (code: string, detail = ""): JurisdictionImportResult => ({ importId: null, status: "failed", prices: 0, skd: 0, errorCode: code, detail });
  if (!files.Price && !files.Skd) return fail("JURISDICTION_FILE_REQUIRED");
  try {
    const spec = (r: "Price" | "Skd") => opts.columns[r] ?? DEFAULT_JURISDICTION_COLUMNS[r];
    const prices = files.Price ? readCsvRows("Price", files.Price, spec("Price"), ["Code", "Status"]) : [];
    const skd = files.Skd ? readCsvRows("Skd", files.Skd, spec("Skd"), ["Code", "FileType", "Status"]) : [];
    const importId = Bun.randomUUIDv7();
    let np = 0;
    let ns = 0;
    db.transaction(() => {
      db.run("INSERT INTO jurisdiction_imports (id, actor, imported_at) VALUES (?, ?, ?)", [importId, opts.actor, opts.now.toISOString()]);
      const p = db.prepare("INSERT OR IGNORE INTO jurisdiction_prices (import_id, code, price_status, price_version) VALUES (?, ?, ?, ?)");
      for (const x of prices) {
        const code = cut(x.Code, 16)?.toUpperCase(); const st = cut(x.Status);
        if (code && st && p.run(importId, code, st, cut(x.Version)).changes) np++;
      }
      const s = db.prepare("INSERT OR IGNORE INTO jurisdiction_skd (import_id, code, file_type, status) VALUES (?, ?, ?, ?)");
      for (const x of skd) {
        const code = cut(x.Code, 16)?.toUpperCase(); const ft = cut(x.FileType, 64); const st = cut(x.Status);
        if (code && ft && st && s.run(importId, code, ft, st).changes) ns++;
      }
    })();
    log({ event: "jurisdiction_import.succeeded", run_id: importId, count: np + ns });
    return { importId, status: "succeeded", prices: np, skd: ns };
  } catch (e) {
    const d: Detail = e instanceof CsvError ? { code: e.code, detail: "" } : typeof e === "object" && e !== null && "code" in e ? (e as Detail) : { code: "CSV_IMPORT_FAILED", detail: "" };
    log({ event: "jurisdiction_import.failed", error_code: d.code });
    return fail(d.code, d.detail);
  }
}

export function jurisdictionImportMessage(r: JurisdictionImportResult): string {
  if (r.status === "succeeded") return `Đã nạp ${r.prices} tài phán trong bảng giá, ${r.skd} dòng SKD.`;
  const why: Record<string, string> = { JURISDICTION_FILE_REQUIRED: "Cần ít nhất một file.", CSV_MISSING_COLUMN: "File thiếu cột cần thiết", CSV_INVALID: "File không đúng dạng CSV." };
  return `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."}${r.detail ? `: ${r.detail}` : ""}. Dữ liệu cũ vẫn giữ nguyên.`;
}
