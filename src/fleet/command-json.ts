// Dữ liệu chung của Command Center (GĐ3 việc 3; D-92): /command/data.json, /command bản phẳng và /command/3d cùng đọc
// một payload này; không có nguồn, quyền hay logic riêng cho từng bản. Lọc theo vai trò: việc chờ Mark chỉ cho Mark,
// BOD; Team MKT không thấy đầu vào của từng bước (câu hỏi của người khác có thể chứa mã khách). Không PII.
import type { Database } from "bun:sqlite";
import { buildBudgetBoard } from "../db/budget.ts";
import { latestPlan } from "../db/budget-plan.ts";
import { buildDataBoard } from "../db/data01.ts";
import { buildHookBoard } from "../db/hooks.ts";
import { buildPartnerBoard } from "../db/partners.ts";
import { buildScheduleDraft, listStoryboards } from "../creative/factory.ts";
import { APPROVED_QUERIES } from "../mi1/approved-queries.ts";
import { latestStrategy } from "../mi1/strategy-run.ts";
import type { QueueUser } from "../queue/auth.ts";
import { monthPeriod, vnDate } from "../time.ts";
import { buildCommandData } from "./command-data.ts";

export type Module = { id: string; label: string; href: string | null; summary: string };
export type WaitingItem = { id: string; itemType: string; ageHours: number };
export type CommandPayload = Omit<ReturnType<typeof buildCommandData>, "waitingMark"> & { role: QueueUser["role"]; userId: string; generatedAt: string; waitingMark: WaitingItem[] | null; modules: Module[] };

const hoursSince = (now: Date, iso: string) => Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000);

function modules(db: Database, now: Date, u: QueueUser, waiting: number, crew: { enabled: boolean }[]): Module[] {
  const pending = (type: string | null) => (db.query(`SELECT COUNT(*) AS n FROM queue_items i JOIN queue_item_state s ON s.id = i.id WHERE s.state = 'pending' AND i.item_type <> 'system_notice' ${type ? "AND i.item_type = ?" : ""}`).get(...(type ? [type] : [])) as { n: number }).n;
  const hooks = buildHookBoard(db);
  const win = buildBudgetBoard(db, now).win;
  const cov = buildDataBoard(db, now).window.rate;
  const m = {
    ask: (who: string) => ({ id: "ask", label: `Hỏi ${who}`, href: "/ask", summary: `${Object.keys(APPROVED_QUERIES).length} truy vấn mẫu đã duyệt` }),
    crew: { id: "crew", label: "Thuyền viên", href: "/command#crew", summary: `${crew.length} thuyền viên, ${crew.filter((c) => c.enabled).length} đang bật` },
    hooks: { id: "hooks", label: "Hook và Win gate", href: "/hooks", summary: `${hooks.proposed.length} Hook đề xuất, ${win.filter((w) => w.status === "win").length} chiến dịch thắng` },
    partners: { id: "partners", label: "Đối tác và reseller", href: "/partners", summary: `${buildPartnerBoard(db, monthPeriod(vnDate(now))).commissionReview.length} hoa hồng đề xuất chờ duyệt` },
    overview: (label: string) => ({ id: "overview", label, href: "/overview", summary: `${pending(null)} mục Hàng chờ còn chờ` }),
  };
  if (u.role === "approver") return [m.ask("Mi1-sa-01"), { id: "queue", label: "Hàng chờ của Amy", href: "/queue", summary: `${pending(null)} mục chờ, ${pending("nba")} NBA` }, m.overview("Dashboard phần Amy"), m.partners, m.crew];
  if (u.role === "mkt") {
    const sb = listStoryboards(db);
    return [m.ask("Mi1-mkt-01"), m.hooks, { id: "creative", label: "Creative", href: "/creative", summary: `${sb.filter((s) => s.status === "pending").length} Storyboard chờ duyệt` },
      { id: "competitors", label: "Gói và giá đối thủ", href: "/competitors", summary: `${(db.query("SELECT COUNT(*) AS n FROM competitor_prices WHERE import_id = (SELECT id FROM competitor_imports ORDER BY imported_at DESC LIMIT 1)").get() as { n: number }).n} giá đối thủ mới nhất` },
      // Ngân sách là trang có tiền nên Team MKT chỉ thấy số tổng hợp, không mở trang (D-63).
      { id: "budget", label: "Ngân sách", href: null, summary: `${win.filter((w) => w.status === "win").length} thắng, ${win.filter((w) => w.status === "insufficient_data").length} thiếu mẫu; chi tiết Mark xem` },
      { id: "schedule", label: "Lịch kênh", href: "/creative", summary: `${buildScheduleDraft(db, now).slots.length} bài nháp tuần tới` }];
  }
  return [m.ask("Mi1"), { id: "queue", label: "Hàng chờ quyết định", href: "/command#waiting", summary: `${waiting} chờ Mark quyết` }, m.overview("Dashboard Growth"),
    { id: "data", label: "Đồ thị và truy vấn mẫu", href: "/data", summary: cov === null ? "Độ phủ nối: chưa có dữ liệu" : `Độ phủ nối ${Math.round(cov * 100)}%` }, m.crew, m.hooks, m.partners];
}

export function commandPayload(db: Database, now: Date, u: QueueUser, disabled: ReadonlySet<string>, evalScores: Record<string, number | null>): CommandPayload {
  const base = buildCommandData(db, now, disabled, evalScores);
  let waiting: WaitingItem[] | null = null;
  if (u.role === "viewer") {
    waiting = [...base.waitingMark];
    const plan = latestPlan(db);
    if (plan?.status === "pending") waiting.push({ id: plan.id, itemType: "budget_plan", ageHours: hoursSince(now, plan.createdAt) });
    const st = latestStrategy(db);
    if (st?.status === "pending") waiting.push({ id: st.id, itemType: "strategy", ageHours: hoursSince(now, st.createdAt) });
  }
  const session = base.session && u.role === "mkt"
    ? { ...base.session, inputSummary: "(ẩn với Team MKT)", steps: base.session.steps.map((s) => ({ ...s, inputSummary: "(ẩn với Team MKT)" })) }
    : base.session;
  return { ...base, session, waitingMark: waiting, role: u.role, userId: u.id, generatedAt: now.toISOString(), modules: modules(db, now, u, waiting?.length ?? 0, base.crew) };
}
