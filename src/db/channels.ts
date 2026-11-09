// Sức khoẻ tài khoản kênh (CRON-02; D-37): ghi lần kiểm tay và đọc lần kiểm mới nhất của mỗi tài khoản.
import type { Database } from "bun:sqlite";
import { CHANNEL_PARAMS, type ChannelParams } from "../config.ts";
import { log } from "../log.ts";
import { channelSummary, KINDS, type ChannelCheck } from "../metrics/channel-health.ts";
import { redactR1 } from "../pii/redact-regex.ts";

const STATUSES = ["ok", "restricted", "disabled"];

export function recordChannelCheck(db: Database, c: { kind: string; label: string; status: string; note: string }, opts: { now: Date; actor: string }): "ok" | "CHANNEL_INVALID" {
  const label = c.label.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!(KINDS as readonly string[]).includes(c.kind) || !STATUSES.includes(c.status) || !label) return "CHANNEL_INVALID";
  const note = redactR1(c.note.trim().slice(0, 300)).text || null;
  db.run("INSERT INTO channel_checks (id, checked_at, actor, kind, label, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [Bun.randomUUIDv7(), opts.now.toISOString(), opts.actor, c.kind, label, c.status, note]);
  log({ event: "channel_check.recorded", count: 1 });
  return "ok";
}

export type ChannelAccount = ChannelCheck & { note: string | null; actor: string };

export function buildChannelBoard(db: Database, now: Date, p: ChannelParams = CHANNEL_PARAMS) {
  const rows = db.query(`SELECT kind, label, status, checked_at AS checkedAt, note, actor FROM channel_checks c
    WHERE NOT EXISTS (SELECT 1 FROM channel_checks c2 WHERE c2.kind = c.kind AND c2.label = c.label AND (c2.checked_at > c.checked_at OR (c2.checked_at = c.checked_at AND c2.id > c.id)))`).all() as ChannelAccount[];
  const accounts = rows.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.label.localeCompare(b.label));
  return { accounts, summary: channelSummary(accounts, now, p), lastCheckedAt: accounts.map((a) => a.checkedAt).sort().pop() ?? null };
}
