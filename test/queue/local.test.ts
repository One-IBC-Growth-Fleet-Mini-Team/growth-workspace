// T-LOCAL-01, T-LOCAL-02: chạy Hàng chờ trên chính máy Ubuntu của người dùng (D-26).
// Chỉ http://localhost hoặc http://127.0.0.1 được phép không có HTTPS; mọi địa chỉ khác vẫn bắt buộc https.
import { describe, expect, test } from "bun:test";
import { ConfigError, getQueueConfig } from "../../src/config.ts";
import { freshDb } from "../helpers/db.ts";
import { makeApp } from "../helpers/queue.ts";

const SECRET = "test-only-session-secret-0123456789abcdef";

describe("T-LOCAL-01 địa chỉ Hàng chờ", () => {
  test("T-LOCAL-01 nhận http://localhost và http://127.0.0.1 (có hoặc không có cổng); https vẫn nhận", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost", "https://queue.example.invalid"]) {
      expect(getQueueConfig({ SESSION_SECRET: SECRET, QUEUE_BASE_URL: url }).baseUrl).toBe(url);
    }
  });

  test("T-LOCAL-01 http tới máy khác bị từ chối, kể cả tên giả dạng localhost", () => {
    for (const url of ["http://queue.example.invalid", "http://localhost.example.invalid:3000", "http://192.168.1.10:3000", "http://localhost@evil.invalid"]) {
      expect(() => getQueueConfig({ SESSION_SECRET: SECRET, QUEUE_BASE_URL: url })).toThrow(ConfigError);
    }
  });
});

describe("T-LOCAL-02 cookie phiên", () => {
  async function loginCookie(baseUrl: string): Promise<string> {
    const hash = await Bun.password.hash("mat-khau-thu-nghiem-12", { algorithm: "argon2id" });
    const { app } = makeApp(freshDb(), { baseUrl, passwordHashes: new Map([["amy", hash]]) });
    const res = await app.fetch(
      new Request(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(baseUrl).origin },
        body: new URLSearchParams({ user: "amy", password: "mat-khau-thu-nghiem-12" }).toString(),
      }),
    );
    expect(res.status).toBe(303);
    return res.headers.get("set-cookie") ?? "";
  }

  test("T-LOCAL-02 chạy trên localhost: cookie không gắn Secure để mọi trình duyệt giữ được; vẫn HttpOnly, SameSite=Strict", async () => {
    const c = await loginCookie("http://localhost:3000");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).not.toContain("Secure");
  });

  test("T-LOCAL-02 chạy qua https: cookie vẫn có Secure", async () => {
    expect(await loginCookie("https://queue.example.invalid")).toContain("Secure");
  });
});
