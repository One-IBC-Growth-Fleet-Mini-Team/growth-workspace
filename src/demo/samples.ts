// Dữ liệu mẫu cho bản demo (D-75): nạp đúng các file trong deploy/samples bằng bộ nạp thật, để các trang của Team MKT
// và Mark có số để xem (Hook, Creative, ngân sách, quảng cáo tuần, giá đối thủ, thị trường, 45 tài phán, sự kiện, kênh).
// Mọi trang của demo hiện dải "Dữ liệu mẫu". Không dùng ngoài demo.
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { importAdReport } from "../crm/ad-report-import.ts";
import { importBankFiles } from "../crm/bank-import.ts";
import { importCampaignCsv } from "../crm/campaign-import.ts";
import { importCompetitorPrices } from "../crm/competitor-import.ts";
import { importEvents } from "../crm/event-import.ts";
import { importHookCsv } from "../crm/hook-import.ts";
import { importPriceSheet, importSkdList } from "../crm/jurisdiction-import.ts";
import { importMarketCsv } from "../crm/market-import.ts";
import { importPartners } from "../crm/partner-import.ts";
import { importSandboxLog } from "../crm/sandbox-import.ts";
import { mondayOf } from "../mi1/core.ts";
import { vnDate } from "../time.ts";

const DIR = new URL("../../deploy/samples/", import.meta.url).pathname;
const f = (n: string) => readFileSync(DIR + n, "utf8");

export function seedDemoSamples(db: Database, now: Date): void {
  const by = { now, actor: "demo" };
  const week = mondayOf(vnDate(now));
  importHookCsv(db, f("hooks.csv"), by);
  importCampaignCsv(db, f("campaigns.csv"), by);
  importAdReport(db, f("meta-ads.csv"), { platform: "meta", weekStart: week, ...by });
  importAdReport(db, f("google-ads.csv"), { platform: "google", weekStart: week, ...by });
  importCompetitorPrices(db, f("competitor-prices.csv"), by);
  importMarketCsv(db, "regulation", f("market-regulation.csv"), by);
  importMarketCsv(db, "reviews", f("market-reviews.csv"), by);
  importPriceSheet(db, f("price-final.csv"), by);
  importSkdList(db, f("skd-files.txt"), by);
  importSandboxLog(db, { bugs: f("sandbox-bugs.csv"), cases: f("sandbox-cases.csv") }, by);
  importBankFiles(db, { matrix: f("bank-matrix.csv"), core: f("bank-core.csv") }, by);
  importEvents(db, f("events.csv"), by);
  importPartners(db, { Partner: f("partner.csv"), Referral: f("referral.csv") }, { columns: {}, ...by });
  // Một Storyboard đã duyệt, QA PASS, đã đóng gói: để thấy nháp lịch kênh, tên bundle trên /creative.
  const at = now.toISOString();
  db.run("INSERT INTO storyboards (creative_ir_id, hook_id, jurisdiction, title, scenes, created_at, actor) VALUES ('DEMO-IR-1', 'HK-01', 'Hong Kong', 'Mở công ty HK trong 7 ngày', '[\"Cảnh 1: hồ sơ online\",\"Cảnh 2: 7 ngày\",\"Cảnh 3: bảng giá\"]', ?, 'demo')", [at]);
  db.run("INSERT INTO storyboard_decisions (id, creative_ir_id, decision, note, decided_at, actor) VALUES (?, 'DEMO-IR-1', 'approve', NULL, ?, 'mark')", [Bun.randomUUIDv7(), at]);
  db.run("INSERT INTO creative_runs (id, creative_ir_id, run_at, actor, qa_status, assets) VALUES (?, 'DEMO-IR-1', ?, 'mark', 'PASS', 26)", [Bun.randomUUIDv7(), at]);
  db.run("INSERT INTO creative_exports (id, creative_ir_id, package_id, bundles, exported_at, actor) VALUES (?, 'DEMO-IR-1', 'DEMO-PKG-1', ?, ?, 'mark')",
    [Bun.randomUUIDv7(), JSON.stringify([{ channel: "meta", aspectRatio: "9:16", entries: 13 }, { channel: "youtube", aspectRatio: "16:9", entries: 13 }]), at]);
}

// Dải nhắc trên mọi trang của demo.
export function withSampleBanner(html: string): string {
  return html.replace("<body>", '<body><div class="status yellow"><strong>Dữ liệu mẫu</strong>: bản demo, số liệu giả từ deploy/samples; giá trị chưa chốt có nhãn "Tạm".</div>');
}
