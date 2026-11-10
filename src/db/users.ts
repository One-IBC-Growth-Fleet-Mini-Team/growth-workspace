// Mật khẩu theo tài khoản (D-79). Dòng mới nhất thắng; must_change = 1 thì phải đổi ở /password trước khi dùng trang khác.
import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";

export const ACCOUNT_IDS = ["amy", "mark", "mkt", "bod"] as const;
export type AccountId = (typeof ACCOUNT_IDS)[number];
export const MIN_PASSWORD = 12;

export function currentPassword(db: Database, user: string): { hash: string; mustChange: boolean } | null {
  const r = db.query("SELECT hash, must_change FROM user_passwords WHERE user_id = ? ORDER BY set_at DESC, id DESC LIMIT 1").get(user) as { hash: string; must_change: number } | null;
  return r ? { hash: r.hash, mustChange: r.must_change === 1 } : null;
}

// Đổi mật khẩu (kể cả đặt lại bằng add-user) huỷ mọi phiên cấp trước đó của tài khoản (D-85). Phiên cũ chưa có iat
// coi như cấp từ trước nên cũng bị huỷ nếu tài khoản đã có mật khẩu trong DB.
export function sessionRevoked(db: Database, s: { sub: string; iat?: number }): boolean {
  const r = db.query("SELECT MAX(set_at) AS t FROM user_passwords WHERE user_id = ?").get(s.sub) as { t: string | null } | null;
  return r?.t ? (s.iat ?? 0) < Date.parse(r.t) : false;
}

export async function setPassword(db: Database, user: AccountId, password: string, opts: { mustChange: boolean; now: Date; actor: string }): Promise<void> {
  if (password.length < MIN_PASSWORD) throw new Error("PASSWORD_TOO_SHORT");
  const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
  db.run("INSERT INTO user_passwords (id, user_id, hash, must_change, set_at, set_by) VALUES (?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), user, hash, opts.mustChange ? 1 : 0, opts.now.toISOString(), opts.actor]);
}

// Mật khẩu tạm 16 ký tự dễ đọc (bỏ ký tự dễ nhầm như 0, O, l, 1).
export function tempPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("");
}
