// Cổng creative-factory-mcp (spec mục 7, 9; D-44). Growth Workspace là nơi gọi Creative Factory:
//   compile_creative_ir: từ Hook sinh Creative IR và Storyboard, lưu chờ duyệt.
//   run_creative_pipeline: bước translate, generate, qa ở ValidationMode STRICT (Mi1-mkt-02 bước 1 tới 4).
// Cổng Storyboard (GATE_REQUIRED): bước generate (gọi model tạo ảnh, video, tốn tiền) chỉ chạy khi quyết định mới
// nhất về Storyboard là approve; kiểm tại đây, trước khi gọi ra ngoài. Hợp đồng ở docs/context/hop-dong-mcp.md.
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { log } from "../log.ts";
import { callRemoteTool, RemoteToolError, type RemoteTarget } from "../mcp/remote.ts";
import { redactR1 } from "../pii/redact-regex.ts";
import { repeatedRejections } from "../db/rejections.ts";

const Compiled = z.object({ creative_ir_id: z.string().min(1), storyboard: z.object({ title: z.string().min(1), scenes: z.array(z.string()).min(1) }) });
const Ran = z.object({ run_id: z.string(), qa_status: z.string(), assets: z.array(z.object({ asset_id: z.string(), kind: z.string() })) });
// Bước 5 tới 6 chỉ chạy thử: kết quả phải ghi rõ published = false; báo đã đăng là sai hợp đồng.
const Exported = z.object({ package_id: z.string().min(1), published: z.literal(false), bundles: z.array(z.object({ bundle_id: z.string(), channel: z.string(), aspect_ratio: z.string(), entries: z.number().int().nonnegative() })) });
const failCode = (e: unknown) => (e instanceof RemoteToolError ? e.code : "CREATIVE_FAILED");

export async function compileFromHook(db: Database, target: RemoteTarget, hook: { hookId: string; text: string; jurisdiction: string | null }, opts: { now: Date; actor: string }) {
  try {
    const r = Compiled.safeParse(await callRemoteTool(target, "compile_creative_ir", { hook_id: hook.hookId, hook_text: hook.text, jurisdiction: hook.jurisdiction, validation_mode: "STRICT",
      // Tầng 4 (D-54): mã lý do từ chối lặp lại để bước 1 thêm câu lọc vào câu 2 tới 3.
      rejection_reasons: repeatedRejections(db, opts.now).map((x) => x.code) }));
    if (!r.success) return { status: "failed" as const, errorCode: "CREATIVE_MCP_CONTRACT" };
    db.run("INSERT OR IGNORE INTO storyboards (creative_ir_id, hook_id, jurisdiction, title, scenes, created_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.data.creative_ir_id.slice(0, 64), hook.hookId, hook.jurisdiction, r.data.storyboard.title.slice(0, 200), JSON.stringify(r.data.storyboard.scenes.map((x) => x.slice(0, 300))), opts.now.toISOString(), opts.actor]);
    log({ event: "creative.compiled", run_id: r.data.creative_ir_id });
    return { status: "succeeded" as const, creativeIrId: r.data.creative_ir_id };
  } catch (e) {
    return { status: "failed" as const, errorCode: failCode(e) };
  }
}

// Người duyệt Storyboard (quyết định mới nhất là approve), hoặc null khi chưa duyệt.
export function storyboardApprover(db: Database, id: string): string | null {
  const d = db.query("SELECT decision, actor FROM storyboard_decisions WHERE creative_ir_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(id) as { decision: string; actor: string } | null;
  return d?.decision === "approve" ? d.actor : null;
}

export function storyboardApproved(db: Database, id: string): boolean {
  return storyboardApprover(db, id) !== null;
}

export function decideStoryboard(db: Database, id: string, decision: string, note: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "INVALID" {
  if (decision !== "approve" && decision !== "reject") return "INVALID";
  if (!db.query("SELECT 1 FROM storyboards WHERE creative_ir_id = ?").get(id)) return "NOT_FOUND";
  db.run("INSERT INTO storyboard_decisions (id, creative_ir_id, decision, note, decided_at, actor) VALUES (?, ?, ?, ?, ?, ?)",
    [Bun.randomUUIDv7(), id, decision, redactR1(note.trim().slice(0, 300)).text || null, opts.now.toISOString(), opts.actor]);
  return "ok";
}

export async function runPipeline(db: Database, target: RemoteTarget, id: string, opts: { now: Date; actor: string }) {
  const approvedBy = storyboardApprover(db, id);
  if (!approvedBy) return { status: "refused" as const, errorCode: "STORYBOARD_NOT_APPROVED" };
  try {
    const r = Ran.safeParse(await callRemoteTool(target, "run_creative_pipeline", { creative_ir_id: id, steps: ["translate", "generate", "qa"], validation_mode: "STRICT", approved_by: approvedBy }));
    if (!r.success) return { status: "failed" as const, errorCode: "CREATIVE_MCP_CONTRACT" };
    db.run("INSERT INTO creative_runs (id, creative_ir_id, run_at, actor, qa_status, assets) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), id, opts.now.toISOString(), opts.actor, r.data.qa_status.slice(0, 20), r.data.assets.length]);
    log({ event: "creative.ran", run_id: id, count: r.data.assets.length });
    return { status: "succeeded" as const, qaStatus: r.data.qa_status, assets: r.data.assets.length };
  } catch (e) {
    return { status: "failed" as const, errorCode: failCode(e) };
  }
}

// Mi1-mkt-05 gọi bước 5 tới 6 (catalog, export) ở chế độ chạy thử (spec mục 7; D-59). Chỉ khi Storyboard đang được
// duyệt và lần chạy gần nhất QA PASS; kiểm tại Growth trước khi gọi ra ngoài.
export async function exportBundles(db: Database, target: RemoteTarget, id: string, opts: { now: Date; actor: string }) {
  if (!storyboardApproved(db, id)) return { status: "refused" as const, errorCode: "STORYBOARD_NOT_APPROVED" };
  const last = db.query("SELECT qa_status FROM creative_runs WHERE creative_ir_id = ? ORDER BY run_at DESC, id DESC LIMIT 1").get(id) as { qa_status: string | null } | null;
  if (last?.qa_status !== "PASS") return { status: "refused" as const, errorCode: "QA_NOT_PASSED" };
  try {
    const r = Exported.safeParse(await callRemoteTool(target, "export_channel_bundle", { creative_ir_id: id }));
    if (!r.success) return { status: "failed" as const, errorCode: "CREATIVE_MCP_CONTRACT" };
    const bundles = r.data.bundles.map((b) => ({ channel: b.channel.slice(0, 40), aspectRatio: b.aspect_ratio.slice(0, 10), entries: b.entries }));
    db.run("INSERT INTO creative_exports (id, creative_ir_id, package_id, bundles, exported_at, actor) VALUES (?, ?, ?, ?, ?, ?)",
      [Bun.randomUUIDv7(), id, r.data.package_id.slice(0, 64), JSON.stringify(bundles), opts.now.toISOString(), opts.actor]);
    log({ event: "creative.exported", run_id: id, count: bundles.length });
    return { status: "succeeded" as const, packageId: r.data.package_id, bundles: bundles.length };
  } catch (e) {
    return { status: "failed" as const, errorCode: failCode(e) };
  }
}

export function listStoryboards(db: Database) {
  const rows = db.query("SELECT creative_ir_id, hook_id, jurisdiction, title, scenes, created_at FROM storyboards ORDER BY created_at DESC, creative_ir_id").all() as
    { creative_ir_id: string; hook_id: string | null; jurisdiction: string | null; title: string; scenes: string; created_at: string }[];
  return rows.map((r) => {
    const d = db.query("SELECT decision, note FROM storyboard_decisions WHERE creative_ir_id = ? ORDER BY decided_at DESC, id DESC LIMIT 1").get(r.creative_ir_id) as { decision: string; note: string | null } | null;
    const run = db.query("SELECT qa_status AS qaStatus, assets, run_at AS runAt FROM creative_runs WHERE creative_ir_id = ? ORDER BY run_at DESC, id DESC LIMIT 1").get(r.creative_ir_id) as { qaStatus: string | null; assets: number; runAt: string } | null;
    const ex = db.query("SELECT package_id AS packageId, bundles, exported_at AS exportedAt FROM creative_exports WHERE creative_ir_id = ? ORDER BY exported_at DESC, id DESC LIMIT 1").get(r.creative_ir_id) as { packageId: string; bundles: string; exportedAt: string } | null;
    const lastExport = ex ? { ...ex, bundles: JSON.parse(ex.bundles) as { channel: string; aspectRatio: string; entries: number }[] } : null;
    return { creativeIrId: r.creative_ir_id, lastExport, hookId: r.hook_id, jurisdiction: r.jurisdiction, title: r.title, scenes: JSON.parse(r.scenes) as string[], createdAt: r.created_at,
      status: d ? (d.decision === "approve" ? "approved" : "rejected") : "pending", note: d?.note ?? null, lastRun: run };
  });
}
