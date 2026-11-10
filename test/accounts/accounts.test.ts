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
    await setPassword(db, "mkt", pw, { mustChange: true, now: NOW, actor: "add-user" });
    const { app } = makeApp(db, { passwordHashes: new Map([["amy", await Bun.password.hash("mat-khau-amy-thu")]]) });
    const login = await post(app, "/login", { user: "mkt", password: pw });
    expect(login.headers.get("location")).toBe("/password");
    const cookie = login.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!.split(";")[0]!;
    expect((await get(app, "/overview", cookie)).headers.get("location")).toBe("/password");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await get(app, "/password", cookie)).text())![1]!;
    expect((await post(app, "/password", { csrf, password: "ngan", password2: "ngan" }, cookie)).status).toBe(422);
    const done = await post(app, "/password", { csrf, password: "mat-khau-moi-cua-mkt", password2: "mat-khau-moi-cua-mkt" }, cookie);
    expect(done.headers.get("location")).toBe("/overview");
    expect(currentPassword(db, "mkt")?.mustChange).toBe(false);
    expect((await get(app, "/overview", cookie)).status).toBe(200);
    expect((await post(app, "/login", { user: "mkt", password: pw })).status).toBe(401); // mật khẩu tạm hết dùng được
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
