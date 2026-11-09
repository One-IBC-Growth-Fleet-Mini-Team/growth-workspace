// T-SCH-01, T-SCH-02: nháp lịch kênh (spec mục 9 schedule_channel_post DRAFT_ONLY; D-70). Nhịp đăng theo kênh từ config.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { buildScheduleDraft } from "../../src/creative/factory.ts";
import { draftSchedule } from "../../src/metrics/channel-schedule.ts";
import { setProvisionalPaths } from "../../src/provisional.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T02:00:00Z"); // thứ Hai 09/11; tuần nháp bắt đầu 16/11
const REPO = new URL("../../config/provisional.json", import.meta.url).pathname;
function isolate(edit?: (j: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "prov-"));
  const j = JSON.parse(readFileSync(REPO, "utf8"));
  edit?.(j);
  writeFileSync(join(dir, "p.json"), JSON.stringify(j));
  setProvisionalPaths({ file: join(dir, "p.json"), overrides: join(dir, "o.jsonl") });
}
afterEach(() => isolate());

// Storyboard với trạng thái cho trước, ghi thẳng vào các bảng chỉ thêm như luồng thật.
function storyboard(db: Database, id: string, o: { decision?: "approve" | "reject"; qa?: string; exported?: boolean; jurisdiction?: string | null }) {
  db.run("INSERT INTO storyboards (creative_ir_id, hook_id, jurisdiction, title, scenes, created_at, actor) VALUES (?, ?, ?, 't', '[\"s\"]', '2026-11-08T01:00:00Z', 'mark')", [id, `H-${id}`, o.jurisdiction ?? null]);
  if (o.decision) db.run("INSERT INTO storyboard_decisions (id, creative_ir_id, decision, note, decided_at, actor) VALUES (?, ?, ?, NULL, '2026-11-08T02:00:00Z', 'mark')", [Bun.randomUUIDv7(), id, o.decision]);
  if (o.qa) db.run("INSERT INTO creative_runs (id, creative_ir_id, run_at, actor, qa_status, assets) VALUES (?, ?, '2026-11-08T03:00:00Z', 'mark', ?, 26)", [Bun.randomUUIDv7(), id, o.qa]);
  if (o.exported) db.run("INSERT INTO creative_exports (id, creative_ir_id, package_id, bundles, exported_at, actor) VALUES (?, ?, 'P', '[]', '2026-11-08T04:00:00Z', 'mark')", [Bun.randomUUIDv7(), id]);
}

describe("T-SCH nháp lịch kênh", () => {
  test("T-SCH-01 hàm: rải đều trong tuần, xoay vòng Creative; không có Creative thì rỗng", () => {
    const s = draftSchedule([{ creativeIrId: "A", hookId: null, jurisdiction: null }, { creativeIrId: "B", hookId: null, jurisdiction: null }], { youtube: 1, meta_feed: 3 }, "2026-11-16");
    expect(s.map((x) => [x.date, x.channel, x.creativeIrId])).toEqual([
      ["2026-11-16", "meta_feed", "A"], ["2026-11-16", "youtube", "B"], ["2026-11-18", "meta_feed", "B"], ["2026-11-20", "meta_feed", "A"],
    ]);
    expect(draftSchedule([], { meta_feed: 3 }, "2026-11-16")).toEqual([]);
  });

  test("T-SCH-02 chỉ Creative đã duyệt, QA PASS, đã đóng gói, tài phán đã chốt giá; đổi nhịp trong config thì lịch đổi", () => {
    const db = freshDb();
    storyboard(db, "OK", { decision: "approve", qa: "PASS", exported: true });
    storyboard(db, "REJ", { decision: "reject", qa: "PASS", exported: true });
    storyboard(db, "FAIL", { decision: "approve", qa: "FAIL", exported: true });
    storyboard(db, "NOEXP", { decision: "approve", qa: "PASS" });
    storyboard(db, "HOLD", { decision: "approve", qa: "PASS", exported: true, jurisdiction: "Gamma" }); // chưa có giá: giữ lại
    isolate();
    const d = buildScheduleDraft(db, NOW);
    expect(d.weekStart).toBe("2026-11-16");
    expect(d.slots).toHaveLength(10); // 3 + 3 + 3 + 1
    expect(new Set(d.slots.map((x) => x.creativeIrId))).toEqual(new Set(["OK"]));
    isolate((j) => { j.channel_schedule.value.posts_per_week = { meta_feed: 2 }; });
    expect(buildScheduleDraft(db, NOW).slots.map((x) => [x.date, x.channel])).toEqual([["2026-11-16", "meta_feed"], ["2026-11-19", "meta_feed"]]);
  });
});
