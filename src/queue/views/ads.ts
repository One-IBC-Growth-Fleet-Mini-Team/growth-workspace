// Trang cổng tuân thủ quảng cáo (D-38): dán một mẫu hoặc tải CSV nhiều mẫu, xem kết quả. Không lưu nội dung.
import type { AdRow } from "../../ads/check.ts";
import type { AdIssue, Verdict } from "../../metrics/ad-compliance.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const VERDICT: Record<Verdict, string> = { pass: "Đạt", review: "Cần người duyệt", hold: "Giữ lại (tài phán chưa chốt giá)", fail: "Không đạt" };
const ISSUE: Record<string, string> = {
  BANNED_WORD: "Từ cấm", REVIEW_WORD: "Từ cần người duyệt", TOO_LONG_OPENING: "Câu mở quá dài", TOO_LONG_HEADLINE: "Headline quá dài",
  TOO_LONG_DESCRIPTION: "Description quá dài", HOLD_PRICE_NOT_LOCKED: "Tài phán chưa chốt giá",
};
const issueText = (i: AdIssue) => `${ISSUE[i.code] ?? i.code}: ${i.detail} (${i.field})`;

export function renderAdsPage(args: { csrf: string; rows: AdRow[] | null; message: string | null; rules: { banned: readonly string[]; review: readonly string[] } }): string {
  return shell("Kiểm quảng cáo", html`<h1>Cổng tuân thủ trước khi đăng</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<p class="meta">Kiểm bằng code: từ cấm, độ dài (câu mở dưới 125 ký tự, Headline tối đa 40, Description tối đa 30), tài phán đã chốt giá. Đạt cổng này chưa phải được đăng: đăng công khai luôn cần người duyệt. Chưa kiểm màu ảnh.</p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
${args.rows ? html`<section><h2>Kết quả (${args.rows.length})</h2><table class="kv">${args.rows.map((r) => html`<tr><td>${r.id}${r.jurisdiction ? html`<br><span class="meta">${r.jurisdiction}</span>` : ""}</td><td>${r.verdict === "pass" ? VERDICT.pass : html`<span class="warn">${VERDICT[r.verdict]}</span>`}</td><td class="meta">${r.issues.map(issueText).join("; ")}</td></tr>`)}</table></section>` : ""}
<section><h2>Kiểm một mẫu</h2><form method="post" action="/ads-check"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Tài phán (không bắt buộc) <input name="jurisdiction" maxlength="64"></label>
<label>Primary text <textarea name="primary_text" rows="4"></textarea></label>
<label>Headline <input name="headline" maxlength="200"></label>
<label>Description <input name="description" maxlength="200"></label>
<button type="submit">Kiểm</button></form></section>
<section><h2>Kiểm nhiều mẫu</h2><form method="post" action="/ads-check" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV có cột id, jurisdiction, primary_text, headline, description <input type="file" name="batch" accept=".csv,text/csv"></label>
<button type="submit">Kiểm</button></form></section>
<p class="meta">Từ cấm đang dùng (tạm, chờ Mark chốt): ${args.rules.banned.join(", ")}. Cần người duyệt: ${args.rules.review.join(", ")}.</p>`);
}
