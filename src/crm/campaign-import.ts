// Nạp kết quả theo chiến dịch cho tầng 5 (D-45). Cổng "Kết quả theo chiến dịch": adapter tải file (mặc định) và
// adapter MCP gọi get_campaign_stats của ads-mcp (hợp đồng ở docs/context/hop-dong-mcp.md). Chỉ đọc nguồn.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { log } from "../log.ts";
import { callRemoteTool, RemoteToolError, type RemoteTarget } from "../mcp/remote.ts";
import { CsvError, parseCsv } from "./csv.ts";

const Row = z.object({
  campaign: z.string().min(1), platform: z.string().nullish(), jurisdiction: z.string().nullish(), period_start: z.string().nullish(), period_end: z.string().nullish(),
  spend_usd: z.number(), leads: z.number().nullish(), closed_won: z.number().nullish(), gross_margin_usd: z.number(), sales_cycle_complete: z.boolean(),
});
type CampaignRow = z.infer<typeof Row>;
type Result = { status: "succeeded" | "failed"; campaigns: number; errorCode?: string };

function save(db: Database, rows: CampaignRow[], source: "file" | "mcp", opts: { now: Date; actor: string }): Result {
  const id = Bun.randomUUIDv7();
  let n = 0;
  db.transaction(() => {
    db.run("INSERT INTO campaign_imports (id, actor, imported_at, source) VALUES (?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), source]);
    const q = db.prepare("INSERT OR IGNORE INTO campaign_results (import_id, campaign, platform, jurisdiction, period_start, period_end, spend_usd, leads, closed_won, gross_margin_usd, cycle_complete) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const r of rows) if (q.run(id, r.campaign.slice(0, 120), r.platform ?? null, r.jurisdiction?.slice(0, 64) ?? null, r.period_start ?? null, r.period_end ?? null, r.spend_usd, r.leads ?? null, r.closed_won ?? null, r.gross_margin_usd, r.sales_cycle_complete ? 1 : 0).changes) n++;
  })();
  log({ event: "campaign_import.succeeded", run_id: id, count: n });
  return { status: "succeeded", campaigns: n };
}

export function importCampaignCsv(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  try {
    const csv = parseCsv(text);
    const h = csv.header.map((x) => x.trim().toLowerCase());
    if (!["campaign", "spend_usd", "gross_margin_usd", "sales_cycle_complete"].every((c) => h.includes(c))) return { status: "failed", campaigns: 0, errorCode: "CAMPAIGN_HEADER_NOT_FOUND" };
    const col = (r: string[], c: string) => (h.includes(c) ? (r[h.indexOf(c)] ?? "").trim() : "");
    const num = (s: string) => (s === "" ? null : Number(s.replace(/[$,\s]/g, "")));
    const rows = csv.rows.map((r) => Row.safeParse({
      campaign: col(r, "campaign"), platform: col(r, "platform") || null, jurisdiction: col(r, "jurisdiction") || null, period_start: col(r, "period_start") || null, period_end: col(r, "period_end") || null,
      spend_usd: num(col(r, "spend_usd")), leads: num(col(r, "leads")), closed_won: num(col(r, "closed_won")), gross_margin_usd: num(col(r, "gross_margin_usd")),
      sales_cycle_complete: ["yes", "true", "1", "có"].includes(col(r, "sales_cycle_complete").toLowerCase()),
    })).filter((x) => x.success).map((x) => x.data!);
    return save(db, rows, "file", opts);
  } catch (e) {
    return { status: "failed", campaigns: 0, errorCode: e instanceof CsvError ? e.code : "CAMPAIGN_IMPORT_FAILED" };
  }
}

export async function importCampaignsFromMcp(db: Database, target: RemoteTarget, opts: { now: Date; actor: string }): Promise<Result> {
  try {
    const p = z.object({ campaigns: z.array(Row) }).safeParse(await callRemoteTool(target, "get_campaign_stats", {}));
    if (!p.success) return { status: "failed", campaigns: 0, errorCode: "CAMPAIGN_MCP_CONTRACT" };
    return save(db, p.data.campaigns, "mcp", opts);
  } catch (e) {
    return { status: "failed", campaigns: 0, errorCode: e instanceof RemoteToolError ? e.code : "CAMPAIGN_IMPORT_FAILED" };
  }
}
