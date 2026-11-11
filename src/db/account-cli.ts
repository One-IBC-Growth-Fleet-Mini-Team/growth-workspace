// Lệnh quản lý tài khoản (D-97), dùng chung cho bản cài máy (bun run scripts/accounts.ts ...) và máy chủ
// (sudo growth-run add-user ...). Mật khẩu tạm chỉ trả về để in ra màn hình một lần; không ghi log, không ghi file.
import type { Database } from "bun:sqlite";
import { ACCOUNT_ROLES, createAccount, disableAccount, getAccount, listAccounts, logSecurityEvent, setPassword, tempPassword } from "./users.ts";

export const TEMP_PASSWORD_HOURS = 72;
export type CliResult = { code: number; out: string };

const USAGE = `Cách dùng:
  add-user <mã tài khoản> <${ACCOUNT_ROLES.join("|")}>   tạo tài khoản, in mật khẩu tạm
  reset-password <mã tài khoản>                 cấp mật khẩu tạm mới, huỷ mọi phiên
  disable-user <mã tài khoản>                   khoá ngay, huỷ phiên, giữ lịch sử
  list-users                                    tài khoản, vai trò, lần đăng nhập cuối, còn mật khẩu tạm không
Mã tài khoản: chữ thường, số, gạch nối, 2 tới 32 ký tự (ví dụ mkt-01). Không dùng tên thật.\n`;

async function issueTemp(db: Database, id: string, now: Date, actor: string): Promise<string> {
  const pw = tempPassword();
  await setPassword(db, id, pw, { mustChange: true, now, actor, expiresAt: new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000) });
  return pw;
}

const tempText = (id: string, pw: string, now: Date) =>
  `Tài khoản: ${id}\nMật khẩu tạm: ${pw}\nHết hạn: ${new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} UTC (${TEMP_PASSWORD_HOURS} giờ). ` +
  `Đăng nhập ở /login rồi đổi ngay.\nGửi địa chỉ web và mật khẩu tạm qua hai kênh khác nhau. Mật khẩu này không được lưu ở đâu, không in lại được.\n`;

export async function runAccountCommand(db: Database, argv: string[], opts: { now: Date; actor?: string }): Promise<CliResult> {
  const [cmd, id = "", role = ""] = argv;
  const actor = opts.actor ?? "cli";
  const now = opts.now;
  if (cmd === "add-user") {
    const r = createAccount(db, id, role, { now, actor });
    if (r === "ID_INVALID") return { code: 2, out: `Mã tài khoản không hợp lệ.\n${USAGE}` };
    if (r === "ROLE_INVALID") return { code: 2, out: `Vai trò phải là một trong: ${ACCOUNT_ROLES.join(", ")}.\n` };
    if (r === "EXISTS") return { code: 1, out: `Tài khoản ${id} đã có. Cấp mật khẩu tạm mới bằng: reset-password ${id}\n` };
    logSecurityEvent(db, id, "account_created", { now, actor });
    return { code: 0, out: `Vai trò: ${role}\n${tempText(id, await issueTemp(db, id, now, actor), now)}` };
  }
  if (cmd === "reset-password") {
    const a = getAccount(db, id);
    if (!a) return { code: 1, out: `Không có tài khoản ${id}.\n` };
    if (a.disabled) return { code: 1, out: `Tài khoản ${id} đã bị khoá; tạo tài khoản mới thay vì mở lại.\n` };
    const pw = await issueTemp(db, id, now, actor);
    logSecurityEvent(db, id, "password_reset", { now, actor });
    return { code: 0, out: tempText(id, pw, now) };
  }
  if (cmd === "disable-user") {
    const r = disableAccount(db, id, { now, actor });
    if (r === "NOT_FOUND") return { code: 1, out: `Không có tài khoản ${id}.\n` };
    if (r === "ALREADY") return { code: 0, out: `Tài khoản ${id} đã bị khoá từ trước.\n` };
    logSecurityEvent(db, id, "account_disabled", { now, actor });
    return { code: 0, out: `Đã khoá ${id}. Mọi phiên của tài khoản này hết hiệu lực ngay; lịch sử thao tác giữ nguyên.\n` };
  }
  if (cmd === "list-users") {
    const rows = listAccounts(db);
    if (!rows.length) return { code: 0, out: "Chưa có tài khoản nào. Tạo bằng: add-user <mã tài khoản> <vai trò>\n" };
    const head = ["Tài khoản", "Vai trò", "Đăng nhập cuối (UTC)", "Mật khẩu tạm", "Trạng thái"];
    const body = rows.map((r) => [r.id, r.role, r.lastLoginAt ? r.lastLoginAt.slice(0, 16).replace("T", " ") : "chưa", r.mustChange ? "còn" : "không", r.disabled ? "đã khoá" : "đang dùng"]);
    const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]!.length)));
    return { code: 0, out: [head, ...body].map((r) => r.map((c, i) => c.padEnd(w[i]!)).join("  ").trimEnd()).join("\n") + "\n" };
  }
  return { code: 2, out: USAGE };
}
