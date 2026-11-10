// Giá trị chưa chốt (D-67): một hàm đọc duy nhất getProvisional(). Mặc định ở config/provisional.json (trong repo);
// Mark sửa hoặc chuyển FINAL ở /tuning, thay đổi ghi nối tiếp (chỉ thêm) vào file JSONL cạnh Growth DB.
// Dòng mới nhất của mỗi khoá thắng. Mọi số dùng giá trị PROVISIONAL hiện nhãn "Tạm" trên giao diện.
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const Num = z.number().finite().nonnegative();
const Rate = z.number().min(0).max(1);
export const PROVISIONAL_SCHEMAS = {
  tier3b: z.object({ min_asset_view_per_week: Num, ask_per_view_below: Rate, contact_per_ask_below: Rate, skip_when_tracking_degraded: z.boolean() }),
  win_gate: z.object({ min_impressions: Num, min_contact_captured: Num, require_cycle_complete: z.boolean(), require_reseller_filtered: z.boolean(), cpl_at_most: z.literal("median"), win_rate_at_least: z.literal("median"), min_confidence: Rate }),
  channel_schedule: z.object({ posts_per_week: z.record(z.string(), Num) }),
  commission: z.object({ rates: z.record(z.string(), Rate), base: z.string(), label: z.string() }),
  bundle_name: z.object({ pattern: z.string().min(1) }),
  cron07: z.object({ enabled: z.boolean(), description: z.string() }),
  k07_ad_words: z.object({ banned: z.array(z.string()), review: z.array(z.string()) }),
  tier4_repeat: z.object({ min_count: z.number().int().positive(), window_days: z.number().int().positive() }),
  q09_stage_weights: z.record(z.string(), Num),
  persona: z.object({ min_deals: z.number().int().positive() }),
  budget_framework: z.object({
    a_share: Rate, test_budget_share: Rate, max_step: Rate, r5_cut: Rate, min_days_between_changes: z.number().int().nonnegative(), jimmy_total_change_share: Rate,
    r2_min_impressions: Num, r2_min_contacts: Num, r3_flag_weeks: z.number().int().positive(), r5_stop_after_cycles: z.number().int().positive(), weekly_total_usd: Num.nullable(),
  }),
} as const;
export type ProvisionalKey = keyof typeof PROVISIONAL_SCHEMAS;
export type ProvisionalStatus = "PROVISIONAL" | "FINAL";
export type Provisional<K extends ProvisionalKey> = { key: K; value: z.infer<(typeof PROVISIONAL_SCHEMAS)[K]>; status: ProvisionalStatus; source: string; decidedBy: string | null; note?: string };

const Entry = z.object({ value: z.unknown(), status: z.enum(["PROVISIONAL", "FINAL"]), source: z.string(), decided_by: z.string().nullable(), note: z.string().optional() });
const Override = z.object({ key: z.string(), value: z.unknown(), status: z.enum(["PROVISIONAL", "FINAL"]), at: z.string(), actor: z.string() });

const REPO_FILE = new URL("../config/provisional.json", import.meta.url).pathname;
let paths: { file: string; overrides: string } | null = null;
// Test và bản cài đặt đường dẫn riêng; mặc định: file trong repo và JSONL cạnh GROWTH_DB_PATH.
export function setProvisionalPaths(p: { file?: string; overrides: string }): void {
  paths = { file: p.file ?? REPO_FILE, overrides: p.overrides };
  cache = null;
}
function currentPaths() {
  if (paths) return paths;
  const db = process.env.GROWTH_DB_PATH;
  return { file: process.env.PROVISIONAL_PATH ?? REPO_FILE, overrides: process.env.PROVISIONAL_OVERRIDES_PATH ?? join(db && db !== ":memory:" ? dirname(db) : ".", "provisional-overrides.jsonl") };
}

let cache: { stamp: string; all: Map<string, Provisional<ProvisionalKey>> } | null = null;
const mtime = (f: string) => (existsSync(f) ? String(statSync(f).mtimeMs) + ":" + String(statSync(f).size) : "none");

function loadAll(): Map<string, Provisional<ProvisionalKey>> {
  const p = currentPaths();
  const stamp = `${p.file}|${mtime(p.file)}|${p.overrides}|${mtime(p.overrides)}`;
  if (cache?.stamp === stamp) return cache.all;
  const raw = JSON.parse(readFileSync(p.file, "utf8")) as Record<string, unknown>;
  const all = new Map<string, Provisional<ProvisionalKey>>();
  for (const key of Object.keys(PROVISIONAL_SCHEMAS) as ProvisionalKey[]) {
    const e = Entry.parse(raw[key]);
    all.set(key, { key, value: PROVISIONAL_SCHEMAS[key].parse(e.value) as never, status: e.status, source: e.source, decidedBy: e.decided_by, note: e.note });
  }
  if (existsSync(p.overrides)) {
    for (const line of readFileSync(p.overrides, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const o = Override.safeParse(JSON.parse(line));
      if (!o.success || !(o.data.key in PROVISIONAL_SCHEMAS)) continue;
      const v = PROVISIONAL_SCHEMAS[o.data.key as ProvisionalKey].safeParse(o.data.value);
      if (!v.success) continue;
      const prev = all.get(o.data.key)!;
      all.set(o.data.key, { ...prev, value: v.data as never, status: o.data.status, decidedBy: o.data.status === "FINAL" ? o.data.actor : prev.decidedBy, source: `${prev.source}; sửa bởi ${o.data.actor} ${o.data.at.slice(0, 10)}` });
    }
  }
  cache = { stamp, all };
  return all;
}

export function getProvisional<K extends ProvisionalKey>(key: K): Provisional<K> {
  return loadAll().get(key) as Provisional<K>;
}

export function listProvisional(): Provisional<ProvisionalKey>[] {
  return [...loadAll().values()];
}

// Nhãn cạnh số dùng giá trị chưa chốt.
export function tag(key: ProvisionalKey): string {
  return getProvisional(key).status === "PROVISIONAL" ? " (Tạm)" : "";
}

// Mark sửa giá trị hoặc chuyển FINAL ở /tuning. Giá trị sai dạng thì không ghi.
// Khoá đổi quyết định tiền phải qua eval như các tham số ở /tuning (D-90): lượt eval gần nhất pass và chạy sau lần đổi trước.
const EVAL_GATED: ReadonlySet<string> = new Set(["budget_framework"]);
function lastSetAt(key: string): string | null {
  const f = currentPaths().overrides;
  if (!existsSync(f)) return null;
  let at: string | null = null;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    try { const o = JSON.parse(line) as { key?: string; at?: string }; if (o.key === key && o.at) at = o.at; } catch { /* dòng trống */ }
  }
  return at;
}

export function setProvisional(key: string, valueJson: string, status: ProvisionalStatus, opts: { now: Date; actor: string; evalRun?: { ranAt: string | null; passed: boolean } }): "ok" | "ONLY_MARK" | "KEY_UNKNOWN" | "VALUE_INVALID" | "EVAL_FAILED" | "EVAL_NOT_RERUN" {
  if (opts.actor !== "mark") return "ONLY_MARK";
  if (!(key in PROVISIONAL_SCHEMAS)) return "KEY_UNKNOWN";
  if (EVAL_GATED.has(key)) {
    const run = opts.evalRun ?? { ranAt: null, passed: false };
    if (!run.ranAt) return "EVAL_NOT_RERUN";
    if (!run.passed) return "EVAL_FAILED";
    const prev = lastSetAt(key);
    if (prev && run.ranAt <= prev) return "EVAL_NOT_RERUN";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    return "VALUE_INVALID";
  }
  if (!PROVISIONAL_SCHEMAS[key as ProvisionalKey].safeParse(parsed).success) return "VALUE_INVALID";
  appendFileSync(currentPaths().overrides, JSON.stringify({ key, value: parsed, status, at: opts.now.toISOString(), actor: opts.actor }) + "\n");
  return "ok";
}
