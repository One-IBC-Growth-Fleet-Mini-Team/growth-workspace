// Bảng thị trường (Mi1-mkt-03; D-46): quy định mới theo tài phán, tiếng khách gom theo chủ đề. Lượt nạp mới nhất mỗi loại.
import type { Database } from "bun:sqlite";

function latest(db: Database, kind: string) {
  return (db.query("SELECT id FROM market_imports WHERE kind = ? ORDER BY imported_at DESC, id DESC LIMIT 1").get(kind) as { id: string } | null)?.id ?? null;
}

export function buildMarketBoard(db: Database) {
  const r = latest(db, "regulation");
  const v = latest(db, "reviews");
  const regulation = r ? (db.query("SELECT jurisdiction, title, summary, effective_date AS effectiveDate, source FROM market_items WHERE import_id = ? ORDER BY effective_date, row_no").all(r) as { jurisdiction: string | null; title: string | null; summary: string | null; effectiveDate: string | null; source: string | null }[]) : [];
  const reviews = v ? (db.query("SELECT theme, rating, summary, source, jurisdiction FROM market_items WHERE import_id = ? ORDER BY row_no").all(v) as { theme: string | null; rating: number | null; summary: string | null; source: string | null; jurisdiction: string | null }[]) : [];
  const themes = new Map<string, number[]>();
  for (const x of reviews) {
    const k = x.theme ?? "khác";
    if (!themes.has(k)) themes.set(k, []);
    if (x.rating !== null) themes.get(k)!.push(x.rating);
    else themes.get(k)!.push(NaN);
  }
  const reviewThemes = [...themes].map(([theme, rs]) => {
    const rated = rs.filter((x) => !Number.isNaN(x));
    return { theme, count: rs.length, avgRating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null };
  }).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
  return { regulation, reviews, reviewThemes };
}
