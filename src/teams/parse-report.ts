// Parser xác định (không LLM) cho tự báo RM (design doc mục 5.3, decisions.md).
// Tách dòng tiêu đề "[dd/mm] [RM] Tên" và 7 nhãn: TIẾP CẬN, ĐĂNG BÀI, HỘI THOẠI, BÁO GIÁ,
// KHÁCH NÓI, CHƯA LÊN HỆ THỐNG, CẦN HỖ TRỢ. Chịu được HTML, bullet, nhãn viết thường hoặc
// không dấu, thiếu nhãn, nhãn lặp, nhiều reply của một RM trong ngày (gộp theo thời gian).
// Không nhận ra nhãn nào thì gắn cờ unstructured và trả nguyên văn.
// Mọi văn bản đầu ra đã qua R1 (redact-regex), nên thứ gửi tiếp cho LLM không còn email, SĐT.
// Dòng tiêu đề bị bỏ (chỉ giữ dd/mm); tác giả map bằng teams_user_id, không bằng tên trong tiêu đề.
import { addStats, emptyStats, redactR1, type RedactionStats } from "../pii/redact-regex.ts";
import { fold } from "../pii/name-guard.ts";
import type { TeamsMessage } from "./graph-read.ts";

export const PARSER_VERSION = "parse-report/0.1.0";

export const SECTION_LABELS = [
  { key: "outreach", label: "TIẾP CẬN" },
  { key: "posts", label: "ĐĂNG BÀI" },
  { key: "conversations", label: "HỘI THOẠI" },
  { key: "quotes", label: "BÁO GIÁ" },
  { key: "customer_said", label: "KHÁCH NÓI" },
  { key: "not_in_crm", label: "CHƯA LÊN HỆ THỐNG" },
  { key: "needs_support", label: "CẦN HỖ TRỢ" },
] as const;

export type SectionKey = (typeof SECTION_LABELS)[number]["key"];

export type ParsedReport = {
  headerDate: string | null; // "dd/mm" lấy từ dòng tiêu đề
  sections: Partial<Record<SectionKey, string[]>>;
  unlabeled: string[]; // dòng không thuộc nhãn nào (trước nhãn đầu tiên, hoặc toàn bộ khi unstructured)
  flags: "unstructured"[];
  redactionStats: RedactionStats;
};

// Gấp từng ký tự (bỏ dấu, đ thành d, viết hoa) và giữ bản đồ vị trí về chuỗi gốc.
function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of fold(s[i]!)) {
      folded += ch;
      map.push(i);
    }
  }
  map.push(s.length);
  return { folded, map };
}

function labelRegex(label: string): RegExp {
  const words = foldWithMap(label).folded.split(/\s+/);
  return new RegExp(`^${words.join("\\s+")}(?![A-Z0-9])`);
}

const LABEL_MATCHERS = SECTION_LABELS.map((s) => ({ key: s.key, re: labelRegex(s.label) }));
const HEADER_RE = /^\[\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\]/;
const BULLET_RE = /^[\s\-*•·◦▪●+>\u2013\u2014]+/u;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|ol|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

function matchLabel(line: string): { key: SectionKey; rest: string } | null {
  const body = line.replace(BULLET_RE, "").replace(/^[*_]+/, "");
  const { folded, map } = foldWithMap(body);
  for (const { key, re } of LABEL_MATCHERS) {
    const m = re.exec(folded);
    if (!m) continue;
    const labelText = body.slice(0, map[m[0].length]);
    const after = body.slice(map[m[0].length]).replace(/^[*_]+/, "");
    // Câu tự do bắt đầu bằng từ của nhãn ("Báo giá đã gửi ...") không phải nhãn: nhãn phải có
    // dấu phân cách theo sau, đứng một mình, hoặc được viết hoa toàn bộ như mẫu.
    const hasSeparator = /^\s*([:：\-\u2013\u2014]|$)/u.test(after);
    const isUpper = labelText === labelText.toUpperCase();
    if (!hasSeparator && !isUpper) return null;
    return { key, rest: after.replace(/^[\s:：\-\u2013\u2014]+/u, "").trim() };
  }
  return null;
}

export function parseReport(content: string, contentType: "text" | "html"): ParsedReport {
  const text = contentType === "html" ? htmlToText(content) : content;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, " ").trim())
    .filter((l) => l !== "");

  let headerDate: string | null = null;
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const unlabeled: string[] = [];
  let stats = emptyStats();
  let current: SectionKey | null = null;
  let labelsFound = 0;

  const push = (raw: string) => {
    const r = redactR1(raw);
    stats = addStats(stats, r.stats);
    if (current === null) unlabeled.push(r.text);
    else (sections[current] ??= []).push(r.text);
  };

  for (const line of lines) {
    const header = HEADER_RE.exec(line);
    if (header && headerDate === null && labelsFound === 0) {
      headerDate = `${header[1]!.padStart(2, "0")}/${header[2]!.padStart(2, "0")}`;
      continue; // phần còn lại của dòng tiêu đề là tên RM, không giữ
    }
    const label = matchLabel(line);
    if (label) {
      labelsFound++;
      current = label.key;
      sections[current] ??= [];
      if (label.rest !== "") push(label.rest);
      continue;
    }
    push(line);
  }

  // Nhãn có mặt nhưng không có nội dung thì bỏ, để "thiếu nhãn" và "nhãn rỗng" giống nhau.
  for (const key of Object.keys(sections) as SectionKey[]) if (sections[key]!.length === 0) delete sections[key];

  return {
    headerDate,
    sections,
    unlabeled,
    flags: labelsFound === 0 ? ["unstructured"] : [],
    redactionStats: stats,
  };
}

function mergeReports(parts: ParsedReport[]): ParsedReport {
  const merged: ParsedReport = { headerDate: null, sections: {}, unlabeled: [], flags: [], redactionStats: emptyStats() };
  for (const p of parts) {
    merged.headerDate ??= p.headerDate;
    for (const [k, v] of Object.entries(p.sections) as [SectionKey, string[]][]) {
      (merged.sections[k] ??= []).push(...v);
    }
    merged.unlabeled.push(...p.unlabeled);
    merged.redactionStats = addStats(merged.redactionStats, p.redactionStats);
  }
  if (parts.length > 0 && parts.every((p) => p.flags.includes("unstructured"))) merged.flags = ["unstructured"];
  return merged;
}

export type AuthorReport = { authorTeamsUserId: string | null; messageIds: string[]; parsed: ParsedReport };

// Gom reply theo tác giả, sắp theo thời gian tạo, gộp các bản tự báo của cùng tác giả.
export function parseDailyReplies(replies: readonly TeamsMessage[]): AuthorReport[] {
  const byAuthor = new Map<string, TeamsMessage[]>();
  for (const m of replies) {
    const key = m.authorTeamsUserId ?? `unknown:${m.messageId}`;
    const list = byAuthor.get(key) ?? [];
    list.push(m);
    byAuthor.set(key, list);
  }
  return [...byAuthor.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      return {
        authorTeamsUserId: sorted[0]!.authorTeamsUserId,
        messageIds: sorted.map((m) => m.messageId),
        parsed: mergeReports(sorted.map((m) => parseReport(m.content, m.contentType))),
      };
    })
    .sort((a, b) => (a.authorTeamsUserId ?? "~").localeCompare(b.authorTeamsUserId ?? "~"));
}

export type RmDirectoryEntry = { rm_id: string; teams_user_id: string | null; active: number };

// Map tác giả sang rm_id chỉ bằng teams_user_id (T-PARSE-04). RM đã nghỉ không map.
export function resolveRmId(authorTeamsUserId: string | null, directory: readonly RmDirectoryEntry[]): string | null {
  if (authorTeamsUserId === null) return null;
  const hit = directory.find((d) => d.teams_user_id === authorTeamsUserId && d.active === 1);
  return hit ? hit.rm_id : null;
}
