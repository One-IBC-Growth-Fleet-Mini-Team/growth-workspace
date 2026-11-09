// Bảng nghiệm thu sandbox8 (Mi1-mkt-05, CRON-04; D-35): đọc lượt nạp mới nhất của từng tab, chỉ đọc.
import type { Database } from "bun:sqlite";
import { casePassRate, isBugOpen, normalizeSeverity, sandboxReady, SEVERITIES } from "../metrics/sandbox-qa.ts";

export type SandboxBug = { bugId: string; severity: string; criterion: string | null; status: string; title: string | null; url: string | null; foundDate: string | null };
export type SandboxBoard = {
  importedAt: string | null;
  ready: boolean | null; // null khi chưa nạp tab Bug
  bySeverity: { severity: string; total: number; open: number }[];
  open: SandboxBug[]; // nặng trước, rồi theo mã
  cases: { total: number; pass: number; fail: number; blocked: number; passRate: number | null } | null;
};

function latest(db: Database, table: string): { id: string; at: string } | null {
  return db.query(`SELECT i.id, i.imported_at AS at FROM sandbox_imports i WHERE EXISTS (SELECT 1 FROM ${table} t WHERE t.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1`).get() as { id: string; at: string } | null;
}

export function buildSandboxBoard(db: Database): SandboxBoard {
  const bi = latest(db, "sandbox_bugs");
  const ci = latest(db, "sandbox_cases");
  const sev = normalizeSeverity;
  const bugs = (bi ? (db.query("SELECT bug_id AS bugId, severity, criterion, status, title, url, found_date AS foundDate FROM sandbox_bugs WHERE import_id = ? ORDER BY bug_id").all(bi.id) as SandboxBug[]) : []).map((b) => ({ ...b, severity: sev(b.severity) }));
  const rank = (s: string) => {
    const i = (SEVERITIES as readonly string[]).indexOf(sev(s));
    return i < 0 ? SEVERITIES.length : i;
  };
  const statuses = ci ? (db.query("SELECT status FROM sandbox_cases WHERE import_id = ?").all(ci.id) as { status: string }[]).map((r) => r.status.trim().toLowerCase()) : null;
  const n = (k: string) => statuses?.filter((s) => s === k).length ?? 0;
  return {
    importedAt: [bi?.at, ci?.at].filter(Boolean).sort().pop() ?? null,
    ready: bi ? sandboxReady(bugs) : null,
    bySeverity: SEVERITIES.map((s) => ({ severity: s, total: bugs.filter((b) => sev(b.severity) === s).length, open: bugs.filter((b) => sev(b.severity) === s && isBugOpen(b.status)).length })),
    open: bugs.filter((b) => isBugOpen(b.status)).sort((a, b) => rank(a.severity) - rank(b.severity) || a.bugId.localeCompare(b.bugId)),
    cases: statuses ? { total: statuses.length, pass: n("pass"), fail: n("fail"), blocked: n("blocked"), passRate: casePassRate(statuses) } : null,
  };
}
