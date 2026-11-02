// Bước 9 phần không cần nguồn ngoài: dọn snapshot (D-09), xoá có kiểm soát (D-12),
// nạp danh bạ RM (Q-07), preflight trước khi bật.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { pruneSnapshots } from "../../src/db/prune.ts";
import { redactRow } from "../../src/db/redact.ts";
import { loadRmDirectory } from "../../src/db/rm-directory.ts";
import { migrate, SCHEMA_VERSION } from "../../src/db/migrate.ts";
import { openReadWrite } from "../../src/db/open.ts";
import { probeCrm } from "../../src/crm/etl.ts";
import { checkConfig, checkDb, checkEval } from "../../src/jobs/preflight.ts";
import { client, freshDb, opp, seedSnapshot, tempDbPath } from "../helpers/db.ts";
import { events, seedItem } from "../helpers/queue.ts";
import { startFakeCrm } from "../crm/fake-crm.ts";
import { RAW_BY_RESOURCE } from "../fixtures/synthetic/crm.ts";

const count = (db: ReturnType<typeof freshDb>, sql: string, ...p: string[]) => (db.query(sql).get(...p) as { n: number }).n;

describe("D-09 dọn snapshot", () => {
  test("T-Q-01 (D-09) xoá dòng crm_* của snapshot cũ hơn 14 ngày; etl_runs chỉ thêm giữ nguyên", () => {
    const db = freshDb();
    seedSnapshot(db, { opportunities: [opp("O1")], clients: [client("C1")] }, { id: "old", at: "2026-10-01T06:30:00.000Z" });
    seedSnapshot(db, { opportunities: [opp("O1")] }, { id: "mid", at: "2026-10-20T06:30:00.000Z" });
    seedSnapshot(db, { opportunities: [opp("O1")] }, { id: "new", at: "2026-11-02T06:30:00.000Z" });
    const r = pruneSnapshots(db, new Date("2026-11-02T07:00:00Z"));
    expect(r.prunedRuns).toEqual(["old"]);
    expect(count(db, "SELECT COUNT(*) AS n FROM crm_opportunities WHERE etl_run_id = 'old'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM crm_clients WHERE etl_run_id = 'old'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM crm_opportunities WHERE etl_run_id IN ('mid','new')")).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM etl_runs")).toBe(3);
  });

  test("T-Q-01 (D-09) không bao giờ xoá snapshot succeeded mới nhất, kể cả khi đã cũ", () => {
    const db = freshDb();
    seedSnapshot(db, { opportunities: [opp("O1")] }, { id: "only", at: "2026-09-01T06:30:00.000Z" });
    expect(pruneSnapshots(db, new Date("2026-11-02T07:00:00Z")).prunedRuns).toEqual([]);
    expect(count(db, "SELECT COUNT(*) AS n FROM crm_opportunities")).toBe(1);
  });
});

describe("D-12 xoá có kiểm soát", () => {
  test("T-Q-11 (D-12) thay payload của đúng một mục bằng {redacted:true}, ghi kiểm toán, trigger được dựng lại", () => {
    const db = freshDb();
    const a = seedItem(db, { payload: '{"note":"CANARY_NAME_7f3a"}' });
    const b = seedItem(db);
    redactRow(db, { table: "queue_items", id: a, reasonCode: "PII_FLAG", operator: "op_mark", now: new Date("2026-11-02T08:00:00Z") });
    expect((db.query("SELECT payload FROM queue_items WHERE id = ?").get(a) as { payload: string }).payload).toBe('{"redacted":true}');
    expect((db.query("SELECT payload FROM queue_items WHERE id = ?").get(b) as { payload: string }).payload).not.toContain("redacted");
    expect(db.query("SELECT table_name, row_id, reason_code, operator FROM redaction_log").all()).toEqual([
      { table_name: "queue_items", row_id: a, reason_code: "PII_FLAG", operator: "op_mark" },
    ]);
    expect(() => db.run("UPDATE queue_items SET payload = 'x' WHERE id = ?", [b])).toThrow(/append_only/);
    expect(() => db.run("DELETE FROM redaction_log")).toThrow(/append_only/);
  });

  test("T-Q-11 (D-12) xoá một mục hàng chờ thì xoá cả bản sửa của mục và rm_reports nguồn", () => {
    const db = freshDb();
    const id = seedItem(db, { item_type: "self_report", payload: '{"note":"x"}', subject_ref: "rep1" });
    db.run(`INSERT INTO rm_reports (id, report_date, rm_id, source_message_ref, source_link, source_version, parsed, pii_check,
              redaction_stats, parser_version, agent_run_id, created_at)
            VALUES ('rep1', '2026-11-01', NULL, 'ref', 'https://x.invalid', 'v', '{"name":"CANARY_NAME_7f3a"}', 'passed', '{}', 'p', 'run_seed', 'x')`);
    db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES ('ev1', ?, 'amy', 'edit', '{\"note\":\"CANARY_NAME_7f3a\"}', 'x')", [id]);
    db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES ('ev2', ?, 'amy', 'pii_flag', NULL, 'y')", [id]);
    const other = seedItem(db);
    redactRow(db, { table: "queue_items", id, reasonCode: "PII_FLAG", operator: "op", now: new Date() });
    const dump = JSON.stringify(db.query("SELECT * FROM queue_events").all()) + JSON.stringify(db.query("SELECT * FROM rm_reports").all());
    expect(dump).not.toContain("CANARY");
    expect(db.query("SELECT table_name, row_id FROM redaction_log ORDER BY table_name, row_id").all()).toEqual([
      { table_name: "queue_events", row_id: "ev1" },
      { table_name: "queue_items", row_id: id },
      { table_name: "rm_reports", row_id: "rep1" },
    ]);
    expect((db.query("SELECT payload FROM queue_items WHERE id = ?").get(other) as { payload: string }).payload).not.toContain("redacted");
    for (const t of ["queue_items", "queue_events", "rm_reports"]) expect(() => db.run(`UPDATE ${t} SET id = id`)).toThrow(/append_only/);
  });

  test("T-Q-11 (D-12) rm_reports.parsed và queue_events.payload cũng xoá được; dòng không tồn tại thì không đổi gì", () => {
    const db = freshDb();
    const id = seedItem(db);
    db.run("INSERT INTO queue_events (id, item_id, actor, action, payload, created_at) VALUES ('ev1', ?, 'amy', 'edit', '{\"note\":\"x\"}', 'x')", [id]);
    redactRow(db, { table: "queue_events", id: "ev1", reasonCode: "PII_FLAG", operator: "op_mark", now: new Date() });
    expect(events(db, id)[0]!.payload).toBe('{"redacted":true}');
    expect(() => redactRow(db, { table: "queue_items", id: "missing", reasonCode: "PII_FLAG", operator: "op", now: new Date() })).toThrow(/NOT_FOUND/);
    expect(count(db, "SELECT COUNT(*) AS n FROM redaction_log")).toBe(1);
    expect(() => db.run("UPDATE queue_items SET payload = 'x'")).toThrow(/append_only/);
    expect(() => redactRow(db, { table: "agent_runs" as never, id: "x", reasonCode: "PII_FLAG", operator: "op", now: new Date() })).toThrow();
  });

  test("T-Q-11 (D-12) không chạy được từ web hay agent: chỉ scripts/ import db/redact", async () => {
    const root = new URL("../../", import.meta.url).pathname;
    for await (const path of new Glob("src/**/*.ts").scan({ cwd: root })) {
      if (path === "src/db/redact.ts") continue;
      const text = await Bun.file(root + path).text();
      expect({ path, hit: /db\/redact|\.\/redact(\.ts)?["']/.test(text) }).toEqual({ path, hit: false });
    }
  });

  test("T-Q-01 (D-12) DB phiên bản cũ được nâng lên phiên bản mới nhất, dữ liệu giữ nguyên", () => {
    const db = openReadWrite(":memory:");
    migrate(db, 1);
    seedItem(db);
    migrate(db);
    expect((db.query("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
    expect(count(db, "SELECT COUNT(*) AS n FROM queue_items")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'redaction_log'")).toBe(1);
  });
});

describe("Q-07 danh bạ RM", () => {
  test("T-PARSE-04 (Q-07) nạp danh bạ: thêm, cập nhật; RM vắng trong file bị đánh dấu nghỉ", () => {
    const db = freshDb();
    loadRmDirectory(db, [
      { rm_id: "RM_A", display_name: "RM_A", teams_user_id: "aad_a" },
      { rm_id: "RM_B", display_name: "RM_B", teams_user_id: "aad_b" },
    ]);
    loadRmDirectory(db, [{ rm_id: "RM_A", display_name: "RM_A", teams_user_id: "aad_a2" }]);
    expect(db.query("SELECT rm_id, teams_user_id, active FROM rm_directory ORDER BY rm_id").all()).toEqual([
      { rm_id: "RM_A", teams_user_id: "aad_a2", active: 1 },
      { rm_id: "RM_B", teams_user_id: "aad_b", active: 0 },
    ]);
  });

  test("T-PARSE-04 (Q-07) dữ liệu sai dạng hoặc teams_user_id trùng bị từ chối, không đổi gì", () => {
    const db = freshDb();
    expect(() => loadRmDirectory(db, [{ rm_id: "", display_name: "x", teams_user_id: "a" }] as never)).toThrow();
    expect(() => loadRmDirectory(db, [
      { rm_id: "RM_A", display_name: "RM_A", teams_user_id: "same" },
      { rm_id: "RM_B", display_name: "RM_B", teams_user_id: "same" },
    ])).toThrow();
    expect(count(db, "SELECT COUNT(*) AS n FROM rm_directory")).toBe(0);
  });
});

describe("Preflight trước khi bật", () => {
  test("T-CRM-05 (preflight) dò CRM chỉ bằng GET, mỗi resource đúng một trang; báo đúng tên trường lệch schema", async () => {
    const crm = startFakeCrm({ pageSize: 1, data: { ...RAW_BY_RESOURCE, Lead: [{ Email: "canary+1@example.invalid" }] } });
    try {
      const r = await probeCrm({ baseUrl: crm.baseUrl, token: "t", sleep: async () => {} }, new Date("2026-11-02T06:30:00Z"));
      expect(crm.requests.length).toBe(4);
      for (const q of crm.requests) expect(q.method).toBe("GET");
      expect(r).toEqual({
        Opportunity: { ok: true },
        Client: { ok: true },
        Lead: { ok: false, error_code: "CRM_MAP_INVALID", field: "Lead.Id" },
        OrderItem: { ok: true },
      });
      expect(JSON.stringify(r)).not.toContain("canary");
    } finally {
      crm.stop();
    }
  });

  test("T-Q-01 (preflight) kiểm DB chỉ đọc: DB thiếu migration bị báo, không bị sửa", () => {
    const { path, cleanup } = tempDbPath();
    try {
      const rw = openReadWrite(path);
      migrate(rw, 1);
      rw.close();
      const checks = checkDb(path);
      expect(checks.find((c) => c.name === "db.schema_version")).toMatchObject({ ok: false });
      const again = openReadWrite(path);
      expect((again.query("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(1);
      again.close();
      expect(checkDb(`${path}.missing`)[0]).toMatchObject({ name: "db.exists", ok: false });
    } finally {
      cleanup();
    }
  });

  test("T-MET-06 (preflight) mỗi tác vụ LLM cần đủ cỡ mẫu eval riêng, không cộng gộp", () => {
    const stats = { self_report_parse: { passRate: 1, caseCount: 15 }, reason_code: { passRate: 1, caseCount: 15 }, nba: { passRate: 1, caseCount: 4 } };
    const bad = checkEval(stats, true).filter((c) => !c.ok).map((c) => c.name);
    expect(bad).toEqual(["eval.case_count.self_report_parse", "eval.case_count.reason_code"]);
    expect(checkEval({ ...stats, self_report_parse: { passRate: 1, caseCount: 30 }, reason_code: { passRate: 1, caseCount: 30 } }, true).every((c) => c.ok)).toBe(true);
  });

  test("T-Q-06 (preflight) kiểm cấu hình: báo tên biến thiếu hoặc sai, không in giá trị", () => {
    const env = {
      GROWTH_DB_PATH: "/data/growth.sqlite",
      CRM_SOURCE: "api",
      PII_HASH_KEY: "short",
      CRM_API_BASE: "https://api-crm.oneibc.com/v1",
      CRM_API_TOKEN: "secret-token-value",
      SESSION_SECRET: "x".repeat(40),
      QUEUE_BASE_URL: "http://insecure.example",
      TEAMS_WEBHOOK_URL_AMY: "https://evil.example/hook",
    };
    const results = checkConfig(env);
    const bad = results.filter((r) => !r.ok).map((r) => r.name);
    expect(bad).toContain("PII_HASH_KEY");
    expect(bad).toContain("QUEUE_BASE_URL");
    expect(bad).toContain("TEAMS_WEBHOOK_URL_AMY");
    expect(bad).toContain("LLM_MODEL");
    expect(results.find((r) => r.name === "CRM_API_BASE")!.ok).toBe(true);
    expect(JSON.stringify(results)).not.toContain("secret-token-value");
  });
});

describe("Backup Growth DB (Q-13)", () => {
  test("T-Q-01 (backup) bản backup đọc được, đủ dữ liệu, trigger chỉ thêm vẫn còn; giữ đúng số bản gần nhất", async () => {
    const { backupDb } = await import("../../src/db/backup.ts");
    const { mkdtempSync, readdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "gw-backup-"));
    try {
      const db = freshDb();
      seedItem(db);
      const days = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
      for (const d of days) backupDb(db, dir, new Date(`${d}T22:30:00Z`), 3);
      const files = readdirSync(dir).sort();
      expect(files).toEqual(["growth-2026-10-21T223000Z.sqlite", "growth-2026-10-22T223000Z.sqlite", "growth-2026-10-23T223000Z.sqlite"]);
      const copy = openReadWrite(join(dir, files.at(-1)!));
      expect(count(copy, "SELECT COUNT(*) AS n FROM queue_items")).toBe(1);
      expect(() => copy.run("DELETE FROM queue_items")).toThrow(/append_only/);
      expect((copy.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");
      copy.close();
      expect(() => backupDb(db, dir, new Date("2026-10-23T22:30:00Z"), 3)).toThrow(/BACKUP_EXISTS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
