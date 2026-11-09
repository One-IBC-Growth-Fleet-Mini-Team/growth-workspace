// Trang Hàng chờ (design doc mục 5.7): nhóm theo loại, thẻ có đề xuất, luật, điểm tự tin, tuổi mục, link, nút.
import { METRIC_PARAMS } from "../../config.ts";
import { REASON_CODES, REASON_LABELS, type ReasonCode } from "../../agents/sa-01/catalog.ts";
import type { QueueEventRow, QueueItemRow } from "../../db/queue.ts";
import { WO_TOUCH_REASONS, type WoBoardRow } from "../../db/wo.ts";
import type { Brief, Digest } from "../../mi1/core.ts";
import { ddmm } from "../../time.ts";
import type { QueueUser } from "../auth.ts";
import { NBA_ACTIONS, RM_OUTCOMES } from "../items.ts";
import { html, SafeHtml } from "./html.ts";

export type SourceStatus = "green" | "yellow" | "red";
export type PageItem = QueueItemRow & { events: QueueEventRow[]; effectivePayload: string };

const GROUPS: { type: QueueItemRow["item_type"]; title: string }[] = [
  { type: "self_report", title: "Tự báo RM" },
  { type: "reason_code", title: "Mã lý do" },
  { type: "nba", title: "NBA" },
  { type: "system_notice", title: "Thông báo hệ thống" },
];

export const OUTCOME_TEXT: Record<(typeof RM_OUTCOMES)[number], string> = {
  rm_accepted: "RM nhận việc",
  rm_already_handled: "RM đã xử lý",
  rm_not_sellable: "RM báo không bán được",
  rm_no_reply: "RM chưa phản hồi",
};

const STATE_TEXT: Record<string, string> = {
  pending: "chờ duyệt",
  confirm: "đã xác nhận",
  edit: "đã sửa",
  reject: "đã bác",
  escalate: "đã escalate",
  default_applied: "quá hạn, giữ nháp",
};

const STYLE = `body{font-family:system-ui,sans-serif;margin:0;padding:16px;max-width:960px;margin-inline:auto;color:#1b1b1b;background:#fafafa}
.status{padding:8px 12px;border-radius:6px;margin-bottom:16px}.green{background:#e3f4e8}.yellow{background:#fff4cc}.red{background:#fde2e1}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}.head{font-weight:600;margin:4px 0 8px}table.kv{border-collapse:collapse;margin:4px 0}table.kv td{padding:2px 12px 2px 0;vertical-align:top}blockquote{margin:4px 0;padding-left:8px;border-left:3px solid #bbb}.warn{color:#9a5b00}details.tech{margin-top:8px}nav a{margin-right:12px}.meta{color:#555;font-size:13px;overflow-wrap:anywhere}
input,select{max-width:100%}
form{display:inline-block;margin:4px 8px 4px 0}textarea{width:100%}pre{white-space:pre-wrap;word-break:break-word;font-size:13px}
@media (prefers-color-scheme: dark){body{background:#151515;color:#eee}.card{background:#222;border-color:#444}.meta{color:#aaa}
.green{background:#173d24}.yellow{background:#4a3d0a}.red{background:#4d1d1b}}`;

function ageText(createdAt: string, now: Date): string {
  const hours = Math.floor((now.getTime() - Date.parse(createdAt)) / 3_600_000);
  return hours < 1 ? "dưới 1 giờ" : `${hours} giờ`;
}

function displayState(item: PageItem): string {
  if (item.item_type === "nba" && (item.state === "confirm" || item.state === "edit")) {
    const outcome = [...item.events].reverse().find((e) => e.action === "rm_outcome");
    if (!outcome) return "chờ RM xác nhận";
    const o = (JSON.parse(outcome.payload ?? "{}") as { outcome?: keyof typeof OUTCOME_TEXT }).outcome;
    return o ? OUTCOME_TEXT[o] : "chờ RM xác nhận";
  }
  return STATE_TEXT[item.state] ?? item.state;
}

function actionForm(item: PageItem, action: string, csrf: string, label: string, fields: SafeHtml | string = ""): SafeHtml {
  return html`<form method="post" action="/queue/items/${item.id}/${action}"><input type="hidden" name="csrf" value="${csrf}">${fields}<button type="submit">${label}</button></form>`;
}

function editFields(item: PageItem, payload: Record<string, unknown>): SafeHtml {
  const note = html`<label>Ghi chú (tối đa 300 ký tự) <input name="note" maxlength="300"></label>`;
  if (item.item_type === "nba") {
    return html`<select name="action">${NBA_ACTIONS.map((a) => html`<option value="${a}" ${a === payload.action ? html`selected` : ""}>${a}</option>`)}</select>${note}`;
  }
  if (item.item_type === "reason_code") {
    const p = (payload.proposal ?? {}) as { primary?: string; is_final?: boolean };
    return html`<select name="primary">${REASON_CODES.map((c) => html`<option value="${c}" ${c === p.primary ? html`selected` : ""}>${c}</option>`)}</select>
<select name="is_final"><option value="true" ${p.is_final ? html`selected` : ""}>is_final: true</option><option value="false" ${p.is_final === false ? html`selected` : ""}>is_final: false</option></select>
<label>Mã Opportunity <input name="opportunity_id" maxlength="64"></label>${note}`;
  }
  const sections = (payload.sections ?? {}) as Record<string, { count?: number | null } | null>;
  return html`${["outreach", "posts", "conversations", "not_in_crm"].map(
    (k) => html`<label>${k} <input name="count_${k}" inputmode="numeric" size="4" value="${sections[k]?.count ?? ""}"></label> `,
  )}${note}`;
}

const SECTION_ROWS: [string, string][] = [
  ["outreach", "Tiếp cận"],
  ["posts", "Đăng bài"],
  ["conversations", "Hội thoại"],
  ["not_in_crm", "Chưa lên hệ thống"],
];

const STATUS_TEXT: Record<string, string> = {
  pii_blocked: "Đã chặn vì nghi có thông tin khách. Mở bản gốc để đọc.",
  parse_failed: "Không cấu trúc được bản tự báo này. Mở bản gốc để đọc.",
  refused: "Không xử lý được bản tự báo này. Mở bản gốc để đọc.",
};

const ACTION_TITLE: Record<string, string> = {
  follow_up: "Theo tiếp deal",
  follow_up_unresponsive: "Follow up khách chưa phản hồi",
  remind_invoice: "Nhắc thanh toán invoice",
  upsell_bank: "Chào dịch vụ Bank",
  handoff_team: "Chuyển giao cho team sở hữu",
  confirm_reseller_flag: "Xác nhận cờ reseller",
};

function selfReportBody(p: Record<string, unknown>): SafeHtml {
  const rm = html`<div class="head">Tự báo của ${p.rm_id ?? "RM chưa xác định"} · ngày ${p.report_date}</div>`;
  const status = String(p.status ?? "ok");
  if (status !== "ok") return html`${rm}<p>${STATUS_TEXT[status] ?? "Không đọc được bản tự báo này."}</p>`;
  const sec = (p.sections ?? {}) as Record<string, unknown>;
  const rows = SECTION_ROWS.flatMap(([k, label]) => {
    const v = sec[k] as { count?: number | null; note?: string } | null | undefined;
    if (!v) return [];
    return [html`<tr><td>${label}</td><td><strong>${v.count ?? "không ghi số"}</strong></td><td>${v.note ?? ""}</td></tr>`];
  });
  const quotes = ((sec.quotes ?? []) as { jurisdiction_code: string | null; service_family: string | null; status: string }[]).map(
    (q) => html`<li>${q.jurisdiction_code ?? "?"} ${q.service_family ?? ""} (${q.status})</li>`,
  );
  const said = ((sec.customer_said ?? []) as { customer_ref: string; quote_vi: string; quote_original: string }[]).map(
    (c) => html`<blockquote>${c.customer_ref}: ${c.quote_original}${c.quote_vi !== c.quote_original ? html`<br><em>${c.quote_vi}</em>` : ""}</blockquote>`,
  );
  const support = ((sec.needs_support ?? []) as { note: string }[]).map((n) => html`<li>${n.note}</li>`);
  return html`${rm}${rows.length ? html`<table class="kv">${rows}</table>` : ""}
${quotes.length ? html`<div>Báo giá:<ul>${quotes}</ul></div>` : ""}
${said.length ? html`<div>Khách nói:${said}</div>` : ""}
${support.length ? html`<div>Cần hỗ trợ:<ul>${support}</ul></div>` : ""}`;
}

function reasonBody(p: Record<string, unknown>): SafeHtml {
  const pr = (p.proposal ?? {}) as { customer_ref?: string; primary?: ReasonCode; is_final?: boolean; evidence_quote?: string | null };
  const label = pr.primary ? (REASON_LABELS[pr.primary] ?? pr.primary) : "?";
  return html`<div class="head">${pr.customer_ref ?? "Khách"} của ${p.rm_id ?? "RM chưa xác định"}: ${label}</div>
<div>Mã đề xuất: <strong>${pr.primary}</strong> · ${pr.is_final ? "khách đã dứt khoát" : "deal đang kẹt, chưa phải từ chối"}${p.opportunity_id ? html` · Opportunity ${p.opportunity_id}` : ""}</div>
${pr.evidence_quote ? html`<blockquote>${pr.evidence_quote}</blockquote>` : ""}`;
}

function nbaBody(p: Record<string, unknown>): SafeHtml {
  const title = ACTION_TITLE[String(p.action)] ?? String(p.action);
  const warnings = ((p.warnings ?? []) as string[]).map((w) => html`<div class="warn">Lưu ý: ${w}</div>`);
  return html`<div class="head">${title}${p.handoff_team ? html` (${p.handoff_team})` : ""} · ${p.subject_kind === "client" ? "Khách" : "Opportunity"} ${p.subject_ref}</div>
<div>${p.explanation}</div>
<table class="kv"><tr><td>RM</td><td>${p.owner_rm_id ?? "chưa xác định"}</td></tr>
${p.stage ? html`<tr><td>Stage</td><td>${p.stage}</td></tr>` : ""}
${p.close_date ? html`<tr><td>Close Date</td><td>${p.close_date}</td></tr>` : ""}</table>
${warnings}${p.note ? html`<div>Ghi chú của Amy: ${p.note}</div>` : ""}`;
}

function itemBody(item: PageItem, p: Record<string, unknown>): SafeHtml {
  if (item.item_type === "self_report") return selfReportBody(p);
  if (item.item_type === "reason_code") return reasonBody(p);
  if (item.item_type === "nba") return nbaBody(p);
  return html`<div class="head">${p.message ?? "Thông báo hệ thống"}</div>`;
}

function rmListText(payload: Record<string, unknown>): string {
  const lines = [`${String(payload.owner_rm_id ?? "RM chưa xác định")}: ${String(payload.explanation ?? payload.action ?? "")}`];
  lines.push(`Mã: ${String(payload.subject_ref ?? "")}`);
  for (const w of (payload.warnings as string[] | undefined) ?? []) lines.push(`Lưu ý: ${w}`);
  return lines.join("\n");
}

function card(item: PageItem, user: QueueUser, csrf: string, now: Date): SafeHtml {
  const payload = JSON.parse(item.effectivePayload) as Record<string, unknown>;
  const inputs = JSON.parse(item.confidence_inputs) as Record<string, unknown>;
  const rules = JSON.parse(item.rules_fired) as string[];
  const canAct = user.role === "approver" && item.item_type !== "system_notice";
  const confirmed = item.item_type === "nba" && (item.state === "confirm" || item.state === "edit");
  const hasOutcome = item.events.some((e) => e.action === "rm_outcome");
  const link = typeof payload.source_link === "string" && payload.source_link.startsWith("https://") ? payload.source_link : null;
  return html`<article class="card" id="item-${item.id}">
<div class="meta">${displayState(item)} · tuổi ${ageText(item.created_at, now)} · điểm tự tin ${item.confidence.toFixed(2)} ${item.confidence < METRIC_PARAMS.confidenceEscalateBelow ? html`<strong>(dưới 0,80)</strong>` : ""}</div>
${itemBody(item, payload)}
<details class="tech"><summary>Chi tiết kỹ thuật</summary><div class="meta">Luật: ${rules.length ? rules.join(", ") : "không"} · Thành phần điểm: ${JSON.stringify(inputs)}</div><pre>${JSON.stringify(payload, null, 2)}</pre></details>
${link ? html`<div><a href="${link}" rel="noreferrer">Mở bản gốc trong Teams</a></div>` : ""}
${confirmed ? html`<details><summary>Danh sách cho RM</summary><textarea readonly rows="4">${rmListText(payload)}</textarea></details>` : ""}
${canAct ? html`<div>
${actionForm(item, "confirm", csrf, "Xác nhận")}
<details style="display:inline-block"><summary>Sửa</summary>${actionForm(item, "edit", csrf, "Lưu bản sửa", editFields(item, payload))}</details>
${actionForm(item, "reject", csrf, "Bác", html`<input name="reason" required maxlength="300" placeholder="Lý do bác"> `)}
${item.confidence < METRIC_PARAMS.confidenceEscalateBelow ? actionForm(item, "escalate", csrf, "Escalate lên Mark") : ""}
${actionForm(item, "pii_flag", csrf, "Báo PII")}
${confirmed && !hasOutcome ? actionForm(item, "rm_outcome", csrf, "Ghi phản hồi RM", html`<select name="outcome">${RM_OUTCOMES.map((o) => html`<option value="${o}">${OUTCOME_TEXT[o]}</option>`)}</select> `) : ""}
</div>` : ""}
</article>`;
}

export function renderQueuePage(args: {
  queueDate: string;
  items: PageItem[];
  user: QueueUser;
  csrf: string;
  now: Date;
  snapshotAt: string | null;
  status: SourceStatus;
  canPaste?: boolean;
  canImport?: boolean;
  canWo?: boolean;
}): string {
  const visible = args.items.filter((i) => i.state !== "pii_flag");
  const statusText =
    args.status === "red" ? "Thiếu nguồn dữ liệu" : args.status === "yellow" ? "Dữ liệu CRM cũ hơn 24 giờ" : "Nguồn dữ liệu đầy đủ";
  const body = html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hàng chờ ${ddmm(args.queueDate)}</title><style>${new SafeHtml(STYLE)}</style></head><body>
<h1>Hàng chờ ngày ${ddmm(args.queueDate)}</h1>
<nav>${args.user.role === "approver" && args.canPaste ? html`<a href="/paste">Dán tự báo của RM</a>` : ""}${args.user.role === "approver" && args.canImport ? html`<a href="/import">Nạp dữ liệu CRM (CSV)</a>` : ""}<a href="/leads">Lead trùng</a>${args.canWo ? html`<a href="/wo">WO tồn đọng</a>` : ""}<a href="/partners">Đối tác</a><a href="/jurisdictions">45 tài phán</a><a href="/banks">Gợi ý ngân hàng</a><a href="/data">Độ phủ ID</a><a href="/channels">Tài khoản kênh</a><a href="/ads-check">Kiểm quảng cáo</a><a href="/ads-overview">Quảng cáo tuần</a><a href="/competitors">Giá đối thủ</a><a href="/billing">Đơn hàng và invoice</a><a href="/brief">Brief sáng</a><a href="/digest">Digest tuần</a></nav>
<div class="status ${args.status}">${statusText} · Snapshot CRM: ${args.snapshotAt ?? "chưa có"} · Người dùng: ${args.user.id}</div>
${GROUPS.map((g) => {
    const list = visible.filter((i) => i.item_type === g.type);
    return html`<section><h2>${g.title} (${list.length})</h2>${list.length ? list.map((i) => card(i, args.user, args.csrf, args.now)) : html`<p class="meta">Không có mục.</p>`}</section>`;
  })}
<form method="post" action="/logout"><input type="hidden" name="csrf" value="${args.csrf}"><button type="submit">Đăng xuất</button></form>
</body></html>`;
  return body.value;
}

export function shell(title: string, body: SafeHtml): string {
  return html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${new SafeHtml(STYLE)} textarea{min-height:320px} label{display:block;margin:8px 0}</style></head><body>${body}</body></html>`.value;
}

export function renderLoginPage(message: string | null): string {
  return shell("Đăng nhập Hàng chờ", html`<h1>Đăng nhập Hàng chờ</h1>
${message ? html`<p class="warn">${message}</p>` : ""}
<form method="post" action="/login">
<label>Người dùng <select name="user"><option value="amy">Amy</option><option value="mark">Mark</option></select></label>
<label>Mật khẩu <input type="password" name="password" required autocomplete="current-password"></label>
<button type="submit">Đăng nhập</button></form>`);
}

export function renderPastePage(args: { csrf: string; reportDate: string; message: string | null }): string {
  return shell("Dán tự báo", html`<h1>Dán tự báo của RM</h1>
<p>Mở thread tự báo của ngày trong Teams, chọn toàn bộ các trả lời, sao chép rồi dán vào ô dưới. Mỗi bản tự báo bắt đầu bằng dòng <code>[dd/mm] [RM] Tên</code>. Nội dung dán vào được lọc thông tin khách trước khi xử lý và không được lưu nguyên văn. Xử lý mất khoảng nửa phút.</p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<form method="post" action="/paste"><input type="hidden" name="csrf" value="${args.csrf}">
<label>Ngày tự báo <input type="date" name="report_date" value="${args.reportDate}" required></label>
<label>Nội dung <textarea name="text" required maxlength="100000"></textarea></label>
<button type="submit">Xử lý</button> <a href="/queue">Quay lại Hàng chờ</a></form>`);
}

export function renderImportPage(args: { csrf: string; message: string | null; crm?: boolean; wo?: boolean }): string {
  const crm = args.crm ?? true;
  const file = (name: string, label: string, note: string) =>
    html`<label>${label} <input type="file" name="${name}" accept=".csv,text/csv"> <span class="meta">${note}</span></label>`;
  return shell("Nạp dữ liệu CRM", html`<h1>Nạp dữ liệu CRM (CSV)</h1>
<p>Xuất danh sách từ trang quản trị CRM. Nếu file là Excel, mở bằng Excel rồi chọn "Lưu thành", định dạng "CSV UTF-8". Chỉ những cột cần dùng được đọc; email và số điện thoại được mã hoá ngay khi nạp; file gốc không được lưu.</p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<form method="post" action="/import" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
${crm ? html`<h2>Cho NBA</h2><p class="meta">File Opportunity là bắt buộc nếu nạp nhóm này; ba file còn lại có thì nạp. Nạp xong, NBA của hôm nay được sinh lại.</p>
${file("opportunity", "Opportunity", "bắt buộc cho NBA")}
${file("client", "Client (Account)", "để biết khách cũ, cờ reseller")}
${file("lead", "Lead", "để cảnh báo trùng khách")}
${file("orderitem", "Order hoặc OrderItem", "để biết khách đã mua dịch vụ gì")}` : ""}
${args.wo ? html`<h2>Cho WO tồn đọng (Bank Team)</h2><p class="meta">Có file nào nạp file đó. File PIC gồm hai cột "Work Order Number" và "PIC Mới"; chỉ cần nạp lại khi đổi người.</p>
${file("workorder", "Work Order", "xuất từ CRM; cột Work Order Number, Status, Created Date, Product: Product Name")}
${file("wopic", "Ghép WO và PIC", "chép từ sheet theo dõi của Bank Team")}` : ""}
<button type="submit">Nạp</button> <a href="/queue">Quay lại Hàng chờ</a></form>`);
}

const WO_REASON_TEXT: Record<string, string> = WO_TOUCH_REASONS;

function woTable(rows: WoBoardRow[], canAct: boolean, csrf: string): SafeHtml {
  if (rows.length === 0) return html`<p class="meta">Không có WO.</p>`;
  // Bảng rộng hơn màn hình điện thoại thì cuộn ngang trong khung, trang không tràn.
  return html`<div style="overflow-x:auto"><table class="kv"><tr><td><strong>WO</strong></td><td><strong>PIC</strong></td><td><strong>Không cập nhật</strong></td><td><strong>Status</strong></td><td><strong>Ngày tạo</strong></td><td><strong>Dịch vụ</strong></td><td><strong>Đang chờ</strong></td>${canAct ? html`<td></td>` : ""}</tr>
${rows.map((r) => html`<tr id="wo-${r.work_order_number}"><td>${r.work_order_number}</td><td>${r.pic ?? html`<span class="warn">chưa có PIC</span>`}</td><td>${r.idle_days} ngày</td><td>${r.status}</td><td>${r.created_date ?? "?"}</td><td class="meta">${r.product_name ?? ""}</td><td>${r.last_reason ? (WO_REASON_TEXT[r.last_reason] ?? r.last_reason) : "chưa rõ"}</td>
${canAct ? html`<td><form method="post" action="/wo/touch"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="wo" value="${r.work_order_number}"><select name="reason">${Object.entries(WO_REASON_TEXT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select> <button type="submit">Đã cập nhật</button></form></td>` : ""}</tr>`)}</table></div>`;
}

export function renderWoPage(args: {
  csrf: string;
  canAct: boolean;
  importedAt: string | null;
  escalate: WoBoardRow[];
  remind: WoBoardRow[];
  backlog: WoBoardRow[];
  okCount: number;
  reminders: { pic: string; text: string }[];
  remindAfterDays: number;
  escalateAfterDays: number;
}): string {
  return shell("WO tồn đọng", html`<h1>WO tồn đọng của Bank Team</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${args.importedAt ? "green" : "red"}">Lượt nạp Work Order gần nhất: ${args.importedAt ?? "chưa có"}</div>
<p class="meta">"Không cập nhật" tính từ lần gần nhất Status đổi giữa hai lượt nạp, hoặc lần Amy bấm "Đã cập nhật"; WO có từ trước lượt nạp đầu tính từ lượt nạp đầu. Ngưỡng tạm, chờ Amy chốt: nhắc PIC từ ${args.remindAfterDays} ngày, báo Amy từ ${args.escalateAfterDays} ngày.</p>
<section><h2>Báo Amy: từ ${args.escalateAfterDays} ngày (${args.escalate.length})</h2>${woTable(args.escalate, args.canAct, args.csrf)}</section>
<section><h2>Nhắc PIC: từ ${args.remindAfterDays} ngày (${args.remind.length})</h2>${woTable(args.remind, args.canAct, args.csrf)}
${args.reminders.length ? html`<details><summary>Tin nhắc theo từng PIC (chép rồi gửi)</summary>${args.reminders.map((r) => html`<p><strong>${r.pic}</strong></p><textarea readonly rows="6" style="min-height:0">${r.text}</textarea>`)}</details>` : ""}</section>
<section><h2>Tồn từ trước, chưa rà (${args.backlog.length})</h2><p class="meta">WO đã mở trước lượt nạp đầu tiên và chưa ai ghi nhận; cũ nhất lên đầu. Rà dần, bấm "Đã cập nhật" để đưa ra khỏi danh sách.</p>${woTable(args.backlog, args.canAct, args.csrf)}</section>
<p class="meta">WO đang mở khác, còn trong hạn: ${args.okCount}.</p>`);
}

const TYPE_TEXT: Record<string, string> = { self_report: "Tự báo RM", reason_code: "Mã lý do", nba: "NBA", system_notice: "Thông báo hệ thống" };
const DECISION_TEXT: Record<string, string> = { ...STATE_TEXT, pii_flag: "báo PII" };
const hours = (h: number | null) => (h === null ? "không có" : h < 48 ? `${Math.round(h)} giờ` : `${Math.round(h / 24)} ngày`);
const pct = (r: number | null) => (r === null ? "không có mục" : `${Math.round(r * 100)}%`);

export function renderBriefPage(b: Brief): string {
  return shell("Brief sáng", html`<h1>Brief sáng ${ddmm(b.date)}</h1>
<p><a href="/queue">Mở Hàng chờ</a></p>
<section><h2>Hàng chờ hôm nay</h2>
${b.today.length ? html`<table class="kv">${b.today.map((t) => html`<tr><td>${TYPE_TEXT[t.type] ?? t.type}</td><td>${t.total} mục</td><td>${t.pending} chờ duyệt</td></tr>`)}</table>` : html`<p class="meta">Chưa có mục nào hôm nay.</p>`}
<p>Tổng ${b.todayTotal.total} mục, ${b.todayTotal.pending} chờ duyệt. Dự kiến mỗi ngày làm việc khoảng ${b.forecastItems} mục (trung bình 7 ngày qua).</p></section>
<section><h2>Cần chú ý</h2><ul>
<li>Còn chờ từ ngày trước: <strong>${b.carryover.count}</strong> mục${b.carryover.oldestHours !== null ? html`, lâu nhất ${hours(b.carryover.oldestHours)}` : ""}.</li>
<li>Quá hạn đã áp mặc định "giữ nháp" trong 24 giờ qua: ${b.defaultsLast24h} mục (Amy vẫn quyết lại được).</li>
<li>Đã escalate lên Mark trong 7 ngày qua: <strong>${b.escalatedWaiting}</strong> mục.</li>
<li>WO tồn đọng: báo Amy ${b.wo.escalate}, nhắc PIC ${b.wo.remind}, tồn từ trước chưa rà ${b.wo.backlog}${b.wo.importedAt ? "" : " (chưa nạp file Work Order)"}.</li>
<li>Mi1-mkt-05: ${b.mkt05.priceLocked}/${b.mkt05.total} tài phán đã chốt giá${b.mkt05.priceImported ? "" : " (chưa nạp bảng giá)"}, bộ SKD ${b.mkt05.skdDone}/${b.mkt05.skdTotal}, ${b.mkt05.sandboxOpen === null ? "sandbox8 chưa nạp issue log" : `sandbox8 còn ${b.mkt05.sandboxOpen} bug mở (${b.mkt05.sandboxOpenSevere} Critical, High), ${b.mkt05.sandboxReady ? "sẵn sàng" : "chưa sẵn sàng"} nghiệm thu`}. <a href="/jurisdictions">Xem</a></li>
<li>Tài khoản kênh (CRON-02): ${b.channels.checked ? `${b.channels.ok} ổn, ${b.channels.issues.length} có vấn đề${b.channels.issues.length ? ` (${b.channels.issues.join(", ")})` : ""}, ${b.channels.stale} quá ${b.channels.staleHours} giờ chưa kiểm, ${b.channels.notTracked} tài khoản chưa theo dõi` : "chưa có lần kiểm nào"}. <a href="/channels">Xem</a></li>
<li>Mi1-data-01: ${b.data01.imported ? `độ phủ ID 7 ngày ${b.data01.rate === null ? "chưa có" : `${(b.data01.rate * 100).toFixed(1)}%`} (${b.data01.linked}/${b.data01.sessions} phiên)${b.data01.degraded ? ", TRACKING_DEGRADED" : ""}` : "chưa nạp file sự kiện"}. <a href="/data">Xem</a></li>
<li>Chi phí Claude API tháng này: ${b.monthCostUsd.toFixed(2)} trên trần ${b.monthCapUsd} USD.</li>
</ul></section>`);
}

export function renderDigestPage(d: Digest): string {
  return shell("Digest tuần", html`<h1>Digest tuần ${ddmm(d.weekStart)} tới ${ddmm(d.weekEnd)}</h1>
<p><a href="/queue">Mở Hàng chờ</a> · <a href="/digest?week=${d.prevWeek}">Tuần trước</a></p>
<div class="status ${d.gate2 ? "green" : "yellow"}">Cổng 2 tuần này: ${d.gate2 ? "đạt" : "chưa đạt"} (Amy mở Hàng chờ ${d.openDays} ngày, cần 3; quyết ${pct(d.decisionRate)} mục, cần 80%).</div>
<section><h2>Mục và quyết định</h2><table class="kv">
<tr><td>Mục được tạo</td><td>${d.created.length ? d.created.map((c) => `${TYPE_TEXT[c.type] ?? c.type} ${c.count}`).join(", ") : "không có"}</td></tr>
<tr><td>Quyết định của người</td><td>${d.decisions.length ? d.decisions.map((c) => `${DECISION_TEXT[c.action] ?? c.action} ${c.count}`).join(", ") : "không có"}</td></tr>
<tr><td>Quá hạn, áp mặc định</td><td>${d.defaultsApplied}</td></tr>
<tr><td>Tuổi quyết định</td><td>trung vị ${hours(d.medianAgeHours)}, lâu nhất ${hours(d.maxAgeHours)}</td></tr>
<tr><td>Phản hồi RM cho NBA</td><td>${d.nbaOutcomes.length ? d.nbaOutcomes.map((o) => `${OUTCOME_TEXT[o.outcome as keyof typeof OUTCOME_TEXT] ?? o.outcome} ${o.count}`).join(", ") : "chưa có"}</td></tr>
<tr><td>Lượt ghi nhận WO</td><td>${d.woTouches}</td></tr>
<tr><td>Chi phí Claude API</td><td>${d.costUsd.toFixed(2)} USD</td></tr></table></section>
<section><h2>Ngâm lâu nhất</h2>${d.longest.length ? html`<table class="kv">${d.longest.map((l) => html`<tr><td><a href="/queue?date=${l.queueDate}#item-${l.id}">${TYPE_TEXT[l.type] ?? l.type} ngày ${ddmm(l.queueDate)}</a></td><td>${hours(l.ageHours)}</td><td>${DECISION_TEXT[l.state] ?? l.state}</td></tr>`)}</table>` : html`<p class="meta">Không có mục.</p>`}</section>`);
}

export type LeadDupGroup = { match_on: "email" | "phone"; lead_ids: string[]; owner_rm_ids: string[] };

// Lead trùng (spec mục 11, Mi1-sa-01; D-29): chỉ xem. Amy quyết gộp và gộp trên CRM; Growth không ghi vào CRM.
export function renderLeadDupPage(args: { snapshotAt: string | null; groups: LeadDupGroup[] }): string {
  const crossRm = args.groups.filter((g) => g.owner_rm_ids.length > 1);
  const sameRm = args.groups.filter((g) => g.owner_rm_ids.length <= 1);
  const table = (list: LeadDupGroup[]) =>
    list.length
      ? html`<table class="kv"><tr><td><strong>Trùng theo</strong></td><td><strong>Lead</strong></td><td><strong>RM</strong></td></tr>
${list.map((g) => html`<tr><td>${g.match_on === "email" ? "email" : "số điện thoại"}</td><td>${g.lead_ids.join(", ")}</td><td>${g.owner_rm_ids.join(", ")}</td></tr>`)}</table>`
      : html`<p class="meta">Không có.</p>`;
  return shell("Lead trùng", html`<h1>Lead trùng</h1>
<p><a href="/queue">Quay lại Hàng chờ</a></p>
<div class="status ${args.snapshotAt ? "green" : "red"}">Dữ liệu CRM: ${args.snapshotAt ?? "chưa nạp file Lead"}</div>
<p class="meta">Các Lead có cùng email hoặc cùng số điện thoại (so bằng mã băm, không lưu email hay số thật). Mở từng Lead trên CRM để quyết có gộp không; trang này chỉ để xem.</p>
<section><h2>Trùng giữa các RM khác nhau (${crossRm.length})</h2><p class="meta">Một khách có thể đang được hai RM chăm; xem trước.</p>${table(crossRm)}</section>
<section><h2>Trùng trong cùng một RM (${sameRm.length})</h2>${table(sameRm)}</section>`);
}

