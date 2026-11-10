// CRON-07 bản Tạm (D-87; spec mục 10 chỉ có tên "Vòng lặp Harness tuần"): 02:00 thứ Hai, Hook đề xuất của tuần chưa có
// Storyboard thì Mi1-mkt-02 gọi creative-factory-v2 bước 1 (compile) để có Storyboard chờ Mark duyệt ở /creative.
// Không tạo ảnh, video (bước tốn tiền vẫn chờ Mark duyệt Storyboard); không gọi LLM. Tắt bằng giá trị tạm cron07.enabled.
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { compileFromHook } from "../creative/factory.ts";
import { buildHookBoard } from "../db/hooks.ts";
import type { RemoteTarget } from "../mcp/remote.ts";
import { getProvisional } from "../provisional.ts";
import { FleetSession } from "./orchestrate.ts";

const BLOCKED = new Set(["CREW_DISABLED", "TOOL_NOT_ALLOWED", "CREW_UNKNOWN"]);
export type Cron07Result = { sessionId: string | null; compiled: string[]; failed: string[]; errorCode?: string };

// connect: mỗi lần gọi một kết nối mới tới creative-factory-mcp (HTTP không trạng thái); null là chưa nối.
export async function runCron07(db: Database, now: Date, disabled: ReadonlySet<string>, connect: (() => Promise<RemoteTarget> | RemoteTarget) | null): Promise<Cron07Result> {
  if (!getProvisional("cron07").value.enabled) return { sessionId: null, compiled: [], failed: [], errorCode: "CRON07_DISABLED" };
  const s = new FleetSession(db, { trigger: "cron-07", actor: "mi1", inputSummary: "Hook đề xuất của tuần chưa có Storyboard", now: () => now, disabled, capUsd: LLM_MONTHLY_CAP_USD });
  const done = (errorCode?: string): Cron07Result => ({ sessionId: s.id, compiled, failed, ...(errorCode ? { errorCode } : {}) });
  const compiled: string[] = [];
  const failed: string[] = [];
  if (s.ended) return done(s.ended.reason ?? "SESSION_ENDED");
  if (!connect) {
    s.end("blocked", "CREATIVE_NOT_CONNECTED");
    return done("CREATIVE_NOT_CONNECTED");
  }
  let blockedBy: string | null = null;
  const has = db.prepare("SELECT 1 FROM storyboards WHERE hook_id = ? LIMIT 1");
  const todo = buildHookBoard(db).proposed.filter((h) => !has.get(h.hookId));
  for (const h of todo) {
    const r = await s.call("mi1-mkt-02", "compile_creative_ir", `Hook ${h.hookId}`, async () => {
      const c = await compileFromHook(db, await connect(), { hookId: h.hookId, text: h.text, jurisdiction: h.jurisdiction }, { now, actor: "mi1-cron-07" });
      return { value: c, ok: c.status === "succeeded", resultSummary: c.status === "succeeded" ? `Storyboard ${c.creativeIrId} chờ Mark duyệt` : c.errorCode };
    });
    (r.ok ? compiled : failed).push(h.hookId);
    if (!r.ok && BLOCKED.has(r.errorCode)) blockedBy = r.errorCode;
    if ((s.ended as unknown) !== null) break;
  }
  // Bước có thể dừng cả phiên (chạm trần chi phí); đọc lại trạng thái sau vòng lặp.
  const stopped = s.ended as { status: string; reason: string | null } | null;
  if (stopped) return done(stopped.reason ?? "SESSION_ENDED");
  if (blockedBy) s.end("blocked", blockedBy);
  else s.end(failed.length ? "failed" : "succeeded", failed.length ? "COMPILE_FAILED" : null);
  return done(blockedBy ?? (failed.length ? "COMPILE_FAILED" : undefined));
}
