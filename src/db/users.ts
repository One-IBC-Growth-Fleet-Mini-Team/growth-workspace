// Tài khoản và mật khẩu (D-79, D-85, D-97). Mỗi người một tài khoản (ví dụ mkt-01), gắn một vai trò. Mật khẩu: dòng mới
// nhất thắng; must_change = 1 thì phải đổi ở /password trước khi dùng trang khác. Không có cách đăng nhập nào khác.
import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";

export const ACCOUNT_ROLES = ["amy", "mkt", "mark", "bod"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
// Chữ thường, số, gạch nối; 2 tới 32 ký tự. Mã tài khoản không phải tên thật (repo và log không có tên người).
export const ACCOUNT_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
export const MIN_PASSWORD = 12;

export type Account = { id: string; role: AccountRole; disabled: boolean };

export function isAccountRole(x: string): x is AccountRole {
  return (ACCOUNT_ROLES as readonly string[]).includes(x);
}

export function getAccount(db: Database, id: string): Account | null {
  if (!ACCOUNT_ID_RE.test(id)) return null;
  const r = db.query("SELECT a.id, a.role, d.account_id AS d FROM accounts a LEFT JOIN account_disabled d ON d.account_id = a.id WHERE a.id = ?").get(id) as { id: string; role: AccountRole; d: string | null } | null;
  return r ? { id: r.id, role: r.role, disabled: r.d !== null } : null;
}

export function createAccount(db: Database, id: string, role: string, opts: { now: Date; actor: string }): "ok" | "ID_INVALID" | "ROLE_INVALID" | "EXISTS" {
  if (!ACCOUNT_ID_RE.test(id)) return "ID_INVALID";
  if (!isAccountRole(role)) return "ROLE_INVALID";
  if (db.query("SELECT 1 FROM accounts WHERE id = ?").get(id)) return "EXISTS";
  db.run("INSERT INTO accounts (id, role, created_at, created_by) VALUES (?, ?, ?, ?)", [id, role, opts.now.toISOString(), opts.actor]);
  return "ok";
}

// Khoá ngay: phiên đang có bị huỷ ở lượt gọi kế tiếp (sessionRevoked), lịch sử thao tác giữ nguyên.
export function disableAccount(db: Database, id: string, opts: { now: Date; actor: string }): "ok" | "NOT_FOUND" | "ALREADY" {
  const a = getAccount(db, id);
  if (!a) return "NOT_FOUND";
  if (a.disabled) return "ALREADY";
  db.run("INSERT INTO account_disabled (account_id, disabled_at, disabled_by) VALUES (?, ?, ?)", [id, opts.now.toISOString(), opts.actor]);
  return "ok";
}

export function currentPassword(db: Database, user: string): { hash: string; mustChange: boolean; expiresAt: string | null } | null {
  const r = db.query("SELECT hash, must_change, expires_at FROM user_passwords WHERE user_id = ? ORDER BY set_at DESC, id DESC LIMIT 1").get(user) as { hash: string; must_change: number; expires_at: string | null } | null;
  return r ? { hash: r.hash, mustChange: r.must_change === 1, expiresAt: r.expires_at } : null;
}

// Đổi mật khẩu (kể cả reset) huỷ mọi phiên cấp trước đó của tài khoản (D-85); tài khoản bị khoá hay không còn thì huỷ hết.
// Phiên cũ chưa có iat coi như cấp từ trước nên cũng bị huỷ nếu tài khoản đã có mật khẩu trong DB.
export function sessionRevoked(db: Database, s: { sub: string; iat?: number }): boolean {
  const a = getAccount(db, s.sub);
  if (!a || a.disabled) return true;
  const r = db.query("SELECT MAX(set_at) AS t FROM user_passwords WHERE user_id = ?").get(s.sub) as { t: string | null } | null;
  return r?.t ? (s.iat ?? 0) < Date.parse(r.t) : false;
}

export async function setPassword(db: Database, user: string, password: string, opts: { mustChange: boolean; now: Date; actor: string; expiresAt?: Date }): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new Error("PASSWORD_TOO_SHORT");
  if (!getAccount(db, user)) throw new Error("ACCOUNT_NOT_FOUND");
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  db.run("INSERT INTO user_passwords (id, user_id, hash, must_change, set_at, set_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [Bun.randomUUIDv7(), user, hash, opts.mustChange ? 1 : 0, opts.now.toISOString(), opts.actor, opts.expiresAt?.toISOString() ?? null]);
}

// Bảng cho lệnh list-users: không có mã băm hay mật khẩu.
export function listAccounts(db: Database): { id: string; role: AccountRole; disabled: boolean; mustChange: boolean; lastLoginAt: string | null }[] {
  const rows = db.query("SELECT a.id, a.role, d.account_id AS d FROM accounts a LEFT JOIN account_disabled d ON d.account_id = a.id ORDER BY a.id").all() as { id: string; role: AccountRole; d: string | null }[];
  return rows.map((r) => ({
    id: r.id, role: r.role, disabled: r.d !== null, mustChange: currentPassword(db, r.id)?.mustChange ?? false,
    lastLoginAt: (db.query("SELECT MAX(at) AS t FROM security_events WHERE account_id = ? AND kind = 'login_ok'").get(r.id) as { t: string | null }).t,
  }));
}

export type SecurityEventKind = "login_ok" | "login_failed" | "login_locked" | "login_rate_limited" | "password_changed" | "password_reset" | "password_expired" | "account_created" | "account_disabled";

// Ghi sổ sự kiện bảo mật (D-97). Mã không có trong accounts ghi là "?": người dùng có thể gõ nhầm mật khẩu vào ô tài
// khoản, nên chuỗi lạ không bao giờ được lưu.
export function logSecurityEvent(db: Database, accountId: string, kind: SecurityEventKind, opts: { now: Date; actor: string }): void {
  const id = getAccount(db, accountId) ? accountId : "?";
  db.run("INSERT INTO security_events (id, at, account_id, kind, actor) VALUES (?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), opts.now.toISOString(), id, kind, opts.actor.slice(0, 32)]);
}

export function listSecurityEvents(db: Database, limit = 200): { at: string; accountId: string; kind: SecurityEventKind; actor: string }[] {
  return db.query("SELECT at, account_id AS accountId, kind, actor FROM security_events ORDER BY at DESC, id DESC LIMIT ?").all(limit) as { at: string; accountId: string; kind: SecurityEventKind; actor: string }[];
}

// Mật khẩu tạm 16 ký tự dễ đọc (bỏ ký tự dễ nhầm như 0, O, l, 1).
export function tempPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("");
}
