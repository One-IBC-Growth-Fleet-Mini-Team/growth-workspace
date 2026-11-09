// Nháp việc cho Jira MKT và ticket MobCEC (spec mục 9 atlassian-m365-drive-mcp create_jira_mkt_task, DRAFT_ONLY;
// mục 8 tầng 3A, 4; D-60). Code soạn nháp từ số đã tính; không gửi đi đâu, không gọi Jira. Người đọc rồi tự tạo việc.
import type { Database } from "bun:sqlite";
import { DATA01_PARAMS } from "../config.ts";
import { idCoverageWindow } from "../db/data01.ts";
import { repeatedRejections, TIER4_PARAMS } from "../db/rejections.ts";
import { buildSandboxBoard } from "../db/sandbox.ts";

export type TaskDraft = { key: string; project: "MKT" | "MobCEC"; title: string; body: string; evidence: string };
const pct = (v: number | null) => (v === null ? "chưa có" : `${(v * 100).toFixed(1)}%`);

export function buildTaskDrafts(db: Database, now: Date): TaskDraft[] {
  const out: TaskDraft[] = [];
  const d = { window: idCoverageWindow(db, now) };
  if (d.window.degraded) {
    out.push({ key: "tracking_degraded", project: "MobCEC", evidence: "/data",
      title: `TRACKING_DEGRADED: độ phủ ID 7 ngày ${pct(d.window.rate)} (${d.window.linked}/${d.window.sessions} phiên), dưới ${pct(DATA01_PARAMS.degradedBelow).replace(".0%", "%")}`,
      body: `Tầng 3A (spec mục 8): độ phủ nối Session → WA → Contact từ ${d.window.start} tới ${d.window.end} dưới ngưỡng. Đề nghị MobCEC kiểm sự kiện contact_captured có contact_id (Phụ lục A2). Không tắt quảng cáo vì số này; đánh giá Hook ở tầng 2 và 5 đang đóng băng tới khi tracking phục hồi.` });
  }
  const s = buildSandboxBoard(db);
  if (s.ready === false) {
    const blocking = s.bySeverity.filter((x) => (x.severity === "Critical" || x.severity === "High") && x.open > 0).map((x) => `${x.open} ${x.severity}`);
    out.push({ key: "sandbox_not_ready", project: "MobCEC", evidence: "/jurisdictions",
      title: `Sandbox8 chưa sẵn sàng nghiệm thu: còn ${blocking.join(", ")} mở`,
      body: "Nghiệm thu sandbox8 (Phụ lục A6) cần không còn bug Critical, High mở. Danh sách bug mở ở trang 45 tài phán, khối nghiệm thu." });
  }
  for (const r of repeatedRejections(db, now)) {
    out.push({ key: `tier4_${r.code}`, project: "MKT", evidence: "/creative",
      title: `Sửa câu 2 tới 3 của copy: lý do từ chối ${r.code} lặp ${r.count} lần trong ${TIER4_PARAMS.windowDays} ngày`,
      body: "Tầng 4 (spec mục 8): thêm câu lọc vào câu 2 tới 3; mã này đã được gửi kèm khi tạo Storyboard mới. Amy đã xác nhận các mã lý do." });
  }
  return out;
}
