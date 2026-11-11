// Bảng sẵn sàng Phụ lục B (GĐ3 việc 5; D-94). Không xây mục nào của Phụ lục B; chỉ đo tiến độ tới điều kiện bật theo
// spec, bằng số đã có: tuần Cổng 2 liên tiếp, quyết định của người trong Hàng chờ, chuỗi ID nối tới Payment (Cổng 3),
// cỡ mẫu Win gate. Điều kiện không đo được trong hệ thống (quyền API nền tảng) ghi rõ là chưa ghi nhận.
import type { Database } from "bun:sqlite";
import { buildWinGate } from "../db/budget.ts";
import { buildDataBoard } from "../db/data01.ts";
import { buildDigest, mondayOf } from "../mi1/core.ts";
import { addDays, vnDate } from "../time.ts";

export type ReadinessRow = { item: string; condition: string; progress: string; ready: boolean; unlockBy: string };
const STEER_WEEKS = 4, SENTINEL_DECISIONS = 50;
// Mắt nối từ phiên web tới thanh toán: Cổng 3 là một chu kỳ bán thật nối suốt tới Payment (spec mục 14).
const FROM_SESSION = ["session_id", "conversation_id", "contact_id", "lead_id", "opportunity_id", "quote_id", "order_id", "payment_id"];

export function buildAppendixB(db: Database, now: Date): ReadinessRow[] {
  // Số tuần liền (tính từ tuần vừa xong) đạt Cổng 2: Amy mở Hàng chờ đủ ngày và quyết đủ tỷ lệ.
  let weeks = 0;
  for (let w = mondayOf(vnDate(new Date(now.getTime() - 7 * 86_400_000))); weeks < STEER_WEEKS; w = addDays(w, -7)) {
    if (!buildDigest(db, w, now).gate2) break;
    weeks += 1;
  }
  const decisions = (db.query("SELECT COUNT(*) AS n FROM queue_events WHERE action IN ('confirm','edit','reject','escalate','pii_flag')").get() as { n: number }).n;
  const links = buildDataBoard(db, now).chain.filter((l) => FROM_SESSION.includes(l.from) && FROM_SESSION.includes(l.to));
  const linked = links.filter((l) => l.linked > 0).length;
  const gate3 = links.length > 0 && linked === links.length;
  const win = buildWinGate(db, now);
  const enough = win.filter((x) => x.status !== "insufficient_data").length;
  const sentinel = decisions >= SENTINEL_DECISIONS;
  return [
    { item: "Lệnh /steer và User_Activities_Log", condition: "Hàng chờ Workspace đã chạy ổn 4 tuần", progress: `Hàng chờ chạy ổn (đạt Cổng 2 liên tiếp): ${weeks}/${STEER_WEEKS} tuần`, ready: weeks >= STEER_WEEKS, unlockBy: "Amy dùng Hàng chờ hằng tuần; Mark bật" },
    { item: "Sentinel-01 (kiểm toán độc lập)", condition: "Có ít nhất 50 quyết định thật trong Hàng chờ", progress: `Quyết định trong Hàng chờ: ${Math.min(decisions, SENTINEL_DECISIONS)}/${SENTINEL_DECISIONS}`, ready: sentinel, unlockBy: "Amy quyết trên Hàng chờ; Mark bật" },
    { item: "Monte-Carlo ngân sách", condition: "Qua Cổng 3; mỗi bước phễu có đủ cỡ mẫu tối thiểu", progress: `Cổng 3: ${gate3 ? "đạt" : "chưa"} (${linked}/${links.length} mắt nối từ phiên tới Payment có dữ liệu nối được); chiến dịch đủ mẫu Win gate: ${enough}/${win.length}`, ready: gate3 && win.length > 0 && enough === win.length, unlockBy: "MobCEC gửi sự kiện theo Phụ lục A; Mark bật" },
    { item: "owned-channel-mcp (CRON-10)", condition: "Đã được duyệt quyền API của từng nền tảng", progress: "Quyền API đã duyệt: chưa ghi nhận (Facebook, Instagram, TikTok, GBP); hệ thống không đo được, cần Mark xác nhận", ready: false, unlockBy: "Mark nộp app review từng nền tảng, bắt đầu từ Facebook" },
    { item: "cross-audit-mcp (CRON-11)", condition: "Đi cùng Sentinel-01", progress: `Theo Sentinel-01: ${sentinel ? "đủ điều kiện" : "chưa"}`, ready: sentinel, unlockBy: "Như Sentinel-01" },
  ];
}
