// Trang Mi1-data-01 (D-36): độ phủ ID, cờ TRACKING_DEGRADED, sự kiện thiếu trường, PII lọt vào tham số.
import type { DataBoard } from "../../db/data01.ts";
import { ddmm } from "../../time.ts";
import type { Tier3bResult } from "../../metrics/tier3b.ts";
import { getProvisional, tag } from "../../provisional.ts";
import { html } from "./html.ts";
import { shell } from "./page.ts";

const pct = (v: number | null) => (v === null ? "chưa có" : `${(v * 100).toFixed(1)}%`);

function tier3bBlock(t: Tier3bResult) {
  const p = getProvisional("tier3b").value;
  const body = !("askPerView" in t) ? (t.status === "skipped_tracking_degraded" ? html`Không xét: đang TRACKING_DEGRADED (tầng 3A trước).` : html`Chưa đủ mẫu: ${t.assetView} asset_view, cần từ ${p.min_asset_view_per_week}.`)
    : html`${t.status === "flag" ? html`<strong class="warn">Có dấu hiệu lỗi trang đích.</strong> ` : "Ổn. "}ask_occ_started/asset_view ${pct(t.askPerView)} (ngưỡng ${pct(p.ask_per_view_below)}), contact_captured/ask_occ_started ${pct(t.contactPerAsk)} (ngưỡng ${pct(p.contact_per_ask_below)}).`;
  return html`<section><h2>Tầng 3B, trang đích (7 ngày)${tag("tier3b")}</h2><p>${body}</p></section>`;
}

export function renderDataPage(args: { board: DataBoard; csrf: string; message: string | null; threshold: number; tier3b?: Tier3bResult }): string {
  const b = args.board;
  const w = b.window;
  return shell("Dữ liệu và tracking", html`<h1>Độ phủ ID và tracking</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${!b.importedAt ? "red" : w.degraded ? "yellow" : "green"}">${!b.importedAt ? "Chưa nạp file sự kiện." : w.degraded ? html`<strong>TRACKING_DEGRADED</strong>: độ phủ ID dưới ${pct(args.threshold)}. Không tắt quảng cáo vì số này; mở ticket cho MobCEC (spec tầng 3A).` : "Độ phủ ID đạt ngưỡng."} Nạp lần cuối: ${b.importedAt ?? "chưa có"}</div>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<section><h2>Độ phủ ID ${ddmm(w.start)} tới ${ddmm(w.end)}: ${pct(w.rate)}</h2><p>${w.linked}/${w.sessions} phiên nối được tới Contact (contact_captured có contact_id). Mốc 25/09/2026: 19% phiên WhatsApp.</p>
${b.days.length ? html`<table class="kv">${b.days.map((d) => html`<tr><td>${ddmm(d.date)}</td><td>${d.linked}/${d.sessions} phiên</td><td>${d.degraded ? html`<span class="warn">${pct(d.rate)}</span>` : pct(d.rate)}</td></tr>`)}</table>` : ""}
${b.badTime ? html`<p class="warn">${b.badTime} sự kiện có event_time sai dạng, không tính vào ngày nào.</p>` : ""}</section>
${args.tier3b ? tier3bBlock(args.tier3b) : ""}
<section><h2>Sự kiện thiếu trường bắt buộc (Phụ lục A1, A2)</h2>${b.missing.length ? html`<table class="kv">${b.missing.map((m) => html`<tr><td>${m.eventName}</td><td>${m.incomplete}/${m.total} thiếu</td><td class="meta">${m.topFields.join(", ")}</td></tr>`)}</table>` : html`<p class="meta">Chưa có dữ liệu.</p>`}
${b.unknownEvents.length ? html`<p class="meta">Sự kiện ngoài 15 sự kiện: ${b.unknownEvents.map((u) => `${u.eventName} (${u.count})`).join(", ")}.</p>` : ""}</section>
${b.pii ? html`<section><h2>PII trong tham số (A6.4)</h2>${b.pii.emailCells || b.pii.forbiddenColumns.length ? html`<p class="warn">Lượt nạp mới nhất có ${b.pii.emailCells} ô chứa email${b.pii.forbiddenColumns.length ? `, cột cấm: ${b.pii.forbiddenColumns.join(", ")}` : ""}. Giá trị không được lưu; báo MobCEC gỡ khỏi GA4, Pixel.</p>` : html`<p>Không thấy email hay cột cấm.</p>`}</section>` : ""}
<section><h2>Chuỗi 12 ID (spec mục 5)</h2><p class="meta">Mỗi mắt nối đo trên sự kiện mang cả hai ID. Thiếu thì ghi thiếu, không suy đoán danh tính.</p>
<table class="kv">${b.chain.map((l) => html`<tr><td>${l.from} → ${l.to}</td><td>${l.status === "no_event" ? html`<span class="warn">Chưa có sự kiện mang cả hai ID (bổ sung Data Contract)</span>` : l.status === "no_data" ? `Chưa có sự kiện ${l.event}` : html`${l.linked}/${l.total} ${l.event}: ${pct(l.rate)}`}</td></tr>`)}</table></section>
<section><h2>Nạp file sự kiện</h2><form method="post" action="/data" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
<label>CSV sự kiện, dòng tiêu đề là tên trường Phụ lục A (event_id, event_name, event_time, session_id, contact_id, ...) <input type="file" name="events" accept=".csv,text/csv"> <span class="meta"><a href="/samples/events.csv" download>File mẫu</a></span></label>
<button type="submit">Nạp</button></form></section>`);
}
