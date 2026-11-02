// Bản ghi CRM thô TỔNG HỢP cho test (không có dữ liệu thật).
// Tên trường là tên tạm kiểu Salesforce, [ĐỐI CHIẾU SCHEMA], chờ tài liệu API CRM (Q-01).
// Mọi giá trị nhạy cảm dùng canary để test quét được: tên CANARY_NAME_xxxx,
// email canary+n@example.invalid, SĐT trong dải thử nghiệm (Ofcom 07700 900xxx, Bắc Mỹ 555-01xx).

export const CANARIES = [
  "CANARY_NAME_7f3a",
  "CANARY_NAME_b21c",
  "CANARY_NAME_0e9d",
  "CANARY_NAME_44aa",
  "CANARY_NAME_c0de",
  "canary+1@example.invalid",
  "canary+2@example.invalid",
  "+44 7700 900123",
  "+1 202 555 0142",
  "447700900123",
  "12025550142",
];

export const RAW_OPPORTUNITIES = [
  {
    Id: "OPP_001",
    Name: "CANARY_NAME_7f3a - Samoa IBC",
    AccountId: "CLI_001",
    OwnerId: "RM_A",
    StageName: "Quotation",
    CloseDate: "2026-11-15",
    LastModifiedDate: "2026-10-30T03:15:42.000Z",
    NextStep: "Gọi lại CANARY_NAME_b21c thứ Hai",
    Description: "Khách CANARY_NAME_0e9d, email canary+1@example.invalid",
    Amount: 1234,
    Jurisdiction__c: "WS",
    Service_Family__c: "IBC01",
    Industry__c: null,
    Rejection_Reason_Code__c: null,
    Unexpected_Field__c: "CANARY_NAME_44aa",
  },
  {
    Id: "OPP_002",
    Name: "CANARY_NAME_c0de",
    AccountId: null,
    OwnerId: "RM_B",
    StageName: "Prospecting",
    CloseDate: "2026-12-20",
    LastModifiedDate: "2026-10-29T08:00:00.000Z",
    NextStep: null,
    Jurisdiction__c: "HK",
    Service_Family__c: null,
  },
];

export const RAW_CLIENTS = [
  {
    Id: "CLI_001",
    Name: "CANARY_NAME_7f3a Holdings",
    BillingStreet: "CANARY_NAME_b21c street",
    Is_Reseller_End_Client__c: null,
    Industry__c: "TRADING",
    First_Won_Date__c: "2025-03-01",
    UBO__c: "CANARY_NAME_0e9d",
  },
  { Id: "CLI_002", Name: "CANARY_NAME_c0de", Is_Reseller_End_Client__c: true, Industry__c: null },
];

export const RAW_LEADS = [
  {
    Id: "LEAD_001",
    FirstName: "CANARY_NAME_7f3a",
    LastName: "CANARY_NAME_b21c",
    Email: "Canary+1@Example.invalid",
    Phone: "+44 7700 900123",
    OwnerId: "RM_A",
    CreatedDate: "2026-10-01T02:00:00.000Z",
    Status: "Open",
  },
  {
    Id: "LEAD_002",
    FirstName: "CANARY_NAME_c0de",
    Email: "canary+2@example.invalid",
    Phone: "+1 202 555 0142",
    OwnerId: "RM_B",
    CreatedDate: "2026-10-05T02:00:00.000Z",
    Status: "Working",
  },
];

export const RAW_ORDER_ITEMS = [
  { Id: "OI_001", Order: { AccountId: "CLI_001" }, Product2: { Family: "IBC01", Name: "CANARY_NAME_44aa" } },
  { Id: "OI_002", Order: { AccountId: "CLI_001" }, Product2: { Family: "IBC01" } },
  { Id: "OI_003", Order: { AccountId: "CLI_002" }, Product2: { Family: "IBC13" } },
];

export const RAW_BY_RESOURCE: Record<string, unknown[]> = {
  Opportunity: RAW_OPPORTUNITIES,
  Client: RAW_CLIENTS,
  Lead: RAW_LEADS,
  OrderItem: RAW_ORDER_ITEMS,
};
