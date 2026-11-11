// T-APPB-01 tới T-APPB-02: bảng sẵn sàng Phụ lục B (D-94). Không xây mục nào; chỉ đo tiến độ tới điều kiện bật theo spec.
import { describe, expect, test } from "bun:test";
import { buildAppendixB } from "../../src/fleet/appendix-b.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, seedItem, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T03:00:00Z"); // thứ Hai
const ev = (db: ReturnType<typeof freshDb>, item: string | null, action: string, at: string) =>
  db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, 'amy', ?, NULL, ?)", [Bun.randomUUIDv7(), item, action, at]);

describe("T-APPB sẵn sàng Phụ lục B", () => {
  test("T-APPB-01 DB trống: 5 hạng mục, không mục nào đủ điều kiện, tiến độ ghi bằng số", () => {
    const rows = buildAppendixB(freshDb(), NOW);
    expect(rows.map((r) => r.item)).toEqual(["Lệnh /steer và User_Activities_Log", "Sentinel-01 (kiểm toán độc lập)", "Monte-Carlo ngân sách", "owned-channel-mcp (CRON-10)", "cross-audit-mcp (CRON-11)"]);
    expect(rows.every((r) => !r.ready)).toBe(true);
    expect(rows[0]!.progress).toBe("Hàng chờ chạy ổn (đạt Cổng 2 liên tiếp): 0/4 tuần");
    expect(rows[1]!.progress).toBe("Quyết định trong Hàng chờ: 0/50");
    expect(rows[2]!.progress).toContain("Cổng 3: chưa");
  });

  test("T-APPB-02 đủ 4 tuần Cổng 2 và 50 quyết định thì /steer, Sentinel-01, cross-audit đủ điều kiện; Mark thấy bảng, Amy không", async () => {
    const db = freshDb();
    for (const w of ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]) {
      for (let d = 0; d < 3; d++) ev(db, null, "queue_opened", `${w.slice(0, 8)}${String(Number(w.slice(8)) + d).padStart(2, "0")}T02:00:00Z`);
      for (let k = 0; k < 13; k++) { const id = seedItem(db, { queue_date: w }); ev(db, id, "confirm", `${w}T03:00:00Z`); }
    }
    const rows = buildAppendixB(db, NOW);
    expect(rows[0]).toMatchObject({ ready: true, progress: "Hàng chờ chạy ổn (đạt Cổng 2 liên tiếp): 4/4 tuần" });
    expect(rows[1]).toMatchObject({ ready: true, progress: "Quyết định trong Hàng chờ: 50/50" });
    expect(rows[4]!.ready).toBe(true);
    expect(rows[3]!.ready).toBe(false);
    const { app } = makeApp(db);
    const mark = await (await get(app, "/command", session({ id: "mark", role: "viewer" }).cookie)).text();
    expect(mark).toContain("Sẵn sàng Phụ lục B");
    expect(mark).toContain("Quyết định trong Hàng chờ: 50/50");
    expect(await (await get(app, "/command", session({ id: "amy", role: "approver" }).cookie)).text()).not.toContain("Sẵn sàng Phụ lục B");
  });
});
