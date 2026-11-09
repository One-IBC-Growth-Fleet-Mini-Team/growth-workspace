// T-GUIDE-01: trang hướng dẫn theo vai trò (D-80): nút trên thanh điều hướng, mỗi vai trò mở đúng trang, có bảng "Nếu thấy X thì làm Y".
import { describe, expect, test } from "bun:test";
import { createDemo } from "../../src/demo/server.ts";

describe("T-GUIDE hướng dẫn", () => {
  test("T-GUIDE-01 /huong-dan mở đúng trang của vai trò; có bảng 5 dòng xử lý lỗi; tên lạ thì 404", async () => {
    const { app } = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
    for (const [who, title] of [["amy", "Hướng dẫn cho Amy"], ["mkt", "Hướng dẫn cho Team MKT"], ["mark", "Hướng dẫn cho Mark"], ["bod", "Hướng dẫn cho BOD"]]) {
      const cookie = (await app.fetch(new Request(`http://localhost:3000/login?as=${who}`))).headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
      const html = await (await app.fetch(new Request("http://localhost:3000/huong-dan", { headers: { cookie } }))).text();
      expect(html).toContain(`<h1>${title}`);
      expect(await (await app.fetch(new Request("http://localhost:3000/overview", { headers: { cookie } }))).text()).toContain('href="/huong-dan"');
      if (who === "amy") expect(html).toContain('<ul style="margin:0"><li><strong>Xác nhận</strong>'); // danh sách con, không đánh số tiếp
      const table = html.slice(html.indexOf("Nếu thấy X thì làm Y"));
      expect((table.match(/<tr>/g) ?? []).length).toBe(6); // tiêu đề + 5 lỗi hay gặp
      expect((await app.fetch(new Request("http://localhost:3000/huong-dan/khong-co", { headers: { cookie } }))).status).toBe(404);
    }
  });
});
