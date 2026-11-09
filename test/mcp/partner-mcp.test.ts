// T-PMCP-01: partner-mcp (spec mục 9, 12; D-56). track_referral chỉ đọc; match_to_contact so mã băm, không lưu, không ghi.
import { describe, expect, test } from "bun:test";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { importPartners } from "../../src/crm/partner-import.ts";
import { createPartnerServer, MATCH_LIMIT } from "../../src/mcp/partner/server.ts";
import { callRemoteTools } from "../../src/mcp/remote.ts";
import { createPiiHasher } from "../../src/pii/hash.ts";
import { freshDb, seedSnapshot } from "../helpers/db.ts";

const KEY = "test-only-pii-key-0123456789abcdef0123";
const NOW = new Date("2026-11-09T02:00:00Z");

describe("T-PMCP partner-mcp", () => {
  test("T-PMCP-01 track_referral theo kỳ; match_to_contact trả mã Lead khớp mã băm; không có calc_commission; DB không đổi", async () => {
    const db = freshDb();
    const h = createPiiHasher(KEY);
    seedSnapshot(db, { leads: [
      { lead_id: "L1", owner_rm_id: null, created_at: null, status: null, email_hash: h.hashEmail("canary.buyer@example.com"), phone_hash: null },
      { lead_id: "L2", owner_rm_id: null, created_at: null, status: null, email_hash: null, phone_hash: h.hashPhone("+84 901 234 567") },
    ] });
    expect(importPartners(db, {
      Partner: "Partner ID,Partner Type\nP1,reseller\n",
      Referral: "Opportunity ID,Partner ID,Account ID,Stage,Close Date,Net Profit\nD1,P1,C1,Closed Won,03/11/2026,500\nD2,P1,C2,Proposal,04/11/2026,\n",
    }, { columns: {}, now: NOW, actor: "amy" }).status).toBe("succeeded");
    const before = db.serialize();
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createPartnerServer(db, h);
    await server.connect(a);
    const [track, byEmail, byPhone, none] = await callRemoteTools({ transport: b }, [
      { tool: "track_referral", args: { period_start: "2026-11-01", period_end: "2026-11-30" } },
      { tool: "match_to_contact", args: { email: "Canary.Buyer@Example.com " } },
      { tool: "match_to_contact", args: { phone: "+84-901-234-567" } },
      { tool: "match_to_contact", args: { email: "nobody@example.com" } },
    ]) as any[];
    expect(track.partners).toMatchObject([{ partner_id: "P1", referred: 2, won: 1 }]);
    expect(track.commission).toBe("pending_policy");
    expect(byEmail).toEqual({ lead_ids: ["L1"], matched: true });
    expect(byPhone).toEqual({ lead_ids: ["L2"], matched: true });
    expect(none).toEqual({ lead_ids: [], matched: false });
    expect(Buffer.from(db.serialize()).equals(Buffer.from(before))).toBe(true);
    const tools = (server as any)._registeredTools as Record<string, unknown>;
    expect(Object.keys(tools).sort()).toEqual(["match_to_contact", "track_referral"]);
  });

  test("T-PMCP-02 match_to_contact quá MATCH_LIMIT lần mỗi phút thì từ chối; sang phút sau tra lại được", async () => {
    let t = 0;
    const server = createPartnerServer(freshDb(), createPiiHasher(KEY), () => t);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const calls = Array.from({ length: MATCH_LIMIT }, (_, i) => ({ tool: "match_to_contact", args: { email: `u${i}@example.com` } }));
    expect((await callRemoteTools({ transport: b }, calls)).length).toBe(MATCH_LIMIT);
    const [c, d] = InMemoryTransport.createLinkedPair();
    await server.close();
    await server.connect(c);
    await expect(callRemoteTools({ transport: d }, [{ tool: "match_to_contact", args: { email: "x@example.com" } }])).rejects.toThrow("REMOTE_TOOL_ERROR");
    t = 61_000;
    const [e, f] = InMemoryTransport.createLinkedPair();
    await server.close();
    await server.connect(e);
    expect(await callRemoteTools({ transport: f }, [{ tool: "match_to_contact", args: { email: "x@example.com" } }])).toEqual([{ lead_ids: [], matched: false }]);
  });
});
