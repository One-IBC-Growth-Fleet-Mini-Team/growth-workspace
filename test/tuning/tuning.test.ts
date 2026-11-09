// T-TUNE-01 tới T-TUNE-03: chỉ Mark đổi ngưỡng 0,8 và trọng số chấm Hook; thay đổi chỉ có hiệu lực sau khi bộ eval
// chạy lại và pass (spec mục 6 "Quyền chỉnh ngưỡng"; D-53). Ngưỡng tiền và gửi ra ngoài không có trong danh sách.
import { describe, expect, test } from "bun:test";
import { activateTuning, currentTuning, proposeTuning } from "../../src/db/tuning.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, get, makeApp, MARK, post, seedItem, session } from "../helpers/queue.ts";

const T0 = new Date("2026-11-09T02:00:00Z");
const by = (actor: string, now = T0) => ({ now, actor });
const PASSED_AFTER = { ranAt: "2026-11-09T03:00:00Z", passed: true };

describe("T-TUNE ngưỡng và trọng số", () => {
  test("T-TUNE-01 đề xuất: chỉ Mark; chỉ hai tham số; giá trị hợp lệ", () => {
    const db = freshDb();
    expect(currentTuning(db)).toEqual({ confidenceEscalateBelow: 0.8, hookWeights: [25, 25, 20, 15, 15] });
    expect(proposeTuning(db, "confidence_escalate_below", "0.7", by("amy"))).toEqual({ status: "refused", errorCode: "ONLY_MARK" });
    expect(proposeTuning(db, "money_threshold", "1", by("mark"))).toEqual({ status: "refused", errorCode: "PARAM_NOT_TUNABLE" });
    expect(proposeTuning(db, "confidence_escalate_below", "1.5", by("mark"))).toEqual({ status: "refused", errorCode: "VALUE_INVALID" });
    expect(proposeTuning(db, "hook_weights", "30,30,20,10,5", by("mark"))).toEqual({ status: "refused", errorCode: "VALUE_INVALID" }); // tổng 95
    expect(proposeTuning(db, "hook_weights", "30,30,20,10,10", by("mark")).status).toBe("ok");
  });

  test("T-TUNE-02 kích hoạt: cần eval chạy sau lúc đề xuất và pass; chỉ Mark; bảng chỉ thêm", () => {
    const db = freshDb();
    const p = proposeTuning(db, "confidence_escalate_below", "0.7", by("mark"));
    if (p.status !== "ok") throw new Error("propose");
    expect(activateTuning(db, p.id, { ranAt: "2026-11-09T01:00:00Z", passed: true }, by("mark"))).toBe("EVAL_NOT_RERUN");
    expect(activateTuning(db, p.id, { ranAt: null, passed: false }, by("mark"))).toBe("EVAL_NOT_RERUN");
    expect(activateTuning(db, p.id, { ranAt: "2026-11-09T03:00:00Z", passed: false }, by("mark"))).toBe("EVAL_FAILED");
    expect(activateTuning(db, p.id, PASSED_AFTER, by("amy"))).toBe("ONLY_MARK");
    expect(currentTuning(db).confidenceEscalateBelow).toBe(0.8);
    expect(activateTuning(db, p.id, PASSED_AFTER, by("mark", new Date("2026-11-09T04:00:00Z")))).toBe("ok");
    expect(activateTuning(db, p.id, PASSED_AFTER, by("mark"))).toBe("ALREADY_ACTIVE");
    expect(currentTuning(db).confidenceEscalateBelow).toBe(0.7);
    expect(() => db.run("DELETE FROM tuning_changes")).toThrow("append_only:tuning_changes");
  });

  test("T-TUNE-03 Hàng chờ dùng ngưỡng đang hiệu lực; trang /tuning chỉ Mark có form; Hàng chờ có link", async () => {
    const db = freshDb();
    const id = seedItem(db, { confidence: 0.75 });
    const p = proposeTuning(db, "confidence_escalate_below", "0.7", by("mark"));
    if (p.status !== "ok") throw new Error("propose");
    activateTuning(db, p.id, PASSED_AFTER, by("mark"));
    const { app } = makeApp(db, { evalRun: () => PASSED_AFTER });
    const a = session(AMY);
    expect(await (await get(app, "/queue?date=2026-11-02", a.cookie)).text()).not.toContain("Escalate lên Mark");
    expect((await post(app, `/queue/items/${id}/escalate`, { csrf: a.csrf }, a.cookie)).status).toBe(422);
    const m = session(MARK);
    const page = await (await get(app, "/tuning", m.cookie)).text();
    expect(page).toContain("Ngưỡng escalate đang dùng: 0.7");
    expect(page).toContain('action="/tuning"');
    expect(await (await get(app, "/tuning", a.cookie)).text()).not.toContain('action="/tuning"');
    expect((await post(app, "/tuning", { csrf: a.csrf, op: "propose", param: "confidence_escalate_below", value: "0.6" }, a.cookie)).status).toBe(403);
    expect((await post(app, "/tuning", { csrf: m.csrf, op: "propose", param: "confidence_escalate_below", value: "0.6" }, m.cookie)).status).toBe(200);
    expect(await (await get(app, "/queue", a.cookie)).text()).toContain('href="/tuning"');
    const w = proposeTuning(db, "hook_weights", "30,30,20,10,10", by("mark"));
    if (w.status !== "ok") throw new Error("propose");
    activateTuning(db, w.id, { ranAt: "2026-11-10T00:00:00Z", passed: true }, by("mark"));
    expect(await (await get(app, "/hooks", m.cookie)).text()).toContain("Tiêu chí 1 30%"); // trang Hook hiện trọng số đang hiệu lực
  });
});
