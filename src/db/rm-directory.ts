// Nạp danh bạ RM (design doc mục 4.2, Q-07) từ file do người vận hành giữ NGOÀI repo.
// File liệt kê RM đang làm; RM có trong DB mà vắng trong file bị đánh dấu nghỉ (active = 0), không xoá,
// vì rm_reports cũ còn tham chiếu rm_id. Sai dạng hoặc teams_user_id trùng thì không đổi gì.
import type { Database } from "bun:sqlite";
import { z } from "zod";

const ID = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
export const RmEntrySchema = z.strictObject({
  rm_id: ID,
  display_name: z.string().min(1).max(80),
  teams_user_id: ID.nullable(),
});
export type RmEntry = z.infer<typeof RmEntrySchema>;

export function loadRmDirectory(db: Database, raw: readonly unknown[]): { active: number; deactivated: number } {
  const entries = z.array(RmEntrySchema).parse(raw);
  const ids = new Set(entries.map((e) => e.rm_id));
  const teams = entries.flatMap((e) => (e.teams_user_id ? [e.teams_user_id] : []));
  if (ids.size !== entries.length || new Set(teams).size !== teams.length) throw new Error("RM_DIRECTORY_DUPLICATE");
  const before = db.query("SELECT rm_id FROM rm_directory WHERE active = 1").all() as { rm_id: string }[];
  const leaving = before.filter((r) => !ids.has(r.rm_id)).map((r) => r.rm_id);
  db.transaction(() => {
    // Giải phóng các teams_user_id sắp được gán lại, để đổi chéo giữa hai RM không vướng ràng buộc UNIQUE.
    for (const t of teams) db.run("UPDATE rm_directory SET teams_user_id = NULL WHERE teams_user_id = ?", [t]);
    for (const id of leaving) db.run("UPDATE rm_directory SET active = 0 WHERE rm_id = ?", [id]);
    for (const e of entries) {
      db.run(
        `INSERT INTO rm_directory (rm_id, display_name, teams_user_id, active) VALUES (?, ?, ?, 1)
         ON CONFLICT (rm_id) DO UPDATE SET display_name = excluded.display_name, teams_user_id = excluded.teams_user_id, active = 1`,
        [e.rm_id, e.display_name, e.teams_user_id],
      );
    }
  })();
  return { active: entries.length, deactivated: leaving.length };
}
