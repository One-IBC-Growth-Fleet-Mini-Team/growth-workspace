// T-CRM-04 (tĩnh): chỉ src/crm/http.ts gọi mạng tới CRM; src/crm/ không chứa phương thức ghi;
// chỉ src/crm/etl.ts import crm/http.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const ROOT = new URL("../../", import.meta.url).pathname;

async function sourceFiles(): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  for await (const path of new Glob("src/**/*.{ts,sql}").scan({ cwd: ROOT })) {
    out.push({ path, text: await Bun.file(ROOT + path).text() });
  }
  return out;
}

describe("T-CRM-04 kiểm tĩnh CRM chỉ đọc", () => {
  test("T-CRM-04 host CRM chỉ xuất hiện trong src/crm/http.ts", async () => {
    for (const f of await sourceFiles()) {
      if (f.path === "src/crm/http.ts") continue;
      expect({ path: f.path, hit: /crm\.oneibc\.com/i.test(f.text) }).toEqual({ path: f.path, hit: false });
    }
  });

  test("T-CRM-04 ngoài src/crm/http.ts không file nào gọi fetch với cấu hình CRM; trong src/crm/ chỉ http.ts gọi fetch", async () => {
    for (const f of await sourceFiles()) {
      if (f.path === "src/crm/http.ts") continue;
      const callsFetch = /\bfetch\s*\(/.test(f.text);
      const hit = callsFetch && (f.path.startsWith("src/crm/") || /CRM_API_BASE|getCrmConfig/.test(f.text));
      expect({ path: f.path, hit }).toEqual({ path: f.path, hit: false });
    }
  });

  test("T-CRM-04 src/crm/ không chứa POST, PUT, PATCH, DELETE", async () => {
    for (const f of await sourceFiles()) {
      if (!f.path.startsWith("src/crm/")) continue;
      expect({ path: f.path, hit: /\b(POST|PUT|PATCH|DELETE)\b/.test(f.text) }).toEqual({ path: f.path, hit: false });
    }
  });

  test("T-CRM-04 chỉ src/crm/etl.ts import crm/http", async () => {
    const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*crm\/http(?:\.ts)?["']|from\s+["']\.\/http(?:\.ts)?["']/;
    for (const f of await sourceFiles()) {
      if (f.path === "src/crm/etl.ts" || f.path === "src/crm/http.ts") continue;
      expect({ path: f.path, hit: importRe.test(f.text) }).toEqual({ path: f.path, hit: false });
    }
  });

  test("T-CRM-04 src/crm/http.ts gán cứng GET và không nhận method, body", async () => {
    const text = await Bun.file(ROOT + "src/crm/http.ts").text();
    expect(text).toMatch(/method:\s*"GET"/);
    expect(text).not.toMatch(/\bbody\s*:/);
    expect(text).not.toMatch(/method\s*:\s*[a-z]/);
  });
});
