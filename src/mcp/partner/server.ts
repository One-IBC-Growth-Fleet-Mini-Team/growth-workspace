// Server MCP partner qua stdio (spec mục 9, 12; D-56). Mở Growth DB chỉ đọc; không ghi gì (DRAFT_ONLY: chỉ trả kết quả để
// người hoặc Partner Portal xem). track_referral: thống kê đối tác theo Close Date trong kỳ. match_to_contact: băm email,
// SĐT ngay khi nhận (HMAC, D-05) rồi so với Lead trong snapshot CRM mới nhất; không lưu, không ghi log giá trị.
// calc_commission chưa có: chưa có chính sách hoa hồng (CLAUDE.md quy tắc 4: việc có tiền luôn cần người duyệt).
import type { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDbPath, getPhoneDefaultCountryCode, getPiiHashKey } from "../../config.ts";
import { latestSucceededSnapshot } from "../../db/crm-read.ts";
import { openReadOnly } from "../../db/open.ts";
import { buildPartnerBoard } from "../../db/partners.ts";
import { log } from "../../log.ts";
import { createPiiHasher, type PiiHasher } from "../../pii/hash.ts";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });

// Giới hạn tra (D-65): tối đa MATCH_LIMIT lần mỗi phút cho mỗi server, để không dò hàng loạt xem ai là Lead.
export const MATCH_LIMIT = 30;

export function createPartnerServer(db: Database, hasher: PiiHasher, now: () => number = Date.now): McpServer {
  const hits: number[] = [];
  const server = new McpServer({ name: "partner", version: "0.1.0" });
  server.registerTool("track_referral", {
    description: "Deal do đối tác giới thiệu có Close Date trong kỳ: số giới thiệu, số chốt, lợi nhuận ghi nhận; khách reseller chưa gắn cờ. Hoa hồng chờ chính sách.",
    inputSchema: z.strictObject({ period_start: DATE, period_end: DATE, partner_id: z.string().max(64).optional() }), annotations: READ_ONLY,
  }, async (a) => {
    const b = buildPartnerBoard(db, { start: a.period_start, end: a.period_end });
    return ok({ imported_at: b.importedAt, partners: b.stats.filter((s) => !a.partner_id || s.partner_id === a.partner_id), won_deals: b.commissionReview.length,
      reseller_flag_missing: b.resellerFlagMissing.length, commission: "pending_policy" });
  });
  server.registerTool("match_to_contact", {
    description: "Referral từ Partner Portal đã có Lead trên CRM chưa: so mã băm email hoặc SĐT, chỉ trả mã Lead. Không lưu email, SĐT.",
    inputSchema: z.strictObject({ email: z.string().max(254).optional(), phone: z.string().max(40).optional() }), annotations: READ_ONLY,
  }, async (a) => {
    const t = now();
    while (hits.length && hits[0]! <= t - 60_000) hits.shift();
    if (hits.length >= MATCH_LIMIT) {
      log({ event: "partner.match_limited", count: hits.length });
      return { content: [{ type: "text" as const, text: JSON.stringify({ error_code: "RATE_LIMITED" }) }], isError: true };
    }
    hits.push(t);
    const snap = latestSucceededSnapshot(db);
    const e = hasher.hashEmail(a.email);
    const p = hasher.hashPhone(a.phone);
    const ids = snap && (e || p)
      ? (db.query("SELECT lead_id FROM crm_leads WHERE etl_run_id = ? AND ((? IS NOT NULL AND email_hash = ?) OR (? IS NOT NULL AND phone_hash = ?)) ORDER BY lead_id")
          .all(snap.etl_run_id, e, e, p, p) as { lead_id: string }[]).map((r) => r.lead_id)
      : [];
    log({ event: "partner.match", count: ids.length }); // chỉ ghi số mã khớp, không ghi email, SĐT
    return ok({ lead_ids: ids, matched: ids.length > 0 });
  });
  return server;
}

if (import.meta.main) {
  const cc = getPhoneDefaultCountryCode();
  const server = createPartnerServer(openReadOnly(getDbPath()), createPiiHasher(getPiiHashKey(), cc ? { defaultCountryCode: cc } : {}));
  await server.connect(new StdioServerTransport());
}
