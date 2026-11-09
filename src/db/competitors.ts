// Bảng so giá với đối thủ (Mi1-mkt-04; D-40): lượt nạp giá đối thủ mới nhất so với sheet FINAL mới nhất. Chỉ đọc.
import type { Database } from "bun:sqlite";
import { priceGap } from "../metrics/price-gap.ts";
import { buildJurisdictionBoard } from "./jurisdictions.ts";

const TIERS = ["starter", "grow", "premium"] as const;
export type CompetitorRow = { jurisdiction: string; tier: string; ours: number | null; competitors: number; competitorMin: number | null; competitorMedian: number | null; gapToMin: number | null; cheapest: string | null };

export function buildCompetitorBoard(db: Database) {
  const imp = db.query("SELECT id, imported_at AS at FROM competitor_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { id: string; at: string } | null;
  const prices = imp ? (db.query("SELECT competitor, jurisdiction, tier, price_usd FROM competitor_prices WHERE import_id = ?").all(imp.id) as { competitor: string; jurisdiction: string; tier: string; price_usd: number }[]) : [];
  const ours = buildJurisdictionBoard(db).jurisdictions;
  const known = new Map(ours.map((j) => [j.name.toLowerCase(), j]));
  const keys = [...new Set(prices.map((p) => `${p.jurisdiction}|${p.tier}`))].sort();
  const rows: CompetitorRow[] = [];
  for (const k of keys) {
    const [jurisdiction, tier] = k.split("|") as [string, (typeof TIERS)[number]];
    const j = known.get(jurisdiction.toLowerCase());
    if (!j) continue;
    const own = j.rows.map((r) => r[tier]).filter((v): v is number => v !== null);
    const ps = prices.filter((p) => p.jurisdiction === jurisdiction && p.tier === tier);
    const g = priceGap(own.length ? Math.min(...own) : null, ps.map((p) => p.price_usd));
    rows.push({ jurisdiction, tier, ours: own.length ? Math.min(...own) : null, competitors: ps.length, ...g, cheapest: ps.find((p) => p.price_usd === g.competitorMin)?.competitor ?? null });
  }
  const covered = new Set(prices.map((p) => p.jurisdiction.toLowerCase()));
  return {
    importedAt: imp?.at ?? null,
    rows,
    notInPriceSheet: [...new Set(prices.map((p) => p.jurisdiction))].filter((j) => !known.has(j.toLowerCase())).sort(),
    withoutCompetitor: imp ? ours.map((j) => j.name).filter((n) => !covered.has(n.toLowerCase())).sort() : [],
  };
}
