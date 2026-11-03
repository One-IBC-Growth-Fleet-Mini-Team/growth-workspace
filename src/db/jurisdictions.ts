// Bảng tiến độ tài phán (Mi1-mkt-05, CRON-04; D-32): đọc lượt nạp mới nhất của từng file, chỉ đọc.
// Tính khi mở trang ($0 token, giống D-28) thay cho script 07:30.
import type { Database } from "bun:sqlite";
import { JURISDICTION_PARAMS, type JurisdictionParams } from "../config.ts";
import { isSkdDone, jurisdictionReadiness } from "../metrics/jurisdiction-ready.ts";

export type JurisdictionRow = { code: string; priceStatus: string | null; priceVersion: string | null; skdDoneTypes: number; skdMissing: number; priceLocked: boolean; ready: boolean };
export type JurisdictionBoard = {
  importedAt: string | null;
  summary: { total: number; listed: number; priceLocked: number; ready: number; notListed: number };
  rows: JurisdictionRow[]; // chưa sẵn sàng lên trước, rồi theo mã
};

function latest(db: Database, table: string): string | null {
  return (db.query(`SELECT i.id FROM jurisdiction_imports i WHERE EXISTS (SELECT 1 FROM ${table} t WHERE t.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1`).get() as { id: string } | null)?.id ?? null;
}

export function buildJurisdictionBoard(db: Database, p: JurisdictionParams = JURISDICTION_PARAMS): JurisdictionBoard {
  const at = (db.query("SELECT MAX(imported_at) AS v FROM jurisdiction_imports").get() as { v: string | null }).v;
  const pid = latest(db, "jurisdiction_prices");
  const sid = latest(db, "jurisdiction_skd");
  const prices = new Map(pid ? (db.query("SELECT code, price_status, price_version FROM jurisdiction_prices WHERE import_id = ?").all(pid) as { code: string; price_status: string; price_version: string | null }[]).map((r) => [r.code, r]) : []);
  const done = new Map<string, Set<string>>();
  const codes = new Set(prices.keys());
  for (const r of sid ? (db.query("SELECT code, file_type, status FROM jurisdiction_skd WHERE import_id = ?").all(sid) as { code: string; file_type: string; status: string }[]) : []) {
    codes.add(r.code);
    if (!done.has(r.code)) done.set(r.code, new Set());
    if (isSkdDone(r.status, p)) done.get(r.code)!.add(r.file_type.trim().toLowerCase());
  }
  const rows: JurisdictionRow[] = [...codes].map((code) => {
    const pr = prices.get(code);
    const skdDoneTypes = done.get(code)?.size ?? 0;
    return { code, priceStatus: pr?.price_status ?? null, priceVersion: pr?.price_version ?? null, skdDoneTypes, ...jurisdictionReadiness({ priceStatus: pr?.price_status ?? null, skdDoneTypes }, p) };
  });
  rows.sort((a, b) => Number(a.ready) - Number(b.ready) || a.code.localeCompare(b.code));
  const ready = rows.filter((r) => r.ready).length;
  return {
    importedAt: at,
    summary: { total: p.total, listed: rows.length, priceLocked: rows.filter((r) => r.priceLocked).length, ready, notListed: Math.max(0, p.total - rows.length) },
    rows,
  };
}
