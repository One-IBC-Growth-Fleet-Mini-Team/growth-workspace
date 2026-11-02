// Ánh xạ bản ghi CRM thô sang dòng snapshot (design doc mục 5.1, 7.2).
// Allowlist: chỉ chép trường liệt kê dưới đây; trường lạ bị bỏ qua, không lỗi.
// Email, SĐT được chuẩn hoá và băm ngay trong mapLead; giá trị gốc không rời khỏi hàm.
// Thiếu trường bắt buộc hoặc sai kiểu thì ném CrmMappingError chỉ kèm tên trường, không kèm giá trị.
// [ĐỐI CHIẾU SCHEMA] Toàn bộ tên trường nguồn (Id, StageName, ...) là tên tạm kiểu Salesforce,
// chờ tài liệu API CRM (Q-01, A-02). Cờ reseller và mã lý do là trường A4, có thể chưa có (A-03).
import type { ClientRow, ClientServiceRow, LeadRow, OpportunityRow } from "../db/types.ts";
import type { PiiHasher } from "../pii/hash.ts";

export class CrmMappingError extends Error {
  readonly code = "CRM_MAP_INVALID";
  constructor(readonly field: string) {
    super(`CRM_MAP_INVALID ${field}`);
  }
}

type Raw = Record<string, unknown>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(raw: unknown, what: string): Raw {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new CrmMappingError(what);
  return raw as Raw;
}

function reqString(r: Raw, field: string, what: string): string {
  const v = r[field];
  if (typeof v !== "string" || v.trim() === "") throw new CrmMappingError(`${what}.${field}`);
  return v;
}

function optString(r: Raw, field: string, what: string): string | null {
  const v = r[field];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw new CrmMappingError(`${what}.${field}`);
  return v;
}

function optDate(r: Raw, field: string, what: string): string | null {
  const v = optString(r, field, what);
  if (v === null) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new CrmMappingError(`${what}.${field}`);
  return v;
}

// Múi giờ của trường thời gian [ĐỐI CHIẾU SCHEMA]; lưu dạng ISO 8601 UTC.
// Bắt buộc có múi giờ (Z hoặc ±hh:mm): không đoán theo múi giờ của máy chạy.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function optTimestamp(r: Raw, field: string, what: string): string | null {
  const v = optString(r, field, what);
  if (v === null) return null;
  if (!TIMESTAMP_RE.test(v)) throw new CrmMappingError(`${what}.${field}`);
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) throw new CrmMappingError(`${what}.${field}`);
  return new Date(ms).toISOString();
}

function optBoolFlag(r: Raw, field: string, what: string): 0 | 1 | null {
  const v = r[field];
  if (v === null || v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  throw new CrmMappingError(`${what}.${field}`);
}

export function mapOpportunity(raw: unknown): OpportunityRow {
  const r = asRecord(raw, "Opportunity");
  const nextStep = r.NextStep;
  if (nextStep !== null && nextStep !== undefined && typeof nextStep !== "string") {
    throw new CrmMappingError("Opportunity.NextStep");
  }
  return {
    opportunity_id: reqString(r, "Id", "Opportunity"),
    client_id: optString(r, "AccountId", "Opportunity"),
    owner_rm_id: optString(r, "OwnerId", "Opportunity"),
    stage: reqString(r, "StageName", "Opportunity"),
    close_date: optDate(r, "CloseDate", "Opportunity"),
    last_modified_at: optTimestamp(r, "LastModifiedDate", "Opportunity"),
    // Chỉ lưu cờ có nội dung; nội dung NextStep có thể chứa tên khách nên không lưu.
    has_next_step: typeof nextStep === "string" && nextStep.trim() !== "" ? 1 : 0,
    jurisdiction_code: optString(r, "Jurisdiction__c", "Opportunity"),
    service_family: optString(r, "Service_Family__c", "Opportunity"),
    industry_code: optString(r, "Industry__c", "Opportunity"),
    rejection_reason_code: optString(r, "Rejection_Reason_Code__c", "Opportunity"),
  };
}

export function mapClient(raw: unknown): ClientRow {
  const r = asRecord(raw, "Client");
  return {
    client_id: reqString(r, "Id", "Client"),
    is_reseller_end_client: optBoolFlag(r, "Is_Reseller_End_Client__c", "Client"),
    industry_code: optString(r, "Industry__c", "Client"),
    first_won_at: optDate(r, "First_Won_Date__c", "Client"),
  };
}

export function mapLead(raw: unknown, hasher: PiiHasher): LeadRow {
  const r = asRecord(raw, "Lead");
  const email = r.Email;
  const phone = r.Phone;
  if (email !== null && email !== undefined && typeof email !== "string") throw new CrmMappingError("Lead.Email");
  if (phone !== null && phone !== undefined && typeof phone !== "string") throw new CrmMappingError("Lead.Phone");
  return {
    lead_id: reqString(r, "Id", "Lead"),
    owner_rm_id: optString(r, "OwnerId", "Lead"),
    created_at: optTimestamp(r, "CreatedDate", "Lead"),
    status: optString(r, "Status", "Lead"),
    email_hash: hasher.hashEmail(email as string | null | undefined),
    phone_hash: hasher.hashPhone(phone as string | null | undefined),
  };
}

// OrderItem → Order.AccountId và Product2.Family (metric-definitions: services_purchased).
export function mapOrderItem(raw: unknown): ClientServiceRow {
  const r = asRecord(raw, "OrderItem");
  const order = asRecord(r.Order, "OrderItem.Order");
  const product = asRecord(r.Product2, "OrderItem.Product2");
  return {
    client_id: reqString(order, "AccountId", "OrderItem.Order"),
    product_family: reqString(product, "Family", "OrderItem.Product2"),
  };
}
