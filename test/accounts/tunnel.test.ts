// T-TUN-01 tới T-TUN-05: Quick Tunnel (D-98). Không gọi cloudflared thật: yêu cầu giả đúng như cloudflared chuyển về app
// (Host là tên trycloudflare, Origin https của link đó, X-Forwarded-For do biên Cloudflare ghi).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { runAccountCommand } from "../../src/db/account-cli.ts";
import { fetchTunnelHostname, latestTunnelUrl, recordTunnelUrl } from "../../src/db/tunnel.ts";
import { freshDb } from "../helpers/db.ts";
import { makeApp } from "../helpers/queue.ts";

const NOW = new Date("2026-11-11T01:00:00.000Z");
const LOCAL = "http://localhost:3000";
const HOST = "calm-river-demo.trycloudflare.com";
const TUN = `https://${HOST}`;
const tempOf = (out: string) => /Mật khẩu tạm: (\S+)/.exec(out)![1]!;
const cookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith("gw_session="));

// Yêu cầu tới app ở localhost như cloudflared chuyển: URL nội bộ http, Host giữ tên tunnel.
function viaTunnel(app: ReturnType<typeof makeApp>["app"], path: string, init: { method?: string; body?: Record<string, string>; cookie?: string; origin?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: init.host ?? HOST, "x-forwarded-for": "198.51.100.23", "x-forwarded-proto": "https" };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body) { headers["content-type"] = "application/x-www-form-urlencoded"; headers.origin = init.origin ?? TUN; }
  return app.fetch(new Request(`http://127.0.0.1:3000${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body ? new URLSearchParams(init.body).toString() : undefined }));
}

describe("T-TUN Quick Tunnel", () => {
  test("T-TUN-01 ghi link: chỉ tên trycloudflare hợp lệ, trùng thì không ghi lại; đọc tên từ cổng metrics của cloudflared", async () => {
    const db = freshDb();
    expect(recordTunnelUrl(db, HOST, NOW)).toBe(true);
    expect(recordTunnelUrl(db, `${TUN}/`, NOW)).toBe(false);
    expect(recordTunnelUrl(db, "evil.example.com", NOW)).toBe(false);
    expect(recordTunnelUrl(db, "other-demo.trycloudflare.com", new Date(NOW.getTime() + 1000))).toBe(true);
    expect(latestTunnelUrl(db)?.url).toBe("https://other-demo.trycloudflare.com");
    const metrics = (async () => new Response(JSON.stringify({ hostname: HOST }))) as unknown as typeof fetch;
    expect(await fetchTunnelHostname("127.0.0.1:20241", metrics)).toBe(HOST);
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    expect(await fetchTunnelHostname("127.0.0.1:20241", down)).toBeNull();
  });

  test("T-TUN-02 qua tunnel: đăng nhập, đổi mật khẩu, POST có Origin của link tunnel đều được; cookie có Secure; ở localhost không Secure", async () => {
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, baseUrl: LOCAL, now: () => NOW });
    recordTunnelUrl(db, HOST, NOW);
    const temp = tempOf((await runAccountCommand(db, ["add-user", "mkt-01", "mkt"], { now: NOW })).out);
    const login = await viaTunnel(app, "/login", { body: { user: "mkt-01", password: temp } });
    expect(login.status).toBe(303);
    const set = cookieOf(login)!;
    expect(set).toContain("Secure");
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Strict");
    const c = set.split(";")[0]!;
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await viaTunnel(app, "/password", { cookie: c })).text())![1]!;
    const done = await viaTunnel(app, "/password", { cookie: c, body: { csrf, password: "den-long-do-ruc-ro", password2: "den-long-do-ruc-ro" } });
    expect(done.status).toBe(303);
    const c2 = cookieOf(done)!.split(";")[0]!;
    const ov = await viaTunnel(app, "/overview", { cookie: c2 });
    expect(ov.status).toBe(200);
    const csrf2 = /name="csrf" value="([^"]+)"/.exec(await ov.text())![1]!;
    expect((await viaTunnel(app, "/command/data.json", { cookie: c2 })).status).toBe(200);
    expect((await viaTunnel(app, "/logout", { cookie: c2, body: { csrf: csrf2 } })).headers.getSetCookie()[0]).toContain("Secure");
    const local = await app.fetch(new Request(`${LOCAL}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: LOCAL }, body: new URLSearchParams({ user: "mkt-01", password: "den-long-do-ruc-ro" }).toString() }));
    expect(local.status).toBe(303);
    expect(cookieOf(local)).not.toContain("Secure");
  });

  test("T-TUN-03 link cũ, Host lạ hoặc Origin lạ thì POST bị từ chối; IP lấy từ X-Forwarded-For của Cloudflare", async () => {
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, baseUrl: LOCAL, now: () => NOW });
    recordTunnelUrl(db, "old-demo.trycloudflare.com", NOW);
    recordTunnelUrl(db, HOST, new Date(NOW.getTime() + 1000));
    const body = { user: "x", password: "y" };
    expect((await viaTunnel(app, "/login", { body, host: "old-demo.trycloudflare.com", origin: "https://old-demo.trycloudflare.com" })).status).toBe(403);
    expect((await viaTunnel(app, "/login", { body, origin: "https://evil.example" })).status).toBe(403);
    expect((await viaTunnel(app, "/login", { body, host: "evil.example", origin: TUN })).status).toBe(403);
    expect((await viaTunnel(app, "/login", { body })).status).toBe(401);
  });

  test("T-TUN-04 /settings (Mark) và Brief sáng hiện link hiện tại; chưa bật tunnel thì /settings hướng dẫn bật", async () => {
    const db = freshDb();
    const { app } = makeApp(db, { passwordLogin: true, baseUrl: LOCAL, now: () => NOW });
    const temp = tempOf((await runAccountCommand(db, ["add-user", "gd-01", "mark"], { now: NOW })).out);
    // Chưa có link trong DB: Host tunnel không được nhận, nên đăng nhập ở localhost.
    expect((await viaTunnel(app, "/login", { body: { user: "gd-01", password: temp } })).status).toBe(403);
    const login = await app.fetch(new Request(`${LOCAL}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: LOCAL }, body: new URLSearchParams({ user: "gd-01", password: temp }).toString() }));
    const lc = cookieOf(login)!.split(";")[0]!;
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await app.fetch(new Request(`${LOCAL}/password`, { headers: { cookie: lc } }))).text())![1]!;
    const done = await app.fetch(new Request(`${LOCAL}/password`, { method: "POST", headers: { cookie: lc, "content-type": "application/x-www-form-urlencoded", origin: LOCAL }, body: new URLSearchParams({ csrf, password: "giay-moi-mau-xanh-ngoc", password2: "giay-moi-mau-xanh-ngoc" }).toString() }));
    const c = cookieOf(done)!.split(";")[0]!;
    const page = (p: string) => app.fetch(new Request(`${LOCAL}${p}`, { headers: { cookie: c } })).then((r) => r.text());
    expect(await page("/settings")).toContain("quick-tunnel.sh");
    recordTunnelUrl(db, HOST, NOW);
    expect(await page("/settings")).toContain(`href="${TUN}"`);
    expect(await page("/brief")).toContain(`Link hôm nay: <a href="${TUN}"`);
  });

  test("T-TUN-05 không dùng SSE (Quick Tunnel không hỗ trợ): /command tự tải lại bằng Refresh, bản 3D hỏi data.json mỗi 5 giây", () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(ts|js)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    const src = files(new URL("../../src", import.meta.url).pathname).filter((f) => !f.includes("/vendor/"));
    for (const f of src) expect(readFileSync(f, "utf8")).not.toMatch(/text\/event-stream|new EventSource/);
    expect(readFileSync(new URL("../../src/queue/static/command3d/core.js", import.meta.url), "utf8")).toContain("setInterval(poll, 5000)");
  });
});
