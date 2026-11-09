// Nạp file sự kiện cho Mi1-data-01 (D-36). Cổng "Sự kiện web và CRM", adapter tải file. Chỉ đọc file tải lên.
// CSV có dòng tiêu đề là tên trường ở Phụ lục A1, A2 (event_name, event_time, session_id, ...).
// Chỉ lưu những gì cần đếm; email lọt vào file chỉ được đếm, không lưu (A1, A6.4).
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CHAIN_IDS } from "../metrics/id-chain.ts";
import { missingFields } from "../metrics/id-coverage.ts";
import { vnDate } from "../time.ts";
import { CsvError, parseCsv } from "./csv.ts";

const FORBIDDEN = /^(e-?mail|phone|phone_number|mobile|name|full_name|first_name|last_name|passport|passport_number|dob|date_of_birth)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

type Result = { status: "succeeded" | "failed"; events: number; errorCode?: string };

export function importEvents(db: Database, text: string, opts: { now: Date; actor: string }): Result {
  try {
    const csv = parseCsv(text);
    const header = csv.header.map((h) => h.trim());
    if (!header.includes("event_name")) return { status: "failed", events: 0, errorCode: "EVENT_HEADER_NOT_FOUND" };
    const forbidden = header.filter((h) => FORBIDDEN.test(h));
    let emailCells = 0;
    const id = Bun.randomUUIDv7();
    let n = 0;
    db.transaction(() => {
      const rows = csv.rows.filter((r) => r.some((c) => c.trim()));
      for (const r of rows) for (const c of r) if (EMAIL.test(c)) emailCells++;
      db.run("INSERT INTO data_event_imports (id, actor, imported_at, email_cells, forbidden_columns) VALUES (?, ?, ?, ?, ?)", [id, opts.actor, opts.now.toISOString(), emailCells, forbidden.join(",") || null]);
      const q = db.prepare("INSERT INTO data_events (import_id, row_no, event_key, event_name, event_date, session_id, linked, missing, known) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const qc = db.prepare("INSERT INTO data_event_chain (import_id, row_no, ids) VALUES (?, ?, ?)");
      rows.forEach((r, i) => {
        const row = Object.fromEntries(header.map((h, k) => [h, (r[k] ?? "").trim()]));
        const name = (row.event_name ?? "").slice(0, 64);
        if (!name) return;
        const t = new Date(row.event_time ?? "");
        const miss = missingFields(name, row);
        q.run(id, i + 2, (row.event_id || `${id}:${i + 2}`).slice(0, 128), name, Number.isNaN(t.getTime()) ? null : vnDate(t), (row.session_id ?? "").slice(0, 128) || null,
          name === "contact_captured" && row.contact_id ? 1 : 0, miss && miss.length ? miss.join(",") : null, miss ? 1 : 0);
        qc.run(id, i + 2, CHAIN_IDS.filter((f) => row[f]).join(","));
        n++;
      });
    })();
    log({ event: "event_import.succeeded", run_id: id, count: n });
    return { status: "succeeded", events: n };
  } catch (e) {
    const code = e instanceof CsvError ? e.code : "EVENT_IMPORT_FAILED";
    log({ event: "event_import.failed", error_code: code });
    return { status: "failed", events: 0, errorCode: code };
  }
}

export function eventImportMessage(r: Result): string {
  if (r.status === "succeeded") return `Đã nạp ${r.events} sự kiện.`;
  const why: Record<string, string> = { EVENT_HEADER_NOT_FOUND: "File thiếu cột event_name (tên trường theo Phụ lục A).", CSV_INVALID: "File không đúng dạng CSV." };
  return `Chưa nạp. ${why[r.errorCode ?? ""] ?? "Không nạp được file."} Dữ liệu cũ vẫn giữ nguyên.`;
}
