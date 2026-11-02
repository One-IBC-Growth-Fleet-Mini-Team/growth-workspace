// Logger chỉ nhận trường khai báo trước (design doc mục 7.4). Không có API ghi chuỗi tuỳ ý.
// Mỗi trường có định dạng chặt: event và error_code là mã máy, run_id là mã, count là số nguyên.
// Trường lạ hoặc sai định dạng bị thay bằng dấu hiệu "invalid", không bao giờ ghi giá trị gốc.

export type LogRecord = {
  event: string; // ví dụ "etl.succeeded"
  run_id?: string;
  count?: number;
  error_code?: string; // ví dụ "CRM_AUTH"
};

export type LogSink = (line: string) => void;

const EVENT_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const ALLOWED_KEYS = new Set(["event", "run_id", "count", "error_code"]);

let sink: LogSink = (line) => process.stderr.write(`${line}\n`);

export function setLogSink(next: LogSink): LogSink {
  const prev = sink;
  sink = next;
  return prev;
}

export function formatLogRecord(record: LogRecord, now: Date = new Date()): string {
  const input = record as Record<string, unknown>;
  const out: Record<string, string | number> = { ts: now.toISOString() };
  out.event = typeof input.event === "string" && EVENT_RE.test(input.event) ? input.event : "invalid";
  if (input.run_id !== undefined) {
    out.run_id = typeof input.run_id === "string" && RUN_ID_RE.test(input.run_id) ? input.run_id : "invalid";
  }
  if (input.count !== undefined) {
    out.count = Number.isSafeInteger(input.count) ? (input.count as number) : -1;
  }
  if (input.error_code !== undefined) {
    out.error_code =
      typeof input.error_code === "string" && ERROR_CODE_RE.test(input.error_code) ? input.error_code : "INVALID";
  }
  const unknownKeys = Object.keys(input).filter((k) => !ALLOWED_KEYS.has(k)).length;
  if (unknownKeys > 0) out.dropped_fields = unknownKeys;
  return JSON.stringify(out);
}

export function log(record: LogRecord): void {
  sink(formatLogRecord(record));
}
