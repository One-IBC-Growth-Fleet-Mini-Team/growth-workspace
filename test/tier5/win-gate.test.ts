// T-WIN-01, T-WIN-02: Win gate Mi1-mkt-01 (D-69). Ngưỡng tạm từ config/provisional.json; đổi config thì kết quả đổi.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importAdReport } from "../../src/crm/ad-report-import.ts";
import { importCampaignCsv } from "../../src/crm/campaign-import.ts";
import { buildWinGate } from "../../src/db/budget.ts";
import { winGate } from "../../src/metrics/win-gate.ts";
import { getProvisional, setProvisionalPaths } from "../../src/provisional.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const REPO = new URL("../../config/provisional.json", import.meta.url).pathname;
function isolate(edit?: (j: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "prov-"));
  const j = JSON.parse(readFileSync(REPO, "utf8"));
  edit?.(j);
  writeFileSync(join(dir, "p.json"), JSON.stringify(j));
  setProvisionalPaths({ file: join(dir, "p.json"), overrides: join(dir, "o.jsonl") });
}
afterEach(() => isolate());

const row = (campaign: string, impressions: number | null, contacts: number | null, closedWon: number | null, spendUsd: number, cycleComplete = true) =>
  ({ campaign, impressions, contacts, closedWon, spendUsd, cycleComplete, resellerFiltered: true, trackingDegraded: false });

describe("T-WIN Win gate", () => {
  test("T-WIN-01 hàm: thiếu mẫu không xếp hạng; đủ mẫu so CPL và tỷ lệ chốt với trung vị", () => {
    const p = getProvisional("win_gate").value;
    const r = winGate([row("A", 5000, 40, 8, 400), row("B", 5000, 40, 2, 800), row("C", 5000, 40, 4, 600), row("D", 2000, 40, 4, 100), row("E", 5000, 40, 4, 100, false), row("F", 5000, null, null, 100)], p);
    expect(r.map((x) => [x.campaign, x.status])).toEqual([["A", "win"], ["B", "not_win"], ["C", "win"], ["D", "insufficient_data"], ["E", "insufficient_data"], ["F", "insufficient_data"]]);
    expect(r.find((x) => x.campaign === "D")!.reasons).toEqual(["impressions"]);
    expect(r.find((x) => x.campaign === "E")!.reasons).toEqual(["sales_cycle"]); // thiếu 1 trên 5 đầu vào: độ tin cậy 0,8, vẫn đạt
    expect(r.find((x) => x.campaign === "F")!.reasons).toEqual(["contact_captured", "confidence"]);
  });

  test("T-WIN-02 từ file chiến dịch và báo cáo tuần; /budget hiện Win gate có nhãn Tạm; đổi ngưỡng trong config thì kết quả đổi", async () => {
    const db = freshDb();
    importAdReport(db, ["Campaign name,Ad name,Reporting starts,Reporting ends,Impressions,Link clicks,Amount spent (USD),Frequency", "C1,A,2026-11-02,2026-11-08,6000,100,50,1.5", "C2,B,2026-11-02,2026-11-08,4000,80,40,1.5"].join("\n"),
      { platform: "meta", weekStart: "2026-11-02", now: NOW, actor: "mark" });
    importCampaignCsv(db, ["campaign,platform,period_start,period_end,spend_usd,leads,closed_won,gross_margin_usd,sales_cycle_complete",
      "C1,meta,2026-11-01,2026-11-08,300,50,10,2000,true", "C2,meta,2026-11-01,2026-11-08,900,30,1,500,true"].join("\n"), { now: NOW, actor: "mark" });
    isolate();
    expect(buildWinGate(db, NOW).map((w) => [w.campaign, w.status])).toEqual([["C1", "win"], ["C2", "not_win"]]);
    isolate((j) => { j.win_gate.value.min_impressions = 5000; });
    expect(buildWinGate(db, NOW).map((w) => [w.campaign, w.status])).toEqual([["C1", "win"], ["C2", "insufficient_data"]]);
    isolate();
    const { app } = makeApp(db, { now: () => NOW });
    const page = await (await app.fetch(new Request(`${BASE}/budget`, { headers: { cookie: createSessionCookie(SECRET, { sub: "mark", csrf: "k", exp: Date.parse("2026-11-10T00:00:00Z") }) } }))).text();
    expect(page).toContain("Win gate (Mi1-mkt-01) (Tạm)");
    expect(page).toContain("<strong>Thắng</strong>");
  });
});
