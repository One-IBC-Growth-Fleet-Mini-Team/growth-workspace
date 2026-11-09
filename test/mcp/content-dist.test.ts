// T-CD-01 tới T-CD-03: server MCP content-dist chỉ đọc (spec mục 9; D-47). Dữ liệu tổng hợp, kết nối trong bộ nhớ.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createContentDistServer } from "../../src/mcp/content-dist/server.ts";
import { callRemoteTools } from "../../src/mcp/remote.ts";
import { importPriceSheet, importSkdList } from "../../src/crm/jurisdiction-import.ts";
import { recordChannelCheck } from "../../src/db/channels.ts";
import { freshDb } from "../helpers/db.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
async function tools(db = freshDb()) {
  importPriceSheet(db, ["Jurisdiction,Loại hình công ty,Starter,Grow,Premium,R,2y,3y", 'Hong Kong,Ltd,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"'].join("\n"), { now: NOW, actor: "mark" });
  importSkdList(db, "Guide.pdf\nGuide.html", { now: NOW, actor: "mark" });
  recordChannelCheck(db, { kind: "wa", label: "WA SG 1", status: "restricted", note: "" }, { now: NOW, actor: "mark" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const before = new TextDecoder().decode(db.serialize()).length;
  await createContentDistServer(db, () => NOW).connect(a);
  return { target: { transport: b }, db, before };
}

describe("T-CD content-dist-mcp", () => {
  test("T-CD-01 giá 45 tài phán, bộ SKD, sandbox8, sức khoẻ kênh", async () => {
    const t = await tools();
    const [p, k, s, c] = await callRemoteTools(t.target, [{ tool: "sync_45_juris_pricing" }, { tool: "audit_media_kit_bundle" }, { tool: "verify_sandbox8_release" }, { tool: "check_channel_account_health" }]) as any[];
    expect(p.summary).toMatchObject({ priceLocked: 1, listed: 1 });
    expect(p.jurisdictions[0]).toMatchObject({ name: "Hong Kong", locked: true, rows: [{ company_type: "Ltd", starter: 1000 }] });
    expect(k).toMatchObject({ done: 2, total: 10 });
    expect(s).toMatchObject({ ready: null, open: [] });
    expect(c.issues).toEqual([{ kind: "wa", label: "WA SG 1", status: "restricted" }]);
  });

  test("T-CD-02 check_ad_compliance trả kết quả cổng; đầu vào sai bị từ chối", async () => {
    const t = await tools();
    const [r] = await callRemoteTools(t.target, [{ tool: "check_ad_compliance", args: { primary_text: "Go offshore with no tax.", jurisdiction: "Hong Kong" } }]) as any[];
    expect(r.verdict).toBe("fail");
    const t2 = await tools();
    await expect(callRemoteTools(t2.target, [{ tool: "check_ad_compliance", args: { headline: "x" } }])).rejects.toThrow();
  });

  test("T-CD-03 server không ghi gì vào DB", async () => {
    const t = await tools();
    await callRemoteTools(t.target, [{ tool: "sync_45_juris_pricing" }, { tool: "check_ad_compliance", args: { primary_text: "Hello." } }]);
    expect(new TextDecoder().decode(t.db.serialize()).length).toBe(t.before);
  });
});
