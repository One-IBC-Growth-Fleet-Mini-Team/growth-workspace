// Đăng nhập Hàng chờ (D-04): Microsoft Entra ID (OIDC, authorization code + PKCE), dùng chung app đăng ký với Graph.
// Phiên là cookie ký HMAC-SHA256 bằng SESSION_SECRET; actor lấy từ phiên, không từ form (design doc mục 9).
// Chế độ mật khẩu (D-97): mỗi người một tài khoản trong DB (src/db/users.ts), gắn một vai trò.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// id là mã tài khoản (ghi làm người thao tác); account là vai trò của tài khoản (D-97). role là quyền: BOD xem như Mark
// (viewer); Team MKT chỉ thấy số tổng hợp (D-63, src/queue/roles.ts).
export type QueueUser = { id: string; role: "approver" | "viewer" | "mkt"; account?: "amy" | "mkt" | "mark" | "bod" };

// Vai trò tài khoản; account luôn có khi đăng nhập bằng mật khẩu. Thiếu (Entra, test cũ) thì suy từ quyền, viewer không
// phải mã "mark" coi là BOD (quyền hẹp hơn).
export function accountRoleOf(u: QueueUser): "amy" | "mkt" | "mark" | "bod" {
  return u.account ?? (u.role === "approver" ? "amy" : u.role === "mkt" ? "mkt" : u.id === "mark" ? "mark" : "bod");
}

export function permissionOf(role: "amy" | "mkt" | "mark" | "bod"): QueueUser["role"] {
  return role === "amy" ? "approver" : role === "mkt" ? "mkt" : "viewer";
}
// iat: lúc cấp phiên (ms). Phiên cấp trước lần đổi mật khẩu gần nhất của tài khoản bị huỷ (D-85).
// exp: hạn tuyệt đối (7 ngày từ lúc cấp); seen: lần dùng gần nhất, quá 8 giờ không dùng thì hết hạn (D-97).
export type Session = { sub: string; csrf: string; exp: number; iat?: number; seen?: number };

export const SESSION_COOKIE = "gw_session";
export const OIDC_COOKIE = "gw_oidc";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const SESSION_IDLE_MS = 8 * 3600 * 1000;
// Ghi lại seen khi lần dùng trước cách quá 5 phút, để không đặt cookie ở mọi yêu cầu.
const TOUCH_AFTER_MS = 5 * 60 * 1000;

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function sealValue(secret: string, value: unknown): string {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${sign(secret, data)}`;
}

export function unsealValue<T>(secret: string, sealed: string | undefined): T | null {
  if (!sealed) return null;
  const [data, mac] = sealed.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(secret, data));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// secure = false chỉ khi Hàng chờ chạy ở http://localhost (D-26): khi đó trình duyệt cùng máy, không có HTTPS.
function cookie(name: string, value: string, maxAgeSeconds: number, path = "/", sameSite: "Strict" | "Lax" = "Strict", secure = true): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly;${secure ? " Secure;" : ""} SameSite=${sameSite}`;
}

export function createSessionCookie(secret: string, s: Session): string {
  return `${SESSION_COOKIE}=${sealValue(secret, s)}`;
}

export function newSession(user: QueueUser, now: Date): Session {
  return { sub: user.id, csrf: randomBytes(24).toString("base64url"), exp: now.getTime() + SESSION_TTL_MS, iat: now.getTime(), seen: now.getTime() };
}

export function sessionSetCookie(secret: string, s: Session, secure = true): string {
  return cookie(SESSION_COOKIE, sealValue(secret, s), Math.max(0, Math.floor((s.exp - (s.seen ?? s.iat ?? Date.now())) / 1000)), "/", "Strict", secure);
}

// Phiên còn dùng: trả cookie mới với seen = bây giờ nếu lần ghi trước đã lâu; null nếu chưa cần.
export function touchSession(secret: string, s: Session, now: Date, secure = true): string | null {
  const last = s.seen ?? s.iat;
  if (last === undefined || now.getTime() - last < TOUCH_AFTER_MS) return null;
  return sessionSetCookie(secret, { ...s, seen: now.getTime() }, secure);
}

export function clearCookie(name: string, path = "/", secure = true): string {
  return cookie(name, "", 0, path, "Strict", secure);
}

export function readSession(req: Request, secret: string, now: Date): Session | null {
  const s = unsealValue<Session>(secret, cookieValue(req, SESSION_COOKIE));
  if (!s || typeof s.exp !== "number" || s.exp <= now.getTime()) return null;
  // Hạn tuyệt đối tính lại từ iat, phòng phiên cũ (trước D-97) mang exp dài hơn 7 ngày.
  if (typeof s.iat === "number" && now.getTime() - s.iat >= SESSION_TTL_MS) return null;
  const last = s.seen ?? s.iat;
  if (typeof last === "number" && now.getTime() - last > SESSION_IDLE_MS) return null;
  if (typeof s.sub !== "string" || !/^[a-z][a-z0-9-]{1,31}$/.test(s.sub)) return null;
  return s;
}

export function csrfMatches(s: Session, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(s.csrf);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Trạng thái tạm của luồng OIDC (state, nonce, code_verifier), ký và hết hạn sau 10 phút.
export type OidcPending = { state: string; nonce: string; verifier: string; exp: number };

export function newOidcPending(now: Date): OidcPending {
  return {
    state: randomBytes(16).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    exp: now.getTime() + 10 * 60 * 1000,
  };
}

// Lax, không Strict: Entra chuyển về /auth/callback bằng điều hướng khởi phát từ site khác,
// trình duyệt bỏ cookie Strict ở bước này. Cookie chỉ sống 10 phút, chỉ có path /auth, đã ký.
export function oidcSetCookie(secret: string, p: OidcPending): string {
  return cookie(OIDC_COOKIE, sealValue(secret, p), 600, "/auth", "Lax");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export type OidcProvider = {
  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string }): string;
  // Đổi code lấy id_token đã kiểm chữ ký; trả oid (AAD object id) và nonce trong token.
  exchange(code: string, codeVerifier: string, expectedNonce: string): Promise<{ oid: string; nonce: string }>;
};

type Jwk = { kid?: string; kty?: string; n?: string; e?: string; alg?: string; use?: string };

// Kiểm id_token RS256: chữ ký theo JWKS, iss, aud, exp, nbf, nonce. Không nhận alg khác.
export async function verifyIdToken(
  token: string,
  opts: { jwks: readonly Jwk[]; issuer: string; audience: string; nonce: string; nowSeconds: number },
): Promise<{ oid: string; nonce: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("ID_TOKEN_FORMAT");
  const [h, p, sig] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error("ID_TOKEN_ALG");
  const jwk = opts.jwks.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("ID_TOKEN_KID");
  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("ID_TOKEN_SIGNATURE");
  const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
  const skew = 120;
  if (c.iss !== opts.issuer) throw new Error("ID_TOKEN_ISS");
  if (c.aud !== opts.audience) throw new Error("ID_TOKEN_AUD");
  if (typeof c.exp !== "number" || c.exp + skew < opts.nowSeconds) throw new Error("ID_TOKEN_EXP");
  if (typeof c.nbf === "number" && c.nbf - skew > opts.nowSeconds) throw new Error("ID_TOKEN_NBF");
  if (c.nonce !== opts.nonce) throw new Error("ID_TOKEN_NONCE");
  if (typeof c.oid !== "string") throw new Error("ID_TOKEN_OID");
  return { oid: c.oid, nonce: c.nonce as string };
}

// Provider thật cho Entra ID. Gọi login.microsoftonline.com (không phải CRM); test dùng provider giả.
export function createEntraOidc(cfg: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): OidcProvider {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}`;
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    authorizationUrl({ state, nonce, codeChallenge }) {
      const u = new URL(`${base}/oauth2/v2.0/authorize`);
      u.search = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: "code",
        redirect_uri: cfg.redirectUri,
        response_mode: "query",
        scope: "openid",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return u.href;
    },
    async exchange(code, codeVerifier, expectedNonce) {
      const res = await doFetch(`${base}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: cfg.redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
        redirect: "manual",
      });
      if (!res.ok) throw new Error("OIDC_TOKEN_EXCHANGE");
      const body = (await res.json()) as { id_token?: string };
      if (!body.id_token) throw new Error("OIDC_NO_ID_TOKEN");
      const keys = (await (await doFetch(`${base}/discovery/v2.0/keys`, { redirect: "manual" })).json()) as { keys: Jwk[] };
      return verifyIdToken(body.id_token, {
        jwks: keys.keys,
        issuer: `${base}/v2.0`,
        audience: cfg.clientId,
        nonce: expectedNonce,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
    },
  };
}
