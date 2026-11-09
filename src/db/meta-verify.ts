// Verify quảng cáo Meta theo quốc gia (Mi1-mkt-03; spec tầng 1B "quốc gia chưa verify Meta thì hold"; D-41).
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import type { AdIssue } from "../metrics/ad-compliance.ts";
import { redactR1 } from "../pii/redact-regex.ts";

const STATUSES = ["not_started", "pending", "verified", "rejected"];
const CODES: Record<string, string> = { tw: "Taiwan", taiwan: "Taiwan", in: "India", india: "India" };
export const canonicalCountry = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return CODES[t.toLowerCase()] ?? t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
};

export function recordCountryVerification(db: Database, v: { country: string; status: string; note: string }, opts: { now: Date; actor: string }): "ok" | "VERIFY_INVALID" {
  const country = canonicalCountry(v.country).slice(0, 60);
  if (!country || !STATUSES.includes(v.status)) return "VERIFY_INVALID";
  db.run("INSERT INTO meta_country_verifications (id, checked_at, actor, country, status, note) VALUES (?, ?, ?, ?, ?, ?)",
    [Bun.randomUUIDv7(), opts.now.toISOString(), opts.actor, country, v.status, redactR1(v.note.trim().slice(0, 300)).text || null]);
  log({ event: "meta_verify.recorded", count: 1 });
  return "ok";
}

export function latestCountryStatus(db: Database): { country: string; status: string; checkedAt: string; note: string | null }[] {
  return db.query(`SELECT country, status, checked_at AS checkedAt, note FROM meta_country_verifications v
    WHERE NOT EXISTS (SELECT 1 FROM meta_country_verifications v2 WHERE v2.country = v.country AND (v2.checked_at > v.checked_at OR (v2.checked_at = v.checked_at AND v2.id > v.id)))
    ORDER BY country`).all() as { country: string; status: string; checkedAt: string; note: string | null }[];
}

// Quốc gia nằm trong danh sách cần verify mà lần ghi mới nhất chưa là verified thì giữ lại.
export function countryHold(db: Database, target: string | null, required: readonly string[]): AdIssue | null {
  if (!target) return null;
  const c = canonicalCountry(target);
  if (!required.some((r) => r.toLowerCase() === c.toLowerCase())) return null;
  const s = latestCountryStatus(db).find((x) => x.country.toLowerCase() === c.toLowerCase());
  return s?.status === "verified" ? null : { code: "HOLD_META_NOT_VERIFIED", field: "target_country", detail: c };
}
