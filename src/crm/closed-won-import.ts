// Nạp file Closed Won cho trang persona của Team MKT (D-86). Cổng "CRM", adapter tải file: Amy tải hai file CSV
// xuất từ CRM (Opportunity đã Closed Won, Account). Chỉ đọc file tải lên, không gọi CRM.
// Allowlist cột: chỉ đọc các cột dưới đây, nên cột tên khách, email, số điện thoại không bao giờ được đọc.
// Account ID chỉ dùng để ghép hai file rồi bỏ; Opportunity ID chỉ lưu dạng mã băm. Dòng không phải Closed Won bị bỏ.
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { log } from "../log.ts";
import { CsvError } from "./csv.ts";
import { readCsvRowsLenient, type ColumnSpec, type Detail, type SkippedRow } from "./csv-import.ts";

export const CLOSED_WON_COLUMNS: Record<"Opportunity" | "Account", Record<string, ColumnSpec>> = {
  Opportunity: { Id: "Opportunity ID", AccountId: "Account ID", StageName: "Stage", CloseDate: { column: "Close Date", format: "dd/mm/yyyy" }, Jurisdiction: "Jurisdiction", ServiceFamily: "Service Family", Amount: "Amount" },
  Account: { Id: "Account ID", Industry: "Industry", Country: "Billing Country", Is_Reseller_End_Client__c: "Reseller End Client" },
};

export type ClosedWonResult = { status: "succeeded" | "failed"; deals: number; notWon: number; skipped: SkippedRow[]; errorCode?: string; detail?: string };

const cut = (v: unknown, max = 64): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};

export function importClosedWon(db: Database, files: { opportunity?: string; account?: string }, opts: { now: Date; actor: string }): ClosedWonResult {
  const fail = (errorCode: string, detail = ""): ClosedWonResult => ({ status: "failed", deals: 0, notWon: 0, skipped: [], errorCode, detail });
  if (!files.opportunity) return fail("CLOSED_WON_OPPORTUNITY_REQUIRED");
  try {
    const opp = readCsvRowsLenient("Opportunity", files.opportunity, CLOSED_WON_COLUMNS.Opportunity, ["Id", "StageName"]);
    const acc = files.account ? readCsvRowsLenient("Account", files.account, CLOSED_WON_COLUMNS.Account, ["Id"]) : { rows: [], skipped: [] };
    const accounts = new Map(acc.rows.map(({ raw }) => [String(raw.Id ?? ""), raw]));
    const won = opp.rows.filter(({ raw }) => String(raw.StageName ?? "").trim().toLowerCase() === "closed won" && cut(raw.Id));
    const id = Bun.randomUUIDv7();
    let deals = 0;
    db.transaction(() => {
      db.run("INSERT INTO closed_won_imports (id, actor, imported_at, deals, skipped) VALUES (?, ?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), won.length, opp.skipped.length + acc.skipped.length]);
      const q = db.prepare("INSERT OR IGNORE INTO closed_won_deals (import_id, deal_ref, close_date, jurisdiction, service_family, industry, country, reseller, amount_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const { raw } of won) {
        const a = accounts.get(String(raw.AccountId ?? ""));
        const amount = Number(String(raw.Amount ?? "").replace(/[^0-9.-]/g, ""));
        const reseller = a?.Is_Reseller_End_Client__c;
        if (q.run(id, createHash("sha256").update(String(raw.Id)).digest("hex").slice(0, 24), cut(raw.CloseDate, 10), cut(raw.Jurisdiction), cut(raw.ServiceFamily), cut(a?.Industry), cut(a?.Country),
          reseller === true ? 1 : reseller === false ? 0 : null, String(raw.Amount ?? "").trim() !== "" && Number.isFinite(amount) ? amount : null).changes) deals++;
      }
    })();
    log({ event: "closed_won_import.succeeded", run_id: id, count: deals });
    return { status: "succeeded", deals, notWon: opp.rows.length - won.length, skipped: [...opp.skipped, ...acc.skipped] };
  } catch (e) {
    const d: Detail = e instanceof CsvError ? { code: e.code, detail: "" } : typeof e === "object" && e !== null && "code" in e ? (e as Detail) : { code: "CSV_IMPORT_FAILED", detail: "" };
    log({ event: "closed_won_import.failed", error_code: d.code });
    return fail(d.code, d.detail);
  }
}

export function closedWonMessage(r: ClosedWonResult): string {
  if (r.status === "failed") return r.errorCode === "CLOSED_WON_OPPORTUNITY_REQUIRED" ? "Cần file Opportunity Closed Won." : `Không nạp được (${r.errorCode}${r.detail ? `: ${r.detail}` : ""}).`;
  const skipped = r.skipped.length ? ` Bỏ qua ${r.skipped.length} dòng: ${r.skipped.slice(0, 5).map((s) => `${s.resource} dòng ${s.row} cột ${s.column}`).join("; ")}.` : "";
  return `Đã nạp ${r.deals} deal Closed Won.${r.notWon ? ` Bỏ ${r.notWon} dòng không phải Closed Won.` : ""}${skipped}`;
}

export function latestClosedWon(db: Database): { importedAt: string; deals: number } | null {
  return db.query("SELECT imported_at AS importedAt, deals FROM closed_won_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { importedAt: string; deals: number } | null;
}
