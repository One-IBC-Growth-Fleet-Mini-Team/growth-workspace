// services_purchased (metric-definitions.md): khách đã mua dịch vụ gì.
// Nguồn duy nhất: bảng crm_client_services (OrderItem → Product2.Family).
import type { ClientServiceRow } from "../db/types.ts";

export function servicesPurchased(rows: readonly ClientServiceRow[], clientId: string): string[] {
  const families = new Set<string>();
  for (const r of rows) if (r.client_id === clientId) families.add(r.product_family);
  return [...families].sort();
}
