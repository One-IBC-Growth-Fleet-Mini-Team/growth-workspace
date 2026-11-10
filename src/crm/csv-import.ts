// Nạp file CSV xuất từ trang quản trị CRM thay cho API khi MobCEC chưa mở (D-24). Chỉ đọc: không gọi CRM.
// Bảng ghép (ColumnMap) cho biết mỗi trường của bộ ánh xạ (Id, StageName, ...) nằm ở cột nào trong file.
// Bảng ghép thật giữ NGOÀI repo (/etc/growth/crm-columns.json) vì tên cột CRM là schema nội bộ (C8);
// trong repo chỉ có bảng mặc định dùng đúng tên trường của bộ ánh xạ và file mẫu deploy/crm-columns.example.json.
// Mỗi dòng được dựng thành bản ghi thô chỉ gồm trường có trong bảng ghép, rồi đi qua đúng các hàm map
// của ETL (allowlist, băm email và SĐT ngay trong hàm). Nội dung file chỉ sống trong bộ nhớ.
import type { Database } from "bun:sqlite";
import { insertEtlRun, insertEtlRunStatus, insertSnapshotSucceeded, type CrmSnapshot, type SnapshotRowCounts } from "../db/crm-snapshot.ts";
import { log } from "../log.ts";
import type { PiiHasher } from "../pii/hash.ts";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { CsvError, parseCsv } from "./csv.ts";
import { CrmMappingError, mapClient, mapLead, mapOpportunity, mapOrderItem } from "./mappers.ts";

export const CSV_RESOURCES = ["Opportunity", "Client", "Lead", "OrderItem"] as const;
export type CsvResource = (typeof CSV_RESOURCES)[number];

export type DateFormat = "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" | "dd/mm/yyyy hh:mm" | "iso";
export type ColumnSpec = string | { column: string; format?: DateFormat };
// WorkOrder, WorkOrderPic: file của Bank Team cho BK-08 (D-25), đọc ở wo-import.ts.
export const WO_RESOURCES = ["WorkOrder", "WorkOrderPic"] as const;
export type WoResource = (typeof WO_RESOURCES)[number];
// SalesOrder, PurchaseOrder, Invoice: file đối soát đơn hàng (D-30), đọc ở billing-import.ts.
export const BILLING_RESOURCES = ["SalesOrder", "PurchaseOrder", "Invoice"] as const;
// Partner, Referral: file đối tác cho Mi1-ptn-01 (D-31), đọc ở partner-import.ts.
export const PARTNER_RESOURCES = ["Partner", "Referral"] as const;
export type ColumnMap = Partial<Record<CsvResource | WoResource | (typeof BILLING_RESOURCES)[number] | (typeof PARTNER_RESOURCES)[number], Record<string, ColumnSpec>>>;

// Trường bắt buộc của từng resource (khớp reqString trong mappers.ts).
const REQUIRED: Record<CsvResource, string[]> = {
  Opportunity: ["Id", "StageName"],
  Client: ["Id"],
  Lead: ["Id"],
  OrderItem: ["Order.AccountId", "Product2.Family"],
};

// Bảng ghép mặc định: tên cột trùng tên trường của bộ ánh xạ.
export const DEFAULT_COLUMN_MAP: ColumnMap = {
  Opportunity: Object.fromEntries(
    ["Id", "AccountId", "OwnerId", "StageName", "CloseDate", "LastModifiedDate", "NextStep", "Jurisdiction__c", "Service_Family__c", "Industry__c", "Rejection_Reason_Code__c"].map((f) => [f, f]),
  ),
  Client: Object.fromEntries(["Id", "Is_Reseller_End_Client__c", "Industry__c", "First_Won_Date__c"].map((f) => [f, f])),
  Lead: Object.fromEntries(["Id", "OwnerId", "CreatedDate", "Status", "Email", "Phone"].map((f) => [f, f])),
  OrderItem: { "Order.AccountId": "Order.AccountId", "Product2.Family": "Product2.Family" },
};

// Giờ trong file CRM không kèm múi giờ được hiểu là giờ Việt Nam (A-07).
const VN_OFFSET = "+07:00";
const TRUE = new Set(["true", "1", "yes", "y", "có", "co", "x"]);
const FALSE = new Set(["false", "0", "no", "n", "không", "khong"]);

class CsvValueError extends Error {}

function convert(value: string, field: string, format: DateFormat | undefined): unknown {
  const v = value.trim();
  if (v === "") return null;
  if (field === "Is_Reseller_End_Client__c") {
    const l = v.toLowerCase();
    if (TRUE.has(l)) return true;
    if (FALSE.has(l)) return false;
    throw new CsvValueError();
  }
  if (!format || format === "yyyy-mm-dd" || format === "iso") return v;
  // Excel hay xuất d/m/yy hoặc d/m/yyyy (D-78); năm 2 chữ số hiểu là 20yy.
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(v);
  if (!m) throw new CsvValueError();
  const [a, b] = [m[1]!.padStart(2, "0"), m[2]!.padStart(2, "0")];
  const [dd, mm] = format.startsWith("dd") ? [a, b] : [b, a];
  if (Number(mm) > 12 || Number(dd) > 31) throw new CsvValueError();
  const date = `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${mm}-${dd}`;
  if (format === "dd/mm/yyyy hh:mm") return `${date}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00${VN_OFFSET}`;
  return date;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = value;
}

export type Detail = { code: string; detail: string };

// Dựng bản ghi thô từ CSV theo bảng ghép; chỉ cột có trong bảng ghép được đọc.
// Thiếu cột bắt buộc ném CSV_MISSING_COLUMN; ô không đổi được ném CSV_BAD_VALUE (chỉ kèm tên cột, số dòng).
export type SkippedRow = { resource: string; row: number; column: string };

// Như readCsvRows nhưng ô không đổi được thì bỏ riêng dòng đó và ghi lại (tên cột, số dòng), không dừng cả file (D-78).
export function readCsvRowsLenient(resource: string, text: string, spec: Record<string, ColumnSpec>, required: string[]): { rows: { raw: Record<string, unknown>; row: number }[]; skipped: SkippedRow[] } {
  const csv = parseCsv(text);
  const cols = Object.entries(spec).map(([field, s]) => {
    const column = typeof s === "string" ? s : s.column;
    return { field, column, format: typeof s === "string" ? undefined : s.format, index: csv.header.indexOf(column) };
  });
  for (const req of required) {
    const c = cols.find((x) => x.field === req);
    if (!c || c.index < 0) throw { code: "CSV_MISSING_COLUMN", detail: `${resource}: ${c?.column ?? req}` } satisfies Detail;
  }
  const rows: { raw: Record<string, unknown>; row: number }[] = [];
  const skipped: SkippedRow[] = [];
  csv.rows.forEach((cells, i) => {
    const raw: Record<string, unknown> = {};
    for (const c of cols) {
      if (c.index < 0) continue;
      try {
        setPath(raw, c.field, convert(cells[c.index] ?? "", c.field, c.format));
      } catch {
        skipped.push({ resource, row: csv.rowNo[i]!, column: c.column });
        return;
      }
    }
    rows.push({ raw, row: csv.rowNo[i]! });
  });
  return { rows, skipped };
}

// Thiếu cột bắt buộc ném CSV_MISSING_COLUMN; ô không đổi được ném CSV_BAD_VALUE (chỉ kèm tên cột, số dòng).
export function readCsvRows(resource: string, text: string, spec: Record<string, ColumnSpec>, required: string[]): Record<string, unknown>[] {
  const r = readCsvRowsLenient(resource, text, spec, required);
  const bad = r.skipped[0];
  if (bad) throw { code: "CSV_BAD_VALUE", detail: `${resource} dòng ${bad.row}: ${bad.column}` } satisfies Detail;
  return r.rows.map((x) => x.raw);
}

export type CsvImportResult = {
  etlRunId: string | null;
  status: "succeeded" | "failed";
  rowCounts: Partial<SnapshotRowCounts>;
  errorCode?: string;
  detail?: string; // tên resource, số dòng, tên cột; không bao giờ có giá trị ô
  skipped?: SkippedRow[]; // dòng bị bỏ vì ô sai hoặc thiếu (D-78)
};

export function importCrmCsv(
  db: Database,
  files: Partial<Record<CsvResource, string>>,
  opts: { hasher: PiiHasher; columns: ColumnMap; now: Date },
): CsvImportResult {
  if (!files.Opportunity) return { etlRunId: null, status: "failed", rowCounts: {}, errorCode: "CSV_OPPORTUNITY_REQUIRED" };
  const etlRunId = Bun.randomUUIDv7();
  const at = opts.now.toISOString();
  insertEtlRun(db, etlRunId, "crm_csv", at);
  const snap: CrmSnapshot = { opportunities: [], clients: [], leads: [], clientServices: [] };
  const seen = new Set<string>();
  const skipped: SkippedRow[] = [];
  const once = <T>(list: T[], key: string, row: T) => {
    if (seen.has(key)) return;
    seen.add(key);
    list.push(row);
  };
  try {
    for (const resource of CSV_RESOURCES) {
      const text = files[resource];
      if (!text) continue;
      const spec = opts.columns[resource] ?? DEFAULT_COLUMN_MAP[resource]!;
      const read = readCsvRowsLenient(resource, text, spec, REQUIRED[resource]);
      skipped.push(...read.skipped);
      for (const { raw, row } of read.rows) {
        try {
          if (resource === "Opportunity") { const r = mapOpportunity(raw); once(snap.opportunities, `o\u0000${r.opportunity_id}`, r); }
          else if (resource === "Client") { const r = mapClient(raw); once(snap.clients, `c\u0000${r.client_id}`, r); }
          else if (resource === "Lead") { const r = mapLead(raw, opts.hasher); once(snap.leads, `l\u0000${r.lead_id}`, r); }
          else { const r = mapOrderItem(raw); once(snap.clientServices, `s\u0000${r.client_id}\u0000${r.product_family}`, r); }
        } catch (e) {
          if (!(e instanceof CrmMappingError)) throw e;
          const sp = spec[e.field];
          skipped.push({ resource, row, column: sp ? (typeof sp === "string" ? sp : sp.column) : e.field });
        }
      }
    }
    // Không còn dòng Opportunity nào tốt thì không ghi snapshot rỗng (sẽ xoá dữ liệu NBA): báo lỗi dòng đầu tiên.
    const firstBad = skipped.find((x) => x.resource === "Opportunity");
    if (snap.opportunities.length === 0 && firstBad) throw { code: "CSV_BAD_VALUE", detail: `Opportunity dòng ${firstBad.row}: ${firstBad.column}` } satisfies Detail;
    const rowCounts = insertSnapshotSucceeded(db, etlRunId, snap, at);
    log({ event: "csv_import.succeeded", run_id: etlRunId, count: rowCounts.opportunity });
    return { etlRunId, status: "succeeded", rowCounts, skipped };
  } catch (e) {
    const d: Detail =
      e instanceof CsvError ? { code: e.code, detail: "" }
      : e instanceof CrmMappingError ? { code: e.code, detail: e.field }
      : typeof e === "object" && e !== null && "code" in e ? (e as Detail)
      : { code: "CSV_IMPORT_FAILED", detail: "" };
    insertEtlRunStatus(db, etlRunId, "failed", at, {}, d.code);
    log({ event: "csv_import.failed", run_id: etlRunId, error_code: d.code });
    return { etlRunId, status: "failed", rowCounts: {}, errorCode: d.code, detail: d.detail };
  }
}

const SpecSchema = z.union([
  z.string().min(1),
  z.strictObject({ column: z.string().min(1), format: z.enum(["yyyy-mm-dd", "dd/mm/yyyy", "mm/dd/yyyy", "dd/mm/yyyy hh:mm", "iso"]).optional() }),
]);
const ColumnMapSchema = z.strictObject(
  Object.fromEntries([...CSV_RESOURCES, ...WO_RESOURCES, ...BILLING_RESOURCES, ...PARTNER_RESOURCES].map((r) => [r, z.record(z.string(), SpecSchema).optional()])) as Record<string, z.ZodOptional<z.ZodRecord<z.ZodString, typeof SpecSchema>>>,
);

// Đọc bảng ghép từ file; không có file thì dùng bảng mặc định. Sai dạng thì ném lỗi khi khởi động.
export function loadColumnMap(path: string): ColumnMap {
  if (!existsSync(path)) return DEFAULT_COLUMN_MAP;
  return ColumnMapSchema.parse(JSON.parse(readFileSync(path, "utf8"))) as ColumnMap;
}

// Câu báo cho Amy theo kết quả nạp; chỉ có tên cột, số dòng, không có giá trị ô.
export function importMessage(r: CsvImportResult): string {
  if (r.status === "succeeded") {
    const c = r.rowCounts;
    const sk = r.skipped ?? [];
    const skipText = sk.length ? ` Bỏ qua ${sk.length} dòng: ${sk.slice(0, 5).map((x) => `${x.resource} dòng ${x.row} cột ${x.column}`).join("; ")}${sk.length > 5 ? "; ..." : ""}.` : "";
    return `Đã nạp ${c.opportunity ?? 0} Opportunity, ${c.client ?? 0} Client, ${c.lead ?? 0} Lead, ${c.client_service ?? 0} dịch vụ đã mua.${skipText}`;
  }
  const why: Record<string, string> = {
    CSV_OPPORTUNITY_REQUIRED: "Cần có file Opportunity.",
    CSV_MISSING_COLUMN: "File thiếu cột cần thiết",
    CSV_BAD_VALUE: "Có ô không đọc được (thường là ngày sai định dạng)",
    CSV_INVALID: "File không đúng dạng CSV.",
    CRM_MAP_INVALID: "Có ô thiếu hoặc sai kiểu",
  };
  const base = why[r.errorCode ?? ""] ?? "Không nạp được file.";
  return `Chưa nạp. ${base}${r.detail ? `: ${r.detail}` : ""}. Dữ liệu CRM cũ vẫn giữ nguyên.`;
}
