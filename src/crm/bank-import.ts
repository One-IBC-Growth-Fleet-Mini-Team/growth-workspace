// Nạp ma trận ngân hàng của Bank Team (D-34). Cổng "Ma trận ngân hàng", adapter tải file. Chỉ đọc file tải lên.
// matrix: CSV của sheet "Product Matrix - Bank Name X Support" (ô YES/NO theo nơi thành lập công ty).
// core: CSV của sheet "Bank ( Core Information for Clients)" (độ khó, thời gian, tiền nạp đầu, gặp trực tiếp).
// Không đọc liên hệ đối tác hay link referral dù có trong file.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError, parseCsv } from "./csv.ts";
import { canonicalJurisdiction } from "./jurisdiction-import.ts";

export const bankName = (s: string) => s.replace(/\*+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
const cell = (r: string[], i: number) => (r[i] ?? "").trim();
const category = (s: string) => (/tradition/i.test(s) ? "traditional" : "emi");

type Result = { status: "succeeded" | "failed"; banks: number; jurisdictions: number; errorCode?: string };

export function importBankFiles(db: Database, files: { matrix?: string; core?: string }, opts: { now: Date; actor: string }): Result {
  const fail = (code: string): Result => ({ status: "failed", banks: 0, jurisdictions: 0, errorCode: code });
  if (!files.matrix) return fail("BANK_MATRIX_REQUIRED");
  try {
    const m = parseCsv(files.matrix);
    const all = [m.header, ...m.rows];
    const h = all.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "hong kong"));
    const bankCol = all.slice(0, Math.max(h, 0)).map((r) => r.findIndex((c) => c.trim().toLowerCase() === "bank name")).find((i) => i >= 0) ?? -1;
    if (h < 0 || bankCol < 0) return fail("BANK_MATRIX_HEADER_NOT_FOUND");
    const jCols = all[h]!.map((c, i) => ({ i, j: c.trim() ? canonicalJurisdiction(c).slice(0, 64) : "" })).filter((x) => x.i > bankCol && x.j);
    const support: { bank: string; category: string; jurisdiction: string; supported: number }[] = [];
    let cat = "emi";
    for (const r of all.slice(h + 1)) {
      if (cell(r, bankCol - 1)) cat = category(cell(r, bankCol - 1));
      const bank = bankName(cell(r, bankCol));
      if (!bank) continue;
      for (const { i, j } of jCols) {
        const v = cell(r, i).toUpperCase();
        if (v === "YES" || v === "NO") support.push({ bank, category: cat, jurisdiction: j, supported: v === "YES" ? 1 : 0 });
      }
    }
    const info: string[][] = [];
    if (files.core) {
      const c = parseCsv(files.core);
      const rows = [c.header, ...c.rows];
      const hc = rows.findIndex((r) => r.some((x) => x.trim() === "Bank Name") && r.some((x) => x.trim() === "Complexity Level"));
      if (hc >= 0) {
        const col = (name: string) => rows[hc]!.findIndex((x) => x.trim() === name);
        const [b, cx, pt, dep, meet] = ["Bank Name", "Complexity Level", "Processing Time", "Initial Deposit", "Meeting Requirement (Online/Physical)"].map(col);
        for (const r of rows.slice(hc + 1)) if (bankName(cell(r, b!))) info.push([bankName(cell(r, b!)), ...[cx!, pt!, dep!, meet!].map((i) => (i >= 0 ? cell(r, i).slice(0, 200) : ""))]);
      }
    }
    const id = Bun.randomUUIDv7();
    db.transaction(() => {
      db.run("INSERT INTO bank_imports (id, actor, imported_at) VALUES (?, ?, ?)", [id, opts.actor, opts.now.toISOString()]);
      const s = db.prepare("INSERT OR IGNORE INTO bank_support (import_id, bank, category, jurisdiction, supported) VALUES (?, ?, ?, ?, ?)");
      for (const x of support) s.run(id, x.bank, x.category, x.jurisdiction, x.supported);
      const q = db.prepare("INSERT OR IGNORE INTO bank_info (import_id, bank, complexity, processing_time, initial_deposit, meeting) VALUES (?, ?, ?, ?, ?, ?)");
      for (const x of info) q.run(id, ...x.map((v) => v || null));
    })();
    const res = { status: "succeeded" as const, banks: new Set(support.map((x) => x.bank)).size, jurisdictions: new Set(support.map((x) => x.jurisdiction)).size };
    log({ event: "bank_import.succeeded", run_id: id, count: support.length });
    return res;
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "BANK_IMPORT_FAILED";
    log({ event: "bank_import.failed", error_code: code });
    return fail(code);
  }
}

export function bankImportMessage(r: Result): string {
  if (r.status === "succeeded") return `Đã nạp ${r.banks} tổ chức, ${r.jurisdictions} tài phán.`;
  const why: Record<string, string> = {
    BANK_MATRIX_REQUIRED: "Cần file CSV của sheet Product Matrix.",
    BANK_MATRIX_HEADER_NOT_FOUND: "Không thấy dòng BANK NAME và dòng tên tài phán (Hong Kong, ...). Hãy tải CSV của sheet Product Matrix.",
    CSV_INVALID: "File không đúng dạng CSV.",
  };
  return `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."} Dữ liệu cũ vẫn giữ nguyên.`;
}
