// T-3B-01, T-3B-02: tầng 3B trang đích (spec mục 8; D-68). Ngưỡng tạm từ config/provisional.json; đổi config thì kết quả đổi.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importEvents } from "../../src/crm/event-import.ts";
import { tier3bWindow } from "../../src/db/data01.ts";
import { tier3bCheck } from "../../src/metrics/tier3b.ts";
import { buildTaskDrafts } from "../../src/mi1/task-drafts.ts";
import { getProvisional, setProvisionalPaths } from "../../src/provisional.ts";
import { freshDb } from "../helpers/db.ts";

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

// 300 asset_view (mỗi phiên một), asks ask_occ_started, 82 contact_captured có contact_id (2 trong 300 phiên trên,
// 80 phiên riêng) để độ phủ ID 82/380 = 21,6%, trên 19%: tracking không gãy.
function events(asks: number) {
  const rows = ["event_id,event_name,event_time,source,anonymous_id,session_id,contact_id"];
  for (let i = 0; i < 300; i++) rows.push(`v${i},asset_view,2026-11-08T01:00:00Z,web,a,s${i},`);
  for (let i = 0; i < asks; i++) rows.push(`q${i},ask_occ_started,2026-11-08T01:05:00Z,web,a,s${i},`);
  for (let i = 0; i < 82; i++) rows.push(`c${i},contact_captured,2026-11-08T01:10:00Z,web,a,s${i < 2 ? i : 1000 + i},ct${i}`);
  return rows.join("\n");
}

describe("T-3B tầng 3B", () => {
  test("T-3B-01 hàm: bỏ qua khi tracking gãy; thiếu mẫu; cờ theo hai tỷ lệ", () => {
    const p = getProvisional("tier3b").value;
    expect(tier3bCheck({ assetView: 500, askStarted: 1, contactCaptured: 0, trackingDegraded: true }, p).status).toBe("skipped_tracking_degraded");
    expect(tier3bCheck({ assetView: 299, askStarted: 0, contactCaptured: 0, trackingDegraded: false }, p).status).toBe("insufficient_data");
    expect(tier3bCheck({ assetView: 300, askStarted: 5, contactCaptured: 2, trackingDegraded: false }, p)).toMatchObject({ status: "flag", reasons: ["ask_per_view"] });
    expect(tier3bCheck({ assetView: 300, askStarted: 30, contactCaptured: 3, trackingDegraded: false }, p)).toMatchObject({ status: "flag", reasons: ["contact_per_ask"] });
    expect(tier3bCheck({ assetView: 300, askStarted: 30, contactCaptured: 10, trackingDegraded: false }, p).status).toBe("ok");
  });

  test("T-3B-02 từ file sự kiện: cờ và nháp việc MKT có nhãn Tạm; đổi ngưỡng trong config thì hết cờ", () => {
    const db = freshDb();
    importEvents(db, events(5), { now: NOW, actor: "mark" });
    isolate();
    expect(tier3bWindow(db, NOW)).toMatchObject({ status: "flag", assetView: 300 });
    expect(buildTaskDrafts(db, NOW).find((d) => d.key === "tier3b_landing")!.title).toContain("dưới ngưỡng (Tạm)");
    isolate((j) => { j.tier3b.value.ask_per_view_below = 0.01; j.tier3b.value.contact_per_ask_below = 0.1; });
    expect(tier3bWindow(db, NOW).status).toBe("ok");
    isolate((j) => { j.tier3b.value.min_asset_view_per_week = 1000; });
    expect(tier3bWindow(db, NOW).status).toBe("insufficient_data");
  });
});
