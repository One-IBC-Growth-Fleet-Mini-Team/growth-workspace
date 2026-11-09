// Gợi ý ngân hàng cho một khách (D-34), theo quy tắc trong file BANKING INSTRUCTION của Bank Team. Bằng code, không do LLM.
//   1. Chỉ giữ tổ chức nhận công ty thành lập ở tài phán của khách (ma trận YES).
//   2. EMI xếp theo danh sách ưu tiên (Airwallex, Payoneer, Aspire), rồi độ khó LOW, MEDIUM, HIGH, rồi tên.
//      Ngân hàng truyền thống xếp theo độ khó, rồi tên.
//   3. Mục tiêu ít nhất minAccounts tài khoản: mở EMI trước. Công ty mới chưa có lịch sử kinh doanh thì nộp
//      ngân hàng truyền thống sau 6 tới 12 tháng; công ty đã hoạt động thì nộp song song.
// Không xét quốc tịch: ma trận quốc tịch của Bank Team đang mã hoá bằng màu ô, không xuất ra CSV được.
import type { BankParams } from "../config.ts";

export type BankCandidate = { bank: string; category: "emi" | "traditional"; complexity: string | null; supported: boolean };
const RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const rank = (c: string | null) => RANK[(c ?? "").toUpperCase()] ?? 3;

export function suggestBanks(banks: BankCandidate[], opts: { newCompany: boolean }, p: BankParams) {
  const prio = (b: string) => {
    const i = p.priorityEmi.findIndex((x) => x.toLowerCase() === b.toLowerCase());
    return i < 0 ? p.priorityEmi.length : i;
  };
  const ok = banks.filter((b) => b.supported);
  const emi = ok.filter((b) => b.category === "emi").sort((a, b) => prio(a.bank) - prio(b.bank) || rank(a.complexity) - rank(b.complexity) || a.bank.localeCompare(b.bank));
  const traditional = ok.filter((b) => b.category === "traditional").sort((a, b) => rank(a.complexity) - rank(b.complexity) || a.bank.localeCompare(b.bank));
  const plan: string[] = [];
  if (!emi.length && !traditional.length) plan.push("Không có tổ chức nào trong ma trận nhận công ty ở nơi này. Hỏi Bank Team.");
  if (emi.length) {
    const pick = emi.slice(0, p.minAccounts).map((b) => b.bank);
    plan.push(`Mở ngay ${pick.length} tài khoản EMI: ${pick.join(", ")}`);
  }
  if (traditional.length) {
    const t = traditional.map((b) => b.bank).join(", ");
    plan.push(opts.newCompany ? `Sau 6 tới 12 tháng hoạt động: nộp ${t}` : `Nộp song song ngân hàng truyền thống: ${t}`);
  }
  return { emi, traditional, notSupported: banks.filter((b) => !b.supported).map((b) => b.bank).sort(), plan };
}
