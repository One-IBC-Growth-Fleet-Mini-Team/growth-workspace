// Kiểu dữ liệu của luật NBA (design doc mục 5.5).
export type NbaAction =
  | "follow_up" // RM theo tiếp deal trong kỳ
  | "follow_up_unresponsive" // NBA_X_STALL: khách im lặng
  | "remind_invoice" // NBA_X_STALL: chờ thanh toán
  | "upsell_bank" // RM chào Bank cho khách cũ
  | "upsell_other" // ứng viên bán thêm khác Bank, luật 1 luôn đổi thành handoff_team
  | "handoff_team" // đề xuất chuyển giao cho team sở hữu
  | "confirm_reseller_flag"; // D-06: nhờ RM xác nhận cờ reseller

export type NbaCandidate = {
  subjectRef: string;
  subjectKind: "opportunity" | "client";
  source: "pipeline" | "old_client";
  action: NbaAction;
  ownerRmId: string | null;
  clientId: string | null;
  family?: string;
  stage?: string;
  closeDate?: string | null;
  industryCode?: string | null;
  rejectionCode?: string | null;
};

export type NbaDraft = NbaCandidate & {
  rulesFired: string[];
  warnings: string[];
  handoffTeam?: string;
  priorityFactor: number;
  defaultAction: "giữ nháp";
};

export type RankedNba = NbaDraft & { priority: number; explanation: string };
