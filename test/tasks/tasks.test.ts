// T-TASK-01, T-TASK-02: nháp việc cho Jira MKT và ticket MobCEC (spec mục 9 create_jira_mkt_task DRAFT_ONLY, mục 8; D-60).
// Code soạn nháp từ tình trạng hiện tại; không gửi đi đâu, người tự tạo trên Jira.
import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { importEvents } from "../../src/crm/event-import.ts";
import { importSandboxLog } from "../../src/crm/sandbox-import.ts";
import { buildTaskDrafts } from "../../src/mi1/task-drafts.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET, seedItem } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const EVENTS = ["event_id,event_name,event_time,source,anonymous_id,session_id,contact_id",
  "e1,asset_view,2026-11-08T01:00:00Z,web,a,s1,", "e2,asset_view,2026-11-08T02:00:00Z,web,a,s2,", "e3,asset_view,2026-11-09T01:00:00Z,web,a,s3,"].join("\n");
const BUGS = ["Bug ID,Mức độ,Tiêu chí,Test case,Tiêu đề lỗi,Vị trí / URL,Bước tái hiện,Kết quả mong đợi,Kết quả thực tế,Ảnh chụp,Trạng thái,Người xử lý,Ngày phát hiện,Ghi chú Dev",
  "BUG-001,High,Function,TC-1,Trang trả 404,https://sandbox.example.invalid/a,b,c,d,,Open,x,24/10/2026,"].join("\n");

function reasons(db: Database, n: number) {
  for (let i = 0; i < n; i++) {
    const id = seedItem(db, { item_type: "reason_code", queue_date: "2026-11-0" + (2 + i), payload: JSON.stringify({ proposal: { primary: "EXPECTATION_MISMATCH" } }) });
    db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, 'amy', 'confirm', NULL, ?)", [Bun.randomUUIDv7(), id, `2026-11-0${2 + i}T03:00:00Z`]);
  }
}

describe("T-TASK nháp việc", () => {
  test("T-TASK-01 tracking gãy thì nháp ticket MobCEC; sandbox còn bug High thì nháp; lý do lặp thì nháp việc MKT; không có gì thì rỗng", () => {
    expect(buildTaskDrafts(freshDb(), NOW)).toEqual([]);
    const db = freshDb();
    importEvents(db, EVENTS, { now: NOW, actor: "mark" });
    importSandboxLog(db, { bugs: BUGS }, { now: NOW, actor: "mark" });
    reasons(db, 3);
    const d = buildTaskDrafts(db, NOW);
    expect(d.map((x) => [x.key, x.project, x.evidence])).toEqual([
      ["tracking_degraded", "MobCEC", "/data"],
      ["sandbox_not_ready", "MobCEC", "/jurisdictions"],
      ["tier4_EXPECTATION_MISMATCH", "MKT", "/creative"],
    ]);
    expect(d[0]!.title).toBe("TRACKING_DEGRADED: độ phủ ID 7 ngày 0.0% (0/3 phiên), dưới 19%");
    expect(d[0]!.body).toContain("Không tắt quảng cáo");
    expect(d[2]!.title).toBe("Sửa câu 2 tới 3 của copy: lý do từ chối EXPECTATION_MISMATCH lặp 3 lần trong 28 ngày (Tạm)");
  });

  test("T-TASK-02 trang /tasks hiện nháp để chép, không có form gửi; Hàng chờ có link", async () => {
    const db = freshDb();
    importEvents(db, EVENTS, { now: NOW, actor: "mark" });
    const { app } = makeApp(db, { now: () => NOW });
    const c = createSessionCookie(SECRET, { sub: "mark", csrf: "k", exp: Date.parse("2026-11-10T00:00:00Z") });
    const page = await (await app.fetch(new Request(`${BASE}/tasks`, { headers: { cookie: c } }))).text();
    expect(page).toContain("TRACKING_DEGRADED");
    // Chỉ có nút Đăng xuất của thanh điều hướng; không có form gửi nháp đi đâu.
    expect(page.replace(/<form method="post" action="\/logout"[\s\S]*?<\/form>/, "")).not.toContain("<form");
    expect(await (await app.fetch(new Request(`${BASE}/queue`, { headers: { cookie: c } }))).text()).toContain('href="/tasks"');
  });
});
