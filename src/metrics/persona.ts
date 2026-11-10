// Chỉ số persona (metric-definitions.md `persona_segments`; spec mục 1 câu 2; D-88). Tính bằng code, không do LLM.
// Từ deal Closed Won thật: bỏ khách cuối của reseller (spec mục 12, is_reseller_end_client); gom theo (tài phán, dịch vụ);
// mỗi nhóm có cỡ mẫu, tỉ lệ trên deal trực tiếp, giá trị giữa, 3 ngành và 3 quốc gia nhiều nhất. Nhóm dưới ngưỡng mẫu
// không dựng persona, chỉ đếm. Không có trường định danh khách nào đi vào hay đi ra.
export type PersonaDeal = { jurisdiction: string | null; serviceFamily: string | null; industry: string | null; country: string | null; reseller: number | null; amountUsd: number | null };
export type Top = { name: string; count: number };
export type PersonaSegment = { jurisdiction: string; serviceFamily: string; deals: number; share: number; medianAmountUsd: number | null; industries: Top[]; countries: Top[] };
export type PersonaSummary = { total: number; direct: number; reseller: number; resellerUnknown: number; segments: PersonaSegment[]; thin: { segments: number; deals: number } };

const UNKNOWN = "chưa rõ";

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1]! + s[m]!) / 2) * 100) / 100;
}

function top(values: (string | null)[], n = 3): Top[] {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

export function personaSegments(deals: readonly PersonaDeal[], minDeals: number): PersonaSummary {
  const direct = deals.filter((d) => d.reseller !== 1);
  const groups = new Map<string, PersonaDeal[]>();
  for (const d of direct) {
    const k = `${d.jurisdiction ?? UNKNOWN}\u0000${d.serviceFamily ?? UNKNOWN}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  const all = [...groups].map(([k, ds]) => {
    const [jurisdiction, serviceFamily] = k.split("\u0000") as [string, string];
    return {
      jurisdiction, serviceFamily, deals: ds.length, share: direct.length ? Math.round((ds.length / direct.length) * 1000) / 1000 : 0,
      medianAmountUsd: median(ds.map((d) => d.amountUsd).filter((x): x is number => x !== null)),
      industries: top(ds.map((d) => d.industry)), countries: top(ds.map((d) => d.country)),
    };
  }).sort((a, b) => b.deals - a.deals || a.jurisdiction.localeCompare(b.jurisdiction) || a.serviceFamily.localeCompare(b.serviceFamily));
  const segments = all.filter((s) => s.deals >= minDeals);
  const thin = all.filter((s) => s.deals < minDeals);
  return {
    total: deals.length, direct: direct.length, reseller: deals.length - direct.length, resellerUnknown: direct.filter((d) => d.reseller === null).length,
    segments, thin: { segments: thin.length, deals: thin.map((s) => s.deals).reduce((a, b) => a + b, 0) },
  };
}
