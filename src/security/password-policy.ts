// Luật mật khẩu mới (D-97): tối thiểu 12 ký tự, khác mật khẩu tạm, không chứa mã tài khoản, không nằm trong danh sách
// 10.000 mật khẩu phổ biến (vendored, src/security/README.md). So không phân biệt hoa thường. Thông báo tiếng Việt.
import { readFileSync } from "node:fs";
import { MIN_PASSWORD } from "../db/users.ts";

const COMMON: ReadonlySet<string> = new Set(
  readFileSync(new URL("./common-passwords.txt", import.meta.url), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean),
);

export function isCommonPassword(pw: string): boolean {
  return COMMON.has(pw.trim().toLowerCase());
}

// Trả câu lỗi tiếng Việt, hoặc null nếu đạt. tempHash: mã băm của mật khẩu tạm đang giữ (lần đổi đầu).
export async function passwordProblem(pw: string, accountId: string, tempHash: string | null): Promise<string | null> {
  if (pw.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (pw.length > 256) return "Mật khẩu quá dài (tối đa 256 ký tự).";
  if (pw.toLowerCase().includes(accountId.toLowerCase())) return "Mật khẩu không được chứa mã tài khoản.";
  if (isCommonPassword(pw)) return "Mật khẩu này quá phổ biến, dễ bị đoán. Chọn mật khẩu khác.";
  if (tempHash && (await Bun.password.verify(pw, tempHash))) return "Mật khẩu mới phải khác mật khẩu tạm.";
  return null;
}
