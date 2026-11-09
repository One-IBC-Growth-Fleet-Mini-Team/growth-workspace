// Cổng market-scan-mcp (spec mục 9; D-46): quy định (watch_regulation), tiếng khách (collect_reviews_anonymized),
// giá gói đối thủ (scan_competitor_packages, đi vào cùng bảng của /competitors). Adapter file và adapter MCP. Chỉ đọc.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { log } from "../log.ts";
import { callRemoteTools, RemoteToolError, type RemoteTarget } from "../mcp/remote.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { importCompetitorPrices } from "./competitor-import.ts";
import { CsvError, parseCsv } from "./csv.ts";
import { canonicalJurisdiction } from "./jurisdiction-import.ts";
import { parseWoDate } from "./wo-import.ts";

type Item = { jurisdiction?: string | null; title?: string | null; summary?: string | null; effective_date?: string | null; source?: string | null; theme?: string | null; rating?: number | null };
type Kind = "regulation" | "reviews";
const t = (v: unknown, n: number) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().slice(0, n));

function save(db: Database, kind: Kind, items: Item[], source: "file" | "mcp", opts: { now: Date; actor: string }): number {
  const id = Bun.randomUUIDv7();
  db.transaction(() => {
    db.run("INSERT INTO market_imports (id, actor, imported_at, kind, source) VALUES (?, ?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), kind, source]);
    const q = db.prepare("INSERT INTO market_items (import_id, row_no, jurisdiction, title, summary, effective_date, source, theme, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    items.forEach((x, i) => {
      const summary = t(x.summary, 500);
      q.run(id, i + 1, x.jurisdiction ? canonicalJurisdiction(x.jurisdiction).slice(0, 64) : null, t(x.title, 200), kind === "reviews" && summary ? redactR1(summary).text : summary,
        x.effective_date ? parseWoDate(x.effective_date, "dd/mm/yyyy") : null, t(x.source, 300), t(x.theme, 60), x.rating ?? null);
    });
  })();
  log({ event: "market_import.succeeded", run_id: id, count: items.length });
  return items.length;
}

// File quy định: jurisdiction, title, summary, effective_date, source_url. File tiếng khách: source, jurisdiction, theme, rating, text.
export function importMarketCsv(db: Database, kind: Kind, text: string, opts: { now: Date; actor: string }) {
  try {
    const csv = parseCsv(text);
    const h = csv.header.map((x) => x.trim().toLowerCase());
    const need = kind === "regulation" ? ["jurisdiction", "title"] : ["text"];
    if (!need.every((c) => h.includes(c))) return { status: "failed" as const, items: 0, errorCode: "MARKET_HEADER_NOT_FOUND" };
    const col = (r: string[], c: string) => (h.includes(c) ? (r[h.indexOf(c)] ?? "").trim() : "");
    const items: Item[] = csv.rows.filter((r) => r.some((c) => c.trim())).map((r) => kind === "regulation"
      ? { jurisdiction: col(r, "jurisdiction"), title: col(r, "title"), summary: col(r, "summary"), effective_date: col(r, "effective_date"), source: col(r, "source_url") }
      : { source: col(r, "source"), jurisdiction: col(r, "jurisdiction"), theme: col(r, "theme"), rating: col(r, "rating") ? Number(col(r, "rating")) : null, summary: col(r, "text") });
    return { status: "succeeded" as const, items: save(db, kind, items, "file", opts) };
  } catch (e) {
    return { status: "failed" as const, items: 0, errorCode: e instanceof CsvError ? e.code : "MARKET_IMPORT_FAILED" };
  }
}

const Reg = z.object({ items: z.array(z.object({ jurisdiction: z.string().nullish(), title: z.string(), summary: z.string().nullish(), effective_date: z.string().nullish(), source_url: z.string().nullish() })) });
const Rev = z.object({ reviews: z.array(z.object({ source: z.string().nullish(), jurisdiction: z.string().nullish(), theme: z.string().nullish(), rating: z.number().nullish(), text: z.string() })) });
const Pkg = z.object({ packages: z.array(z.object({ competitor: z.string(), jurisdiction: z.string(), tier: z.string().nullish(), price_usd: z.number(), source_url: z.string().nullish(), collected_on: z.string().nullish() })) });

export async function pullMarketScan(db: Database, target: RemoteTarget, opts: { now: Date; actor: string }) {
  try {
    const [p0, r0, v0] = await callRemoteTools(target, [{ tool: "scan_competitor_packages" }, { tool: "watch_regulation" }, { tool: "collect_reviews_anonymized" }]);
    const pkg = Pkg.safeParse(p0);
    const reg = Reg.safeParse(r0);
    const rev = Rev.safeParse(v0);
    if (!pkg.success || !reg.success || !rev.success) return { status: "failed" as const, errorCode: "MARKET_MCP_CONTRACT" };
    const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const pkgCsv = ["competitor,jurisdiction,tier,price_usd,source_url,collected_on", ...pkg.data.packages.map((p) => [p.competitor, p.jurisdiction, p.tier ?? "", p.price_usd, p.source_url ?? "", p.collected_on ?? ""].map(csvCell).join(","))].join("\n");
    const packages = importCompetitorPrices(db, pkgCsv, opts).prices;
    const regulation = save(db, "regulation", reg.data.items.map((x) => ({ ...x, source: x.source_url })), "mcp", opts);
    const reviews = save(db, "reviews", rev.data.reviews.map((x) => ({ ...x, summary: x.text })), "mcp", opts);
    return { status: "succeeded" as const, packages, regulation, reviews };
  } catch (e) {
    return { status: "failed" as const, errorCode: e instanceof RemoteToolError ? e.code : "MARKET_IMPORT_FAILED" };
  }
}
