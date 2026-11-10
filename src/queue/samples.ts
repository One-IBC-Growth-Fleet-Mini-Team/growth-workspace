// File mẫu để nạp (D-72): deploy/samples, 3 dòng giả mỗi file, đủ cột theo bảng ghép mặc định. Chỉ tải được tên có trong
// danh sách dưới đây (không đọc đường dẫn tuỳ ý). Đường dẫn tải: /samples/<tên file>.
import { readFileSync } from "node:fs";

export const SAMPLE_FILES: Record<string, string> = {
  "opportunity.csv": "Opportunity (CRM)", "client.csv": "Client hay Account (CRM)", "lead.csv": "Lead (CRM)", "orderitem.csv": "Order hay OrderItem (CRM)",
  "workorder.csv": "Work Order (CRM)", "wopic.csv": "Ghép WO và PIC", "salesorder.csv": "Sales Order", "purchaseorder.csv": "Purchase Order", "invoice.csv": "Invoice",
  "partner.csv": "Danh sách đối tác", "referral.csv": "Deal đối tác giới thiệu", "price-final.csv": "Sheet giá FINAL", "skd-files.txt": "Danh sách file SKD",
  "sandbox-bugs.csv": "Tab Bug sandbox8", "sandbox-cases.csv": "Tab Test Cases sandbox8", "bank-matrix.csv": "Ma trận ngân hàng", "bank-core.csv": "Thông tin ngân hàng",
  "events.csv": "Sự kiện web, CRM", "campaigns.csv": "Kết quả theo chiến dịch", "meta-ads.csv": "Báo cáo tuần Meta Ads", "google-ads.csv": "Báo cáo tuần Google Ads",
  "competitor-prices.csv": "Giá gói đối thủ", "hooks.csv": "Điểm Hook", "market-regulation.csv": "Quy định", "market-reviews.csv": "Tiếng khách", "ads-check-batch.csv": "Nhiều mẫu quảng cáo",
};

const DIR = new URL("../../deploy/samples/", import.meta.url).pathname;

export function readSample(name: string): string | null {
  return Object.hasOwn(SAMPLE_FILES, name) ? readFileSync(DIR + name, "utf8") : null;
}

// Link tải file mẫu, đặt cạnh ô nạp.
export function sampleLink(name: string): string {
  return `<a href="/samples/${name}" download>File mẫu</a>`;
}
