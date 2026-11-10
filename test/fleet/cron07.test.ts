// T-CRON07: vòng lặp Harness tuần bản Tạm (D-87). Hook đề xuất chưa có Storyboard thì compile qua creative-factory
// (server giả); không gọi bước tạo ảnh, video; có vết trên /command; tắt bằng giá trị tạm; chưa nối thì phiên bị chặn.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { importHookCsv } from "../../src/crm/hook-import.ts";
import { importPriceSheet } from "../../src/crm/jurisdiction-import.ts";
import { runCron07 } from "../../src/fleet/cron07.ts";
import { latestSession } from "../../src/fleet/orchestrate.ts";
import { getProvisional, setProvisional, setProvisionalPaths } from "../../src/provisional.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T19:00:00Z");
const by = { now: NOW, actor: "mark" };
const sample = (n: string) => readFileSync(new URL(`../../deploy/samples/${n}`, import.meta.url), "utf8");
function factory(calls: string[]) {
  const s = new McpServer({ name: "cf-fake", version: "0" });
  s.registerTool("compile_creative_ir", { description: "giả", inputSchema: { hook_id: z.string(), hook_text: z.string(), jurisdiction: z.string().nullish(), validation_mode: z.string().optional(), rejection_reasons: z.array(z.string()).optional() } }, async (a) => {
    calls.push(`compile:${a.hook_id}`);
    return { content: [{ type: "text" as const, text: JSON.stringify({ creative_ir_id: `IR-${a.hook_id}`, storyboard: { title: a.hook_text, scenes: ["Mở", "Kết"] } }) }] };
  });
  return s;
}
async function target(calls: string[]) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await factory(calls).connect(a);
  return { transport: b };
}
function seeded() {
  const db = freshDb();
  importPriceSheet(db, sample("price-final.csv"), by);
  importHookCsv(db, sample("hooks.csv"), by);
  return db;
}
afterEach(() => setProvisionalPaths({ overrides: join(mkdtempSync(join(tmpdir(), "prov-")), "o.jsonl") }));

describe("T-CRON07 Harness tuần (Tạm)", () => {
  test("T-CRON07-01 compile Storyboard cho Hook đề xuất chưa có Storyboard, chỉ bước 1; chạy lại không compile trùng; vết trên phiên cron-07", async () => {
    const db = seeded();
    const calls: string[] = [];
    const r = await runCron07(db, NOW, new Set(), () => target(calls));
    expect(r.compiled.sort()).toEqual(["HK-01", "SG-01"]);
    expect(r.failed).toEqual([]);
    expect(calls.sort()).toEqual(["compile:HK-01", "compile:SG-01"]);
    const s = latestSession(db)!;
    expect(s).toMatchObject({ trigger: "cron-07", status: "succeeded" });
    expect(s.steps.map((x) => [x.crewId, x.tool, x.status])).toEqual([["mi1-mkt-01", "draft_budget_change", "succeeded"], ["mi1-mkt-02", "compile_creative_ir", "succeeded"], ["mi1-mkt-02", "compile_creative_ir", "succeeded"]]);
    const again = await runCron07(db, NOW, new Set(), () => target(calls));
    expect(again.compiled).toEqual([]);
    expect(calls.length).toBe(2);
  });

  test("T-CRON07-02 chưa nối creative-factory thì phiên bị chặn; Mi1-mkt-02 tắt thì không gọi; tắt bằng giá trị tạm thì không tạo phiên", async () => {
    const db = seeded();
    expect(await runCron07(db, NOW, new Set(), null)).toMatchObject({ compiled: [], errorCode: "CREATIVE_NOT_CONNECTED" });
    expect(latestSession(db)).toMatchObject({ status: "blocked", reason: "CREATIVE_NOT_CONNECTED" });
    const calls: string[] = [];
    const off = await runCron07(db, NOW, new Set(["mi1-mkt-02"]), () => target(calls));
    expect(off).toMatchObject({ compiled: [], failed: ["HK-01", "SG-01"], errorCode: "CREW_DISABLED" });
    expect(latestSession(db)).toMatchObject({ status: "blocked", reason: "CREW_DISABLED" });
    expect(calls).toEqual([]);
    setProvisional("cron07", JSON.stringify({ ...getProvisional("cron07").value, enabled: false }), "PROVISIONAL", { now: NOW, actor: "mark" });
    const n = (db.query("SELECT COUNT(*) AS n FROM fleet_sessions").get() as { n: number }).n;
    expect(await runCron07(db, NOW, new Set(), () => target(calls))).toMatchObject({ sessionId: null, errorCode: "CRON07_DISABLED" });
    expect((db.query("SELECT COUNT(*) AS n FROM fleet_sessions").get() as { n: number }).n).toBe(n);
  });
});
