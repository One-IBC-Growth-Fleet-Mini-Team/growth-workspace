// T-T4-01, T-T4-02: tầng 4 (spec mục 8): lý do từ chối lặp lại được đẩy về bước 1 của creative-factory-v2 (D-54).
import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compileFromHook } from "../../src/creative/factory.ts";
import { repeatedRejections } from "../../src/db/rejections.ts";
import { repeatedReasons } from "../../src/metrics/repeated-reasons.ts";
import { freshDb } from "../helpers/db.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import { get, makeApp, seedItem, SECRET } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const P = { minCount: 3, windowDays: 28 };

function reason(db: Database, primary: string, date: string, action: "confirm" | "edit" | null, editedTo?: string) {
  const id = seedItem(db, { item_type: "reason_code", queue_date: date, payload: JSON.stringify({ proposal: { primary } }) });
  if (action) db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES (?, ?, 'amy', ?, ?, ?)",
    [Bun.randomUUIDv7(), id, action, action === "edit" ? JSON.stringify({ proposal: { primary: editedTo } }) : null, `${date}T03:00:00Z`]);
}

function load() {
  const db = freshDb();
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) reason(db, "EXPECTATION_MISMATCH", d, "confirm");
  reason(db, "PRICE_TOO_HIGH", "2026-11-05", "edit", "EXPECTATION_MISMATCH"); // Amy sửa mã: tính theo mã đã sửa
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04"]) reason(db, "UNRESPONSIVE", d, "confirm"); // STALL: không sửa nội dung
  for (const d of ["2026-11-02", "2026-11-03"]) reason(db, "PRICE_TOO_HIGH", d, null); // Amy chưa xác nhận: không tính
  for (const d of ["2026-09-01", "2026-09-02", "2026-09-03"]) reason(db, "NO_NEED", d, "confirm"); // ngoài 28 ngày
  return db;
}

describe("T-T4 lý do từ chối lặp lại", () => {
  test("T-T4-01 chỉ mã Amy đã xác nhận, trong 28 ngày, sửa được bằng nội dung; từ 3 lần trở lên", () => {
    expect(repeatedReasons(["NO_NEED_NOW", "NO_NEED_NOW", "PAYMENT_PENDING", "PAYMENT_PENDING", "PAYMENT_PENDING", "NO_NEED_NOW", "OTHER", "OTHER", "OTHER"], P))
      .toEqual([{ code: "NO_NEED_NOW", count: 3 }]);
    expect(repeatedRejections(load(), NOW, P)).toEqual([{ code: "EXPECTATION_MISMATCH", count: 4 }]);
  });

  test("T-T4-02 compile gửi mã lặp lại sang creative-factory-v2; trang /creative hiện khối tầng 4", async () => {
    const db = load();
    const got: unknown[] = [];
    const s = new McpServer({ name: "fake", version: "0" });
    s.registerTool("compile_creative_ir", { inputSchema: { hook_id: z.string(), rejection_reasons: z.array(z.string()).optional() } }, async (a) => {
      got.push(a.rejection_reasons);
      return { content: [{ type: "text" as const, text: JSON.stringify({ creative_ir_id: "IR-9", storyboard: { title: "t", scenes: ["s"] } }) }] };
    });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await s.connect(x);
    await compileFromHook(db, { transport: y }, { hookId: "H1", text: "x", jurisdiction: null }, { now: NOW, actor: "mark" });
    expect(got).toEqual([["EXPECTATION_MISMATCH"]]);
    const { app } = makeApp(db, { now: () => NOW });
    const page = await (await get(app, "/creative", createSessionCookie(SECRET, { sub: "mark", csrf: "c", exp: Date.parse("2026-11-10T00:00:00Z") }))).text();
    expect(page).toContain("Lý do từ chối lặp lại 28 ngày");
    expect(page).toContain("EXPECTATION_MISMATCH (4)");
  });
});
