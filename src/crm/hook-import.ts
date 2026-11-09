// Nạp Hook và điểm 5 tiêu chí (Mi1-mkt-02; D-43). Cổng "Điểm Hook": adapter tải file (mặc định) và adapter MCP
// gọi tool get_hook_scores của hệ thống SEO/AIO (hợp đồng ở docs/context/hop-dong-mcp.md). Chỉ đọc nguồn.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { HOOK_PARAMS } from "../config.ts";
import { log } from "../log.ts";
import { callRemoteTool, RemoteToolError, type RemoteTarget } from "../mcp/remote.ts";
import { CsvError, parseCsv } from "./csv.ts";
import { canonicalJurisdiction } from "./jurisdiction-import.ts";

type Hook = { hookId: string; text: string; jurisdiction: string | null; scores: (number | null)[] };
type Result = { status: "succeeded" | "failed"; hooks: number; errorCode?: string };
const score = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
};

function save(db: Database, hooks: Hook[], source: "file" | "mcp", labels: readonly string[], opts: { now: Date; actor: string }): Result {
  const id = Bun.randomUUIDv7();
  let n = 0;
  db.transaction(() => {
    db.run("INSERT INTO hook_imports (id, actor, imported_at, source, labels) VALUES (?, ?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), source, JSON.stringify(labels)]);
    const q = db.prepare("INSERT OR IGNORE INTO hook_candidates (import_id, hook_id, text, jurisdiction, s1, s2, s3, s4, s5) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const h of hooks) {
      if (!h.hookId || !h.text) continue;
      if (q.run(id, h.hookId.slice(0, 64), h.text.slice(0, 500), h.jurisdiction ? canonicalJurisdiction(h.jurisdiction).slice(0, 64) : null, ...h.scores).changes) n++;
    }
  })();
  log({ event: "hook_import.succeeded", run_id: id, count: n });
  return { status: "succeeded", hooks: n };
}

// File: cột hook_id, text, jurisdiction, score_1 tới score_5 (thang 0 tới 100, theo thứ tự trọng số 25/25/20/15/15).
export function importHookCsv(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  try {
    const csv = parseCsv(text);
    const h = csv.header.map((x) => x.trim().toLowerCase());
    const cols = ["hook_id", "text", "score_1", "score_2", "score_3", "score_4", "score_5"];
    if (!cols.every((c) => h.includes(c))) return { status: "failed", hooks: 0, errorCode: "HOOK_HEADER_NOT_FOUND" };
    const col = (r: string[], c: string) => (h.includes(c) ? (r[h.indexOf(c)] ?? "").trim() : "");
    const hooks = csv.rows.map((r) => ({ hookId: col(r, "hook_id"), text: col(r, "text"), jurisdiction: col(r, "jurisdiction") || null, scores: [1, 2, 3, 4, 5].map((i) => score(col(r, `score_${i}`))) }));
    return save(db, hooks, "file", HOOK_PARAMS.defaultLabels, opts);
  } catch (e) {
    return { status: "failed", hooks: 0, errorCode: e instanceof CsvError ? e.code : "HOOK_IMPORT_FAILED" };
  }
}

// Hợp đồng tool get_hook_scores: 5 tiêu chí theo thứ tự trọng số, mỗi Hook có điểm cho đủ 5 khoá.
const Contract = z.object({
  criteria: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).length(5),
  hooks: z.array(z.object({ hook_id: z.string().min(1), text: z.string().min(1), jurisdiction: z.string().nullish(), scores: z.record(z.string(), z.number().nullable()) })),
});

export async function importHooksFromMcp(db: Database, target: RemoteTarget, opts: { now: Date; actor: string }): Promise<Result> {
  try {
    const parsed = Contract.safeParse(await callRemoteTool(target, "get_hook_scores", {}));
    if (!parsed.success) return { status: "failed", hooks: 0, errorCode: "HOOK_MCP_CONTRACT" };
    const keys = parsed.data.criteria.map((c) => c.key);
    const hooks = parsed.data.hooks.map((x) => ({ hookId: x.hook_id, text: x.text, jurisdiction: x.jurisdiction ?? null, scores: keys.map((k) => x.scores[k] ?? null) }));
    return save(db, hooks, "mcp", parsed.data.criteria.map((c) => c.label.slice(0, 60)), opts);
  } catch (e) {
    const code = e instanceof RemoteToolError ? e.code : "HOOK_IMPORT_FAILED";
    log({ event: "hook_import.failed", error_code: code });
    return { status: "failed", hooks: 0, errorCode: code };
  }
}
