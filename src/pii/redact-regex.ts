// Lớp R1 (design doc mục 7.3): regex xoá email, SĐT, số giấy tờ, ngày sinh có ngữ cảnh, URL
// trước khi văn bản rời tiến trình (gửi LLM) và chạy lại ở lớp R3.
// Chặt hơn design doc một chút: xoá mọi URL, không chỉ URL có tham số, vì đường dẫn hồ sơ
// (ví dụ trang cá nhân mạng xã hội) cũng chứa tên người.
// Thứ tự áp: URL, email, ngày sinh, giấy tờ, SĐT (mẫu trước không để lộ phần cho mẫu sau).
// Thống kê chỉ đếm số chỗ đã xoá theo loại, không giữ giá trị.

export type RedactionStats = { email: number; phone: number; id_doc: number; dob: number; url: number };

export const PLACEHOLDERS = {
  email: "[EMAIL]",
  phone: "[SĐT]",
  id_doc: "[GIẤY_TỜ]",
  dob: "[NGÀY_SINH]",
  url: "[URL]",
} as const;

export function emptyStats(): RedactionStats {
  return { email: 0, phone: 0, id_doc: 0, dob: 0, url: 0 };
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

const DATE_PART =
  "(?:\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}|\\d{4}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{4})";
const DOB_CONTEXT =
  "(?:d\\.?o\\.?b\\.?|date\\s+of\\s+birth|birth\\s*day|birthday|born(?:\\s+on)?|ngày\\s+sinh|ngay\\s+sinh|sinh\\s+ngày|sinh\\s+ngay|năm\\s+sinh|nam\\s+sinh|sinh\\s+năm|sinh\\s+nam|ns)";
const DOB_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${DOB_CONTEXT})(\\s*[:\\-]?\\s*)${DATE_PART}(?![\\p{N}])`, "giu");

const ID_CONTEXT =
  "(?:passport(?:\\s+no\\.?)?|hộ\\s+chiếu|ho\\s+chieu|cccd|cmnd|căn\\s+cước|can\\s+cuoc|id\\s+(?:no\\.?|number|card))";
const ID_CONTEXT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${ID_CONTEXT})((?:\\s*(?:số|so|no\\.?|#|:))*\\s*)[A-Z0-9]{6,12}(?![\\p{L}\\p{N}])`,
  "giu",
);
// Chuỗi giống số hộ chiếu không có ngữ cảnh: 1 tới 2 chữ cái in hoa rồi 6 tới 8 chữ số.
const ID_SHAPE_RE = /(?<![\p{L}\p{N}_])[A-Z]{1,2}\d{6,8}(?![\p{L}\p{N}_])/gu;

// SĐT: tuỳ chọn tiền tố (+cc) hoặc +, rồi chữ số và ký tự phân cách trên cùng một dòng.
const PHONE_RE = /(?<![\p{L}\p{N}_+])(?:\(\+?\d{1,4}\)|\+)?[ \t.-]*\d[\d \t().-]{6,}\d(?![\p{L}\p{N}_])/gu;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

export function redactR1(input: string): { text: string; stats: RedactionStats } {
  const stats = emptyStats();
  let text = input.replace(URL_RE, () => {
    stats.url++;
    return PLACEHOLDERS.url;
  });
  text = text.replace(EMAIL_RE, () => {
    stats.email++;
    return PLACEHOLDERS.email;
  });
  text = text.replace(DOB_RE, (_m, ctx: string, sep: string) => {
    stats.dob++;
    return `${ctx}${sep}${PLACEHOLDERS.dob}`;
  });
  text = text.replace(ID_CONTEXT_RE, (_m, ctx: string, sep: string) => {
    stats.id_doc++;
    return `${ctx}${sep}${PLACEHOLDERS.id_doc}`;
  });
  text = text.replace(ID_SHAPE_RE, () => {
    stats.id_doc++;
    return PLACEHOLDERS.id_doc;
  });
  text = text.replace(PHONE_RE, (m) => {
    const core = m.trim();
    const digits = core.replace(/\D/g, "").length;
    if (DATE_LIKE.test(core) || digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) return m;
    stats.phone++;
    const lead = m.slice(0, m.indexOf(core));
    const trail = m.slice(m.indexOf(core) + core.length);
    return `${lead}${PLACEHOLDERS.phone}${trail}`;
  });
  return { text, stats };
}

export function addStats(a: RedactionStats, b: RedactionStats): RedactionStats {
  return {
    email: a.email + b.email,
    phone: a.phone + b.phone,
    id_doc: a.id_doc + b.id_doc,
    dob: a.dob + b.dob,
    url: a.url + b.url,
  };
}

export function totalHits(s: RedactionStats): number {
  return s.email + s.phone + s.id_doc + s.dob + s.url;
}
