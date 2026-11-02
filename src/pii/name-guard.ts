// Lớp R3 (design doc mục 7.3): quét mọi chuỗi trong đầu ra (sau LLM, trước khi ghi DB).
// 1. Chạy lại R1: còn email, SĐT, giấy tờ, ngày sinh, URL thì chặn.
// 2. Bộ lọc tên riêng: từ viết hoa không thuộc danh sách cho phép bị coi là nghi tên khách.
//    Ngoại lệ duy nhất: từ đầu câu viết hoa kiểu thường (không phải mã) và từ ngay sau nó
//    không phải một từ viết hoa lạ khác. Từ dạng mã (có gạch dưới, có chữ số, hoặc viết hoa toàn bộ)
//    luôn phải nằm trong danh sách cho phép, ở bất kỳ vị trí nào.
// Có nghi vấn thì pii_check = blocked. Chặn nhầm chỉ mất bản nháp; lọt PII thì vi phạm quy tắc cứng.
// Danh sách cho phép mở rộng qua PR khi thấy chặn nhầm lặp lại.
// Kết quả chỉ chứa số đếm, không chứa chuỗi bị nghi.
import { redactR1, totalHits } from "./redact-regex.ts";

export type GuardResult = {
  pii_check: "passed" | "blocked";
  stats: { r1_hits: number; name_suspects: number };
};

export type GuardOptions = {
  rmNames?: readonly string[]; // display_name trong rm_directory (tên nhân viên, không phải khách)
  extraAllowlist?: readonly string[];
};

// Gấp chữ để so: bỏ dấu, đ thành d, viết hoa.
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase();
}

const BASE_ALLOWLIST = [
  // Tài phán và quốc gia thường gặp (tách từng từ)
  "SAMOA", "WS", "BVI", "BRITISH", "VIRGIN", "ISLANDS", "ISLAND", "HONG", "KONG", "HK", "SINGAPORE", "SG",
  "SEYCHELLES", "SC", "CAYMAN", "KY", "DELAWARE", "WYOMING", "US", "USA", "UK", "ANGUILLA", "BELIZE",
  "PANAMA", "MARSHALL", "LABUAN", "MALAYSIA", "VIETNAM", "VN", "DUBAI", "UAE", "CYPRUS",
  "MAURITIUS", "NEVIS", "KITTS", "ESTONIA", "MALTA", "IRELAND", "AUSTRALIA", "CANADA", "CHINA", "TAIWAN",
  "JAPAN", "KOREA", "THAILAND", "INDONESIA", "PHILIPPINES", "INDIA", "EU", "EUROPE", "ASIA",
  // Sản phẩm, dịch vụ, nhóm
  "IBC", "IBC01", "IBC11", "IBC13", "IBC14", "BANK", "BANKING", "RENEW", "RENEWAL", "ATA", "SERVICE",
  "SERVICES", "FORMATION", "LLC", "LTD", "LIMITED", "CORP", "INC", "PTE", "EMI", "KYC", "EKYC", "UBO",
  "CRM", "NBA", "MKT", "RM", "SA", "PO", "SO", "INVOICE", "MEMORANDUM", "FOREX", "FX", "MARKETS",
  "TRADING", "ONE", "OCC", "S&F",
  // Kênh, công cụ
  "LINKEDIN", "FACEBOOK", "WHATSAPP", "ZALO", "TELEGRAM", "TEAMS", "GOOGLE", "ZOOM", "WECHAT", "EMAIL", "GMAIL",
  // Tiền tệ
  "USD", "VND", "HKD", "SGD", "EUR", "GBP", "AUD",
  // Không đưa từ của nhãn mẫu (TIẾP CẬN, BÁO GIÁ, ...) vào đây: sau khi gấp chữ chúng trùng
  // họ, tên Việt phổ biến (Hồ, Nam, Bảo, Đăng, Thông, Gia). Chỉ "KHÁCH" là an toàn.
  "KHACH",
  // Placeholder của R1 (đã gấp chữ)
  "SDT", "GIAY_TO", "NGAY_SINH", "URL",
  // Mã lý do từ chối v0.1 (docs/spec/rejection-reason-codes.md)
  "PRICE_TOO_HIGH", "PRICE_COMPARING", "PRICE_DISCOUNT_ASK", "NO_NEED_NOW", "NO_NEED", "EXPECTATION_MISMATCH",
  "SCOPE_ADVISORY_DEPTH", "RESTRICTED_INDUSTRY", "KYC_NOT_COMPLETED", "BANK_DECLINED", "SLOW_TURNAROUND",
  "UNRESPONSIVE", "PAYMENT_PENDING", "RESELLER_CHANNEL", "OTHER",
  // Mã luật, cờ
  "NBA_R1", "NBA_R2", "NBA_R3", "NBA_R4", "NBA_R5", "NBA_X_DUP", "NBA_X_STALL",
  // Tháng, thứ
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC",
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "T2", "T3", "T4", "T5", "T6", "T7", "CN",
  // Từ thông dụng hay viết hoa
  "OK", "AI", "VIP", "PDF", "FAQ", "Q&A", "I",
];

const PSEUDONYM_RE = /^KHACH_\d+$/;
const TOKEN_RE = /[\p{L}\p{N}_&]+/gu;
const SENTENCE_BREAK_RE = /[.!?:;\n"“”(\[\]•\-]\s*$/u;

function isCapitalized(token: string): boolean {
  return /^\p{Lu}/u.test(token);
}

function isCodeLike(token: string): boolean {
  if (token.includes("_")) return true;
  if (/\p{N}/u.test(token) && /\p{L}/u.test(token)) return true;
  return token.length >= 2 && token === token.toUpperCase() && /\p{Lu}/u.test(token);
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
}

function countNameSuspects(text: string, allow: Set<string>): number {
  const tokens = [...text.matchAll(TOKEN_RE)].map((m) => ({ t: m[0], at: m.index ?? 0 }));
  const allowed = (t: string) => allow.has(fold(t)) || PSEUDONYM_RE.test(t);
  let suspects = 0;
  for (let i = 0; i < tokens.length; i++) {
    const { t, at } = tokens[i]!;
    if (!isCapitalized(t) || allowed(t)) continue;
    if (isCodeLike(t)) {
      suspects++;
      continue;
    }
    const before = text.slice(0, at);
    const sentenceStart = before.trim() === "" || SENTENCE_BREAK_RE.test(before);
    const next = tokens[i + 1]?.t;
    const nextIsStrangeCapital = next !== undefined && isCapitalized(next) && !allowed(next);
    if (sentenceStart && !nextIsStrangeCapital) continue;
    suspects++;
  }
  return suspects;
}

export function guardOutput(value: unknown, opts: GuardOptions = {}): GuardResult {
  const allow = new Set(BASE_ALLOWLIST.map(fold));
  for (const name of [...(opts.rmNames ?? []), ...(opts.extraAllowlist ?? [])]) {
    for (const m of name.matchAll(TOKEN_RE)) allow.add(fold(m[0]));
  }
  const strings: string[] = [];
  collectStrings(value, strings);
  let r1Hits = 0;
  let nameSuspects = 0;
  for (const s of strings) {
    r1Hits += totalHits(redactR1(s).stats);
    nameSuspects += countNameSuspects(s, allow);
  }
  return {
    pii_check: r1Hits === 0 && nameSuspects === 0 ? "passed" : "blocked",
    stats: { r1_hits: r1Hits, name_suspects: nameSuspects },
  };
}
