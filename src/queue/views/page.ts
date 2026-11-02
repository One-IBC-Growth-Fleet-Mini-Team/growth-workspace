// Trang Hàng chờ (design doc mục 5.7): nhóm theo loại, thẻ có đề xuất, luật, điểm tự tin, tuổi mục, link, nút.
import { METRIC_PARAMS } from "../../config.ts";
import { REASON_CODES } from "../../agents/sa-01/catalog.ts";
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
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}.meta{color:#555;font-size:13px}
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
<pre>${JSON.stringify(payload, null, 2)}</pre>
<div class="meta">Luật: ${rules.length ? rules.join(", ") : "không"} · Thành phần điểm: ${JSON.stringify(inputs)}</div>
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
}): string {
  const visible = args.items.filter((i) => i.state !== "pii_flag");
  const statusText =
    args.status === "red" ? "Thiếu nguồn dữ liệu" : args.status === "yellow" ? "Dữ liệu CRM cũ hơn 24 giờ" : "Nguồn dữ liệu đầy đủ";
  const body = html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hàng chờ ${ddmm(args.queueDate)}</title><style>${new SafeHtml(STYLE)}</style></head><body>
<h1>Hàng chờ ngày ${ddmm(args.queueDate)}</h1>
<div class="status ${args.status}">${statusText} · Snapshot CRM: ${args.snapshotAt ?? "chưa có"} · Người dùng: ${args.user.id}</div>
${GROUPS.map((g) => {
    const list = visible.filter((i) => i.item_type === g.type);
    return html`<section><h2>${g.title} (${list.length})</h2>${list.length ? list.map((i) => card(i, args.user, args.csrf, args.now)) : html`<p class="meta">Không có mục.</p>`}</section>`;
  })}
<form method="post" action="/logout"><input type="hidden" name="csrf" value="${args.csrf}"><button type="submit">Đăng xuất</button></form>
</body></html>`;
  return body.value;
}
