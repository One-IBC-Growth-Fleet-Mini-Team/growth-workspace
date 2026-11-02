// T-WO-01 tới T-WO-08: WO tồn đọng của Bank Team (BK-08, D-25). Chỉ dữ liệu tổng hợp:
// số WO 0000100x, PIC là RM_A, RM_B, tên Account dùng canary để chứng minh không bao giờ vào DB.
import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { WO_PARAMS } from "../../src/config.ts";
import { importWorkOrders, normalizeWoNumber, parseWoDate, woImportMessage } from "../../src/crm/wo-import.ts";
import { buildWoBoard, recordWoTouch, reminderTexts } from "../../src/db/wo.ts";
import { woIdleDays, woStage } from "../../src/metrics/wo-idle.ts";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T02:00:00.000Z"); // 09:00 giờ Việt Nam
const at = (days: number) => new Date(T0.getTime() + days * DAY);
let db: Database;
beforeEach(() => {
  db = freshDb();
});

const WO_HEADER = "No.,Created Date,Status,Work Order Number,Account: Account Name,Account: Status,Product: Product Name,Total Profit";
function woCsv(rows: [string, string, string][]) {
  // [số WO, Status, ngày tạo dd/mm/yyyy]
  return [WO_HEADER, ...rows.map(([n, st, d], i) => `${i + 1},${d},${st},${n},CANARY_NAME_7f3a Ltd,Active,Bank - Hong Kong - Supporting Fee,899`)].join("\n");
}
const PIC_CSV = "Work Order Number,PIC Mới\n1001,RM_A\n1002.0,RM_B\n";

describe("T-WO-01 hàm wo_idle_days và ngưỡng", () => {
  test("T-WO-01 tính từ lượt nạp đầu của chuỗi cùng Status; Status đổi thì đếm lại; ghi nhận của Amy đặt lại đồng hồ", () => {
    const obs = [
      { at: at(0).toISOString(), status: "New" },
      { at: at(3).toISOString(), status: "In Progress" },
      { at: at(5).toISOString(), status: "in progress " },
    ];
    expect(woIdleDays({ observations: obs, lastTouchAt: null, now: at(10) })).toBe(7);
    expect(woIdleDays({ observations: obs.slice(0, 1), lastTouchAt: null, now: at(10) })).toBe(10);
    expect(woIdleDays({ observations: obs, lastTouchAt: at(8).toISOString(), now: at(10) })).toBe(2);
    // Ghi nhận cũ hơn mốc Status đổi không kéo lùi mốc.
    expect(woIdleDays({ observations: obs, lastTouchAt: at(1).toISOString(), now: at(10) })).toBe(7);
    expect(() => woIdleDays({ observations: [], lastTouchAt: null, now: T0 })).toThrow(RangeError);
  });

  test("T-WO-01 đếm theo ngày lịch giờ Việt Nam", () => {
    // 23:30 giờ VN ngày 01/11 tới 00:30 giờ VN ngày 02/11 là 1 ngày.
    const obs = [{ at: "2026-11-01T16:30:00.000Z", status: "New" }];
    expect(woIdleDays({ observations: obs, lastTouchAt: null, now: new Date("2026-11-01T17:30:00.000Z") })).toBe(1);
  });

  test("T-WO-01 ngưỡng tạm N = 7, M = 14; tham số sai bị từ chối", () => {
    expect(WO_PARAMS).toMatchObject({ remindAfterDays: 7, escalateAfterDays: 14 });
    expect([6, 7, 13, 14, 30].map((d) => woStage(d, WO_PARAMS))).toEqual(["ok", "remind", "remind", "escalate", "escalate"]);
    expect(() => woStage(1, { remindAfterDays: 10, escalateAfterDays: 5 })).toThrow(RangeError);
  });
});

describe("T-WO-02 nạp file Work Order và file PIC", () => {
  test("T-WO-02 chuẩn số WO về 8 chữ số; đọc ngày dd/mm/yyyy và yyyy-mm-dd; ngày sai thành trống", () => {
    expect(["1001", "00001001", "1001.0", " 1001 "].map(normalizeWoNumber)).toEqual(Array(4).fill("00001001"));
    expect(normalizeWoNumber("")).toBeNull();
    expect(parseWoDate("23/04/2025", "dd/mm/yyyy")).toBe("2025-04-23");
    expect(parseWoDate("4/23/2025", "mm/dd/yyyy")).toBe("2025-04-23");
    expect(parseWoDate("2025-04-23 10:00", undefined)).toBe("2025-04-23");
    expect(parseWoDate("không rõ", "dd/mm/yyyy")).toBeNull();
    expect(parseWoDate("31/13/2025", "dd/mm/yyyy")).toBeNull();
  });

  test("T-WO-02 nạp đủ hai file: đếm đúng, bỏ dòng trùng và dòng thiếu số WO, báo ô ngày lỗi", () => {
    const csv = woCsv([["1001", "In Progress", "23/04/2025"], ["1001", "New", "01/01/2025"], ["", "New", "01/01/2025"], ["1003", "Completed", "sai ngày"]]);
    const r = importWorkOrders(db, { WorkOrder: csv, WorkOrderPic: PIC_CSV }, { columns: {}, now: T0, actor: "amy" });
    expect(r).toMatchObject({ status: "succeeded", workOrders: 2, pics: 2, skipped: 2, badDates: 1 });
    expect(db.query("SELECT work_order_number, status, created_date FROM wo_rows ORDER BY work_order_number").all()).toEqual([
      { work_order_number: "00001001", status: "In Progress", created_date: "2025-04-23" },
      { work_order_number: "00001003", status: "Completed", created_date: null },
    ]);
    expect(woImportMessage(r)).toContain("Đã nạp 2 Work Order, 2 dòng PIC");
  });

  test("T-WO-03 tên Account và các cột ngoài allowlist không bao giờ vào DB", () => {
    importWorkOrders(db, { WorkOrder: woCsv([["1001", "New", "01/10/2026"]]) }, { columns: {}, now: T0, actor: "amy" });
    const bytes = new TextDecoder().decode(db.serialize()).toLowerCase();
    expect(bytes).not.toContain("canary_name_7f3a");
    expect(bytes).not.toContain("899");
  });

  test("T-WO-02 thiếu cột bắt buộc: không ghi gì, câu báo chỉ có tên cột", () => {
    const r = importWorkOrders(db, { WorkOrder: "Work Order Number,Account: Account Name\n1001,CANARY_NAME_7f3a\n" }, { columns: {}, now: T0, actor: "amy" });
    expect(r).toMatchObject({ status: "failed", errorCode: "CSV_MISSING_COLUMN", detail: "WorkOrder: Status" });
    expect(JSON.stringify(r)).not.toContain("CANARY");
    expect((db.query("SELECT COUNT(*) AS n FROM wo_imports").get() as { n: number }).n).toBe(0);
    expect(importWorkOrders(db, {}, { columns: {}, now: T0, actor: "amy" })).toMatchObject({ status: "failed", errorCode: "WO_FILE_REQUIRED" });
  });

  test("T-WO-02 bảng ghép riêng (crm-columns.json) đổi được tên cột", () => {
    const csv = "WO,Trạng thái\n1001,New\n";
    const r = importWorkOrders(db, { WorkOrder: csv }, { columns: { WorkOrder: { WorkOrderNumber: "WO", Status: "Trạng thái" } }, now: T0, actor: "amy" });
    expect(r).toMatchObject({ status: "succeeded", workOrders: 1 });
  });
});

describe("T-WO-04 bảng WO tồn đọng", () => {
  const imp = (days: number, rows: [string, string, string][], pics?: string) =>
    importWorkOrders(db, { WorkOrder: woCsv(rows), ...(pics ? { WorkOrderPic: pics } : {}) }, { columns: {}, now: at(days), actor: "amy" });

  test("T-WO-04 lượt nạp đầu: mọi WO bắt đầu từ 0 ngày; WO cũ chưa rà vào nhóm tồn từ trước, cũ nhất lên đầu", () => {
    imp(0, [["1001", "In Progress", "01/03/2025"], ["1002", "New", "01/01/2025"], ["1003", "Completed", "01/01/2025"]], PIC_CSV);
    const b = buildWoBoard(db, at(0));
    expect(b.escalate.length + b.remind.length).toBe(0);
    expect(b.backlog.map((r) => r.work_order_number)).toEqual(["00001002", "00001001"]);
    expect(b.backlog.map((r) => r.pic)).toEqual(["RM_B", "RM_A"]);
  });

  test("T-WO-04 sau 7 ngày không ai cập nhật thì nhắc PIC, sau 14 ngày thì báo Amy; Status đổi thì đếm lại", () => {
    imp(0, [["1001", "In Progress", "01/03/2025"], ["1002", "New", "01/01/2025"]], PIC_CSV);
    imp(7, [["1001", "In Progress", "01/03/2025"], ["1002", "In Progress", "01/01/2025"], ["1004", "New", "08/11/2026"]]);
    let b = buildWoBoard(db, at(7));
    expect(b.remind.map((r) => [r.work_order_number, r.idle_days])).toEqual([["00001001", 7]]);
    expect(b.okCount).toBe(2); // 1002 vừa đổi Status, 1004 mới xuất hiện
    expect(b.backlog.length).toBe(0); // 1002 đã đổi Status nên không còn là "chưa rà"
    b = buildWoBoard(db, at(14));
    expect(b.escalate.map((r) => r.work_order_number)).toEqual(["00001001"]);
    expect(b.remind.map((r) => r.work_order_number)).toEqual(["00001002", "00001004"]);
  });

  test("T-WO-05 Amy ghi nhận 'đã cập nhật' kèm đang chờ ai: đồng hồ đếm lại, lý do hiện trên bảng", () => {
    imp(0, [["1001", "In Progress", "01/03/2025"]], PIC_CSV);
    expect(recordWoTouch(db, { workOrderNumber: "00001001", reason: "waiting_bank", actor: "amy", now: at(10) })).toEqual({ ok: true });
    const b = buildWoBoard(db, at(12));
    expect(b.escalate.length + b.remind.length + b.backlog.length).toBe(0);
    expect(b.okCount).toBe(1);
    expect(buildWoBoard(db, at(17)).remind[0]).toMatchObject({ work_order_number: "00001001", idle_days: 7, last_reason: "waiting_bank" });
    expect(recordWoTouch(db, { workOrderNumber: "00001001", reason: "tu_che", actor: "amy", now: at(10) })).toMatchObject({ ok: false, status: 422 });
    expect(recordWoTouch(db, { workOrderNumber: "00009999", reason: "waiting_bank", actor: "amy", now: at(10) })).toMatchObject({ ok: false, status: 404 });
  });

  test("T-WO-05 PIC lấy từ lượt nạp file PIC mới nhất; WO chưa có PIC vẫn hiện, ghi rõ", () => {
    imp(0, [["1001", "New", "01/03/2025"], ["1005", "New", "01/03/2025"]], PIC_CSV);
    importWorkOrders(db, { WorkOrderPic: "Work Order Number,PIC Mới\n1001,RM_B\n" }, { columns: {}, now: at(1), actor: "amy" });
    const b = buildWoBoard(db, at(8));
    expect(b.remind.map((r) => [r.work_order_number, r.pic])).toEqual([["00001001", "RM_B"], ["00001005", null]]);
    const texts = reminderTexts(b.remind);
    expect(texts.map((t) => t.pic)).toEqual(["RM_B", "Chưa có PIC"]);
    expect(texts[0]!.text).toContain("WO 00001001 (New, 8 ngày)");
  });

  test("T-WO-06 bảng chỉ thêm: không sửa, không xoá được", () => {
    imp(0, [["1001", "New", "01/03/2025"]], PIC_CSV);
    recordWoTouch(db, { workOrderNumber: "00001001", reason: "waiting_client", actor: "amy", now: at(1) });
    for (const t of ["wo_imports", "wo_rows", "wo_pics", "wo_touches"]) {
      expect(() => db.run(`DELETE FROM ${t}`)).toThrow(`append_only:${t}`);
    }
    expect(() => db.run("UPDATE wo_rows SET status = 'Completed'")).toThrow("append_only:wo_rows");
  });
});

describe("T-WO-07 trang /wo và nạp qua /import", () => {
  const woImport = (d: Database) => async (files: { WorkOrder?: string; WorkOrderPic?: string }, actor: string) => {
    const r = importWorkOrders(d, files, { columns: {}, now: T0, actor });
    return { ok: r.status === "succeeded", message: woImportMessage(r) };
  };

  test("T-WO-07 chỉ có file WO thì không chạy nhóm NBA; người nạp lấy từ phiên", async () => {
    const crmCalls: number[] = [];
    const { app } = makeApp(db, { onImport: async () => { crmCalls.push(1); return { ok: true, message: "NBA" }; }, onWoImport: woImport(db) });
    const s = session(AMY);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("workorder", new File([woCsv([["1001", "New", "01/03/2025"]])], "wo.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/import`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Đã nạp 1 Work Order");
    expect(crmCalls.length).toBe(0);
    expect(db.query("SELECT actor FROM wo_imports").get()).toEqual({ actor: "amy" });
  });

  test("T-WO-08 Amy xem và ghi nhận được, có CSRF; Mark chỉ xem; trang không có tên Account", async () => {
    importWorkOrders(db, { WorkOrder: woCsv([["1001", "New", "01/03/2025"]]), WorkOrderPic: PIC_CSV }, { columns: {}, now: at(-8), actor: "amy" });
    const { app } = makeApp(db, { onWoImport: woImport(db) }); // giờ của app là T0
    const s = session(AMY);
    const page = await (await get(app, "/wo", s.cookie)).text();
    expect(page).toContain("Nhắc PIC: từ 7 ngày (1)");
    expect(page).toContain("00001001");
    expect(page).toContain("Đã cập nhật");
    expect(page).not.toContain("CANARY");
    expect((await post(app, "/wo/touch", { csrf: "sai", wo: "00001001", reason: "waiting_client" }, s.cookie)).status).toBe(403);
    expect((await post(app, "/wo/touch", { csrf: s.csrf, wo: "00001001", reason: "waiting_client" }, s.cookie)).status).toBe(303);
    expect(await (await get(app, "/wo", s.cookie)).text()).toContain("còn trong hạn: 1");
    const m = session(MARK);
    const markPage = await (await get(app, "/wo", m.cookie)).text();
    expect(markPage).toContain("WO tồn đọng của Bank Team");
    expect(markPage).not.toContain('action="/wo/touch"');
    expect((await post(app, "/wo/touch", { csrf: m.csrf, wo: "00001001", reason: "waiting_client" }, m.cookie)).status).toBe(403);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/wo"');
  });

  test("T-WO-08 chưa bật WO thì /wo không có", async () => {
    const { app } = makeApp(db);
    expect((await get(app, "/wo", session(AMY).cookie)).status).toBe(404);
  });
});
