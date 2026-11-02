// Bản demo chạy trên máy cá nhân: dữ liệu tổng hợp, LLM giả, đăng nhập giả, chỉ nghe trên loopback.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { createDemo, DEMO_HOST } from "../../src/demo/server.ts";

describe("Bản demo", () => {
  test("T-E2E-01 (demo) sinh đủ ba loại mục; vào bằng /login rồi mở được Hàng chờ và bấm xác nhận", async () => {
    const { app, queueDate } = await createDemo(new Date("2026-11-02T01:00:00.000Z"));
    const login = await app.fetch(new Request("http://localhost:3000/login?as=amy"));
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    const page = await app.fetch(new Request(`http://localhost:3000/queue?date=${queueDate}`, { headers: { cookie } }));
    const html = await page.text();
    expect(page.status).toBe(200);
    for (const t of ["Tự báo RM (", "Mã lý do (", "NBA ("]) expect(html).toContain(t);
    expect(html).not.toMatch(/Tự báo RM \(0\)|Mã lý do \(0\)|NBA \(0\)/);
    const id = /\/queue\/items\/([A-Za-z0-9-]+)\/confirm/.exec(html)![1]!;
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
    const res = await app.fetch(new Request(`http://localhost:3000/queue/items/${id}/confirm`, {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrf }).toString(),
    }));
    expect(res.status).toBe(303);
  });

  test("T-Q-06 (demo) đăng nhập Mark thì không có nút duyệt; người lạ không vào được", async () => {
    const { app, queueDate } = await createDemo(new Date("2026-11-02T01:00:00.000Z"));
    const login = await app.fetch(new Request("http://localhost:3000/login?as=mark"));
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    const html = await (await app.fetch(new Request(`http://localhost:3000/queue?date=${queueDate}`, { headers: { cookie } }))).text();
    expect(html).not.toContain("/confirm");
    expect((await app.fetch(new Request("http://localhost:3000/login?as=stranger"))).status).toBe(403);
  });

  test("T-Q-06 (demo) chỉ nghe trên 127.0.0.1; mã chạy thật không import src/demo", async () => {
    expect(DEMO_HOST).toBe("127.0.0.1");
    const root = new URL("../../", import.meta.url).pathname;
    for await (const path of new Glob("src/**/*.ts").scan({ cwd: root })) {
      if (path.startsWith("src/demo/")) continue;
      const text = await Bun.file(root + path).text();
      expect({ path, hit: /["'][^"']*demo\//.test(text) }).toEqual({ path, hit: false });
    }
  });
});
