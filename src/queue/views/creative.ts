// Trang Creative Factory (D-44): Storyboard chờ duyệt, duyệt hoặc từ chối, chạy tạo ảnh, video sau khi duyệt.
import type { listStoryboards } from "../../creative/factory.ts";
import { tier4Params } from "../../db/rejections.ts";
import { tag } from "../../provisional.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const STATUS = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối" } as const;

export function renderCreativePage(args: { storyboards: ReturnType<typeof listStoryboards>; connected: boolean; hooks: { hookId: string; text: string }[]; rejections: { code: string; count: number }[]; csrf: string; message: string | null }): string {
  return shell("Creative Factory", html`<h1>Creative Factory và cổng Storyboard</h1>
<p><a href="/queue">Quay lại Hàng chờ</a> · <a href="/hooks">Hook</a></p>
${args.connected ? "" : html`<div class="status yellow">Chưa nối Creative Factory (đặt CREATIVE_SOURCE=mcp và CREATIVE_MCP_URL). Trang chỉ xem Storyboard đã có.</div>`}
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>Lý do từ chối lặp lại ${String(tier4Params().windowDays)} ngày (tầng 4)${tag("tier4_repeat")}</h2>${args.rejections.length ? html`<p>${args.rejections.map((r) => `${r.code} (${r.count})`).join(", ")}. Gửi kèm khi tạo Storyboard để thêm câu lọc vào câu 2 tới 3.</p>` : html`<p class="meta">Chưa có mã nào lặp từ ${String(tier4Params().minCount)} lần trong số mã Amy đã xác nhận.</p>`}</section>
<p class="meta">Chỉ gọi model tạo ảnh, video sau khi Storyboard được duyệt (spec mục 7). Việc này tốn tiền nên luôn cần người duyệt.</p>
${args.connected && args.hooks.length ? html`<section><h2>Tạo Storyboard từ Hook</h2><form method="post" action="/creative/compile"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Hook <select name="hook">${args.hooks.map((h) => html`<option value="${h.hookId}">${h.hookId}: ${h.text.slice(0, 60)}</option>`)}</select></label><button type="submit">Tạo Storyboard</button></form></section>` : ""}
<section><h2>Storyboard (${args.storyboards.length})</h2>${args.storyboards.length ? args.storyboards.map((s) => html`<div class="card"><div class="head">${s.creativeIrId}: ${s.title} · ${s.status === "approved" ? STATUS.approved : html`<span class="warn">${STATUS[s.status as keyof typeof STATUS]}</span>`}</div>
<ol>${s.scenes.map((x) => html`<li>${x}</li>`)}</ol>
${s.note ? html`<p class="meta">Ghi chú: ${s.note}</p>` : ""}${s.lastRun ? html`<p class="meta">Lần chạy gần nhất ${s.lastRun.runAt}: QA ${s.lastRun.qaStatus ?? "chưa có"}, ${s.lastRun.assets} asset</p>` : ""}
<form method="post" action="/creative/decide"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${s.creativeIrId}"><input name="note" placeholder="Ghi chú" maxlength="300">
<button name="decision" value="approve">Duyệt</button><button name="decision" value="reject">Từ chối</button></form>
${args.connected && s.status === "approved" ? html`<form method="post" action="/creative/run"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${s.creativeIrId}"><button name="run" value="1">Chạy tạo ảnh, video (STRICT)</button></form>` : ""}
${s.lastExport ? html`<p class="meta">Đóng gói ${s.lastExport.exportedAt} (chạy thử, chưa đăng): ${s.lastExport.bundles.map((b) => `${b.channel} ${b.aspectRatio} (${b.entries})`).join(", ")}</p>` : ""}
${args.connected && s.lastRun ? html`<form method="post" action="/creative/analyze"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${s.creativeIrId}"><button type="submit">Phân tích (bước 7)</button></form>` : ""}
${args.connected && s.status === "approved" && s.lastRun?.qaStatus === "PASS" ? html`<form method="post" action="/creative/export"><input type="hidden" name="csrf" value="${args.csrf}"><input type="hidden" name="id" value="${s.creativeIrId}"><button type="submit">Đóng gói cho kênh (chạy thử)</button></form>` : ""}</div>`) : html`<p class="meta">Chưa có Storyboard.</p>`}</section>`);
}
