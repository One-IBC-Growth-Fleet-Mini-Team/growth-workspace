// Chỉ số nghiệm thu sandbox8 (Mi1-mkt-05, CRON-04; D-35). Tính bằng code, không do LLM.
//   sandbox_bug_open: bug còn mở khi trạng thái khác Closed và Reject (Open, Fixed chờ QA kiểm lại đều tính là mở).
//   sandbox_case_pass_rate: số test case Pass / (tổng trừ N/A); giống cột "% Pass" ở tab "Tổng hợp" của file MobCEC.
//   sandbox_ready: không còn bug Critical hoặc High đang mở. Ngưỡng TẠM, chờ Mark chốt.
export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const norm = (s: string) => s.trim().toLowerCase();
// File MobCEC ghi mức độ lẫn tiếng Anh và tiếng Việt (đo 09/11/2026: 7 bug ghi Cao, Trung bình, Thấp).
const SEVERITY_VI: Record<string, (typeof SEVERITIES)[number]> = { "nghiêm trọng": "Critical", "cao": "High", "trung bình": "Medium", "thấp": "Low" };
export function normalizeSeverity(s: string): string {
  const k = norm(s);
  return SEVERITIES.find((x) => x.toLowerCase() === k) ?? SEVERITY_VI[k] ?? s.trim();
}

export function isBugOpen(status: string): boolean {
  return !["closed", "reject", "rejected"].includes(norm(status));
}

export function casePassRate(statuses: string[]): number | null {
  const counted = statuses.filter((s) => norm(s) !== "n/a");
  return counted.length ? counted.filter((s) => norm(s) === "pass").length / counted.length : null;
}

export function sandboxReady(bugs: { severity: string; status: string }[]): boolean {
  return !bugs.some((b) => ["Critical", "High"].includes(normalizeSeverity(b.severity)) && isBugOpen(b.status));
}
