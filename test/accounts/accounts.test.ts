// T-ACC-01, T-ACC-02: tài khoản theo vai trò, mật khẩu tạm phải đổi (D-79); diễn tập sao lưu rồi khôi phục trên DB demo.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemo } from "../../src/demo/server.ts";
import { backupDb, restoreDb } from "../../src/db/backup.ts";
import { currentPassword, setPassword, tempPassword } from "../../src/db/users.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, post } from "../helpers/queue.ts";

const NOW = new Date("2026-11-02T02:00:00.000Z");

describe("T-ACC tài khoản và khôi phục", () => {
  test("T-ACC-01 mật khẩu tạm của MKT: đăng nhập thì phải đổi, trang khác chuyển về /password; đổi xong vào Tổng quan", async () => {
    const db = freshDb();
    const pw = tempPassword();
    expect(pw).toMatch(/^[A-Za-z2-9]{16}$/);
    const { app } = makeApp(db, { passwordLogin: true });
    await setPassword(db, "mkt", pw, { mustChange: true, now: NOW, actor: "add-user" });
    const login = await post(app, "/login", { user: "mkt", password: pw });
    expect(login.headers.get("location")).toBe("/password");
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    expect((await get(app, "/overview", cookie)).headers.get("location")).toBe("/password");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await get(app, "/password", cookie)).text())![1]!;
    expect((await post(app, "/password", { csrf, password: "ngan", password2: "ngan" }, cookie)).status).toBe(422);
    const done = await post(app, "/password", { csrf, password: "mat-khau-moi-cua-mkt", password2: "mat-khau-moi-cua-mkt" }, cookie);
    expect(done.headers.get("location")).toBe("/overview");
    expect(currentPassword(db, "mkt")?.mustChange).toBe(false);
    const fresh = done.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    expect((await get(app, "/overview", fresh)).status).toBe(200);
    expect((await post(app, "/login", { user: "mkt", password: pw })).status).toBe(401); // mật khẩu tạm hết dùng được
  });

  test("T-ACC-03 đổi mật khẩu cần mật khẩu cũ (trừ lần đầu với mật khẩu tạm); đổi xong huỷ mọi phiên khác, giữ phiên hiện tại (D-85)", async () => {
    const db = freshDb();
    let clock = new Date("2026-11-02T01:00:00.000Z");
    const later = (min: number) => { clock = new Date(clock.getTime() + min * 60_000); };
    const { app } = makeApp(db, { now: () => clock, passwordLogin: true });
    await setPassword(db, "mark", "mat-khau-cu-cua-mark", { mustChange: false, now: clock, actor: "add-user" });
    const login = async (pw: string) => (await post(app, "/login", { user: "mark", password: pw })).headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    later(1);
    const here = await login("mat-khau-cu-cua-mark");
    const other = await login("mat-khau-cu-cua-mark");
    later(1);
    const form = await (await get(app, "/password", here)).text();
    expect(form).toContain('name="current"');
    const csrf = /name="csrf" value="([^"]+)"/.exec(form)![1]!;
    const change = (current: string | undefined) => post(app, "/password", { csrf, ...(current === undefined ? {} : { current }), password: "mat-khau-moi-cua-mark", password2: "mat-khau-moi-cua-mark" }, here);
    expect((await change(undefined)).status).toBe(422);
    expect((await change("sai-mat-khau-cu")).status).toBe(422);
    expect((await post(app, "/login", { user: "mark", password: "mat-khau-cu-cua-mark" })).status).toBe(303);
    const done = await change("mat-khau-cu-cua-mark");
    expect(done.status).toBe(303);
    const kept = done.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    later(1);
    expect((await get(app, "/overview", kept)).status).toBe(200);
    expect((await get(app, "/overview", other)).headers.get("location")).toBe("/login");
    expect((await get(app, "/overview", here)).headers.get("location")).toBe("/login");
    expect((await post(app, "/login", { user: "mark", password: "mat-khau-cu-cua-mark" })).status).toBe(401);
    // Đặt lại bằng add-user (mật khẩu tạm) cũng huỷ phiên đang có; lần đổi đầu không hỏi mật khẩu cũ.
    later(1);
    const temp = tempPassword();
    await setPassword(db, "mark", temp, { mustChange: true, now: clock, actor: "add-user" });
    expect((await get(app, "/overview", kept)).headers.get("location")).toBe("/login");
    later(1);
    const t = await login(temp);
    expect(await (await get(app, "/password", t)).text()).not.toContain('name="current"');
  });

  test("T-ACC-02 diễn tập: sao lưu DB demo, khôi phục vào chỗ DB, số dòng khớp; bản hỏng bị từ chối, DB cũ giữ lại", async () => {
    const { db } = await createDemo(new Date("2026-11-09T01:00:00.000Z"));
    const dir = mkdtempSync(join(tmpdir(), "growth-restore-"));
    const backup = backupDb(db, join(dir, "backup"), new Date("2026-11-09T02:00:00Z"));
    const dbPath = join(dir, "growth.sqlite");
    writeFileSync(dbPath, "");
    const r = restoreDb(backup, dbPath, new Date("2026-11-09T03:00:00Z"));
    expect(r.previous).toContain(".before-restore-");
    const restored = new Database(dbPath, { readonly: true });
    for (const t of ["queue_items", "hook_candidates", "campaign_results", "storyboards"]) {
      expect((restored.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n).toBe((db.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    }
    restored.close();
    const bad = join(dir, "hong.sqlite");
    writeFileSync(bad, "không phải sqlite");
    expect(() => restoreDb(bad, dbPath, new Date())).toThrow();
  });
});
