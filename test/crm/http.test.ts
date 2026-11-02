// T-CRM-01, T-CRM-02, T-CRM-03, T-CRM-06: crmGet là cửa duy nhất tới CRM, chỉ GET.
// Không test nào gọi CRM thật; fetch được thay bằng hàm giả hoặc CRM giả trên 127.0.0.1.
import { describe, expect, test } from "bun:test";
import { CRM_RESOURCES, CrmError, crmGet, type CrmGetOptions } from "../../src/crm/http.ts";
import { startFakeCrm } from "./fake-crm.ts";

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: (url: string, n: number) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return respond(url, calls.length);
  }) as typeof fetch;
  return { calls, impl };
}

const noSleep = async () => {};

function opts(fetchImpl: typeof fetch, baseUrl = "https://api-crm.oneibc.com/v1"): CrmGetOptions {
  return { baseUrl, token: "test-token", fetchImpl, sleep: noSleep };
}

describe("T-CRM-01 crmGet chỉ gửi GET", () => {
  test("T-CRM-01 mọi resource trong enum: method GET, không body", async () => {
    const f = fakeFetch(() => Response.json({ records: [] }));
    for (const r of CRM_RESOURCES) await crmGet(r, { page: 1 }, opts(f.impl));
    expect(f.calls.length).toBe(CRM_RESOURCES.length);
    for (const c of f.calls) {
      expect(c.init?.method).toBe("GET");
      expect(c.init?.body ?? null).toBeNull();
      expect(c.init?.redirect).toBe("manual");
    }
  });

  test("T-CRM-01 với CRM giả thật qua mạng loopback: GET, không body", async () => {
    const crm = startFakeCrm();
    try {
      for (const r of CRM_RESOURCES) await crmGet(r, { page: 1 }, { baseUrl: crm.baseUrl, token: "t", sleep: noSleep });
      expect(crm.requests.length).toBe(CRM_RESOURCES.length);
      for (const req of crm.requests) {
        expect(req.method).toBe("GET");
        expect(req.hasBody).toBe(false);
      }
    } finally {
      crm.stop();
    }
  });

  test("T-CRM-01 crmGet không có tham số method hay body", async () => {
    expect(crmGet.length).toBe(3);
    const f = fakeFetch(() => Response.json({}));
    // Khoá lạ trong options bị từ chối, kể cả method.
    const bad = { ...opts(f.impl), method: "PATCH" } as unknown as CrmGetOptions;
    await expect(crmGet("Lead", {}, bad)).rejects.toMatchObject({ code: "CRM_OPTION_NOT_ALLOWED" });
    expect(f.calls.length).toBe(0);
  });
});

describe("T-CRM-02 resource ngoài enum", () => {
  test("T-CRM-02 ném lỗi, không gửi request", async () => {
    const f = fakeFetch(() => Response.json({}));
    for (const r of ["Account", "User", "../Lead", "Lead/../../admin", ""]) {
      await expect(crmGet(r as never, {}, opts(f.impl))).rejects.toMatchObject({ code: "CRM_RESOURCE_NOT_ALLOWED" });
    }
    expect(f.calls.length).toBe(0);
  });
});

describe("T-CRM-03 host và redirect", () => {
  test("T-CRM-03 host khác allowlist ném lỗi trước khi gửi", async () => {
    const f = fakeFetch(() => Response.json({}));
    for (const base of [
      "https://evil.example/v1",
      "http://api-crm.oneibc.com/v1",
      "https://api-crm.oneibc.com.evil.example/v1",
      "https://crm.oneibc.com/v1",
      "not a url",
    ]) {
      await expect(crmGet("Lead", {}, opts(f.impl, base))).rejects.toMatchObject({ code: "CRM_HOST_NOT_ALLOWED" });
    }
    expect(f.calls.length).toBe(0);
  });

  test("T-CRM-03 loopback chỉ được phép khi NODE_ENV=test", async () => {
    const f = fakeFetch(() => Response.json({}));
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(crmGet("Lead", {}, opts(f.impl, "http://127.0.0.1:9/api"))).rejects.toMatchObject({
        code: "CRM_HOST_NOT_ALLOWED",
      });
    } finally {
      process.env.NODE_ENV = prev;
    }
    expect(f.calls.length).toBe(0);
  });

  test("T-CRM-03 redirect sang host khác bị từ chối, không đi theo", async () => {
    const f = fakeFetch(() => new Response(null, { status: 302, headers: { Location: "https://evil.example/x" } }));
    await expect(crmGet("Lead", {}, opts(f.impl))).rejects.toMatchObject({ code: "CRM_REDIRECT" });
    expect(f.calls.length).toBe(1);
  });

  test("T-CRM-03 redirect từ CRM giả qua mạng loopback cũng bị từ chối", async () => {
    const crm = startFakeCrm({
      respond: () => new Response(null, { status: 307, headers: { Location: "https://evil.example/steal" } }),
    });
    try {
      await expect(crmGet("Opportunity", {}, { baseUrl: crm.baseUrl, token: "t", sleep: noSleep })).rejects.toMatchObject({
        code: "CRM_REDIRECT",
      });
      expect(crm.requests.length).toBe(1);
    } finally {
      crm.stop();
    }
  });

  test("T-CRM-03 query không đổi được host hay đường dẫn", async () => {
    const f = fakeFetch(() => Response.json({}));
    await crmGet("Lead", { q: "//evil.example/../../x", "a/b": "1" }, opts(f.impl));
    const url = new URL(f.calls[0]!.url);
    expect(url.host).toBe("api-crm.oneibc.com");
    expect(url.pathname).toBe("/v1/Lead");
  });
});

describe("T-CRM-06 thử lại", () => {
  test("T-CRM-06 401 và 403 không thử lại", async () => {
    for (const status of [401, 403]) {
      const f = fakeFetch(() => new Response("no", { status }));
      await expect(crmGet("Lead", {}, opts(f.impl))).rejects.toMatchObject({ code: "CRM_AUTH" });
      expect(f.calls.length).toBe(1);
    }
  });

  test("T-CRM-06 5xx thử lại đúng 3 lần (4 lượt gửi) rồi ném lỗi", async () => {
    const f = fakeFetch(() => new Response("down", { status: 503 }));
    await expect(crmGet("Lead", {}, opts(f.impl))).rejects.toMatchObject({ code: "CRM_SERVER_ERROR" });
    expect(f.calls.length).toBe(4);
  });

  test("T-CRM-06 5xx rồi thành công thì trả kết quả", async () => {
    const f = fakeFetch((_, n) => (n < 3 ? new Response("x", { status: 500 }) : Response.json({ ok: 1 })));
    expect(await crmGet("Lead", {}, opts(f.impl))).toEqual({ ok: 1 });
    expect(f.calls.length).toBe(3);
  });

  test("T-CRM-06 lỗi mạng thử lại 3 lần; thông điệp lỗi không chứa nội dung phản hồi", async () => {
    let n = 0;
    const impl = (async () => {
      n++;
      throw new Error("socket CANARY_NAME_7f3a");
    }) as unknown as typeof fetch;
    const err = await crmGet("Lead", {}, opts(impl)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrmError);
    expect((err as CrmError).code).toBe("CRM_NETWORK");
    expect(String((err as Error).message)).not.toContain("CANARY");
    expect(n).toBe(4);
  });

  test("T-CRM-06 4xx khác không thử lại", async () => {
    const f = fakeFetch(() => new Response("bad", { status: 404 }));
    await expect(crmGet("Lead", {}, opts(f.impl))).rejects.toMatchObject({ code: "CRM_CLIENT_ERROR" });
    expect(f.calls.length).toBe(1);
  });
});
