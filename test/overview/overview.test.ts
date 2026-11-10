// T-OV-01, T-OV-02: dashboard /overview (D-76): hàng theo vai trò, ô link sang trang chi tiết, dải Dữ liệu mẫu trên demo.
import { describe, expect, test } from "bun:test";
import { createDemo } from "../../src/demo/server.ts";
import { totalProposedUsd } from "../../src/metrics/commission.ts";

async function pageAs(who: string) {
  const { app } = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
  const login = await app.fetch(new Request(`http://localhost:3000/login?as=${who}`));
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
  const res = await app.fetch(new Request("http://localhost:3000/overview", { headers: { cookie } }));
  return { status: res.status, html: await res.text() };
}
const h2 = (html: string) => [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);

describe("T-OV dashboard", () => {
  test("T-OV-01 Mark, BOD đủ 4 hàng; Amy hệ thống và vận hành; MKT Growth và tiến độ, không có ô hoa hồng", async () => {
    for (const who of ["mark", "bod"]) expect(h2((await pageAs(who)).html)).toEqual(["Hệ thống", "Vận hành", "Growth", "Tiến độ dự án"]);
    expect(h2((await pageAs("amy")).html)).toEqual(["Hệ thống", "Vận hành"]);
    const mkt = await pageAs("mkt");
    expect(mkt.status).toBe(200);
    expect(h2(mkt.html)).toEqual(["Growth", "Tiến độ dự án"]);
    expect(mkt.html).not.toContain('href="/partners"');
  });

  test("T-OV-02 ô có số từ dữ liệu mẫu, link trang chi tiết, nhãn Tạm, dải Dữ liệu mẫu; tổng hoa hồng qua hàm", async () => {
    const { html } = await pageAs("mark");
    expect(html).toContain("Dữ liệu mẫu");
    for (const href of ["/queue", "/data", "/budget", "/creative", "/partners", "/runs"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Win gate (Tạm)");
    expect(html).toContain("Hoa hồng đề xuất, chưa chi (Tạm)");
    expect(html).toContain("GD2 Thử, đo và Creative Factory");
    expect(totalProposedUsd([{ amount_usd: 120 }, { amount_usd: null }, { amount_usd: 375.5 }])).toBe(495.5);
  });
});
