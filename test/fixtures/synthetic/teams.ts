// Tin Teams TỔNG HỢP theo mẫu tự báo RM (decisions.md), không có tự báo thật.
// Tên khách dùng canary CANARY_NAME_xxxx; email canary+n@example.invalid;
// SĐT trong dải thử nghiệm (Ofcom 07700 900xxx, Bắc Mỹ 555-01xx, Úc 0491 570 xxx).
// Hình dạng tin theo chatMessage của Microsoft Graph, [ĐỐI CHIẾU SCHEMA] (design doc mục 5.3).

export const TEAM_ID = "team_synthetic";
export const CHANNEL_ID = "channel_synthetic";

export const CANONICAL_TEXT = [
  "[01/11] [RM] RM_A",
  "TIẾP CẬN: 12 lead qua LinkedIn",
  "ĐĂNG BÀI: 1 bài về Samoa IBC",
  "HỘI THOẠI: 4",
  "BÁO GIÁ: 2 báo giá WS IBC01",
  "KHÁCH NÓI: Cost wise its expensive",
  "CHƯA LÊN HỆ THỐNG: 2",
  "CẦN HỖ TRỢ: cần bảng so sánh phí",
].join("\n");

export const HTML_VARIANT =
  "<p>[01/11] [RM] RM_B</p>" +
  "<ul><li><strong>Tiếp cận</strong> - 8 lead</li>" +
  "<li>dang bai: 0</li>" +
  "<li>HOI THOAI : 3 khách, CANARY_NAME_7f3a hỏi giá</li>" +
  "<li>• Báo giá: 1 BVI</li>" +
  "<li>khach noi: &quot;need it next month&quot; &amp; email canary+1@example.invalid</li>" +
  "<li>Báo giá: thêm 1 HK</li></ul>" +
  "<div>Cần hỗ trợ:<br>gọi lại +44 7700 900123</div>";

export const UNSTRUCTURED_TEXT =
  "Hôm nay mình gặp 3 khách, một khách CANARY_NAME_b21c (canary+2@example.invalid, +1 202 555 0142) chê giá.";

export type SyntheticGraphMessage = {
  id: string;
  replyToId: string | null;
  createdDateTime: string;
  lastModifiedDateTime: string;
  from: { user: { id: string } } | null;
  body: { contentType: "text" | "html"; content: string };
  webUrl: string;
  deletedDateTime?: string | null;
};

export function rootMessage(id: string, ddmm: string): SyntheticGraphMessage {
  return {
    id,
    replyToId: null,
    createdDateTime: "2026-11-01T00:30:00Z",
    lastModifiedDateTime: "2026-11-01T00:30:00Z",
    from: { user: { id: "aad_admin" } },
    body: { contentType: "text", content: `Tự báo ngày ${ddmm}` },
    webUrl: `https://teams.example.invalid/l/message/${id}`,
  };
}

export function reply(
  id: string,
  authorId: string,
  content: string,
  contentType: "text" | "html" = "text",
  createdDateTime = "2026-11-01T10:00:00Z",
): SyntheticGraphMessage {
  return {
    id,
    replyToId: "root_0111",
    createdDateTime,
    lastModifiedDateTime: createdDateTime,
    from: { user: { id: authorId } },
    body: { contentType, content },
    webUrl: `https://teams.example.invalid/l/message/${id}`,
  };
}
