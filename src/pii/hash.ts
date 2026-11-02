// Chuẩn hoá và băm email, SĐT của Lead để kiểm trùng (spec mục 2, design doc mục 7.2).
// D-05 (Mark đã duyệt, lệch spec "SHA-256"): HMAC-SHA256 với khoá bí mật PII_HASH_KEY,
// vì không gian SĐT nhỏ nên SHA-256 trần dò ngược được. Giá trị gốc không rời khỏi hàm băm.
import { createHmac } from "node:crypto";
import { PII_HASH_KEY_MIN_LENGTH } from "../config.ts";

export type PhoneOptions = {
  // Mã quốc gia thay cho số 0 đầu của số nội địa. Chờ đối chiếu schema CRM (mục 7.2): CRM lưu SĐT dạng nào.
  defaultCountryCode?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15; // E.164

export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

export function normalizePhone(raw: string, opts: PhoneOptions = {}): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  const hasPlus = /^\(?\+/.test(trimmed);
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!hasPlus && digits.startsWith("0") && opts.defaultCountryCode) {
    digits = opts.defaultCountryCode + digits.slice(1);
  }
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return null;
  return digits;
}

export type PiiHasher = {
  hashEmail(raw: string | null | undefined): string | null;
  hashPhone(raw: string | null | undefined): string | null;
};

export function createPiiHasher(key: string, phoneOpts: PhoneOptions = {}): PiiHasher {
  if (typeof key !== "string" || key.length < PII_HASH_KEY_MIN_LENGTH) {
    throw new RangeError("pii hash: key too short");
  }
  const hmac = (value: string) => createHmac("sha256", key).update(value, "utf8").digest("hex");
  return {
    hashEmail(raw) {
      if (typeof raw !== "string") return null;
      const v = normalizeEmail(raw);
      return v === null ? null : hmac(v);
    },
    hashPhone(raw) {
      if (typeof raw !== "string") return null;
      const v = normalizePhone(raw, phoneOpts);
      return v === null ? null : hmac(v);
    },
  };
}
