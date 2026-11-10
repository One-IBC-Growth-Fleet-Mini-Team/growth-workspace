// Danh bạ thuyền viên của Mi1 (spec mục 6 bảng thuyền viên; PHẦN 7B, D-82). Mi1 chỉ gọi thuyền viên có trong đây,
// đang bật, và chỉ bằng tool trong danh sách của thuyền viên đó. Không có tool ghi ra ngoài: tool "query:<mẫu>" là
// truy vấn mẫu đã duyệt (src/mi1/approved-queries.ts), tool MCP là tool chỉ đọc hoặc chỉ nháp đã có trong src/mcp.
// Tắt một thuyền viên: thêm mã vào biến môi trường FLEET_DISABLED (cách nhau bằng dấu phẩy), khởi động lại dịch vụ.
import type { Database } from "bun:sqlite";
import { monthToDateCostUsd } from "../metrics/cost.ts";

export type Crew = {
  id: string;
  role: string;
  supervisor: "Mark" | "Amy";
  kind: "llm" | "script";
  tools: readonly string[];
  // Tên agent trong agent_runs, để lấy lần chạy cuối và chi phí tháng. null: chưa ghi agent_runs riêng.
  agentRun: string | null;
};

export const CREW: readonly Crew[] = [
  { id: "mi1", role: "Điều phối: nhận câu hỏi, chọn thuyền viên, áp mặc định mục quá hạn", supervisor: "Mark", kind: "llm", tools: ["choose_template", "apply_defaults", "query:fleet_operations", "query:lessons", "search_knowledge"], agentRun: "mi1" },
  { id: "mi1-data-01", role: "Độ phủ ID, gãy tracking GA4/CRM, sức khoẻ 3 số WA, kiểm trùng Lead", supervisor: "Mark", kind: "script", tools: ["find_duplicate_leads"], agentRun: null },
  { id: "mi1-sa-01", role: "Tự báo RM, lý do từ chối, khớp PO và SO, nhắc invoice, NBA", supervisor: "Amy", kind: "llm", tools: ["get_pipeline_by_close_date"], agentRun: "mi1-sa-01" },
  { id: "mi1-ptn-01", role: "Hiệu suất đối tác, cờ reseller, bảng đề xuất hoa hồng", supervisor: "Amy", kind: "script", tools: ["track_referral", "calc_commission", "match_to_contact", "check_reseller_flag"], agentRun: null },
  { id: "mi1-mkt-01", role: "Overview Meta/GG, Win gate, nháp đổi ngân sách", supervisor: "Mark", kind: "script", tools: ["draft_budget_change"], agentRun: null },
  { id: "mi1-mkt-02", role: "Chấm Hook 25/25/20/15/15, gọi creative-factory-v2 bước 1 tới 4", supervisor: "Mark", kind: "script", tools: ["query:hook_board", "propose_hook_card", "compile_creative_ir"], agentRun: null },
  { id: "mi1-mkt-03", role: "Quy định, tiếng khách, verify Meta TW/IN", supervisor: "Mark", kind: "script", tools: [], agentRun: null },
  { id: "mi1-mkt-04", role: "Gói và giá đối thủ khớp 45 tài phán", supervisor: "Mark", kind: "script", tools: [], agentRun: null },
  { id: "mi1-mkt-05", role: "Bảng giá 45 tài phán, bộ SKD, nghiệm thu sandbox8, lịch kênh", supervisor: "Mark", kind: "script", tools: ["query:output_readiness", "query:channel_health", "sync_45_juris_pricing", "audit_media_kit_bundle", "verify_sandbox8_release", "check_ad_compliance", "check_channel_account_health"], agentRun: null },
];

export function parseDisabled(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

// Thuyền viên giữ tool này (mỗi tool đúng một thuyền viên; test kiểm).
export function crewForTool(tool: string): Crew | null {
  return CREW.find((c) => c.tools.includes(tool)) ?? null;
}

export type CrewStatus = Crew & { enabled: boolean; evalScore: number | null; lastRunAt: string | null; lastStatus: string | null; monthCostUsd: number };

// Trạng thái từng thuyền viên cho /command. evalScores: tỉ lệ pass gần nhất theo mã thuyền viên (null: chưa có eval).
export function crewStatus(db: Database, now: Date, disabled: ReadonlySet<string>, evalScores: Record<string, number | null>): CrewStatus[] {
  return CREW.map((c) => {
    const runs = c.agentRun ? (db.query("SELECT cost_usd, started_at, status FROM agent_runs WHERE agent = ? ORDER BY started_at DESC").all(c.agentRun) as { cost_usd: number; started_at: string; status: string }[]) : [];
    const step = db.query("SELECT finished_at, status FROM fleet_steps WHERE crew_id = ? ORDER BY finished_at DESC LIMIT 1").get(c.id) as { finished_at: string; status: string } | null;
    const last = runs[0] && (!step || runs[0].started_at >= step.finished_at) ? { at: runs[0].started_at, status: runs[0].status } : step ? { at: step.finished_at, status: step.status } : null;
    return { ...c, enabled: !disabled.has(c.id), evalScore: evalScores[c.id] ?? null, lastRunAt: last?.at ?? null, lastStatus: last?.status ?? null, monthCostUsd: monthToDateCostUsd(runs, now) };
  });
}
