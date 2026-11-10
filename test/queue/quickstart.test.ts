// Chạy thật sớm (02/11/2026): thẻ dễ đọc, dán tự báo thay Graph, đăng nhập bằng mật khẩu thay Entra.
import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, events, get, makeApp, post, seedItem, session } from "../helpers/queue.ts";
import { splitPastedThread } from "../../src/teams/paste-report.ts";

let db: Database;
beforeEach(() => {
  db = freshDb();
});

describe("Thẻ dễ đọc", () => {
  test("T-Q-08 (giao diện) tự báo hiện thành bảng chữ, không phải JSON thô; dữ liệu kỹ thuật nằm trong phần thu gọn", async () => {
    const { app } = makeApp(db);
    seedItem(db, {
      item_type: "self_report",
      payload: JSON.stringify({
        status: "ok", report_date: "2026-10-31", rm_id: "RM_A", source_link: "https://teams.example.invalid/m/1",
        sections: {
          outreach: { count: 12, channels: [], note: "12 lead qua LinkedIn" }, posts: null, conversations: { count: 4, note: "4" },
          quotes: [{ jurisdiction_code: "WS", service_family: "IBC01", status: "sent" }],
          customer_said: [{ customer_ref: "KHACH_1", quote_vi: "Khách chê giá cao", quote_original: "Cost wise its expensive" }],
          not_in_crm: null, needs_support: [{ topic: "hỗ trợ", note: "cần bảng so sánh phí" }],
        },
        flags: [],
      }),
    });
    const html = await (await get(app, "/queue?date=2026-11-02", session(AMY).cookie)).text();
    const visible = html.replace(/<details class="tech">[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Tiếp cận");
    expect(visible).toContain("12");
    expect(visible).toContain("Cost wise its expensive");
    expect(visible).toContain("cần bảng so sánh phí");
    expect(visible).toContain("RM_A");
    expect(visible).not.toContain('"outreach"');
    expect(html).toContain('<details class="tech">');
  });

  test("T-Q-08 (giao diện) mã lý do hiện nghĩa tiếng Việt; NBA hiện câu giải thích; nội dung vẫn được escape", async () => {
    const { app } = makeApp(db);
    seedItem(db, { item_type: "reason_code", payload: JSON.stringify({ rm_id: "RM_A", proposal: { customer_ref: "KHACH_1", primary: "PRICE_TOO_HIGH", is_final: true, evidence_quote: "<b>đắt</b>" } }) });
    seedItem(db, { payload: JSON.stringify({ action: "follow_up", subject_ref: "O1", owner_rm_id: "RM_B", explanation: "RM theo tiếp deal <script>x</script>", warnings: ["có thể trùng khách với RM_A"], stage: "Quotation", close_date: "2026-11-20" }) });
    const html = await (await get(app, "/queue?date=2026-11-02", session(AMY).cookie)).text();
    const visible = html.replace(/<details class="tech">[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Khách chê giá cao so với kỳ vọng");
    expect(visible).toContain("RM theo tiếp deal");
    expect(visible).toContain("có thể trùng khách với RM_A");
    expect(visible).toContain("2026-11-20");
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain("<b>đắt");
  });
});

describe("Dán tự báo", () => {
  const directory = [
    { rm_id: "RM_A", display_name: "RM_A", teams_user_id: null, active: 1 },
    { rm_id: "RM_B", display_name: "Tên RM B", teams_user_id: null, active: 1 },
  ];

  test("T-PARSE-01 (dán) tách thread dán thành từng bản tự báo theo dòng tiêu đề; RM map theo tên trong danh bạ", () => {
    const text = [
      "Một dòng rác do Teams chép kèm",
      "[31/10] [RM] RM_A",
      "TIẾP CẬN: 5",
      "[31/10] [RM] tên rm b",
      "HỘI THOẠI: 2",
      "[31/10] [RM] Người Lạ",
      "BÁO GIÁ: 1",
    ].join("\n");
    const r = splitPastedThread(text, "2026-10-31", directory);
    expect(r.reports.map((x) => x.rmId)).toEqual(["RM_A", "RM_B", null]);
    expect(r.reports[0]!.message.content).toBe("[31/10] [RM] RM_A\nTIẾP CẬN: 5");
    expect(new Set(r.reports.map((x) => x.message.messageId)).size).toBe(3);
  });

  test("T-PARSE-05 (dán) dán lại y hệt cho cùng mã và phiên bản; sửa nội dung thì phiên bản mới", () => {
    const a = splitPastedThread("[31/10] [RM] RM_A\nTIẾP CẬN: 5", "2026-10-31", directory).reports[0]!;
    const b = splitPastedThread("[31/10] [RM] RM_A\nTIẾP CẬN: 5", "2026-10-31", directory).reports[0]!;
    const c = splitPastedThread("[31/10] [RM] RM_A\nTIẾP CẬN: 6", "2026-10-31", directory).reports[0]!;
    expect(a.message.messageId).toBe(b.message.messageId);
    expect(a.message.lastModifiedAt).toBe(b.message.lastModifiedAt);
    expect(c.message.messageId).toBe(a.message.messageId);
    expect(c.message.lastModifiedAt).not.toBe(a.message.lastModifiedAt);
  });

  test("T-PARSE-03 (dán) không có dòng tiêu đề nào thì cả đoạn là một bản không xác định RM", () => {
    const r = splitPastedThread("hôm nay gặp 3 khách", "2026-10-31", directory);
    expect(r.reports.length).toBe(1);
    expect(r.reports[0]!.rmId).toBeNull();
  });

  test("T-Q-02 (dán) chỉ Amy dán được; có CSRF; văn bản đi qua hàm xử lý rồi báo số mục tạo mới (D-73); không ghi văn bản thô vào DB", async () => {
    const received: string[] = [];
    const { app } = makeApp(db, { onPaste: async (text, reportDate) => { received.push(`${reportDate}|${text}`); return { created: 2 }; } });
    const s = session(AMY);
    const form = await (await get(app, "/paste", s.cookie)).text();
    expect(form).toContain("<textarea");
    const raw = "[31/10] [RM] RM_A\nKHÁCH NÓI: CANARY_NAME_7f3a chê giá, canary+1@example.invalid";
    const res = await post(app, "/paste", { csrf: s.csrf, report_date: "2026-10-31", text: raw }, s.cookie);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã tạo 2 mục mới trên Hàng chờ.");
    expect(page).not.toContain("CANARY");
    expect(received).toEqual([`2026-10-31|${raw}`]);
    const dump = JSON.stringify(db.query("SELECT * FROM queue_events").all());
    expect(dump).not.toContain("CANARY");
    const mark = session({ id: "mark", role: "viewer" });
    expect((await post(app, "/paste", { csrf: mark.csrf, report_date: "2026-10-31", text: "x" }, mark.cookie)).status).toBe(403);
    expect((await post(app, "/paste", { csrf: "sai", report_date: "2026-10-31", text: "x" }, s.cookie)).status).toBe(403);
    expect((await post(app, "/paste", { csrf: s.csrf, report_date: "31/10", text: "x" }, s.cookie)).status).toBe(422);
  });
});

describe("Đăng nhập bằng mật khẩu", () => {
  async function passwordApp() {
    const hashes = new Map([["amy", await Bun.password.hash("mat-khau-amy-thu")], ["mark", await Bun.password.hash("mat-khau-mark-thu")]]);
    return makeApp(db, { passwordHashes: hashes });
  }

  test("T-Q-06 (mật khẩu) đúng mật khẩu thì vào được Hàng chờ; sai thì không; cookie phiên an toàn", async () => {
    const { app } = await passwordApp();
    const page = await (await get(app, "/login")).text();
    expect(page).toContain('type="password"');
    const bad = await post(app, "/login", { user: "amy", password: "sai" });
    expect(bad.status).toBe(401);
    const ok = await post(app, "/login", { user: "amy", password: "mat-khau-amy-thu" });
    expect(ok.status).toBe(303);
    const cookie = ok.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await get(app, "/queue", cookie.split(";")[0])).status).toBe(200);
  });

  test("T-Q-06 (mật khẩu) sai 5 lần thì khoá 15 phút, kể cả nhập đúng; Origin lạ bị từ chối", async () => {
    const { app } = await passwordApp();
    for (let i = 0; i < 5; i += 1) expect((await post(app, "/login", { user: "mark", password: "sai" })).status).toBe(401);
    expect((await post(app, "/login", { user: "mark", password: "mat-khau-mark-thu" })).status).toBe(429);
    expect((await post(app, "/login", { user: "amy", password: "mat-khau-amy-thu" }, undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(app, "/login", { user: "ai-do", password: "x" })).status).toBe(401);
    expect(events(db)).toEqual([]);
  });
});
