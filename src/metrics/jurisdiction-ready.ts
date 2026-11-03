// Chỉ số tài phán sẵn sàng (Mi1-mkt-05, spec mục 1 câu hỏi 3; D-32). Tính bằng code, không do LLM.
//   jurisdiction_ready: tài phán đã chốt giá (trạng thái giá thuộc danh sách đã chốt) VÀ số loại file SKD
//   khác nhau ở trạng thái xong đạt đủ số file yêu cầu (10). Thiếu bảng giá thì coi là chưa chốt.
import type { JurisdictionParams } from "../config.ts";

const norm = (s: string) => s.trim().toLowerCase();

export function jurisdictionReadiness(j: { priceStatus: string | null; skdDoneTypes: number }, p: JurisdictionParams) {
  const priceLocked = j.priceStatus !== null && p.lockedPriceStatuses.some((s) => norm(s) === norm(j.priceStatus!));
  const skdMissing = Math.max(0, p.skdFiles - j.skdDoneTypes);
  return { priceLocked, skdMissing, ready: priceLocked && skdMissing === 0 };
}

export function isSkdDone(status: string, p: JurisdictionParams): boolean {
  return p.doneSkdStatuses.some((s) => norm(s) === norm(status));
}
