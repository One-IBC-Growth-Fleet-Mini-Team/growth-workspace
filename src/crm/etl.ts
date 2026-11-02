// Job ETL CRM (design doc mục 3.2 bước 1, mục 5.1). Chỉ đọc CRM qua crmGet.
// Mỗi lần chạy là một snapshot mới; lỗi thì run failed và snapshot cũ giữ nguyên.
// Bản ghi thô chỉ sống trong bộ nhớ từng trang; thứ được ghi là dòng đã qua allowlist và băm.
import type { Database } from "bun:sqlite";
import { crmGet, CrmError, type CrmGetOptions, type CrmQuery, type CrmResource } from "./http.ts";
import { CrmMappingError, mapClient, mapLead, mapOpportunity, mapOrderItem } from "./mappers.ts";
import {
  insertEtlRun,
  insertEtlRunStatus,
  insertSnapshotSucceeded,
  type CrmSnapshot,
  type SnapshotRowCounts,
} from "../db/crm-snapshot.ts";
import type { PiiHasher } from "../pii/hash.ts";
import { log } from "../log.ts";

// Phạm vi kéo (D-09): Opportunity có Close Date trong 13 tháng gần nhất và mọi Opportunity mở;
// mọi Client có Order; Lead tạo trong 180 ngày.
export type CrmPullScope = { closeDateFrom: string; leadCreatedFrom: string };

export function pullScope(now: Date): CrmPullScope {
  const close = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, now.getUTCDate()));
  const lead = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  return { closeDateFrom: close.toISOString().slice(0, 10), leadCreatedFrom: lead.toISOString().slice(0, 10) };
}

// [ĐỐI CHIẾU SCHEMA] Cách lọc và phân trang của API CRM chưa biết (Q-01). Đây là bản tổng hợp,
// khớp CRM giả trong test: query page=n, phản hồi {records: [...], next_page: n | null}.
// Khi có tài liệu API, thay bằng adapter thật cùng interface.
export type CrmPagination = {
  firstQuery(resource: CrmResource, scope: CrmPullScope): CrmQuery;
  parsePage(body: unknown, current: CrmQuery): { records: unknown[]; nextQuery: CrmQuery | null };
};

export const SYNTHETIC_PAGINATION: CrmPagination = {
  firstQuery(resource, scope): CrmQuery {
    switch (resource) {
      case "Opportunity":
        return { close_date_from: scope.closeDateFrom, include_open: true, page: 1 };
      case "Client":
        return { has_order: true, page: 1 };
      case "Lead":
        return { created_from: scope.leadCreatedFrom, page: 1 };
      case "OrderItem":
        return { page: 1 };
    }
  },
  parsePage(body, current) {
    if (body === null || typeof body !== "object") throw new CrmError("CRM_BAD_RESPONSE");
    const b = body as { records?: unknown; next_page?: unknown };
    if (!Array.isArray(b.records)) throw new CrmError("CRM_BAD_RESPONSE");
    const next = b.next_page;
    if (next !== null && next !== undefined && !Number.isInteger(next)) throw new CrmError("CRM_BAD_RESPONSE");
    return { records: b.records, nextQuery: typeof next === "number" ? { ...current, page: next } : null };
  },
};

export class EtlLimitError extends Error {
  readonly code = "CRM_PAGE_LIMIT";
}

export type EtlDeps = {
  db: Database;
  crm: CrmGetOptions;
  hasher: PiiHasher;
  now?: () => Date;
  pagination?: CrmPagination;
  maxPagesPerResource?: number; // chặn số request (design doc mục 6, L5)
};

export type EtlResult = {
  etlRunId: string;
  status: "succeeded" | "failed";
  rowCounts: Partial<SnapshotRowCounts>;
  errorCode?: string;
};

async function pullResource(
  resource: CrmResource,
  deps: Required<Pick<EtlDeps, "crm" | "pagination" | "maxPagesPerResource">>,
  scope: CrmPullScope,
  onRecord: (raw: unknown) => void,
): Promise<void> {
  let query: CrmQuery | null = deps.pagination.firstQuery(resource, scope);
  let pages = 0;
  while (query) {
    if (pages >= deps.maxPagesPerResource) throw new EtlLimitError("CRM_PAGE_LIMIT");
    const body = await crmGet(resource, query, deps.crm);
    pages++;
    const page = deps.pagination.parsePage(body, query);
    for (const raw of page.records) onRecord(raw);
    query = page.nextQuery;
  }
}

function errorCode(e: unknown): string {
  if (e instanceof CrmError || e instanceof CrmMappingError || e instanceof EtlLimitError) return e.code;
  return "ETL_UNKNOWN";
}

export async function runCrmEtl(deps: EtlDeps): Promise<EtlResult> {
  const now = deps.now ?? (() => new Date());
  const pullDeps = {
    crm: deps.crm,
    pagination: deps.pagination ?? SYNTHETIC_PAGINATION,
    maxPagesPerResource: deps.maxPagesPerResource ?? 1000,
  };
  const etlRunId = Bun.randomUUIDv7();
  const startedAt = now();
  insertEtlRun(deps.db, etlRunId, "crm", startedAt.toISOString());
  log({ event: "etl.started", run_id: etlRunId });

  const snap: CrmSnapshot = { opportunities: [], clients: [], leads: [], clientServices: [] };
  const serviceKeys = new Set<string>();
  try {
    const scope = pullScope(startedAt);
    await pullResource("Opportunity", pullDeps, scope, (r) => snap.opportunities.push(mapOpportunity(r)));
    await pullResource("Client", pullDeps, scope, (r) => snap.clients.push(mapClient(r)));
    await pullResource("Lead", pullDeps, scope, (r) => snap.leads.push(mapLead(r, deps.hasher)));
    await pullResource("OrderItem", pullDeps, scope, (r) => {
      const row = mapOrderItem(r);
      const key = `${row.client_id}\u0000${row.product_family}`;
      if (serviceKeys.has(key)) return;
      serviceKeys.add(key);
      snap.clientServices.push(row);
    });
    const rowCounts = insertSnapshotSucceeded(deps.db, etlRunId, snap, now().toISOString());
    log({ event: "etl.succeeded", run_id: etlRunId, count: rowCounts.opportunity });
    return { etlRunId, status: "succeeded", rowCounts };
  } catch (e) {
    const code = errorCode(e);
    insertEtlRunStatus(deps.db, etlRunId, "failed", now().toISOString(), {}, code);
    log({ event: "etl.failed", run_id: etlRunId, error_code: code });
    return { etlRunId, status: "failed", rowCounts: {}, errorCode: code };
  }
}
