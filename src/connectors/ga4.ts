// Adapter GA4 (D-96): Google Analytics Data API, chỉ đọc số liệu. Chỉ gọi properties/{id}:runReport (báo cáo, không ghi).
// Đếm eventCount theo eventName trong khoảng ngày; phân trang offset/limit tới hết rowCount. Token OAuth làm mới khi
// 401; 429 RESOURCE_EXHAUSTED (hết quota) thì chờ rồi thử lại. Không lấy tham số người dùng nào (Phụ lục A6.4).
import { readJson, type ReadOptions, type TokenSource } from "./read-http.ts";

export function ga4Options(token: TokenSource, extra: Partial<ReadOptions> = {}): ReadOptions {
  return { connector: "ga4", hosts: ["analyticsdata.googleapis.com"], readPost: [/\/properties\/\d+:runReport$/], token,
    isRateLimited: (s, b) => s === 429 || (b as { error?: { status?: string } } | null)?.error?.status === "RESOURCE_EXHAUSTED", ...extra };
}

export async function readGa4EventCounts(propertyId: string, since: string, until: string, o: ReadOptions, limit = 1000): Promise<Record<string, number>> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId.replace(/^properties\//, "")}:runReport`;
  const out: Record<string, number> = {};
  for (let offset = 0, pages = 0; pages < 100; pages++) {
    const b = (await readJson({ url, method: "POST", body: { dateRanges: [{ startDate: since, endDate: until }], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit, offset } }, o)) as
      { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]; rowCount?: number };
    for (const r of b.rows ?? []) { const k = r.dimensionValues?.[0]?.value; if (k) out[k] = Number(r.metricValues?.[0]?.value ?? 0); }
    offset += limit;
    if (!b.rows?.length || offset >= (b.rowCount ?? 0)) break;
  }
  return out;
}
