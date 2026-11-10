// Bảng persona (D-88): deal Closed Won của lượt nạp mới nhất, qua `personaSegments`, kèm tín hiệu thị trường theo tài phán
// (quy định mới và chủ đề tiếng khách ở lượt nạp thị trường mới nhất; spec mục 1 câu 2). Chỉ đọc.
import type { Database } from "bun:sqlite";
import { personaSegments, type PersonaDeal } from "../metrics/persona.ts";
import { getProvisional } from "../provisional.ts";
import { buildMarketBoard } from "./market.ts";

export function buildPersonaBoard(db: Database) {
  const imp = db.query("SELECT id, imported_at AS importedAt FROM closed_won_imports ORDER BY imported_at DESC, id DESC LIMIT 1").get() as { id: string; importedAt: string } | null;
  if (!imp) return null;
  const deals = db.query("SELECT jurisdiction, service_family AS serviceFamily, industry, country, reseller, amount_usd AS amountUsd FROM closed_won_deals WHERE import_id = ?").all(imp.id) as PersonaDeal[];
  const p = getProvisional("persona");
  const summary = personaSegments(deals, p.value.min_deals);
  const m = buildMarketBoard(db);
  const key = (s: string | null) => (s ?? "").trim().toLowerCase();
  const signals = (j: string) => ({
    regulations: m.regulation.filter((r) => key(r.jurisdiction) === key(j)).map((r) => r.title ?? "").filter(Boolean).slice(0, 3),
    reviewThemes: [...new Set(m.reviews.filter((r) => key(r.jurisdiction) === key(j)).map((r) => r.theme ?? "khác"))].slice(0, 3),
  });
  return { importedAt: imp.importedAt, minDeals: p.value.min_deals, minDealsProvisional: p.status === "PROVISIONAL", ...summary, segments: summary.segments.map((s) => ({ ...s, market: signals(s.jurisdiction) })) };
}
