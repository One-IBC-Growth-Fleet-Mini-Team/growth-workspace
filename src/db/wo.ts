// Bảng WO tồn đọng (BK-08, D-25): đọc lượt nạp Work Order mới nhất, tính số ngày không cập nhật bằng hàm
// trong metrics, chia nhóm. Ghi duy nhất là wo_touches (Amy ghi nhận WO đã có cập nhật).
import type { Database } from "bun:sqlite";
import { WO_PARAMS } from "../config.ts";
import { woIdleDays, woStage, type WoObservation } from "../metrics/wo-idle.ts";

export const WO_TOUCH_REASONS = {
  member_working: "Member đang xử lý",
  waiting_client: "Chờ khách",
  waiting_bank: "Chờ bank hoặc EMI",
  waiting_internal: "Chờ bộ phận khác",
} as const;
export type WoTouchReason = keyof typeof WO_TOUCH_REASONS;

export type WoBoardRow = {
  work_order_number: string;
  status: string;
  created_date: string | null;
  product_name: string | null;
  pic: string | null;
  idle_days: number;
  last_reason: WoTouchReason | null;
};

export type WoBoard = {
  importedAt: string | null; // lượt nạp Work Order mới nhất
  escalate: WoBoardRow[]; // từ M ngày: báo Amy
  remind: WoBoardRow[]; // từ N tới dưới M ngày: nhắc PIC
  backlog: WoBoardRow[]; // có từ lượt nạp đầu, chưa ai ghi nhận, Status chưa đổi, chưa tới N ngày
  okCount: number;
};

export function buildWoBoard(db: Database, now: Date, params = WO_PARAMS): WoBoard {
  const latest = db
    .query("SELECT id, imported_at FROM wo_imports WHERE has_work_orders = 1 ORDER BY imported_at DESC, id DESC LIMIT 1")
    .get() as { id: string; imported_at: string } | null;
  const board: WoBoard = { importedAt: latest?.imported_at ?? null, escalate: [], remind: [], backlog: [], okCount: 0 };
  if (!latest) return board;
  const open = new Set(params.openStatuses.map((s) => s.toLowerCase()));
  const current = (db.query("SELECT work_order_number, status, created_date, product_name FROM wo_rows WHERE import_id = ?").all(latest.id) as {
    work_order_number: string; status: string; created_date: string | null; product_name: string | null;
  }[]).filter((r) => open.has(r.status.trim().toLowerCase()));
  if (current.length === 0) return board;

  const history = new Map<string, WoObservation[]>();
  for (const h of db
    .query("SELECT r.work_order_number AS n, r.status AS status, i.imported_at AS at FROM wo_rows r JOIN wo_imports i ON i.id = r.import_id ORDER BY i.imported_at")
    .all() as { n: string; status: string; at: string }[]) {
    (history.get(h.n) ?? history.set(h.n, []).get(h.n)!).push({ at: h.at, status: h.status });
  }
  const firstImportAt = (db.query("SELECT MIN(imported_at) AS at FROM wo_imports WHERE has_work_orders = 1").get() as { at: string }).at;
  const pics = new Map(
    (db.query(
      `SELECT p.work_order_number AS n, p.pic AS pic FROM wo_pics p JOIN wo_imports i ON i.id = p.import_id
       ORDER BY i.imported_at, i.id`,
    ).all() as { n: string; pic: string }[]).map((r) => [r.n, r.pic]),
  );
  const touches = new Map(
    (db.query("SELECT work_order_number AS n, reason_code AS reason, created_at AS at FROM wo_touches ORDER BY created_at, id").all() as {
      n: string; reason: WoTouchReason; at: string;
    }[]).map((t) => [t.n, t]),
  );

  for (const r of current) {
    const obs = history.get(r.work_order_number)!;
    const touch = touches.get(r.work_order_number) ?? null;
    const idle = woIdleDays({ observations: obs, lastTouchAt: touch?.at ?? null, now });
    const row: WoBoardRow = { ...r, pic: pics.get(r.work_order_number) ?? null, idle_days: idle, last_reason: touch?.reason ?? null };
    const stage = woStage(idle, params);
    if (stage === "escalate") board.escalate.push(row);
    else if (stage === "remind") board.remind.push(row);
    // Tồn từ trước, chưa rà: có từ lượt nạp đầu, chưa ai ghi nhận, Status chưa từng đổi.
    else if (!touch && obs[0]!.at === firstImportAt && obs.every((o) => o.status.trim().toLowerCase() === obs[0]!.status.trim().toLowerCase())) board.backlog.push(row);
    else board.okCount++;
  }
  const byIdle = (a: WoBoardRow, b: WoBoardRow) => b.idle_days - a.idle_days || a.work_order_number.localeCompare(b.work_order_number);
  board.escalate.sort(byIdle);
  board.remind.sort(byIdle);
  // Tồn từ trước: cũ nhất lên đầu; không có ngày tạo thì xuống cuối.
  board.backlog.sort((a, b) => (a.created_date ?? "9999").localeCompare(b.created_date ?? "9999") || a.work_order_number.localeCompare(b.work_order_number));
  return board;
}

// Tin nhắc theo từng PIC cho nhóm "nhắc"; Amy chép và tự gửi. Chỉ có số WO và số ngày, không có tên khách.
export function reminderTexts(rows: WoBoardRow[], params = WO_PARAMS): { pic: string; text: string }[] {
  const byPic = new Map<string, WoBoardRow[]>();
  for (const r of rows) (byPic.get(r.pic ?? "") ?? byPic.set(r.pic ?? "", []).get(r.pic ?? "")!).push(r);
  return [...byPic.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([pic, list]) => ({
      pic: pic || "Chưa có PIC",
      text: [
        `${pic ? `Chào ${pic}` : "Chào bạn"}, các WO dưới đây chưa có cập nhật từ ${params.remindAfterDays} ngày trở lên:`,
        ...list.map((r) => `- WO ${r.work_order_number} (${r.status}, ${r.idle_days} ngày)`),
        "Bạn cập nhật tiến độ trên CRM và báo Amy đang chờ ai (khách, bank hay nội bộ) giúp nhé.",
      ].join("\n"),
    }));
}

export function recordWoTouch(
  db: Database,
  args: { workOrderNumber: string; reason: string; actor: string; now: Date },
): { ok: true } | { ok: false; status: number; error: string } {
  if (!(args.reason in WO_TOUCH_REASONS)) return { ok: false, status: 422, error: "Lý do không hợp lệ." };
  const known = db.query("SELECT 1 FROM wo_rows WHERE work_order_number = ? LIMIT 1").get(args.workOrderNumber);
  if (!known) return { ok: false, status: 404, error: "Không tìm thấy WO." };
  db.run("INSERT INTO wo_touches (id, work_order_number, actor, reason_code, created_at) VALUES (?, ?, ?, ?, ?)", [
    Bun.randomUUIDv7(), args.workOrderNumber, args.actor, args.reason, args.now.toISOString(),
  ]);
  return { ok: true };
}

