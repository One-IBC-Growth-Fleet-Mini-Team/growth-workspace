// Kiểm một lô mẫu quảng cáo (CSV) qua cổng tuân thủ (D-38): tầng 1A theo nội dung, tầng 1B giữ lại (hold) mẫu của
// tài phán chưa chốt giá theo sheet FINAL (cùng hàm của trang /jurisdictions). Không lưu gì; chỉ đọc file tải lên.
// Cột: id, jurisdiction, target_country, primary_text, headline, description (id, jurisdiction, target_country không bắt buộc).
// target_country nằm trong danh sách cần verify Meta mà chưa verified thì giữ lại (D-41).
import type { Database } from "bun:sqlite";
import type { AdRules } from "../config.ts";
import { CsvError, parseCsv } from "../crm/csv.ts";
import { canonicalJurisdiction } from "../crm/jurisdiction-import.ts";
import { buildJurisdictionBoard } from "../db/jurisdictions.ts";
import { checkAdCopy, type AdIssue, type Verdict } from "../metrics/ad-compliance.ts";
import { countryHold } from "../db/meta-verify.ts";

export type AdRow = { id: string; jurisdiction: string | null; verdict: Verdict; issues: AdIssue[] };
const RANK: Record<Verdict, number> = { pass: 0, review: 1, hold: 2, fail: 3 };

export function holdIssue(db: Database, jurisdiction: string | null): AdIssue | null {
  if (!jurisdiction) return null;
  const name = canonicalJurisdiction(jurisdiction);
  const j = buildJurisdictionBoard(db).jurisdictions.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return j?.locked ? null : { code: "HOLD_PRICE_NOT_LOCKED", field: "jurisdiction", detail: name };
}

export function checkOne(db: Database, copy: { primaryText: string; headline: string; description: string; jurisdiction: string | null; targetCountry?: string | null }, r: AdRules) {
  const c = checkAdCopy(copy, r);
  const holds = [holdIssue(db, copy.jurisdiction), countryHold(db, copy.targetCountry ?? null, r.metaVerifyRequired ?? [])].filter((x): x is AdIssue => x !== null);
  if (!holds.length) return c;
  return { verdict: RANK[c.verdict] >= RANK.hold ? c.verdict : ("hold" as Verdict), issues: [...c.issues, ...holds] };
}

export function checkAdBatch(db: Database, text: string, r: AdRules): { status: "succeeded" | "failed"; rows: AdRow[]; errorCode?: string } {
  try {
    const csv = parseCsv(text);
    const h = csv.header.map((x) => x.trim().toLowerCase());
    if (!h.includes("primary_text") && !h.includes("headline")) return { status: "failed", rows: [], errorCode: "ADS_HEADER_NOT_FOUND" };
    const col = (r: string[], name: string) => (h.includes(name) ? (r[h.indexOf(name)] ?? "").trim() : "");
    const rows = csv.rows.filter((x) => x.some((c) => c.trim())).slice(0, 500).map((x, i) => {
      const jurisdiction = col(x, "jurisdiction") || null;
      const c = checkOne(db, { primaryText: col(x, "primary_text"), headline: col(x, "headline"), description: col(x, "description"), jurisdiction, targetCountry: col(x, "target_country") || null }, r);
      return { id: col(x, "id") || `dòng ${i + 2}`, jurisdiction, ...c };
    });
    return { status: "succeeded", rows };
  } catch (e) {
    return { status: "failed", rows: [], errorCode: e instanceof CsvError ? e.code : "ADS_CHECK_FAILED" };
  }
}
