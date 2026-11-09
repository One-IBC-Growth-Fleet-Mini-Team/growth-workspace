// T-PROV-01 tới T-PROV-03: giá trị tạm đọc qua một hàm (D-67). Đổi giá trị trong config thì kết quả đổi theo, không sửa code.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkOne } from "../../src/ads/check.ts";
import { adRules } from "../../src/config.ts";
import { repeatedRejections } from "../../src/db/rejections.ts";
import { getProvisional, listProvisional, PROVISIONAL_SCHEMAS, setProvisional, setProvisionalPaths, tag } from "../../src/provisional.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET, seedItem } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const REPO = new URL("../../config/provisional.json", import.meta.url).pathname;
function isolate(edit?: (j: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "prov-"));
  const file = join(dir, "provisional.json");
  const j = JSON.parse(readFileSync(REPO, "utf8"));
  edit?.(j);
  writeFileSync(file, JSON.stringify(j));
  setProvisionalPaths({ file, overrides: join(dir, "o.jsonl") });
}
afterEach(() => isolate());

describe("T-PROV giá trị tạm", () => {
  test("T-PROV-01 file trong repo đủ 9 khoá, đúng dạng, đều PROVISIONAL, có nguồn và chỗ ghi ai chốt", () => {
    isolate();
    const all = listProvisional();
    expect(all.map((p) => p.key as string).sort()).toEqual(Object.keys(PROVISIONAL_SCHEMAS).sort());
    for (const p of all) expect([p.status, p.source.length > 0, p.decidedBy]).toEqual(["PROVISIONAL", true, null]);
    expect(getProvisional("commission").value.rates).toEqual({ referrer: 0.1, partner: 0.15, premier: 0.2 });
    expect(tag("tier3b")).toBe(" (Tạm)");
  });

  test("T-PROV-02 đổi config thì kết quả đổi theo: ngưỡng tầng 4, từ cần duyệt K-07", () => {
    const db = freshDb();
    for (let i = 0; i < 2; i++) {
      const id = seedItem(db, { item_type: "reason_code", queue_date: `2026-11-0${2 + i}`, payload: JSON.stringify({ proposal: { primary: "NO_NEED_NOW" } }) });
      db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, 'amy', 'confirm', NULL, ?)", [Bun.randomUUIDv7(), id, `2026-11-0${2 + i}T03:00:00Z`]);
    }
    isolate();
    expect(repeatedRejections(db, NOW)).toEqual([]);
    isolate((j) => { j.tier4_repeat.value.min_count = 2; });
    expect(repeatedRejections(db, NOW)).toEqual([{ code: "NO_NEED_NOW", count: 2 }]);
    const copy = { primaryText: "Open a corporate bank account fast.", headline: "", description: "", jurisdiction: null };
    isolate();
    expect(checkOne(db, copy, adRules()).verdict).toBe("pass");
    isolate((j) => { j.k07_ad_words.value.review.push("bank account"); });
    expect(checkOne(db, copy, adRules()).verdict).toBe("review");
  });

  test("T-PROV-03 chỉ Mark sửa, chuyển FINAL thì mất nhãn Tạm; giá trị sai dạng không ghi; trang /tuning hiện bảng", async () => {
    isolate();
    const by = { now: NOW, actor: "mark" };
    expect(setProvisional("tier4_repeat", '{"min_count":4,"window_days":28}', "PROVISIONAL", { now: NOW, actor: "amy" })).toBe("ONLY_MARK");
    expect(setProvisional("tier4_repeat", '{"min_count":"x"}', "FINAL", by)).toBe("VALUE_INVALID");
    expect(setProvisional("money_threshold", "1", "FINAL", by)).toBe("KEY_UNKNOWN");
    expect(setProvisional("tier4_repeat", '{"min_count":4,"window_days":28}', "FINAL", by)).toBe("ok");
    expect(getProvisional("tier4_repeat")).toMatchObject({ value: { min_count: 4 }, status: "FINAL", decidedBy: "mark" });
    expect(tag("tier4_repeat")).toBe("");
    const { app } = makeApp(freshDb(), { now: () => NOW });
    const c = (sub: string) => createSessionCookie(SECRET, { sub: sub as any, csrf: "k", exp: Date.parse("2026-11-10T00:00:00Z") });
    const page = await (await app.fetch(new Request(`${BASE}/tuning`, { headers: { cookie: c("mark") } }))).text();
    expect(page).toContain("Giá trị tạm (config/provisional.json)");
    expect(page).toContain("win_gate");
    const post = (sub: string) => app.fetch(new Request(`${BASE}/tuning`, { method: "POST", headers: { cookie: c(sub), origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: "csrf=k&op=provisional&key=tier3b&value=&status=FINAL" }));
    expect((await post("amy")).status).toBe(403);
    expect((await post("mark")).status).toBe(200);
    expect(getProvisional("tier3b").status).toBe("FINAL");
  });
});
