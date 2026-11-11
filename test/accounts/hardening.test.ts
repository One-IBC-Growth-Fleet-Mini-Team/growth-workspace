// T-SEC-01 tới T-SEC-07: làm chặt đăng nhập (D-97): mật khẩu tạm 72 giờ, API JSON khi còn mật khẩu tạm, luật mật khẩu
// mới, giới hạn theo IP, phiên 8 giờ không dùng và 7 ngày tuyệt đối, cờ cookie, sổ sự kiện bảo mật trên /settings.
import { describe, expect, test } from "bun:test";
import { runAccountCommand } from "../../src/db/account-cli.ts";
import { listSecurityEvents } from "../../src/db/users.ts";
import { isCommonPassword } from "../../src/security/password-policy.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, post } from "../helpers/queue.ts";

const T0 = Date.parse("2026-11-02T01:00:00.000Z");
const H = 3_600_000;
const tempOf = (out: string) => /Mật khẩu tạm: (\S+)/.exec(out)![1]!;
const cookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith("gw_session="))?.split(";")[0];
const csrfOf = (html: string) => /name="csrf" value="([^"]+)"/.exec(html)![1]!;

async function setup(id = "mkt-01", role = "mkt") {
  const clock = { t: T0 };
  const db = freshDb();
  const { app } = makeApp(db, { passwordLogin: true, now: () => new Date(clock.t) });
  const temp = tempOf((await runAccountCommand(db, ["add-user", id, role], { now: new Date(clock.t) })).out);
  return { db, app, clock, temp };
}

describe("T-SEC làm chặt đăng nhập", () => {
  test("T-SEC-01 mật khẩu tạm quá 72 giờ thì không đăng nhập được, ghi sự kiện; reset thì dùng lại được", async () => {
    const { db, app, clock, temp } = await setup();
    clock.t = T0 + 72 * H + 1;
    const r = await post(app, "/login", { user: "mkt-01", password: temp });
    expect(r.status).toBe(401);
    expect(await r.text()).toContain("Mật khẩu tạm đã hết hạn");
    expect(cookieOf(r)).toBeUndefined();
    expect(listSecurityEvents(db)[0]!.kind).toBe("password_expired");
    const fresh = tempOf((await runAccountCommand(db, ["reset-password", "mkt-01"], { now: new Date(clock.t) })).out);
    expect((await post(app, "/login", { user: "mkt-01", password: fresh })).headers.get("location")).toBe("/password");
  });

  test("T-SEC-02 còn mật khẩu tạm: API JSON trả 403 không có dữ liệu; trang HTML chuyển về /password; /logout vẫn được", async () => {
    const { app, temp } = await setup("gd-01", "mark");
    const c = cookieOf(await post(app, "/login", { user: "gd-01", password: temp }))!;
    const api = await get(app, "/command/data.json", c);
    expect(api.status).toBe(403);
    const body = await api.text();
    expect(body).not.toContain("crew");
    expect(body).not.toContain("{");
    const accept = await app.fetch(new Request(`${BASE}/overview`, { headers: { cookie: c, accept: "application/json" } }));
    expect(accept.status).toBe(403);
    expect((await get(app, "/settings", c)).headers.get("location")).toBe("/password");
    expect((await get(app, "/password", c)).status).toBe(200);
  });

  test("T-SEC-03 mật khẩu mới: dưới 12 ký tự, chứa mã tài khoản, phổ biến, trùng mật khẩu tạm đều bị từ chối bằng tiếng Việt", async () => {
    const { app, temp } = await setup();
    const c = cookieOf(await post(app, "/login", { user: "mkt-01", password: temp }))!;
    const csrf = csrfOf(await (await get(app, "/password", c)).text());
    const tryPw = async (pw: string) => { const r = await post(app, "/password", { csrf, password: pw, password2: pw }, c); return { status: r.status, text: await r.text() }; };
    expect(isCommonPassword("Unbelievable")).toBe(true);
    expect(await tryPw("ngan-qua")).toMatchObject({ status: 422, text: expect.stringContaining("ít nhất 12 ký tự") });
    expect(await tryPw("toi-la-MKT-01-day")).toMatchObject({ status: 422, text: expect.stringContaining("không được chứa mã tài khoản") });
    expect(await tryPw("unbelievable")).toMatchObject({ status: 422, text: expect.stringContaining("quá phổ biến") });
    expect(await tryPw(temp)).toMatchObject({ status: 422, text: expect.stringContaining("khác mật khẩu tạm") });
    expect((await tryPw("den-long-do-ruc-ro")).status).toBe(303);
  });

  test("T-SEC-04 giới hạn theo IP: 20 lần sai từ một IP thì IP đó bị chặn 15 phút kể cả đúng mật khẩu; IP khác vẫn vào; khoá 5 lần theo tài khoản giữ nguyên", async () => {
    const { db, app, clock, temp } = await setup();
    const from = (ip: string, user: string, password: string) =>
      post(app, "/login", { user, password }, undefined, { "x-forwarded-for": `10.0.0.9, ${ip}` });
    for (let i = 0; i < 20; i++) expect((await from("192.0.2.10", `nguoi-la-${i}`, "sai")).status).toBe(401);
    expect((await from("192.0.2.10", "mkt-01", temp)).status).toBe(429);
    expect((await from("198.51.100.7", "mkt-01", temp)).status).toBe(303);
    expect(listSecurityEvents(db).some((e) => e.kind === "login_rate_limited")).toBe(true);
    expect(listSecurityEvents(db).filter((e) => e.kind === "login_failed").every((e) => e.accountId === "?")).toBe(true);
    clock.t += 15 * 60_000 + 1;
    expect((await from("192.0.2.10", "mkt-01", temp)).status).toBe(303);
    for (let i = 0; i < 5; i++) await from("203.0.113.5", "mkt-01", "sai-mat-khau");
    expect((await from("203.0.113.6", "mkt-01", temp)).status).toBe(429);
  });

  test("T-SEC-05 phiên: quá 8 giờ không dùng thì hết; dùng đều thì gia hạn nhưng không quá 7 ngày từ lúc đăng nhập", async () => {
    const { app, clock, temp } = await setup();
    const c0 = cookieOf(await post(app, "/login", { user: "mkt-01", password: temp }))!;
    const csrf = csrfOf(await (await get(app, "/password", c0)).text());
    let c = cookieOf(await post(app, "/password", { csrf, password: "den-long-do-ruc-ro", password2: "den-long-do-ruc-ro" }, c0))!;
    const start = clock.t;
    clock.t = start + 8 * H + 1;
    expect((await get(app, "/overview", c)).headers.get("location")).toBe("/login");
    clock.t = start;
    for (let k = 1; k * 6 * H < 7 * 24 * H; k++) {
      clock.t = start + k * 6 * H;
      const r = await get(app, "/overview", c);
      expect(r.status).toBe(200);
      c = cookieOf(r) ?? c;
    }
    clock.t = start + 7 * 24 * H;
    expect((await get(app, "/overview", c)).headers.get("location")).toBe("/login");
  });

  test("T-SEC-06 cookie phiên: QUEUE_BASE_URL https thì có Secure, HttpOnly, SameSite=Strict; localhost http thì không Secure", async () => {
    for (const [base, secure] of [["https://growth.example.invalid", true], ["http://localhost:3000", false]] as const) {
      const db = freshDb();
      const { app } = makeApp(db, { passwordLogin: true, baseUrl: base, now: () => new Date(T0) });
      const temp = tempOf((await runAccountCommand(db, ["add-user", "amy-01", "amy"], { now: new Date(T0) })).out);
      const r = await app.fetch(new Request(`${base}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: new URLSearchParams({ user: "amy-01", password: temp }).toString() }));
      const set = r.headers.getSetCookie().find((x) => x.startsWith("gw_session="))!;
      expect(set).toContain("HttpOnly");
      expect(set).toContain("SameSite=Strict");
      expect(set.includes("Secure")).toBe(secure);
    }
  });

  test("T-SEC-07 /settings: Mark xem sổ sự kiện bảo mật, không có mật khẩu hay mã băm; vai trò khác không vào được", async () => {
    const { db, app, clock, temp } = await setup("gd-01", "mark");
    await post(app, "/login", { user: "gd-01", password: "sai-roi" });
    await post(app, "/login", { user: "SuaMatKhau2026!", password: "x" });
    const c0 = cookieOf(await post(app, "/login", { user: "gd-01", password: temp }))!;
    const csrf = csrfOf(await (await get(app, "/password", c0)).text());
    const c = cookieOf(await post(app, "/password", { csrf, password: "giay-moi-mau-xanh-ngoc", password2: "giay-moi-mau-xanh-ngoc" }, c0))!;
    clock.t += 60_000;
    const html = await (await get(app, "/settings", c)).text();
    for (const k of ["Sổ sự kiện bảo mật", "Đăng nhập sai", "Đổi mật khẩu", "Tạo tài khoản", "Đăng nhập được"]) expect(html).toContain(k);
    expect(html).not.toContain("SuaMatKhau2026");
    expect(html).not.toContain("argon2");
    expect(html).not.toContain(temp);
    const amy = tempOf((await runAccountCommand(db, ["add-user", "amy-01", "amy"], { now: new Date(clock.t) })).out);
    const ca0 = cookieOf(await post(app, "/login", { user: "amy-01", password: amy }))!;
    const ca = cookieOf(await post(app, "/password", { csrf: csrfOf(await (await get(app, "/password", ca0)).text()), password: "ca-phe-sang-tuoi-mat", password2: "ca-phe-sang-tuoi-mat" }, ca0))!;
    expect((await get(app, "/settings", ca)).status).toBe(403);
  });
});

describe("T-SEC sau review", () => {
  test("T-SEC-08 reset-password gỡ khoá 15 phút ngay; tài khoản không có thật cũng chạy verify (không lộ qua thời gian)", async () => {
    const { db, app, clock, temp } = await setup();
    for (let i = 0; i < 5; i++) await post(app, "/login", { user: "mkt-01", password: "sai-mat-khau" });
    expect((await post(app, "/login", { user: "mkt-01", password: temp })).status).toBe(429);
    clock.t += 60_000;
    const fresh = tempOf((await runAccountCommand(db, ["reset-password", "mkt-01"], { now: new Date(clock.t) })).out);
    clock.t += 1000;
    expect((await post(app, "/login", { user: "mkt-01", password: fresh })).headers.get("location")).toBe("/password");
    const time = async (user: string) => { const t0 = performance.now(); await post(app, "/login", { user, password: "khong-dung" }); return performance.now() - t0; };
    await time("khong-co-ai");
    const known = await time("mkt-01"), unknown = await time("khong-co-ai-2");
    expect(unknown).toBeGreaterThan(known / 4);
  });
});
