// Server MCP content-dist qua stdio (spec mục 9; D-47). Mở Growth DB chỉ đọc; trả dữ liệu Growth đã tính cho hệ thống
// khác (ví dụ hệ thống SEO/AIO): giá 45 tài phán, bộ SKD, nghiệm thu sandbox8, kiểm nội dung, sức khoẻ tài khoản kênh.
// schedule_channel_post (DRAFT_ONLY) chưa làm: lịch kênh chưa có trong phạm vi.
import type { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkOne } from "../../ads/check.ts";
import { AD_RULES, getDbPath } from "../../config.ts";
import { buildChannelBoard } from "../../db/channels.ts";
import { buildJurisdictionBoard } from "../../db/jurisdictions.ts";
import { openReadOnly } from "../../db/open.ts";
import { buildSandboxBoard } from "../../db/sandbox.ts";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const guard = (f: () => unknown) => {
  try {
    return ok(f());
  } catch {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error_code: "TOOL_ERROR" }) }], isError: true };
  }
};

export function createContentDistServer(db: Database, now: () => Date = () => new Date()): McpServer {
  const server = new McpServer({ name: "content-dist", version: "0.1.0" });
  server.registerTool("sync_45_juris_pricing", { description: "Giá bán theo tài phán và loại hình từ sheet FINAL đã nạp, kèm trạng thái chốt giá. Chỉ đọc.", annotations: READ_ONLY }, async () => guard(() => {
    const b = buildJurisdictionBoard(db);
    return { imported_at: b.importedAt, summary: b.summary, jurisdictions: b.jurisdictions.map((j) => ({ name: j.name, locked: j.locked, rows: j.rows.map((r) => ({ company_type: r.companyType, status: r.status, starter: r.starter, grow: r.grow, premium: r.premium, renewal: r.renewal, renewal_2y: r.renewal2y, renewal_3y: r.renewal3y })) })) };
  }));
  server.registerTool("audit_media_kit_bundle", { description: "Bộ SKD eKYC: số file đã có trên 10 và phần còn thiếu.", annotations: READ_ONLY }, async () => guard(() => buildJurisdictionBoard(db).skd));
  server.registerTool("verify_sandbox8_release", { description: "Nghiệm thu sandbox8: sẵn sàng hay chưa, bug mở theo mức độ, tỷ lệ Pass.", annotations: READ_ONLY }, async () => guard(() => {
    const s = buildSandboxBoard(db);
    return { imported_at: s.importedAt, ready: s.ready, by_severity: s.bySeverity, open: s.open.map((b) => ({ bug_id: b.bugId, severity: b.severity, status: b.status, title: b.title })), cases: s.cases };
  }));
  server.registerTool("check_ad_compliance", {
    description: "Cổng tuân thủ trước khi đăng (tầng 1A, 1B): pass, review, hold hoặc fail kèm lý do. Đạt cổng chưa phải được đăng.",
    inputSchema: z.strictObject({ primary_text: z.string().max(5000), headline: z.string().max(500).default(""), description: z.string().max(500).default(""), jurisdiction: z.string().max(64).optional(), target_country: z.string().max(60).optional() }),
    annotations: READ_ONLY,
  }, async (a) => guard(() => checkOne(db, { primaryText: a.primary_text, headline: a.headline, description: a.description, jurisdiction: a.jurisdiction ?? null, targetCountry: a.target_country ?? null }, AD_RULES)));
  server.registerTool("check_channel_account_health", { description: "Sức khoẻ BM, số WhatsApp, Fanpage theo lần kiểm mới nhất.", annotations: READ_ONLY }, async () => guard(() => {
    const c = buildChannelBoard(db, now());
    return { last_checked_at: c.lastCheckedAt, ok: c.summary.ok, issues: c.summary.issues.map((x) => ({ kind: x.kind, label: x.label, status: x.status })), stale: c.summary.stale.map((x) => x.label), not_tracked: c.summary.notTracked };
  }));
  return server;
}

if (import.meta.main) {
  const server = createContentDistServer(openReadOnly(getDbPath()));
  await server.connect(new StdioServerTransport());
}
