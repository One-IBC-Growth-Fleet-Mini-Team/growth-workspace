// Nạp issue log nghiệm thu sandbox8 (D-35). Cổng "Issue log sandbox8", adapter tải file. Chỉ đọc file tải lên.
// bugs: CSV của tab "Bug"; cases: CSV của tab "Test Cases" (file test case sandbox8 do MobCEC giữ). Đọc cột theo tên.
// Allowlist: không đọc người xử lý, tester, bước tái hiện, ảnh, ghi chú.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError, parseCsv } from "./csv.ts";
import { parseWoDate } from "./wo-import.ts";

type Result = { status: "succeeded" | "failed"; bugs: number; cases: number; errorCode?: string };
const cut = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function table(text: string, required: string[]): { rows: string[][]; col: (name: string) => number } | null {
  const csv = parseCsv(text);
  const all = [csv.header, ...csv.rows];
  const h = all.findIndex((r) => required.every((name) => r.some((c) => c.trim() === name)));
  if (h < 0) return null;
  const header = all[h]!.map((c) => c.trim());
  return { rows: all.slice(h + 1), col: (name) => header.indexOf(name) };
}

export function importSandboxLog(db: Database, files: { bugs?: string; cases?: string }, opts: { now: Date; actor: string }): Result {
  const fail = (code: string): Result => ({ status: "failed", bugs: 0, cases: 0, errorCode: code });
  if (!files.bugs && !files.cases) return fail("SANDBOX_FILE_REQUIRED");
  try {
    const b = files.bugs ? table(files.bugs, ["Bug ID", "Mức độ", "Trạng thái"]) : null;
    if (files.bugs && !b) return fail("SANDBOX_BUG_HEADER_NOT_FOUND");
    const c = files.cases ? table(files.cases, ["Mã TC", "Status"]) : null;
    if (files.cases && !c) return fail("SANDBOX_CASE_HEADER_NOT_FOUND");
    const id = Bun.randomUUIDv7();
    let nb = 0;
    let nc = 0;
    db.transaction(() => {
      db.run("INSERT INTO sandbox_imports (id, actor, imported_at) VALUES (?, ?, ?)", [id, opts.actor, opts.now.toISOString()]);
      if (b) {
        const [bid, sev, crit, st, title, url, found] = ["Bug ID", "Mức độ", "Tiêu chí", "Trạng thái", "Tiêu đề lỗi", "Vị trí / URL", "Ngày phát hiện"].map(b.col);
        const q = db.prepare("INSERT OR IGNORE INTO sandbox_bugs (import_id, bug_id, severity, criterion, status, title, url, found_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        for (const r of b.rows) {
          const key = cut(r[bid!], 32);
          if (!key || !cut(r[sev!], 20) || !cut(r[st!], 20)) continue;
          if (q.run(id, key, cut(r[sev!], 20), cut(r[crit!], 60) || null, cut(r[st!], 20), cut(r[title!], 200) || null, cut(r[url!], 300) || null, parseWoDate(r[found!], "dd/mm/yyyy")).changes) nb++;
        }
      }
      if (c) {
        const [tc, crit, st] = ["Mã TC", "Tiêu chí", "Status"].map(c.col);
        const q = db.prepare("INSERT OR IGNORE INTO sandbox_cases (import_id, case_id, criterion, status) VALUES (?, ?, ?, ?)");
        for (const r of c.rows) {
          const key = cut(r[tc!], 32);
          if (key && cut(r[st!], 20) && q.run(id, key, cut(r[crit!], 60) || null, cut(r[st!], 20)).changes) nc++;
        }
      }
    })();
    log({ event: "sandbox_import.succeeded", run_id: id, count: nb + nc });
    return { status: "succeeded", bugs: nb, cases: nc };
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "SANDBOX_IMPORT_FAILED";
    log({ event: "sandbox_import.failed", error_code: code });
    return fail(code);
  }
}

export function sandboxImportMessage(r: Result): string {
  if (r.status === "succeeded") return `Đã nạp issue log sandbox8: ${r.bugs} bug, ${r.cases} test case.`;
  const why: Record<string, string> = {
    SANDBOX_BUG_HEADER_NOT_FOUND: "File bug thiếu cột Bug ID, Mức độ hoặc Trạng thái. Hãy tải CSV của tab Bug.",
    SANDBOX_CASE_HEADER_NOT_FOUND: "File test case thiếu cột Mã TC hoặc Status. Hãy tải CSV của tab Test Cases.",
    CSV_INVALID: "File không đúng dạng CSV.",
  };
  return `Chưa nạp issue log. ${why[r.errorCode ?? ""] ?? "Không nạp được file."} Dữ liệu cũ vẫn giữ nguyên.`;
}
