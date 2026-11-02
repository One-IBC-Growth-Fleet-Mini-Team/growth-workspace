// Nạp file Work Order của Bank Team cho BK-08 (D-25). Chỉ đọc file Amy tải lên, không gọi CRM.
// Hai file, có file nào nạp file đó:
//   WorkOrder: danh sách WO xuất từ CRM (số WO, Status, ngày tạo, tên sản phẩm);
//   WorkOrderPic: file ghép số WO với người phụ trách (PIC), Amy chép từ sheet theo dõi của Bank Team.
// Allowlist: cột khác (tên Account, tên khách, ghi chú) không bao giờ được đọc. Nội dung file chỉ sống trong bộ nhớ.
import type { Database } from "bun:sqlite";
import { log } from "../log.ts";
import { CsvError } from "./csv.ts";
import { readCsvRows, type ColumnMap, type ColumnSpec, type DateFormat, type Detail } from "./csv-import.ts";

// Bảng ghép mặc định: tên cột của báo cáo Work Order chuẩn trên CRM và cột "PIC Mới" trong sheet của Bank Team.
export const DEFAULT_WO_COLUMNS: Required<Pick<ColumnMap, "WorkOrder" | "WorkOrderPic">> = {
  WorkOrder: {
    WorkOrderNumber: "Work Order Number",
    Status: "Status",
    CreatedDate: { column: "Created Date", format: "dd/mm/yyyy" },
    ProductName: "Product: Product Name",
  },
  WorkOrderPic: { WorkOrderNumber: "Work Order Number", Pic: "PIC Mới" },
};

const MAX_STATUS = 40;
const MAX_PRODUCT = 200;
const MAX_PIC = 60;

export type WoImportResult = {
  importId: string | null;
  status: "succeeded" | "failed";
  workOrders: number;
  pics: number;
  skipped: number; // dòng thiếu số WO hoặc Status, hoặc trùng số WO trong file
  badDates: number; // ô ngày tạo không đọc được, lưu thành trống
  errorCode?: string;
  detail?: string; // tên file, tên cột, số dòng; không bao giờ có giá trị ô
};

// Số WO: file xuất từ CRM giữ số 0 ở đầu ("00003941"), Excel hay bỏ ("3941", "3941.0"). Chuẩn về 8 chữ số.
export function normalizeWoNumber(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const m = /^0*(\d+)(?:\.0+)?$/.exec(s);
  if (m) return m[1]!.padStart(8, "0");
  if (s.length > 32) throw new CsvValueErrorWo();
  return s;
}

class CsvValueErrorWo extends Error {}

// Ngày tạo: nhận YYYY-MM-DD (có thể kèm giờ) hoặc dạng có dấu "/" theo format; sai thì trả null, không làm hỏng lượt nạp.
export function parseWoDate(v: unknown, format: DateFormat | undefined): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(s);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const [dd, mm] = format?.startsWith("mm") ? [b, a] : [a, b];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function plain(spec: Record<string, ColumnSpec>): { cols: Record<string, string>; formats: Record<string, DateFormat | undefined> } {
  const cols: Record<string, string> = {};
  const formats: Record<string, DateFormat | undefined> = {};
  for (const [field, s] of Object.entries(spec)) {
    cols[field] = typeof s === "string" ? s : s.column;
    formats[field] = typeof s === "string" ? undefined : s.format;
  }
  return { cols, formats };
}

function cut(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
}

export function importWorkOrders(
  db: Database,
  files: { WorkOrder?: string; WorkOrderPic?: string },
  opts: { columns: ColumnMap; now: Date; actor: string },
): WoImportResult {
  const empty = { workOrders: 0, pics: 0, skipped: 0, badDates: 0 };
  if (!files.WorkOrder && !files.WorkOrderPic) return { importId: null, status: "failed", ...empty, errorCode: "WO_FILE_REQUIRED" };
  const at = opts.now.toISOString();
  const counts = { ...empty };
  try {
    const wo: { n: string; status: string; created: string | null; product: string | null }[] = [];
    if (files.WorkOrder) {
      const { cols, formats } = plain(opts.columns.WorkOrder ?? DEFAULT_WO_COLUMNS.WorkOrder);
      const seen = new Set<string>();
      readCsvRows("WorkOrder", files.WorkOrder, cols, ["WorkOrderNumber", "Status"]).forEach((raw, i) => {
        let n: string | null;
        try {
          n = normalizeWoNumber(raw.WorkOrderNumber);
        } catch {
          throw { code: "CSV_BAD_VALUE", detail: `WorkOrder dòng ${i + 2}: ${cols.WorkOrderNumber}` } satisfies Detail;
        }
        const status = cut(raw.Status, MAX_STATUS);
        if (!n || !status || seen.has(n)) { counts.skipped++; return; }
        seen.add(n);
        const created = parseWoDate(raw.CreatedDate, formats.CreatedDate);
        if (created === null && String(raw.CreatedDate ?? "").trim() !== "") counts.badDates++;
        wo.push({ n, status, created, product: cut(raw.ProductName, MAX_PRODUCT) });
      });
    }
    const pics: { n: string; pic: string }[] = [];
    if (files.WorkOrderPic) {
      const { cols } = plain(opts.columns.WorkOrderPic ?? DEFAULT_WO_COLUMNS.WorkOrderPic);
      const seen = new Set<string>();
      readCsvRows("WorkOrderPic", files.WorkOrderPic, cols, ["WorkOrderNumber", "Pic"]).forEach((raw, i) => {
        let n: string | null;
        try {
          n = normalizeWoNumber(raw.WorkOrderNumber);
        } catch {
          throw { code: "CSV_BAD_VALUE", detail: `WorkOrderPic dòng ${i + 2}: ${cols.WorkOrderNumber}` } satisfies Detail;
        }
        const pic = cut(raw.Pic, MAX_PIC);
        if (!n || !pic || seen.has(n)) { counts.skipped++; return; }
        seen.add(n);
        pics.push({ n, pic });
      });
    }
    const importId = Bun.randomUUIDv7();
    db.transaction(() => {
      db.run("INSERT INTO wo_imports (id, actor, imported_at, has_work_orders, has_pics) VALUES (?, ?, ?, ?, ?)", [
        importId, opts.actor, at, files.WorkOrder ? 1 : 0, files.WorkOrderPic ? 1 : 0,
      ]);
      const r = db.prepare("INSERT INTO wo_rows (import_id, work_order_number, status, created_date, product_name) VALUES (?, ?, ?, ?, ?)");
      for (const w of wo) r.run(importId, w.n, w.status, w.created, w.product);
      const p = db.prepare("INSERT INTO wo_pics (import_id, work_order_number, pic) VALUES (?, ?, ?)");
      for (const x of pics) p.run(importId, x.n, x.pic);
    })();
    counts.workOrders = wo.length;
    counts.pics = pics.length;
    log({ event: "wo_import.succeeded", run_id: importId, count: wo.length });
    return { importId, status: "succeeded", ...counts };
  } catch (e) {
    const d: Detail =
      e instanceof CsvError ? { code: e.code, detail: "" }
      : typeof e === "object" && e !== null && "code" in e ? (e as Detail)
      : { code: "CSV_IMPORT_FAILED", detail: "" };
    log({ event: "wo_import.failed", error_code: d.code });
    return { importId: null, status: "failed", ...empty, errorCode: d.code, detail: d.detail };
  }
}

// Câu báo cho Amy; chỉ có số đếm, tên cột, số dòng.
export function woImportMessage(r: WoImportResult): string {
  if (r.status === "succeeded") {
    const extra = [
      r.skipped ? `bỏ qua ${r.skipped} dòng thiếu số WO, thiếu Status hoặc trùng số WO` : "",
      r.badDates ? `${r.badDates} ô ngày tạo không đọc được` : "",
    ].filter(Boolean);
    return `Đã nạp ${r.workOrders} Work Order, ${r.pics} dòng PIC${extra.length ? ` (${extra.join("; ")})` : ""}.`;
  }
  const why: Record<string, string> = {
    WO_FILE_REQUIRED: "Cần có file Work Order hoặc file PIC.",
    CSV_MISSING_COLUMN: "File thiếu cột cần thiết",
    CSV_BAD_VALUE: "Có ô không đọc được",
    CSV_INVALID: "File không đúng dạng CSV.",
  };
  const base = why[r.errorCode ?? ""] ?? "Không nạp được file.";
  return `Chưa nạp Work Order. ${base}${r.detail ? `: ${r.detail}` : ""}. Dữ liệu cũ vẫn giữ nguyên.`;
}
