// CRON-06 qua bộ điều phối (D-82): một lượt chạy cha, một bước Mi1 áp mặc định "giữ nháp" cho mục quá hạn. Không gọi LLM.
import type { Database } from "bun:sqlite";
import { LLM_MONTHLY_CAP_USD } from "../config.ts";
import { applyDefaults } from "../mi1/core.ts";
import { FleetSession } from "./orchestrate.ts";

export async function runCron06(db: Database, now: Date, disabled: ReadonlySet<string>): Promise<{ sessionId: string; applied: number | null; errorCode?: string }> {
  const s = new FleetSession(db, { trigger: "cron-06", actor: "mi1", inputSummary: "mục quá hạn của Hàng chờ", now: () => now, disabled, capUsd: LLM_MONTHLY_CAP_USD });
  const r = await s.call("mi1", "apply_defaults", "mục còn chờ đã quá hạn", () => {
    const a = applyDefaults(db, now);
    return { value: a.applied, resultSummary: `áp mặc định ${a.applied} mục`, agentRunId: a.agentRunId };
  });
  s.end(r.ok ? "succeeded" : "blocked", r.ok ? null : r.errorCode);
  return r.ok ? { sessionId: s.id, applied: r.value } : { sessionId: s.id, applied: null, errorCode: r.errorCode };
}
