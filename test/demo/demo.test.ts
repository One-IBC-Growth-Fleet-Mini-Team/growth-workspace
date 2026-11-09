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

  test("T-DEMO-01 dữ liệu mẫu cho trang MKT, dải Dữ liệu mẫu, tài khoản MKT và BOD (D-75)", async () => {
    const { app } = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
    const as = async (who: string) => (await app.fetch(new Request(`http://localhost:3000/login?as=${who}`))).headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    const page = async (cookie: string, path: string) => app.fetch(new Request(`http://localhost:3000${path}`, { headers: { cookie } }));
    const mkt = await as("mkt");
    const hooks = await (await page(mkt, "/hooks")).text();
    expect(hooks).toContain("Dữ liệu mẫu");
    expect(hooks).toContain("HK-01");
    expect(await (await page(mkt, "/creative")).text()).toContain("oneibc_meta_all_hk-01_20261109_v1");
    expect((await page(mkt, "/budget")).status).toBe(403);
    const budget = await (await page(await as("mark"), "/budget")).text();
    expect(budget).toContain("Sample HK Q4");
    expect(budget).toContain("Win gate (Mi1-mkt-01) (Tạm)");
    expect((await page(mkt, "/leads")).status).toBe(403);
    const bod = await as("bod");
    expect((await page(bod, "/partners")).status).toBe(200);
    expect(await (await page(bod, "/queue")).text()).not.toContain("/confirm");
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
