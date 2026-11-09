// Trang hỏi Mi1 (D-58): câu trả lời là kết quả của truy vấn mẫu đã duyệt, không phải chữ do LLM viết.
import type { AskResult } from "../../mi1/ask.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const WHY: Record<string, string> = {
  QUESTION_REQUIRED: "Cần nhập câu hỏi.", COST_CAP: "Đã chạm trần chi phí LLM tháng (100 USD); Mi1 tạm không gọi LLM.",
  ASK_LLM_FAILED: "Không gọi được LLM.", ASK_REFUSED: "LLM từ chối câu hỏi này.", ASK_BAD_OUTPUT: "LLM trả sai định dạng; thử hỏi lại.", PARAMS_INVALID: "Tham số không hợp lệ; thử hỏi cụ thể hơn.",
};

export function renderAskPage(args: { configured: boolean; q: string; result: AskResult | null; csrf: string }): string {
  const r = args.result;
  return shell("Hỏi Mi1", html`<h1>Hỏi Mi1</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<p class="meta">Mi1 chỉ chọn truy vấn mẫu đã duyệt; số liệu do hàm tính. Không có mẫu phù hợp thì Mi1 nói rõ. Mỗi lần hỏi tính token vào <a href="/runs">Phiên chạy</a>. Câu hỏi được gửi tới Claude API: không gõ tên khách, email, số điện thoại (email, số điện thoại tự bị che).</p>
${args.configured ? html`<form method="post" action="/ask"><input type="hidden" name="csrf" value="${args.csrf}"><label>Câu hỏi <input name="q" maxlength="500" required value="${args.q}"></label><button type="submit">Hỏi</button></form>`
    : html`<div class="status yellow">Chưa cấu hình LLM (LLM_MODEL, giá token, API key) nên chưa hỏi được.</div>`}
${r ? html`<section><h2>${args.q}</h2>${r.status === "answered"
    ? html`<p>Mẫu ${r.template} (câu hỏi đầu ra số ${String(r.question)}). Đã xác minh: số từ hàm tính.</p><pre>${JSON.stringify(r.result, null, 2)}</pre>`
    : r.status === "no_template" ? html`<p class="warn">Chưa có truy vấn mẫu cho câu này. Thêm mẫu phải qua PR (D-51).</p>`
    : html`<p class="warn">${WHY[r.errorCode] ?? `Lỗi ${r.errorCode}.`}</p>`}</section>` : ""}`);
}
