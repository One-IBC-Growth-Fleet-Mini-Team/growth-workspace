// Trang sức khoẻ tài khoản kênh (CRON-02; D-37): lần kiểm mới nhất của 3 BM, 3 số WA, 6 Fanpage và form ghi lần kiểm.
import type { buildChannelBoard } from "../../db/channels.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const KIND = { bm: "Business Manager", wa: "Số WhatsApp Business", fanpage: "Fanpage" } as const;
const STATUS = { ok: "Ổn", restricted: "Bị hạn chế", disabled: "Bị khoá" } as const;

export function renderChannelsPage(args: { board: ReturnType<typeof buildChannelBoard>; csrf: string; message: string | null; staleHours: number }): string {
  const b = args.board;
  const s = b.summary;
  const stale = new Set(s.stale.map((x) => `${x.kind}|${x.label}`));
  const missing = Object.entries(s.notTracked).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND[k as keyof typeof KIND]}`);
  return shell("Tài khoản kênh", html`<h1>Sức khoẻ tài khoản kênh</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${s.issues.length ? "red" : s.stale.length || missing.length ? "yellow" : "green"}">${s.ok} ổn, ${s.issues.length} có vấn đề, ${s.stale.length} quá ${args.staleHours} giờ chưa kiểm. Lần kiểm cuối: ${b.lastCheckedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
${missing.length ? html`<p class="meta">Chưa theo dõi so với spec (3 BM, 3 số WA, 6 Fanpage): ${missing.join(", ")}.</p>` : ""}
${b.accounts.length ? html`<table class="kv">${b.accounts.map((a) => html`<tr><td>${a.label}<br><span class="meta">${KIND[a.kind]}</span></td><td>${a.status === "ok" ? STATUS.ok : html`<span class="warn">${STATUS[a.status]}</span>`}</td><td class="meta">${a.checkedAt}${stale.has(`${a.kind}|${a.label}`) ? html` <span class="warn">(quá hạn)</span>` : ""}<br>${a.note ?? ""}</td></tr>`)}</table>` : html`<p class="meta">Chưa có lần kiểm nào.</p>`}
<section><h2>Ghi lần kiểm</h2><p class="meta">Xem trên Meta Business Suite, rồi ghi trạng thái. Nhãn là tên gọi nội bộ, không ghi số điện thoại.</p>
<form method="post" action="/channels"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Loại <select name="kind">${Object.entries(KIND).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
<label>Nhãn <input name="label" maxlength="60" list="labels" required></label><datalist id="labels">${b.accounts.map((a) => html`<option value="${a.label}">`)}</datalist>
<label>Trạng thái <select name="status">${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
<label>Ghi chú <input name="note" maxlength="300"></label>
<button type="submit">Ghi</button></form></section>`);
}
