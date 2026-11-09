// Nạp giá gói của đối thủ (Mi1-mkt-04; D-40). Cổng "Giá đối thủ", adapter tải file. Chỉ đọc file tải lên.
// Cột: competitor, jurisdiction, tier (starter, grow, premium; trống là starter), price_usd, source_url, collected_on (dd/mm/yyyy).
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError, parseCsv } from "./csv.ts";
import { canonicalJurisdiction } from "./jurisdiction-import.ts";
import { parseWoDate } from "./wo-import.ts";

type Result = { status: "succeeded" | "failed"; prices: number; errorCode?: string };

export function importCompetitorPrices(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  try {
    const csv = parseCsv(text);
    const h = csv.header.map((x) => x.trim().toLowerCase());
    if (!["competitor", "jurisdiction", "price_usd"].every((c) => h.includes(c))) return { status: "failed", prices: 0, errorCode: "COMPETITOR_HEADER_NOT_FOUND" };
    const col = (r: string[], n: string) => (h.includes(n) ? (r[h.indexOf(n)] ?? "").trim() : "");
    const id = Bun.randomUUIDv7();
    let n = 0;
    db.transaction(() => {
      db.run("INSERT INTO competitor_imports (id, actor, imported_at) VALUES (?, ?, ?)", [id, opts.actor, opts.now.toISOString()]);
      const q = db.prepare("INSERT INTO competitor_prices (import_id, row_no, competitor, jurisdiction, tier, price_usd, source_url, collected_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      csv.rows.forEach((r, i) => {
        const price = Number(col(r, "price_usd").replace(/[$,\s]/g, ""));
        const tier = col(r, "tier").toLowerCase() || "starter";
        if (!col(r, "competitor") || !col(r, "jurisdiction") || !Number.isFinite(price) || price <= 0 || !["starter", "grow", "premium"].includes(tier)) return;
        q.run(id, i + 2, col(r, "competitor").slice(0, 80), canonicalJurisdiction(col(r, "jurisdiction")).slice(0, 64), tier, price, col(r, "source_url").slice(0, 300) || null, parseWoDate(col(r, "collected_on"), "dd/mm/yyyy"));
        n++;
      });
    })();
    log({ event: "competitor_import.succeeded", run_id: id, count: n });
    return { status: "succeeded", prices: n };
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "COMPETITOR_IMPORT_FAILED";
    log({ event: "competitor_import.failed", error_code: code });
    return { status: "failed", prices: 0, errorCode: code };
  }
}
