// T-HARD-04, T-HARD-05: tự báo RM lệch mẫu khi dán (D-78): hai ngày trong một tin, tên khách trong bản dán.
import { describe, expect, test } from "bun:test";
import { createDemo } from "../../src/demo/server.ts";
import { splitPastedThread } from "../../src/teams/paste-report.ts";

const DIR = [{ rm_id: "RM_A", display_name: "RM_A", active: 1, teams_user_id: null }] as any;

describe("T-HARD tự báo lệch mẫu", () => {
  test("T-HARD-04 một lần dán có hai ngày của cùng RM: hai bản, hai mã tin khác nhau", () => {
    const r = splitPastedThread("• [31/10] [RM] RM_A\n- TIẾP CẬN: 5\n[ 01 / 11 ] [RM] RM_A\nTIẾP CẬN: 7", "2026-11-01", DIR);
    expect(r.reports).toHaveLength(2);
    expect(new Set(r.reports.map((x) => x.message.messageId)).size).toBe(2);
  });

  test("T-HARD-05 bản dán có tên khách, email, số điện thoại, thiếu dòng: vẫn tạo mục, DB không giữ tên khách hay email", async () => {
    const { app, db } = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
    const login = await app.fetch(new Request("http://localhost:3000/login?as=amy"));
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await app.fetch(new Request("http://localhost:3000/paste", { headers: { cookie } }))).text())![1]!;
    const text = "[08/11] [RM] RM_A\nKHÁCH NÓI: Anh Canaryname Zxqv bảo giá cao, mail canary.z@example.invalid, gọi 0901 234 567";
    const res = await app.fetch(new Request("http://localhost:3000/paste", { method: "POST", headers: { cookie, origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf, report_date: "2026-11-08", text }).toString() }));
    expect(await res.text()).toContain("Đã tạo");
    const dump = new TextDecoder().decode(db.serialize());
    for (const leak of ["Canaryname", "canary.z@example.invalid", "0901 234 567"]) expect(dump.includes(leak)).toBe(false);
  });
});
