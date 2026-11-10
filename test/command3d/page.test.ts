// T-3D-01 tới T-3D-03: trang /command/3d và file tĩnh (D-93). Cùng payload với bản phẳng; Three.js r0.160.0 vendored,
// không gọi CDN; tự về bản phẳng khi không WebGL, prefers-reduced-motion hoặc người dùng chọn; không PII.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createDemo } from "../../src/demo/server.ts";

const NOW = new Date("2026-11-09T01:00:00.000Z");
const B = "http://localhost:3000";
const STATIC = new URL("../../src/queue/static/", import.meta.url).pathname;
async function as(app: { fetch(r: Request): Promise<Response> }, who: string) {
  const c = (await app.fetch(new Request(`${B}/login?as=${who}`))).headers.getSetCookie().find((x) => x.startsWith("gw_session="))!.split(";")[0]!;
  return (p: string) => app.fetch(new Request(`${B}${p}`, { headers: { cookie: c } }));
}

describe("T-3D Command Center 3D", () => {
  test("T-3D-01 mọi vai trò mở được; CSP chỉ cho script của app; trang có sẵn bản rút gọn từ cùng payload", async () => {
    const { app } = await createDemo(NOW);
    for (const who of ["mark", "bod", "amy", "mkt"]) {
      const get = await as(app, who);
      const r = await get("/command/3d");
      expect(r.status).toBe(200);
      const csp = r.headers.get("content-security-policy")!;
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toMatch(/https?:/);
      const page = await r.text();
      const data = (await (await get("/command/data.json")).json()) as { modules: { label: string; summary: string }[] };
      for (const m of data.modules) { expect(page).toContain(m.label); expect(page).toContain(m.summary); }
      expect(page).toContain('<script type="module" src="/static/command3d/app.js">');
      expect(page).not.toMatch(/<script[^>]*src="https?:/);
    }
    expect((await app.fetch(new Request(`${B}/command/3d`))).headers.get("location")).toBe("/login");
  });

  test("T-3D-02 file tĩnh: chỉ file có sẵn, đúng kiểu; đường dẫn lạ hoặc lùi thư mục trả 404; chưa đăng nhập về /login", async () => {
    const { app } = await createDemo(NOW);
    const get = await as(app, "mkt");
    const glb = await get("/static/command3d/mi1.glb");
    expect([glb.status, glb.headers.get("content-type")]).toEqual([200, "model/gltf-binary"]);
    expect((await glb.arrayBuffer()).byteLength).toBe(10171984);
    expect((await get("/static/vendor/three/three.module.min.js")).headers.get("content-type")).toContain("javascript");
    for (const p of ["/static/../server.ts", "/static/%2e%2e/server.ts", "/static/command3d/khong-co.js", "/static/vendor/three/LICENSE"]) expect([403, 404]).toContain((await get(p)).status);
    expect((await app.fetch(new Request(`${B}/static/command3d/app.js`))).headers.get("location")).toBe("/login");
  });

  test("T-3D-03 Three.js r0.160.0 vendored, không URL ngoài trong script của app; có đường tự về bản phẳng", () => {
    expect(readFileSync(STATIC + "vendor/three/three.module.min.js", "utf8")).toContain('"160"');
    for (const f of readdirSync(STATIC + "command3d").filter((x) => x.endsWith(".js"))) {
      const js = readFileSync(STATIC + "command3d/" + f, "utf8");
      expect({ f, external: /https?:\/\//.test(js) }).toEqual({ f, external: false });
    }
    const app = readFileSync(STATIC + "command3d/app.js", "utf8");
    for (const s of ["prefers-reduced-motion", "getContext('webgl", "location.replace('/command')", "gw3d"]) expect(app).toContain(s);
  });
});
