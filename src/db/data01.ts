// Bảng Mi1-data-01 (D-36): độ phủ ID theo ngày, cờ TRACKING_DEGRADED, sự kiện thiếu trường, PII lọt vào tham số.
// Gộp mọi lượt nạp, bỏ trùng theo event_id (lượt nạp mới nhất thắng). Chỉ đọc.
import type { Database } from "bun:sqlite";
import { DATA01_PARAMS, type Data01Params } from "../config.ts";
import { chainLinkCoverage, type LinkCoverage } from "../metrics/id-chain.ts";
import { idCoverage } from "../metrics/id-coverage.ts";
import { addDays, vnDate } from "../time.ts";

type Row = { event_name: string; event_date: string | null; session_id: string | null; linked: number; missing: string | null; known: number; ids: string | null };
export type DataBoard = {
  importedAt: string | null;
  window: { start: string; end: string; sessions: number; linked: number; rate: number | null; degraded: boolean };
  days: { date: string; sessions: number; linked: number; rate: number | null; degraded: boolean }[]; // mới nhất trước
  missing: { eventName: string; total: number; incomplete: number; topFields: string[] }[];
  unknownEvents: { eventName: string; count: number }[];
  badTime: number;
  pii: { emailCells: number; forbiddenColumns: string[] } | null; // của lượt nạp mới nhất
  chain: LinkCoverage[]; // chuỗi 12 ID, chỉ sự kiện nạp từ khi có bảng data_event_chain
};

export function buildDataBoard(db: Database, now: Date, p: Data01Params = DATA01_PARAMS): DataBoard {
  const last = db.query("SELECT imported_at, email_cells, forbidden_columns FROM data_event_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { imported_at: string; email_cells: number; forbidden_columns: string | null } | null;
  const rows = db.query(`SELECT e.event_name, e.event_date, e.session_id, e.linked, e.missing, e.known, c.ids FROM data_events e JOIN data_event_imports i ON i.id = e.import_id
    LEFT JOIN data_event_chain c ON c.import_id = e.import_id AND c.row_no = e.row_no
    WHERE NOT EXISTS (SELECT 1 FROM data_events e2 JOIN data_event_imports i2 ON i2.id = e2.import_id WHERE e2.event_key = e.event_key AND (i2.imported_at > i.imported_at OR (i2.imported_at = i.imported_at AND (e2.import_id > e.import_id OR (e2.import_id = e.import_id AND e2.row_no > e.row_no)))))`).all() as Row[];
  const end = vnDate(now);
  const start = addDays(end, -(p.windowDays - 1));
  const cov = (rs: Row[]) => idCoverage(rs.map((r) => ({ session_id: r.session_id ?? "", event_name: r.event_name, contact_id: r.linked ? "x" : "" })));
  const degraded = (rate: number | null) => rate !== null && rate < p.degradedBelow;
  const inWindow = rows.filter((r) => r.event_date !== null && r.event_date >= start && r.event_date <= end);
  const w = cov(inWindow);
  const dates = [...new Set(inWindow.map((r) => r.event_date!))].sort().reverse();
  const known = rows.filter((r) => r.known);
  const names = [...new Set(known.map((r) => r.event_name))].sort();
  const unknown = new Map<string, number>();
  for (const r of rows) if (!r.known) unknown.set(r.event_name, (unknown.get(r.event_name) ?? 0) + 1);
  return {
    importedAt: last?.imported_at ?? null,
    window: { start, end, ...w, degraded: degraded(w.rate) },
    days: dates.map((d) => {
      const c = cov(inWindow.filter((r) => r.event_date === d));
      return { date: d, ...c, degraded: degraded(c.rate) };
    }).filter((d) => d.sessions > 0),
    missing: names.map((name) => {
      const rs = known.filter((r) => r.event_name === name);
      const counts = new Map<string, number>();
      for (const r of rs) for (const f of r.missing?.split(",") ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
      return { eventName: name, total: rs.length, incomplete: rs.filter((r) => r.missing).length, topFields: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([f]) => f) };
    }),
    unknownEvents: [...unknown].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([eventName, count]) => ({ eventName, count })),
    badTime: rows.filter((r) => r.event_date === null).length,
    chain: chainLinkCoverage(rows.filter((r) => r.ids !== null).map((r) => ({ eventName: r.event_name, ids: new Set(r.ids ? r.ids.split(",") : []) }))),
    pii: last ? { emailCells: last.email_cells, forbiddenColumns: last.forbidden_columns ? last.forbidden_columns.split(",") : [] } : null,
  };
}
