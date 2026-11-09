// Nhật ký bài học và quyết định (D-48). Ghi chỉ thêm; nội dung qua lọc R1; bằng chứng bắt buộc là đường dẫn trong Growth.
import type { Database } from "bun:sqlite";
import { redactR1 } from "../pii/redact-regex.ts";

export type KnowledgeEntry = { id: string; kind: string; createdAt: string; actor: string; title: string; body: string; evidence: string; tags: string | null };

export function logKnowledge(db: Database, e: { kind: string; title: string; body: string; evidence: string; tags?: string }, opts: { now: Date; actor: string }): { status: "ok"; id: string } | { status: "invalid"; errorCode: string } {
  const title = e.title.trim().slice(0, 200);
  const evidence = e.evidence.trim().slice(0, 500);
  if (e.kind !== "lesson" && e.kind !== "decision") return { status: "invalid", errorCode: "KIND_INVALID" };
  if (!title || !e.body.trim()) return { status: "invalid", errorCode: "TEXT_REQUIRED" };
  // Bằng chứng phải truy vấn lại được trong Growth: đường dẫn tương đối, không phải URL ngoài.
  if (!/^\/[A-Za-z0-9/_\-?=&.%]*$/.test(evidence) || evidence.startsWith("//")) return { status: "invalid", errorCode: "EVIDENCE_REQUIRED" };
  const id = Bun.randomUUIDv7();
  db.run("INSERT INTO knowledge_log (id, kind, created_at, actor, title, body, evidence, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, e.kind, opts.now.toISOString(), opts.actor, redactR1(title).text, redactR1(e.body.trim().slice(0, 2000)).text, evidence, e.tags?.trim().slice(0, 200) || null]);
  return { status: "ok", id };
}

export function searchKnowledge(db: Database, q: string, limit = 50): KnowledgeEntry[] {
  const like = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db.query(`SELECT id, kind, created_at AS createdAt, actor, title, body, evidence, tags FROM knowledge_log
    WHERE ? = '%%' OR title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT ?`).all(like, like, like, like, limit) as KnowledgeEntry[];
}
