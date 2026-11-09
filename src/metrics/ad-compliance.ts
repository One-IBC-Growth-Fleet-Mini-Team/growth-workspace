// Cổng tuân thủ nội dung quảng cáo trước khi đăng (spec mục 7, tầng 1A; D-38). Kiểm bằng code, $0 token, không do LLM.
//   ad_copy_verdict: fail nếu có từ cấm hoặc vượt giới hạn độ dài; review nếu có từ cần người duyệt; còn lại pass.
//   So từ không phân biệt hoa thường, theo nguyên từ hoặc nguyên cụm; tên thương hiệu trong brandAllow bị loại trước khi so.
// Đây chỉ là cổng trước: đăng công khai vẫn luôn cần người duyệt (CLAUDE.md quy tắc 4).
import type { AdRules } from "../config.ts";

export type AdCopy = { primaryText: string; headline: string; description: string };
export type AdIssue = { code: string; field: string; detail: string };
export type Verdict = "pass" | "review" | "hold" | "fail";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, phrase: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(phrase).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);

export function firstSentence(text: string): string {
  const t = text.trim();
  const m = /^.*?[.!?](?=\s|$)/su.exec(t);
  return (m ? m[0] : t).trim();
}

export function checkAdCopy(copy: AdCopy, r: AdRules): { verdict: Verdict; issues: AdIssue[] } {
  const issues: AdIssue[] = [];
  for (const field of ["primaryText", "headline", "description"] as const) {
    let text = copy[field] ?? "";
    for (const b of r.brandAllow) text = text.replace(new RegExp(escape(b), "giu"), " ");
    for (const w of r.banned) if (has(text, w)) issues.push({ code: "BANNED_WORD", field, detail: w });
    for (const w of r.review) if (has(text, w)) issues.push({ code: "REVIEW_WORD", field, detail: w });
  }
  const len = (s: string) => [...s].length;
  const opening = len(firstSentence(copy.primaryText ?? ""));
  if (opening > r.maxOpening) issues.push({ code: "TOO_LONG_OPENING", field: "primaryText", detail: `${opening}/${r.maxOpening}` });
  if (len(copy.headline ?? "") > r.maxHeadline) issues.push({ code: "TOO_LONG_HEADLINE", field: "headline", detail: `${len(copy.headline)}/${r.maxHeadline}` });
  if (len(copy.description ?? "") > r.maxDescription) issues.push({ code: "TOO_LONG_DESCRIPTION", field: "description", detail: `${len(copy.description)}/${r.maxDescription}` });
  const verdict: Verdict = issues.some((i) => i.code !== "REVIEW_WORD") ? "fail" : issues.length ? "review" : "pass";
  return { verdict, issues };
}
