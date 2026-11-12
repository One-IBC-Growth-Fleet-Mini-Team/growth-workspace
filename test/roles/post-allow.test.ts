// T-ROLE-05 tới T-ROLE-07: POST theo danh sách cho phép (D-98). Việc có tiền chỉ vai mark; đường dẫn lạ bị từ chối;
// mọi route POST trong server đều có dòng trong bảng (thêm route mới mà quên bảng thì test này đỏ).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { canPost, POST_ALLOW } from "../../src/queue/roles.ts";
import type { QueueUser } from "../../src/queue/auth.ts";
import { freshDb } from "../helpers/db.ts";
import { makeApp, post, session } from "../helpers/queue.ts";

const U = (id: string, role: QueueUser["role"], account: QueueUser["account"]): QueueUser => ({ id, role, account });
const AMY = U("amy-01", "approver", "amy"), MARK = U("mark-01", "viewer", "mark"), BOD = U("bod-01", "viewer", "bod"), MKT = U("mkt-01", "mkt", "mkt");

describe("T-ROLE POST theo danh sách cho phép", () => {
  test("T-ROLE-05 /budget/decide và việc có tiền chỉ vai mark; Amy, BOD, MKT bị từ chối qua HTTP", async () => {
    for (const p of ["/budget/decide", "/budget/plan", "/strategy", "/tuning"]) {
      expect(canPost(MARK, p)).toBe(true);
      for (const u of [AMY, BOD, MKT]) expect(canPost(u, p)).toBe(false);
    }
    const db = freshDb();
    const { app } = makeApp(db);
    for (const id of ["amy", "bod", "mkt"]) {
      const s = session({ id, role: id === "amy" ? "approver" : id === "mkt" ? "mkt" : "viewer" });
      expect((await post(app, "/budget/decide", { csrf: s.csrf, id: "x", decision: "approve", note: "" }, s.cookie)).status).toBe(403);
    }
    const m = session({ id: "mark", role: "viewer" });
    expect((await post(app, "/budget/decide", { csrf: m.csrf, id: "khong-co", decision: "approve", note: "" }, m.cookie)).status).toBe(422);
  });

  test("T-ROLE-06 đường dẫn POST không có trong bảng thì mọi vai bị từ chối; Hàng chờ chỉ Amy; đăng xuất mọi vai", () => {
    for (const u of [AMY, MARK, BOD, MKT]) {
      expect(canPost(u, "/khong-co-route")).toBe(false);
      expect(canPost(u, "/logout")).toBe(true);
    }
    expect(canPost(AMY, "/queue/items/abc-1/confirm")).toBe(true);
    for (const u of [MARK, BOD, MKT]) expect(canPost(u, "/queue/items/abc-1/confirm")).toBe(false);
    expect(canPost(BOD, "/jurisdictions")).toBe(true); // BOD như Mark (D-66)
    expect(canPost(MKT, "/jurisdictions")).toBe(false);
  });

  test("T-ROLE-07 mọi route POST trong server.ts đều có trong bảng cho phép", () => {
    const src = readFileSync(new URL("../../src/queue/server.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf('if (req.method === "POST") {'), src.indexOf("const m = /^\\/queue\\/items\\/"));
    const paths = new Set([...block.matchAll(/path === "(\/[^"]*)"/g)].map((x) => x[1]!));
    expect(paths.size).toBeGreaterThan(25);
    for (const p of paths) expect(Object.keys(POST_ALLOW)).toContain(p);
  });
});
