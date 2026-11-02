// Trang Hàng chờ (design doc mục 5.7): nhóm theo loại, thẻ có đề xuất, luật, điểm tự tin, tuổi mục, link, nút.
import { METRIC_PARAMS } from "../../config.ts";
import { REASON_CODES, REASON_LABELS, type ReasonCode } from "../../agents/sa-01/catalog.ts";
import type { QueueEventRow, QueueItemRow } from "../../db/queue.ts";
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
}): string {
  const visible = args.items.filter((i) => i.state !== "pii_flag");
  const statusText =
    args.status === "red" ? "Thiếu nguồn dữ liệu" : args.status === "yellow" ? "Dữ liệu CRM cũ hơn 24 giờ" : "Nguồn dữ liệu đầy đủ";
  const body = html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hàng chờ ${ddmm(args.queueDate)}</title><style>${new SafeHtml(STYLE)}</style></head><body>
<h1>Hàng chờ ngày ${ddmm(args.queueDate)}</h1>
${args.user.role === "approver" && (args.canPaste || args.canImport) ? html`<nav>${args.canPaste ? html`<a href="/paste">Dán tự báo của RM</a>` : ""}${args.canImport ? html`<a href="/import">Nạp dữ liệu CRM (CSV)</a>` : ""}</nav>` : ""}
<div class="status ${args.status}">${statusText} · Snapshot CRM: ${args.snapshotAt ?? "chưa có"} · Người dùng: ${args.user.id}</div>
${GROUPS.map((g) => {
    const list = visible.filter((i) => i.item_type === g.type);
    return html`<section><h2>${g.title} (${list.length})</h2>${list.length ? list.map((i) => card(i, args.user, args.csrf, args.now)) : html`<p class="meta">Không có mục.</p>`}</section>`;
  })}
<form method="post" action="/logout"><input type="hidden" name="csrf" value="${args.csrf}"><button type="submit">Đăng xuất</button></form>
</body></html>`;
  return body.value;
}

function shell(title: string, body: SafeHtml): string {
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

export function renderImportPage(args: { csrf: string; message: string | null }): string {
  const file = (name: string, label: string, note: string) =>
    html`<label>${label} <input type="file" name="${name}" accept=".csv,text/csv"> <span class="meta">${note}</span></label>`;
  return shell("Nạp dữ liệu CRM", html`<h1>Nạp dữ liệu CRM (CSV)</h1>
<p>Xuất danh sách từ trang quản trị CRM. Nếu file là Excel, mở bằng Excel rồi chọn "Lưu thành", định dạng "CSV UTF-8". File Opportunity là bắt buộc; ba file còn lại có thì nạp. Chỉ những cột cần cho NBA được đọc; email và số điện thoại được mã hoá ngay khi nạp; file gốc không được lưu. Nạp xong, NBA của hôm nay được sinh lại từ dữ liệu mới.</p>
${args.message ? html`<p class="warn">${args.message}</p>` : ""}
<form method="post" action="/import" enctype="multipart/form-data"><input type="hidden" name="csrf" value="${args.csrf}">
${file("opportunity", "Opportunity", "bắt buộc")}
${file("client", "Client (Account)", "để biết khách cũ, cờ reseller")}
${file("lead", "Lead", "để cảnh báo trùng khách")}
${file("orderitem", "Order hoặc OrderItem", "để biết khách đã mua dịch vụ gì")}
<button type="submit">Nạp</button> <a href="/queue">Quay lại Hàng chờ</a></form>`);
}
