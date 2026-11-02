// Dọn snapshot CRM cũ (D-09): giữ 14 ngày, xoá dòng crm_* theo etl_run_id.
// etl_runs và etl_run_status là bảng chỉ thêm nên giữ nguyên; mục hàng chờ vẫn biết mình từ snapshot nào.
// Không bao giờ xoá snapshot succeeded mới nhất, để NBA và Hàng chờ luôn còn một bản để đọc.
import type { Database } from "bun:sqlite";
import { latestSucceededSnapshot } from "./crm-read.ts";

export const SNAPSHOT_KEEP_DAYS = 14;
const SNAPSHOT_TABLES = ["crm_opportunities", "crm_clients", "crm_client_services", "crm_leads"] as const;

export function pruneSnapshots(db: Database, now: Date, keepDays = SNAPSHOT_KEEP_DAYS): { prunedRuns: string[] } {
  const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString();
  const latest = latestSucceededSnapshot(db)?.etl_run_id ?? null;
  const runs = (db.query("SELECT id FROM etl_runs WHERE started_at < ? ORDER BY started_at").all(cutoff) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => id !== latest);
  db.transaction(() => {
    for (const id of runs) for (const t of SNAPSHOT_TABLES) db.run(`DELETE FROM ${t} WHERE etl_run_id = ?`, [id]);
  })();
  return { prunedRuns: runs };
}
