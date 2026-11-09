// Nạp file đối tác cho Mi1-ptn-01 (D-31): Partner (mã, loại) và Referral (deal do đối tác giới thiệu). Có file nào nạp file đó.
// Cổng "Đối tác", adapter tải file. Chỉ đọc file Amy tải lên. [ĐỐI CHIẾU SCHEMA] tên cột mặc định là tên tạm.
// Allowlist: không đọc tên đối tác, tên khách, ghi chú.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError } from "./csv.ts";
import { readCsvRows, type ColumnMap, type ColumnSpec, type Detail } from "./csv-import.ts";
import { parseWoDate } from "./wo-import.ts";

export const DEFAULT_PARTNER_COLUMNS: Record<"Partner" | "Referral", Record<string, ColumnSpec>> = {
  Partner: { PartnerId: "Partner ID", Type: "Partner Type" },
  Referral: { DealId: "Opportunity ID", PartnerId: "Partner ID", ClientId: "Account ID", Stage: "Stage", CloseDate: { column: "Close Date", format: "dd/mm/yyyy" }, Profit: "Net Profit" },
};
const RESELLER = new Set(["reseller", "đại lý", "dai ly", "agent"]);
// Bậc đối tác giữ nguyên để tính hoa hồng theo bậc (D-71); loại khác coi là referrer như trước.
const TIERS = new Set(["referrer", "partner", "premier"]);
const norm = (raw: unknown) => String(raw ?? "").trim().toLowerCase();
const cut = (v: unknown, max = 64): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};

export type PartnerImportResult = { importId: string | null; status: "succeeded" | "failed"; partners: number; referrals: number; errorCode?: string; detail?: string };

export function importPartners(db: Database, files: { Partner?: string; Referral?: string }, opts: { columns: ColumnMap; now: Date; actor: string }): PartnerImportResult {
  const fail = (code: string, detail = ""): PartnerImportResult => ({ importId: null, status: "failed", partners: 0, referrals: 0, errorCode: code, detail });
  if (!files.Partner && !files.Referral) return fail("PARTNER_FILE_REQUIRED");
  try {
    const spec = (r: "Partner" | "Referral") => opts.columns[r] ?? DEFAULT_PARTNER_COLUMNS[r];
    const plain = (s: Record<string, ColumnSpec>) => Object.fromEntries(Object.entries(s).map(([f, c]) => [f, typeof c === "string" ? c : c.column]));
    const dateSpec = spec("Referral").CloseDate;
    const dateFormat = typeof dateSpec === "object" ? dateSpec.format : undefined;
    const partners = files.Partner ? readCsvRows("Partner", files.Partner, plain(spec("Partner")), ["PartnerId", "Type"]) : [];
    const referrals = files.Referral ? readCsvRows("Referral", files.Referral, plain(spec("Referral")), ["DealId", "PartnerId", "Stage"]) : [];
    const importId = Bun.randomUUIDv7();
    let np = 0;
    let nr = 0;
    db.transaction(() => {
      db.run("INSERT INTO partner_imports (id, actor, imported_at) VALUES (?, ?, ?)", [importId, opts.actor, opts.now.toISOString()]);
      const p = db.prepare("INSERT OR IGNORE INTO partner_rows (import_id, partner_id, partner_type) VALUES (?, ?, ?)");
      const t = db.prepare("INSERT OR IGNORE INTO partner_tiers (import_id, partner_id, tier) VALUES (?, ?, ?)");
      for (const x of partners) {
        const id = cut(x.PartnerId);
        if (id && p.run(importId, id, RESELLER.has(norm(x.Type)) ? "reseller" : "referrer").changes) np++;
        if (id && TIERS.has(norm(x.Type))) t.run(importId, id, norm(x.Type));
      }
      const r = db.prepare("INSERT OR IGNORE INTO partner_referrals (import_id, deal_id, partner_id, client_id, stage, close_date, profit_usd) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const x of referrals) {
        const id = cut(x.DealId); const pid = cut(x.PartnerId); const st = cut(x.Stage, 40);
        const profit = Number(String(x.Profit ?? "").replace(/[^0-9.-]/g, ""));
        const hasProfit = String(x.Profit ?? "").trim() !== "" && Number.isFinite(profit);
        if (id && pid && st && r.run(importId, id, pid, cut(x.ClientId), st, parseWoDate(x.CloseDate, dateFormat), hasProfit ? profit : null).changes) nr++;
      }
    })();
    log({ event: "partner_import.succeeded", run_id: importId, count: nr });
    return { importId, status: "succeeded", partners: np, referrals: nr };
  } catch (e) {
    const d: Detail = e instanceof CsvError ? { code: e.code, detail: "" } : typeof e === "object" && e !== null && "code" in e ? (e as Detail) : { code: "CSV_IMPORT_FAILED", detail: "" };
    log({ event: "partner_import.failed", error_code: d.code });
    return fail(d.code, d.detail);
  }
}

export function partnerImportMessage(r: PartnerImportResult): string {
  if (r.status === "succeeded") return `Đã nạp ${r.partners} đối tác, ${r.referrals} deal giới thiệu.`;
  const why: Record<string, string> = { PARTNER_FILE_REQUIRED: "Cần ít nhất một file.", CSV_MISSING_COLUMN: "File thiếu cột cần thiết", CSV_INVALID: "File không đúng dạng CSV." };
  return `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."}${r.detail ? `: ${r.detail}` : ""}. Dữ liệu cũ vẫn giữ nguyên.`;
}
