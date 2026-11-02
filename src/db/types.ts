// Kiểu dòng của các bảng snapshot CRM, khớp src/db/schema.sql (design doc mục 4.1).
// Mọi tên cột là [ĐỐI CHIẾU SCHEMA], chờ tài liệu API CRM (Q-01).

export type OpportunityRow = {
  opportunity_id: string;
  client_id: string | null;
  owner_rm_id: string | null;
  stage: string;
  close_date: string | null; // YYYY-MM-DD
  last_modified_at: string | null; // ISO 8601 UTC
  has_next_step: 0 | 1 | null;
  jurisdiction_code: string | null;
  service_family: string | null;
  industry_code: string | null;
  rejection_reason_code: string | null;
};

export type ClientRow = {
  client_id: string;
  is_reseller_end_client: 0 | 1 | null;
  industry_code: string | null;
  first_won_at: string | null;
};

export type ClientServiceRow = {
  client_id: string;
  product_family: string;
};

export type LeadRow = {
  lead_id: string;
  owner_rm_id: string | null;
  created_at: string | null;
  status: string | null;
  email_hash: string | null;
  phone_hash: string | null;
};
