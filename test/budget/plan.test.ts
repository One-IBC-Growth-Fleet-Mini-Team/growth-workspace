// T-BF-06 tới T-BF-08: kế hoạch ngân sách tuần trên dữ liệu mẫu (D-90): tổ hợp Kênh × Tài phán, lưu chỉ thêm, chạy lại
// trong tuần không tạo trùng; /budget hiện kế hoạch, chỉ Mark tạo và duyệt; đổi tham số khung phải qua eval.
import { describe, expect, test } from "bun:test";
import { createWeeklyPlan, latestPlan } from "../../src/db/budget-plan.ts";
import { createDemo } from "../../src/demo/server.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProvisional, setProvisional, setProvisionalPaths } from "../../src/provisional.ts";

const NOW = new Date("2026-11-09T01:00:00.000Z");
const cookie = async (app: { fetch(r: Request): Promise<Response> }, who: string) =>
  (await app.fetch(new Request(`http://localhost:3000/login?as=${who}`))).headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;

describe("T-BF kế hoạch tuần", () => {
  test("T-BF-06 kế hoạch từ dữ liệu mẫu: mỗi tổ hợp một dòng có quy tắc và dẫn chứng; chạy lại trong tuần không tạo trùng", async () => {
    const { db } = await createDemo(NOW);
    const r = createWeeklyPlan(db, NOW, "mark");
    expect(r.created).toBe(true);
    const p = latestPlan(db)!;
    expect(p.weekStart).toBe("2026-11-09");
    expect(p.lines.map((l) => `${l.channel}|${l.jurisdiction}`).sort()).toEqual(["google|Singapore", "meta|British Virgin Islands", "meta|Hong Kong"]);
    const hk = p.lines.find((l) => l.jurisdiction === "Hong Kong")!;
    expect(hk.objectiveOld).toBeNull();
    expect(hk.budgetOld).toBeGreaterThan(0);
    expect(hk.rules.length).toBeGreaterThan(0);
    expect(hk.evidence).toHaveProperty("win_gate");
    // HK có asset QA PASS, đã khoá giá, đủ impressions và contact: R2 chuyển sang C.
    expect(hk).toMatchObject({ rules: ["R2"], objectiveNew: "C" });
    // BVI chưa khoá giá, chưa có asset QA PASS: cổng G3 giữ nguyên.
    expect(p.lines.find((l) => l.jurisdiction === "British Virgin Islands")!.rules).toEqual(["G3"]);
    expect(createWeeklyPlan(db, NOW, "mark")).toMatchObject({ id: r.id, created: false });
  });

  test("T-BF-07 /budget: Mark tạo và duyệt kế hoạch; Amy, BOD không tạo, không duyệt", async () => {
    const { app, db } = await createDemo(NOW);
    const mark = await cookie(app, "mark");
    const csrfOf = async (c: string) => /name="csrf" value="([^"]+)"/.exec(await (await app.fetch(new Request("http://localhost:3000/budget", { headers: { cookie: c } }))).text())![1]!;
    const post = async (c: string, fields: Record<string, string>) => app.fetch(new Request("http://localhost:3000/budget/plan", { method: "POST", headers: { cookie: c, origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: await csrfOf(c), ...fields }).toString() }));
    for (const who of ["amy", "bod"]) expect((await post(await cookie(app, who), { op: "create" })).status).toBe(403);
    const made = await (await post(mark, { op: "create" })).text();
    expect(made).toContain("Đã tạo kế hoạch tuần với 3 tổ hợp.");
    expect(made).toContain("Kế hoạch ngân sách tuần (khung quyết định) (Tạm)");
    expect(made).toContain("Chờ Mark duyệt");
    const id = latestPlan(db)!.id;
    expect((await post(await cookie(app, "bod"), { id, decision: "approve" })).status).toBe(403);
    expect(await (await post(mark, { id, decision: "approve", note: "ok" })).text()).toContain("Đã duyệt (mark)");
  });

  test("T-BF-08 đổi tham số khung ở /tuning cần eval chạy lại sau lần đổi trước và pass", () => {
    const fresh = () => setProvisionalPaths({ overrides: join(mkdtempSync(join(tmpdir(), "bf-")), "o.jsonl") });
    fresh();
    const v = JSON.stringify({ ...getProvisional("budget_framework").value, max_step: 0.15 });
    const by = { now: NOW, actor: "mark" };
    expect(setProvisional("budget_framework", v, "PROVISIONAL", { ...by, evalRun: { ranAt: null, passed: false } })).toBe("EVAL_NOT_RERUN");
    expect(setProvisional("budget_framework", v, "PROVISIONAL", { ...by, evalRun: { ranAt: "2026-11-09T00:00:00Z", passed: false } })).toBe("EVAL_FAILED");
    expect(setProvisional("budget_framework", v, "PROVISIONAL", { ...by, evalRun: { ranAt: "2026-11-09T00:00:00Z", passed: true } })).toBe("ok");
    expect(getProvisional("budget_framework").value.max_step).toBe(0.15);
    expect(setProvisional("budget_framework", v, "PROVISIONAL", { now: new Date("2026-11-10T00:00:00Z"), actor: "mark", evalRun: { ranAt: "2026-11-09T00:00:00Z", passed: true } })).toBe("EVAL_NOT_RERUN");
    expect(setProvisional("persona", JSON.stringify({ min_deals: 4 }), "PROVISIONAL", by)).toBe("ok");
    fresh();
  });
});
