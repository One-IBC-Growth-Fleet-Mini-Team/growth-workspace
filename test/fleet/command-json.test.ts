// T-CMD-01 tới T-CMD-03: API dữ liệu Command Center (D-92). Bản phẳng và JSON đọc cùng payload; lọc theo vai trò; không PII.
import { describe, expect, test } from "bun:test";
import { createWeeklyPlan } from "../../src/db/budget-plan.ts";
import type { CommandPayload } from "../../src/fleet/command-json.ts";
import { askMi1 } from "../../src/mi1/ask.ts";
import { createDemo } from "../../src/demo/server.ts";

const NOW = new Date("2026-11-09T01:00:00.000Z");
const B = "http://localhost:3000";
async function as(app: { fetch(r: Request): Promise<Response> }, who: string) {
  const c = (await app.fetch(new Request(`${B}/login?as=${who}`))).headers.getSetCookie().find((x) => x.startsWith("gw_session="))!.split(";")[0]!;
  const get = (p: string) => app.fetch(new Request(`${B}${p}`, { headers: { cookie: c } }));
  return { json: async () => (await (await get("/command/data.json")).json()) as CommandPayload, html: async () => (await get("/command")).text(), res: () => get("/command/data.json") };
}
const llm = (template: string) => ({ async complete() { return { text: JSON.stringify({ template, params: {} }), inputTokens: 10, outputTokens: 5, model: "fake", refused: false }; } });

describe("T-CMD API Command Center", () => {
  test("T-CMD-01 cùng một lượt chạy: JSON và bản phẳng hiện cùng các bước, thuyền viên, module", async () => {
    const { app, db } = await createDemo(NOW);
    await askMi1(db, llm("hook_board"), "Hook tuần này thế nào?", { now: new Date(), actor: "mark", price: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, evalGate: { passed: true, version: "t" } });
    const mark = await as(app, "mark");
    const r = await mark.res();
    expect(r.headers.get("content-type")).toContain("application/json");
    const j = await mark.json();
    const h = await mark.html();
    expect(j.session!.trigger).toBe("ask");
    for (const s of j.session!.steps) { expect(h).toContain(s.tool); expect(h).toContain(s.resultSummary); }
    for (const c of j.crew) expect(h).toContain(c.id);
    for (const m of j.modules) { expect(h).toContain(m.label); expect(h).toContain(m.summary); }
    expect(h).toContain(`trần ${j.capUsd} USD`);
    expect(h).toContain(`khoảng ${j.forecastPerDay} mục mỗi ngày`);
  });

  test("T-CMD-02 module theo vai trò như spec 3D mục 2; việc chờ Mark gồm kế hoạch ngân sách và chỉ Mark, BOD thấy", async () => {
    const { app, db } = await createDemo(NOW);
    createWeeklyPlan(db, NOW, "mark");
    const labels = async (who: string) => (await (await as(app, who)).json()).modules.map((m) => m.label);
    expect(await labels("mark")).toEqual(["Hỏi Mi1", "Hàng chờ quyết định", "Dashboard Growth", "Đồ thị và truy vấn mẫu", "Thuyền viên", "Hook và Win gate", "Đối tác và reseller"]);
    expect(await labels("bod")).toEqual(await labels("mark"));
    expect(await labels("amy")).toEqual(["Hỏi Mi1-sa-01", "Hàng chờ của Amy", "Dashboard phần Amy", "Đối tác và reseller", "Thuyền viên"]);
    expect(await labels("mkt")).toEqual(["Hỏi Mi1-mkt-01", "Hook và Win gate", "Creative", "Gói và giá đối thủ", "Ngân sách", "Lịch kênh"]);
    const mark = await (await as(app, "mark")).json();
    expect(mark.waitingMark!.map((w) => w.itemType)).toContain("budget_plan");
    expect((await (await as(app, "amy")).json()).waitingMark).toBeNull();
    const mkt = await (await as(app, "mkt")).json();
    expect(mkt.waitingMark).toBeNull();
    expect(mkt.modules.find((m) => m.id === "budget")!.href).toBeNull();
  });

  test("T-CMD-03 Team MKT không thấy đầu vào từng bước; JSON không có PII; chưa đăng nhập thì về /login", async () => {
    const { app, db } = await createDemo(NOW);
    await askMi1(db, llm("channel_health"), "Kênh ổn không? gửi canary.person@example.com mã O-CANARY-1", { now: new Date(), actor: "mark", price: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, evalGate: { passed: true, version: "t" } });
    const mkt = await (await as(app, "mkt")).json();
    expect(mkt.session!.inputSummary).toBe("(ẩn với Team MKT)");
    expect(mkt.session!.steps.every((s) => s.inputSummary === "(ẩn với Team MKT)")).toBe(true);
    expect(JSON.stringify(mkt)).not.toContain("CANARY");
    expect(JSON.stringify(await (await as(app, "mark")).json())).not.toContain("canary.person");
    expect((await app.fetch(new Request(`${B}/command/data.json`))).headers.get("location")).toBe("/login");
  });
});
