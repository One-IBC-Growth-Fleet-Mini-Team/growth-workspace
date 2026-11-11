// T-ACC-04 tới T-ACC-08: mỗi người một tài khoản gắn vai trò (D-97). Lệnh add-user, reset-password, disable-user,
// list-users; quyền theo vai trò, người thao tác ghi theo tài khoản; migration giữ tài khoản bản cài cũ.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runAccountCommand } from "../../src/db/account-cli.ts";
import { migrate } from "../../src/db/migrate.ts";
import { getAccount, listSecurityEvents } from "../../src/db/users.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, post } from "../helpers/queue.ts";

const NOW = new Date("2026-11-02T01:00:00.000Z");
const tempOf = (out: string) => /Mật khẩu tạm: (\S+)/.exec(out)![1]!;
const cookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;

async function loginAndChange(app: ReturnType<typeof makeApp>["app"], user: string, temp: string, next: string): Promise<string> {
  const login = await post(app, "/login", { user, password: temp });
  expect(login.headers.get("location")).toBe("/password");
  const c = cookieOf(login);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await (await get(app, "/password", c)).text())![1]!;
  const done = await post(app, "/password", { csrf, password: next, password2: next }, c);
  expect(done.status).toBe(303);
  return cookieOf(done);
}

describe("T-ACC tài khoản theo người", () => {
  test("T-ACC-04 add-user: hai người cùng vai mkt, cùng quyền; mã hoặc vai sai thì từ chối; trùng mã thì báo; mật khẩu tạm in một lần", async () => {
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, now: () => NOW });
    const a = await runAccountCommand(db, ["add-user", "mkt-01", "mkt"], { now: NOW });
    const b = await runAccountCommand(db, ["add-user", "mkt-02", "mkt"], { now: NOW });
    expect([a.code, b.code]).toEqual([0, 0]);
    expect(a.out).toContain("Hết hạn: 2026-11-05 01:00 UTC (72 giờ)");
    expect(tempOf(a.out)).not.toBe(tempOf(b.out));
    expect((await runAccountCommand(db, ["add-user", "mkt-01", "mkt"], { now: NOW })).code).toBe(1);
    expect((await runAccountCommand(db, ["add-user", "Nguyen Van A", "mkt"], { now: NOW })).code).toBe(2);
    expect((await runAccountCommand(db, ["add-user", "mkt-03", "admin"], { now: NOW })).code).toBe(2);
    expect((await runAccountCommand(db, ["oops"], { now: NOW })).code).toBe(2);
    const c1 = await loginAndChange(app, "mkt-01", tempOf(a.out), "ca-phe-sang-1-tuoi-mat");
    const c2 = await loginAndChange(app, "MKT-02 ", tempOf(b.out), "ca-phe-sang-2-tuoi-mat");
    for (const c of [c1, c2]) {
      expect((await get(app, "/overview", c)).status).toBe(200);
      expect((await get(app, "/billing", c)).status).toBe(403);
      expect((await get(app, "/settings", c)).status).toBe(403);
    }
    // Người thao tác ghi theo tài khoản, không theo vai trò.
    for (const c of [c1, c2]) {
      const csrf = /name="csrf" value="([^"]+)"/.exec(await (await get(app, "/lessons", c)).text())![1]!;
      expect((await post(app, "/lessons", { csrf, kind: "lesson", title: "t", body: "b", evidence: "/hooks", tags: "" }, c)).status).toBe(200);
    }
    expect(db.query("SELECT actor FROM knowledge_log ORDER BY actor").all()).toEqual([{ actor: "mkt-01" }, { actor: "mkt-02" }]);
  });

  test("T-ACC-05 reset-password: mật khẩu tạm mới, mọi phiên cũ hết hiệu lực; tài khoản lạ thì báo", async () => {
    let clock = NOW;
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, now: () => clock });
    const made = await runAccountCommand(db, ["add-user", "amy-01", "amy"], { now: clock });
    const c = await loginAndChange(app, "amy-01", tempOf(made.out), "ca-phe-sang-amy-tuoi");
    expect((await get(app, "/queue", c)).status).toBe(200);
    clock = new Date(NOW.getTime() + 60_000);
    const r = await runAccountCommand(db, ["reset-password", "amy-01"], { now: clock });
    expect(r.code).toBe(0);
    clock = new Date(NOW.getTime() + 120_000);
    expect((await get(app, "/queue", c)).headers.get("location")).toBe("/login");
    expect((await post(app, "/login", { user: "amy-01", password: "ca-phe-sang-amy-tuoi" })).status).toBe(401);
    expect((await post(app, "/login", { user: "amy-01", password: tempOf(r.out) })).headers.get("location")).toBe("/password");
    expect((await runAccountCommand(db, ["reset-password", "khong-co"], { now: clock })).code).toBe(1);
  });

  test("T-ACC-06 disable-user: khoá ngay, huỷ phiên, không đăng nhập được, giữ lịch sử; list-users không in mã băm", async () => {
    let clock = NOW;
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, now: () => clock });
    const made = await runAccountCommand(db, ["add-user", "bod-01", "bod"], { now: clock });
    const c = await loginAndChange(app, "bod-01", tempOf(made.out), "tra-chieu-xanh-la-vang");
    expect((await get(app, "/overview", c)).status).toBe(200);
    clock = new Date(NOW.getTime() + 60_000);
    expect((await runAccountCommand(db, ["disable-user", "bod-01"], { now: clock })).code).toBe(0);
    expect((await get(app, "/overview", c)).headers.get("location")).toBe("/login");
    expect((await post(app, "/login", { user: "bod-01", password: "tra-chieu-xanh-la-vang" })).status).toBe(401);
    expect(getAccount(db, "bod-01")?.disabled).toBe(true);
    expect((db.query("SELECT COUNT(*) AS n FROM user_passwords WHERE user_id = 'bod-01'").get() as { n: number }).n).toBe(2);
    const list = (await runAccountCommand(db, ["list-users"], { now: clock })).out;
    expect(list).toMatch(/bod-01\s+bod\s+2026-11-02 01:00\s+không\s+đã khoá/);
    expect(list).not.toContain("argon2");
    expect(listSecurityEvents(db).map((e) => e.kind)).toEqual(["login_failed", "account_disabled", "password_changed", "login_ok", "account_created"]);
  });

  test("T-ACC-07 quyền riêng của Mark theo vai trò tài khoản: mã khác 'mark' nhưng vai mark vào được /settings; vai bod thì không", async () => {
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, now: () => NOW });
    const m = await runAccountCommand(db, ["add-user", "gd-01", "mark"], { now: NOW });
    const b = await runAccountCommand(db, ["add-user", "bod-02", "bod"], { now: NOW });
    const cm = await loginAndChange(app, "gd-01", tempOf(m.out), "giay-moi-mau-xanh-ngoc");
    const cb = await loginAndChange(app, "bod-02", tempOf(b.out), "ban-go-soi-mau-nau");
    expect((await get(app, "/settings", cm)).status).toBe(200);
    expect((await get(app, "/settings", cb)).status).toBe(403);
    expect(await (await get(app, "/overview", cm)).text()).toContain('href="/settings"');
    expect(await (await get(app, "/overview", cb)).text()).not.toContain('href="/settings"');
  });

  test("T-ACC-08 migration 031: tài khoản và mật khẩu của bản cài cũ (amy, mark) giữ nguyên, vai trò trùng mã", () => {
    const db = new Database(":memory:");
    migrate(db, 30);
    db.run("INSERT INTO user_passwords (id, user_id, hash, must_change, set_at, set_by) VALUES ('p1', 'amy', '$argon2id$x', 0, '2026-11-01T00:00:00Z', 'add-user')");
    migrate(db);
    expect(getAccount(db, "amy")).toEqual({ id: "amy", role: "amy", disabled: false });
    expect(getAccount(db, "mark")).toBeNull();
    expect(db.query("SELECT user_id, hash, expires_at FROM user_passwords").all()).toEqual([{ user_id: "amy", hash: "$argon2id$x", expires_at: null }]);
    expect(() => db.run("UPDATE accounts SET role = 'mark'")).toThrow(/append_only/);
  });
});
