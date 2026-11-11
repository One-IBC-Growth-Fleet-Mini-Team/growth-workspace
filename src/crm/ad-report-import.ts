// Nạp báo cáo quảng cáo một tuần (Mi1-mkt-01; D-39). Cổng "Meta Ads, Google Ads", adapter tải file. Chỉ đọc file tải lên.
// Nhận tên cột mặc định của file xuất Meta Ads Manager và Google Ads; dòng tổng của Google Ads ("Total: ...") bị bỏ.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError, parseCsv } from "./csv.ts";

// Tên cột chấp nhận cho mỗi trường, theo thứ tự ưu tiên. [ĐỐI CHIẾU SCHEMA] với file xuất thật.
const COLUMNS = {
  campaign: ["Campaign name", "Campaign"],
  ad: ["Ad name", "Ad", "Ad group"],
  impressions: ["Impressions", "Impr."],
  clicks: ["Link clicks", "Clicks (all)", "Clicks"],
  spend: ["Amount spent (USD)", "Amount spent", "Cost"],
  frequency: ["Frequency"],
} as const;
const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

type Result = { status: "succeeded" | "failed"; ads: number; errorCode?: string };

export type AdRowInput = { campaign: string | null; ad: string; impressions: number; clicks: number; spend: number; frequency: number | null };

// Ghi một lần nạp vào ad_imports và ad_rows. Dùng chung cho file tải lên và adapter API (D-96), nên Win gate đọc một bảng.
export function saveAdRows(db: Database, rows: AdRowInput[], opts: { platform: "meta" | "google"; weekStart: string; now: Date; actor: string }): string {
  const id = Bun.randomUUIDv7();
  db.transaction(() => {
    db.run("INSERT INTO ad_imports (id, actor, imported_at, platform, week_start) VALUES (?, ?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), opts.platform, opts.weekStart]);
    const q = db.prepare("INSERT INTO ad_rows (import_id, row_no, campaign, ad, impressions, clicks, spend, frequency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    rows.forEach((r, i) => q.run(id, i + 1, r.campaign?.slice(0, 120) || null, r.ad.slice(0, 120), Math.round(r.impressions), Math.round(r.clicks), r.spend, r.frequency));
  })();
  log({ event: "ad_report_import.succeeded", run_id: id, count: rows.length });
  return id;
}

export function importAdReport(db: Database, text: string, opts: { platform: "meta" | "google"; weekStart: string; now: Date; actor: string }): Result {
  const fail = (code: string): Result => ({ status: "failed", ads: 0, errorCode: code });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.weekStart) || new Date(`${opts.weekStart}T00:00:00Z`).getUTCDay() !== 1) return fail("AD_WEEK_NOT_MONDAY");
  try {
    const csv = parseCsv(text);
    const all = [csv.header, ...csv.rows];
    const h = all.findIndex((r) => r.some((c) => (COLUMNS.ad as readonly string[]).includes(c.trim())) && r.some((c) => (COLUMNS.impressions as readonly string[]).includes(c.trim())));
    if (h < 0) return fail("AD_REPORT_HEADER_NOT_FOUND");
    const header = all[h]!.map((c) => c.trim());
    const col = (names: readonly string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
    const c = Object.fromEntries(Object.entries(COLUMNS).map(([k, v]) => [k, col(v)])) as Record<keyof typeof COLUMNS, number>;
    const rows = all.slice(h + 1).filter((r) => (r[c.ad] ?? "").trim() && !/^total/i.test((r[0] ?? "").trim()));
    const ads = rows.map((r) => ({ campaign: c.campaign >= 0 ? (r[c.campaign] ?? "").trim() || null : null, ad: r[c.ad]!.trim(),
      impressions: num(r[c.impressions]), clicks: c.clicks >= 0 ? num(r[c.clicks]) : 0, spend: c.spend >= 0 ? num(r[c.spend]) : 0,
      frequency: c.frequency >= 0 && (r[c.frequency] ?? "").trim() ? num(r[c.frequency]) : null }));
    saveAdRows(db, ads, opts);
    return { status: "succeeded", ads: rows.length };
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "AD_REPORT_IMPORT_FAILED";
    log({ event: "ad_report_import.failed", error_code: code });
    return fail(code);
  }
}
