// T-CH-01 tới T-CH-04: sức khoẻ tài khoản kênh (CRON-02: 3 BM, 3 số WA, 6 Fanpage; D-37). Nhập tay, dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { buildChannelBoard, recordChannelCheck } from "../../src/db/channels.ts";
import { channelSummary } from "../../src/metrics/channel-health.ts";
import { buildBrief } from "../../src/mi1/core.ts";
import { renderBriefPage } from "../../src/queue/views/page.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const T = (h: string) => new Date(`2026-11-02T${h}:00Z`);
const P = { expected: { bm: 3, wa: 3, fanpage: 6 }, staleHours: 24 };

function load() {
  const db = freshDb();
  recordChannelCheck(db, { kind: "bm", label: "BM Group", status: "ok", note: "" }, { now: T("01:00"), actor: "mark" });
  recordChannelCheck(db, { kind: "bm", label: "BM HK", status: "restricted", note: "Đang review, gọi canary.ops@example.com" }, { now: T("01:00"), actor: "mark" });
  recordChannelCheck(db, { kind: "wa", label: "WA SG 1", status: "disabled", note: "" }, { now: T("01:00"), actor: "mark" });
  recordChannelCheck(db, { kind: "wa", label: "WA SG 1", status: "ok", note: "Đã mở lại" }, { now: T("02:00"), actor: "mark" }); // lần kiểm mới thắng
  recordChannelCheck(db, { kind: "fanpage", label: "Page VN", status: "ok", note: "" }, { now: new Date("2026-10-30T01:00:00Z"), actor: "mark" }); // cũ hơn 24 giờ
  return db;
}

describe("T-CH sức khoẻ tài khoản kênh", () => {
  test("T-CH-01 hàm: lần kiểm mới nhất của mỗi tài khoản; vấn đề, quá hạn kiểm, còn thiếu so với spec", () => {
    const s = channelSummary([
      { kind: "bm", label: "A", status: "ok", checkedAt: "2026-11-02T01:00:00Z" },
      { kind: "bm", label: "B", status: "restricted", checkedAt: "2026-11-02T01:00:00Z" },
      { kind: "fanpage", label: "P", status: "ok", checkedAt: "2026-10-30T01:00:00Z" },
    ], T("02:00"), P);
    expect(s.ok).toBe(2);
    expect(s.issues.map((x) => x.label)).toEqual(["B"]);
    expect(s.stale.map((x) => x.label)).toEqual(["P"]);
    expect(s.notTracked).toEqual({ bm: 1, wa: 3, fanpage: 5 });
  });

  test("T-CH-02 bảng: lần kiểm mới thắng; ghi chú qua lọc PII; bảng chỉ thêm; giá trị không hợp lệ bị từ chối", () => {
    const db = load();
    const b = buildChannelBoard(db, T("03:00"), P);
    expect(b.accounts.map((a) => [a.kind, a.label, a.status])).toEqual([["bm", "BM Group", "ok"], ["bm", "BM HK", "restricted"], ["wa", "WA SG 1", "ok"], ["fanpage", "Page VN", "ok"]]);
    expect(b.summary.issues.map((x) => x.label)).toEqual(["BM HK"]);
    expect(b.summary.stale.map((x) => x.label)).toEqual(["Page VN"]);
    expect(new TextDecoder().decode(db.serialize())).not.toContain("canary.ops");
    expect(() => db.run("DELETE FROM channel_checks")).toThrow("append_only:channel_checks");
    expect(recordChannelCheck(db, { kind: "tiktok", label: "x", status: "ok", note: "" }, { now: T("03:00"), actor: "mark" })).toBe("CHANNEL_INVALID");
    expect(recordChannelCheck(db, { kind: "bm", label: " ", status: "ok", note: "" }, { now: T("03:00"), actor: "mark" })).toBe("CHANNEL_INVALID");
  });

  test("T-CH-03 Brief sáng có dòng CRON-02", () => {
    expect(renderBriefPage(buildBrief(load(), T("03:00")))).toContain("Tài khoản kênh (CRON-02): 3 ổn, 1 có vấn đề (BM HK), 1 quá 24 giờ chưa kiểm, 8 tài khoản chưa theo dõi");
    expect(renderBriefPage(buildBrief(freshDb(), T("03:00")))).toContain("Tài khoản kênh (CRON-02): chưa có lần kiểm nào");
  });

  test("T-CH-04 trang /channels: Mark và Amy ghi được có CSRF; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    for (const who of [MARK, AMY]) {
      const s = session(who);
      const res = await post(app, "/channels", { csrf: s.csrf, kind: "wa", label: "WA SG 2", status: "restricted", note: "chờ Meta" }, s.cookie);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Đã ghi lần kiểm WA SG 2.");
    }
    expect((await post(app, "/channels", { csrf: "sai", kind: "wa", label: "x", status: "ok" }, session(AMY).cookie)).status).toBe(403);
    expect((await post(app, "/channels", { csrf: session(AMY).csrf, kind: "wa", label: "", status: "ok" }, session(AMY).cookie)).status).toBe(422);
    expect(await (await get(app, "/channels", session(MARK).cookie)).text()).toContain("WA SG 2");
    expect(await (await get(app, "/queue", session(AMY).cookie)).text()).toContain('href="/channels"');
  });
});
