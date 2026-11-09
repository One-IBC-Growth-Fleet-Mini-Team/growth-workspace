// Quy tắc thao tác trên mục hàng chờ (design doc mục 4.4, 5.7). Mỗi thao tác hợp lệ ghi đúng một queue_event.
// Form chỉ có trường cố định theo loại mục; ghi chú giới hạn độ dài và qua R1, R3 trước khi lưu (T-PII-06).
import type { Database } from "bun:sqlite";
import { currentTuning } from "../db/tuning.ts";
import { getQueueItem, insertQueueEvent, listItemEvents, type QueueAction, type QueueItemRow } from "../db/queue.ts";
import { guardOutput } from "../pii/name-guard.ts";
import { REASON_CODES } from "../agents/sa-01/catalog.ts";
import type { NbaAction } from "../agents/sa-01/nba/types.ts";
import type { QueueUser } from "./auth.ts";

export const RM_OUTCOMES = ["rm_accepted", "rm_already_handled", "rm_not_sellable", "rm_no_reply"] as const;
export const NBA_ACTIONS: readonly NbaAction[] = [
  "follow_up",
  "follow_up_unresponsive",
  "remind_invoice",
  "upsell_bank",
  "handoff_team",
  "confirm_reseller_flag",
];
export const ITEM_ACTIONS = ["confirm", "edit", "reject", "escalate", "rm_outcome", "pii_flag"] as const;
export type ItemAction = (typeof ITEM_ACTIONS)[number];

const NOTE_MAX = 300;
const COUNT_FIELDS = ["outreach", "posts", "conversations", "not_in_crm"] as const;

export type ActionResult = { ok: true; item: QueueItemRow } | { ok: false; status: 401 | 403 | 404 | 409 | 422; error: string };

const fail = (status: 403 | 404 | 409 | 422, error: string): ActionResult => ({ ok: false, status, error });

// Văn bản tự do của người dùng: giới hạn độ dài, không có PII theo R1 và R3.
function cleanText(raw: string | null, rmNames: readonly string[], required: boolean): string | null {
  const v = (raw ?? "").trim();
  if (required && v === "") return null;
  if (v.length > NOTE_MAX) return null;
  if (v !== "" && guardOutput({ text: v }, { rmNames }).pii_check !== "passed") return null;
  return v;
}

function editedPayload(item: QueueItemRow, form: FormData, note: string): Record<string, unknown> | string {
  const original = JSON.parse(item.payload) as Record<string, unknown>;
  switch (item.item_type) {
    case "nba": {
      const action = String(form.get("action") ?? "");
      if (!(NBA_ACTIONS as readonly string[]).includes(action)) return "BAD_ACTION";
      return { ...original, action, note };
    }
    case "reason_code": {
      const primary = String(form.get("primary") ?? "");
      if (!(REASON_CODES as readonly string[]).includes(primary)) return "BAD_CODE";
      const isFinal = form.get("is_final");
      if (isFinal !== "true" && isFinal !== "false") return "BAD_IS_FINAL";
      const opportunityId = String(form.get("opportunity_id") ?? "").trim();
      if (opportunityId !== "" && !/^[A-Za-z0-9_-]{1,64}$/.test(opportunityId)) return "BAD_OPPORTUNITY";
      const proposal = { ...(original.proposal as Record<string, unknown> | undefined), primary, is_final: isFinal === "true" };
      return { ...original, proposal, opportunity_id: opportunityId === "" ? null : opportunityId, note };
    }
    case "self_report": {
      const sections = { ...(original.sections as Record<string, Record<string, unknown> | null> | undefined) };
      for (const k of COUNT_FIELDS) {
        const raw = form.get(`count_${k}`);
        if (raw === null) continue;
        const s = String(raw).trim();
        if (s !== "" && !/^\d{1,5}$/.test(s)) return "BAD_COUNT";
        sections[k] = { ...(sections[k] ?? { note: "" }), count: s === "" ? null : Number(s) };
      }
      return { ...original, sections, note };
    }
    default:
      return "NOT_EDITABLE";
  }
}

export function recordItemAction(
  db: Database,
  args: { itemId: string; action: ItemAction; user: QueueUser; form: FormData; now: Date; rmNames: readonly string[] },
): ActionResult {
  if (args.user.role !== "approver") return fail(403, "VIEWER_CANNOT_ACT");
  const item = getQueueItem(db, args.itemId);
  if (!item) return fail(404, "NOT_FOUND");
  const history = listItemEvents(db, item.id);
  let payload: string | null = null;
  // Mục đã báo PII bị ẩn và chờ người vận hành xoá: không thao tác gì thêm.
  if (item.state === "pii_flag") return fail(409, "ITEM_FLAGGED_PII");
  // Bấm lặp cùng một quyết định (tab cũ, bấm hai lần) không ghi thêm sự kiện.
  if ((args.action === "confirm" || args.action === "reject" || args.action === "escalate") && item.state === args.action) {
    return fail(409, "ALREADY_RECORDED");
  }

  switch (args.action) {
    case "confirm":
    case "pii_flag":
      break;
    case "escalate":
      if (item.confidence >= currentTuning(db).confidenceEscalateBelow) return fail(422, "ESCALATE_ONLY_BELOW_THRESHOLD");
      break;
    case "reject": {
      const reason = cleanText(args.form.get("reason") as string | null, args.rmNames, true);
      if (reason === null) return fail(422, "REASON_REQUIRED_OR_INVALID");
      payload = JSON.stringify({ reason });
      break;
    }
    case "edit": {
      const note = cleanText(args.form.get("note") as string | null, args.rmNames, false);
      if (note === null) return fail(422, "NOTE_INVALID");
      const edited = editedPayload(item, args.form, note);
      if (typeof edited === "string") return fail(422, edited);
      payload = JSON.stringify(edited);
      break;
    }
    case "rm_outcome": {
      if (item.item_type !== "nba" || (item.state !== "confirm" && item.state !== "edit")) return fail(409, "NOT_CONFIRMED");
      if (history.some((e) => e.action === "rm_outcome")) return fail(409, "OUTCOME_ALREADY_RECORDED");
      const outcome = String(args.form.get("outcome") ?? "");
      if (!(RM_OUTCOMES as readonly string[]).includes(outcome)) return fail(422, "BAD_OUTCOME");
      payload = JSON.stringify({ outcome });
      break;
    }
  }

  insertQueueEvent(db, {
    id: Bun.randomUUIDv7(),
    item_id: item.id,
    actor: args.user.id,
    action: args.action as QueueAction,
    payload,
    created_at: args.now.toISOString(),
  });
  return { ok: true, item };
}

export function recordQueueOpened(db: Database, user: QueueUser, queueDate: string, now: Date): void {
  insertQueueEvent(db, {
    id: Bun.randomUUIDv7(),
    item_id: null,
    actor: user.id,
    action: "queue_opened",
    payload: JSON.stringify({ queue_date: queueDate }),
    created_at: now.toISOString(),
  });
}
