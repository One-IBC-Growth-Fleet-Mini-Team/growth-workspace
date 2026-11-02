// T-Q-02 tới T-Q-11, T-NBA-R4 (phần hiển thị), T-PII-06: trang Hàng chờ.
import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { freshDb } from "../helpers/db.ts";
import { AMY, BASE, MARK, events, get, makeApp, post, seedItem, session } from "../helpers/queue.ts";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyIdToken } from "../../src/queue/auth.ts";

let db: Database;
beforeEach(() => { db = freshDb(); });

const act = (id: string, action: string) => `/queue/items/${id}/${action}`;

describe("T-Q-02 mỗi nút ghi đúng một sự kiện", () => {
  test("T-Q-02 xác nhận, sửa, bác, escalate, phản hồi RM, báo PII: mỗi nút một queue_event, actor từ phiên", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const cases: [string, Record<string, string>, number?][] = [
      ["confirm", {}],
      ["edit", { action: "follow_up_unresponsive", note: "ưu tiên gọi sáng" }],
      ["reject", { reason: "RM đã xử lý" }],
      ["escalate", {}, 0.5],
      ["pii_flag", {}],
    ];
    for (const [action, fields, conf] of cases) {
      const id = seedItem(db, { confidence: conf ?? 0.9 });
      const res = await post(app, act(id, action), { csrf: s.csrf, actor: "mark", ...fields }, s.cookie);
      expect({ action, status: res.status }).toEqual({ action, status: 303 });
      const ev = events(db, id);
      expect(ev.length).toBe(1);
      expect(ev[0]).toMatchObject({ actor: "amy", action });
    }
    const id = seedItem(db);
    await post(app, act(id, "confirm"), { csrf: s.csrf }, s.cookie);
    await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_accepted" }, s.cookie);
    expect(events(db, id).map((e) => e.action)).toEqual(["confirm", "rm_outcome"]);
  });

  test("T-Q-02 phản hồi RM chỉ một lần và chỉ sau khi đã xác nhận mục NBA", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    expect((await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_accepted" }, s.cookie)).status).toBe(409);
    await post(app, act(id, "confirm"), { csrf: s.csrf }, s.cookie);
    expect((await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_hacked" }, s.cookie)).status).toBe(422);
    expect((await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_no_reply" }, s.cookie)).status).toBe(303);
    expect((await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_accepted" }, s.cookie)).status).toBe(409);
  });
});

describe("T-Q-02 trạng thái chặn thao tác lặp", () => {
  test("T-Q-02 mục đã báo PII không thao tác được nữa; bấm lặp cùng quyết định bị từ chối", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const flagged = seedItem(db);
    await post(app, act(flagged, "pii_flag"), { csrf: s.csrf }, s.cookie);
    for (const a of ["confirm", "pii_flag", "escalate"]) {
      expect((await post(app, act(flagged, a), { csrf: s.csrf }, s.cookie)).status).toBe(409);
    }
    expect((await post(app, act(flagged, "edit"), { csrf: s.csrf, action: "follow_up" }, s.cookie)).status).toBe(409);
    const twice = seedItem(db);
    expect((await post(app, act(twice, "confirm"), { csrf: s.csrf }, s.cookie)).status).toBe(303);
    expect((await post(app, act(twice, "confirm"), { csrf: s.csrf }, s.cookie)).status).toBe(409);
    expect(events(db, twice).length).toBe(1);
  });

  test("T-Q-10 escalate trả về ngay, không chờ webhook Teams", async () => {
    const { app } = makeApp(db, { notifyEscalation: () => new Promise(() => {}) });
    const s = session(AMY);
    const id = seedItem(db, { confidence: 0.5 });
    const res = await Promise.race([
      post(app, act(id, "escalate"), { csrf: s.csrf }, s.cookie),
      new Promise<Response>((r) => setTimeout(() => r(new Response(null, { status: 599 })), 500)),
    ]);
    expect(res.status).toBe(303);
  });
});

describe("T-Q-03 mở trang", () => {
  test("T-Q-03 mở trang ghi queue_opened với actor từ phiên", async () => {
    const { app } = makeApp(db);
    const res = await get(app, "/queue?date=2026-11-02", session(MARK).cookie);
    expect(res.status).toBe(200);
    expect(events(db)).toEqual([{ actor: "mark", action: "queue_opened", payload: '{"queue_date":"2026-11-02"}' }]);
  });
});

describe("T-Q-04 trạng thái", () => {
  test("T-Q-04 queue_item_state trả quyết định mới nhất; chưa có sự kiện là pending", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const a = seedItem(db);
    const b = seedItem(db);
    await post(app, act(a, "confirm"), { csrf: s.csrf }, s.cookie);
    await post(app, act(a, "reject"), { csrf: s.csrf, reason: "đổi ý" }, s.cookie);
    const state = (id: string) => (db.query("SELECT state FROM queue_item_state WHERE id = ?").get(id) as { state: string }).state;
    expect(state(a)).toBe("reject");
    expect(state(b)).toBe("pending");
  });
});

describe("T-Q-05 bác và sửa", () => {
  test("T-Q-05 bác thiếu lý do bị từ chối", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    expect((await post(app, act(id, "reject"), { csrf: s.csrf, reason: "   " }, s.cookie)).status).toBe(422);
    expect(events(db, id)).toEqual([]);
  });

  test("T-Q-05 sửa lưu bản đầy đủ, chỉ nhận trường cố định theo loại mục", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    expect((await post(app, act(id, "edit"), { csrf: s.csrf, action: "remind_invoice" }, s.cookie)).status).toBe(303);
    const payload = JSON.parse(events(db, id)[0]!.payload!);
    expect(payload).toEqual({ action: "remind_invoice", subject_ref: "O1", owner_rm_id: "RM_A", explanation: "RM theo tiếp", warnings: [], note: "" });
    expect((await post(app, act(id, "edit"), { csrf: s.csrf, action: "sell_everything" }, s.cookie)).status).toBe(422);
    const rc = seedItem(db, { item_type: "reason_code", payload: JSON.stringify({ proposal: { primary: "PRICE_TOO_HIGH", is_final: true } }) });
    expect((await post(app, act(rc, "edit"), { csrf: s.csrf, primary: "PRICE_COMPARING", is_final: "false", opportunity_id: "O9" }, s.cookie)).status).toBe(303);
    expect(JSON.parse(events(db, rc)[0]!.payload!)).toMatchObject({ proposal: { primary: "PRICE_COMPARING", is_final: false }, opportunity_id: "O9" });
    const sys = seedItem(db, { item_type: "system_notice", payload: '{"kind":"x","message":"y"}' });
    expect((await post(app, act(sys, "edit"), { csrf: s.csrf }, s.cookie)).status).toBe(422);
  });
});

describe("T-Q-06 đăng nhập", () => {
  test("T-Q-06 không đăng nhập: /health 200, /queue chuyển sang đăng nhập, POST trả 401", async () => {
    const { app } = makeApp(db);
    expect((await get(app, "/health")).status).toBe(200);
    const r = await get(app, "/queue");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/login");
    const id = seedItem(db);
    expect((await post(app, act(id, "confirm"), { csrf: "x" })).status).toBe(401);
    expect(events(db)).toEqual([]);
  });

  test("T-Q-06 cookie phiên giả hoặc hết hạn bị từ chối", async () => {
    const { app } = makeApp(db);
    const forged = session(AMY).cookie.replace(/\.[^.;]+/, ".AAAA");
    expect((await get(app, "/queue", forged)).status).toBe(302);
    const { app: later } = makeApp(db, { now: () => new Date("2026-11-04T00:00:00Z") });
    expect((await get(later, "/queue", session(AMY).cookie)).status).toBe(302);
  });

  test("T-Q-06 luồng OIDC: state phải khớp; người ngoài danh sách bị từ chối; Amy vào được", async () => {
    const { app } = makeApp(db);
    const login = await get(app, "/login");
    expect(login.status).toBe(302);
    const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
    const oidcSet = login.headers.get("set-cookie")!;
    // Cookie OIDC phải là Lax: Entra chuyển về /auth/callback bằng điều hướng khác site, Strict sẽ bị bỏ.
    expect(oidcSet).toMatch(/SameSite=Lax/);
    const oidcCookie = oidcSet.split(";")[0]!;
    expect((await get(app, `/auth/callback?code=code-amy&state=wrong`, oidcCookie)).status).toBe(400);
    expect((await get(app, `/auth/callback?code=code-stranger&state=${state}`, oidcCookie)).status).toBe(403);
    const ok = await get(app, `/auth/callback?code=code-amy&state=${state}`, oidcCookie);
    // Trả trang cùng site rồi mới chuyển sang /queue, để cookie phiên Strict được gửi ở bước kế.
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('http-equiv="refresh" content="0;url=/queue"');
    expect(ok.headers.getSetCookie().some((c) => c.startsWith("gw_oidc=;") && c.includes("Path=/auth"))).toBe(true);
    const setCookie = ok.headers.getSetCookie().find((c) => c.startsWith("gw_session="))!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect((await get(app, "/queue", setCookie.split(";")[0])).status).toBe(200);
  });

  test("T-Q-06 Mark không có nút duyệt và không duyệt được", async () => {
    const { app } = makeApp(db);
    const id = seedItem(db, { confidence: 0.5 });
    const html = await (await get(app, "/queue?date=2026-11-02", session(MARK).cookie)).text();
    expect(html).not.toContain(`${id}/confirm`);
    expect(html).not.toContain(`${id}/escalate`);
    const s = session(MARK);
    expect((await post(app, act(id, "confirm"), { csrf: s.csrf }, s.cookie)).status).toBe(403);
    expect(events(db, id)).toEqual([]);
  });

  test("T-Q-06 verifyIdToken: chữ ký RS256, iss, aud, exp, nonce", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, string>), kid: "k1", alg: "RS256", use: "sig" };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const make = (claims: Record<string, unknown>) => {
      const h = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
      const p = b64(claims);
      const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
      return `${h}.${p}.${sig}`;
    };
    const now = Date.parse("2026-11-02T02:00:00Z") / 1000;
    const good = { iss: "https://login.microsoftonline.com/t1/v2.0", aud: "client-1", exp: now + 600, nbf: now - 10, nonce: "n1", oid: "oid-amy" };
    const opts = { jwks: [jwk], issuer: good.iss, audience: "client-1", nonce: "n1", nowSeconds: now };
    expect(await verifyIdToken(make(good), opts)).toEqual({ oid: "oid-amy", nonce: "n1" });
    for (const bad of [{ aud: "other" }, { iss: "https://evil" }, { exp: now - 600 }, { nonce: "n2" }]) {
      await expect(verifyIdToken(make({ ...good, ...bad }), opts)).rejects.toThrow();
    }
    const tampered = make(good).replace(/\.[^.]+\./, `.${b64({ ...good, oid: "oid-mark" })}.`);
    await expect(verifyIdToken(tampered, opts)).rejects.toThrow();
    const noneAlg = `${b64({ alg: "none", kid: "k1" })}.${b64(good)}.`;
    await expect(verifyIdToken(noneAlg, opts)).rejects.toThrow();
  });
});

describe("T-Q-07 CSRF", () => {
  test("T-Q-07 thiếu hoặc sai CSRF token bị từ chối; Origin lạ bị từ chối", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    expect((await post(app, act(id, "confirm"), {}, s.cookie)).status).toBe(403);
    expect((await post(app, act(id, "confirm"), { csrf: "wrong" }, s.cookie)).status).toBe(403);
    expect((await post(app, act(id, "confirm"), { csrf: s.csrf }, s.cookie, { origin: "https://evil.example" })).status).toBe(403);
    expect(events(db, id)).toEqual([]);
  });
});

describe("T-Q-07 Origin khi trình duyệt POST form", () => {
  test("T-Q-07 Referrer-Policy là same-origin: với no-referrer, Chromium gửi Origin: null và mọi nút bị chặn", async () => {
    const { app } = makeApp(db);
    const res = await get(app, "/queue?date=2026-11-02", session(AMY).cookie);
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
  });
});

describe("T-Q-08 escape", () => {
  test("T-Q-08 chuỗi chứa <script> trong payload được escape khi render; CSP chặn script", async () => {
    const { app } = makeApp(db);
    seedItem(db, { payload: JSON.stringify({ action: "follow_up", explanation: '<script>alert("x")</script>', warnings: ["<img src=x onerror=1>"] }) });
    const res = await get(app, "/queue?date=2026-11-02", session(AMY).cookie);
    const html = await res.text();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(res.headers.get("x-frame-options") ?? res.headers.get("content-security-policy")).toMatch(/DENY|frame-ancestors 'none'/);
  });
});

describe("T-Q-10 nút Escalate", () => {
  test("T-Q-10 mục dưới 0,8 có nút Escalate; từ 0,8 không có; escalate gửi Mark tin chỉ có link", async () => {
    const { app, escalations } = makeApp(db);
    const low = seedItem(db, { confidence: 0.79 });
    const high = seedItem(db, { confidence: 0.8 });
    const html = await (await get(app, "/queue?date=2026-11-02", session(AMY).cookie)).text();
    expect(html).toContain(`${low}/escalate`);
    expect(html).not.toContain(`${high}/escalate`);
    const s = session(AMY);
    expect((await post(app, act(high, "escalate"), { csrf: s.csrf }, s.cookie)).status).toBe(422);
    expect((await post(app, act(low, "escalate"), { csrf: s.csrf }, s.cookie)).status).toBe(303);
    expect(escalations).toEqual([`${BASE}/queue?date=2026-11-02#item-${low}`]);
  });
});

describe("T-Q-11 báo PII", () => {
  test("T-Q-11 pii_flag ẩn mục khỏi trang", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    expect(await (await get(app, "/queue?date=2026-11-02", s.cookie)).text()).toContain(`item-${id}`);
    await post(app, act(id, "pii_flag"), { csrf: s.csrf }, s.cookie);
    expect(await (await get(app, "/queue?date=2026-11-02", s.cookie)).text()).not.toContain(`item-${id}`);
  });
});

describe("T-NBA-R4 hiển thị chờ RM xác nhận", () => {
  test("T-NBA-R4 sau confirm hiển thị chờ RM xác nhận tới khi có rm_outcome; có khối Danh sách cho RM", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    await post(app, act(id, "confirm"), { csrf: s.csrf }, s.cookie);
    let html = await (await get(app, "/queue?date=2026-11-02", s.cookie)).text();
    expect(html).toContain("chờ RM xác nhận");
    expect(html).toContain("Danh sách cho RM");
    await post(app, act(id, "rm_outcome"), { csrf: s.csrf, outcome: "rm_already_handled" }, s.cookie);
    html = await (await get(app, "/queue?date=2026-11-02", s.cookie)).text();
    expect(html).not.toContain("chờ RM xác nhận");
    expect(html).toContain("RM đã xử lý");
  });
});

describe("T-PII-06 ghi chú của Amy", () => {
  test("T-PII-06 ghi chú ở form sửa và lý do bác đi qua R1 và R3; có PII thì bị từ chối", async () => {
    const { app } = makeApp(db);
    const s = session(AMY);
    const id = seedItem(db);
    for (const note of ["gọi canary+1@example.invalid", "gọi +44 7700 900123", "khách tên Johnathan Doe"]) {
      expect((await post(app, act(id, "edit"), { csrf: s.csrf, action: "follow_up", note }, s.cookie)).status).toBe(422);
      expect((await post(app, act(id, "reject"), { csrf: s.csrf, reason: note }, s.cookie)).status).toBe(422);
    }
    expect(events(db, id)).toEqual([]);
    expect((await post(app, act(id, "edit"), { csrf: s.csrf, action: "follow_up", note: "x".repeat(301) }, s.cookie)).status).toBe(422);
  });
});
