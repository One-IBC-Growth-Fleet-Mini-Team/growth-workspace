// Bảng tiến độ Mi1-mkt-05 (CRON-04; D-32, D-33): đọc lượt nạp giá và lượt nạp SKD mới nhất, chỉ đọc.
// Tính khi mở trang ($0 token, giống D-28) thay cho script 07:30.
import type { Database } from "bun:sqlite";
import { JURISDICTION_PARAMS, type JurisdictionParams } from "../config.ts";
import { priceRowStatus, skdKitStatus, type PriceRow, type PriceRowStatus } from "../metrics/jurisdiction-ready.ts";

export type BoardRow = PriceRow & { companyType: string } & PriceRowStatus;
export type JurisdictionBoard = {
  importedAt: string | null;
  summary: { total: number; listed: number; priceLocked: number; notListed: number };
  jurisdictions: { name: string; locked: boolean; rows: BoardRow[] }[]; // chưa chốt lên trước, rồi theo tên
  skd: { importedAt: string | null; done: number; total: number; missing: string[] };
};

function latest(db: Database, table: string): { id: string; at: string } | null {
  return db.query(`SELECT i.id, i.imported_at AS at FROM jurisdiction_imports i WHERE EXISTS (SELECT 1 FROM ${table} t WHERE t.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1`).get() as { id: string; at: string } | null;
}

export function buildJurisdictionBoard(db: Database, p: JurisdictionParams = JURISDICTION_PARAMS): JurisdictionBoard {
  const pi = latest(db, "jurisdiction_prices");
  const rows = pi ? (db.query("SELECT jurisdiction, company_type, starter, grow, premium, renewal, renewal_2y AS renewal2y, renewal_3y AS renewal3y FROM jurisdiction_prices WHERE import_id = ? ORDER BY row_no").all(pi.id) as (PriceRow & { jurisdiction: string; company_type: string })[]) : [];
  const groups = new Map<string, BoardRow[]>();
  for (const r of rows) {
    const { jurisdiction, company_type, ...price } = r;
    if (!groups.has(jurisdiction)) groups.set(jurisdiction, []);
    groups.get(jurisdiction)!.push({ ...price, companyType: company_type, ...priceRowStatus(price, p) });
  }
  const jurisdictions = [...groups].map(([name, rs]) => ({ name, locked: rs.every((r) => r.status === "locked"), rows: rs }));
  jurisdictions.sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
  const si = latest(db, "skd_files");
  const names = si ? (db.query("SELECT file_name FROM skd_files WHERE import_id = ? ORDER BY file_name").all(si.id) as { file_name: string }[]).map((r) => r.file_name) : [];
  return {
    importedAt: pi?.at ?? null,
    summary: { total: p.total, listed: jurisdictions.length, priceLocked: jurisdictions.filter((j) => j.locked).length, notListed: Math.max(0, p.total - jurisdictions.length) },
    jurisdictions,
    skd: { importedAt: si?.at ?? null, ...skdKitStatus(names, p) },
  };
}
