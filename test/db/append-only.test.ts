// T-Q-01: trigger chặn UPDATE và DELETE trên các bảng chỉ thêm (design doc mục 4).
import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openReadWrite, openReadOnly } from "../../src/db/open.ts";
import { migrate } from "../../src/db/migrate.ts";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";

const NOW = "2026-11-02T00:00:00.000Z";

function seed(db: Database): void {
  db.run("INSERT INTO etl_runs (id, source, started_at) VALUES ('etl_1', 'crm', ?)", [NOW]);
  db.run(
    "INSERT INTO etl_run_status (etl_run_id, status, finished_at, row_counts) VALUES ('etl_1', 'succeeded', ?, '{}')",
    [NOW],
  );
  db.run(
    `INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model,
       input_tokens, output_tokens, cost_usd, status, started_at, finished_at)
     VALUES ('run_1', 'mi1-sa-01', 'manual', 'p1', 'e1', 'model_x', 1, 1, 0, 'succeeded', ?, ?)`,
    [NOW, NOW],
  );
  db.run("INSERT INTO rm_directory (rm_id, display_name, teams_user_id) VALUES ('RM_A', 'RM_A', 'aad_a')");
  db.run(
    `INSERT INTO rm_reports (id, report_date, rm_id, source_message_ref, source_link, source_version,
       parsed, pii_check, redaction_stats, parser_version, agent_run_id, created_at)
     VALUES ('rep_1', '2026-11-01', 'RM_A', 'ref_1', 'https://example.invalid/m/1', 'v1',
       '{}', 'passed', '{}', 'parser_v1', 'run_1', ?)`,
    [NOW],
  );
  db.run(
    `INSERT INTO queue_items (id, item_type, queue_date, dedupe_key, subject_ref, payload, rules_fired,
       confidence, confidence_inputs, assignee, default_action, due_at, etl_run_id, agent_run_id, created_at)
     VALUES ('item_1', 'nba', '2026-11-02', 'dk_1', 'opp_1', '{}', '[]', 0.9, '{}', 'amy', 'giữ nháp', ?, 'etl_1', 'run_1', ?)`,
    [NOW, NOW],
  );
  db.run(
    "INSERT INTO queue_events (id, item_id, actor, action, created_at) VALUES ('ev_1', 'item_1', 'amy', 'confirm', ?)",
    [NOW],
  );
}

const APPEND_ONLY: Array<{ table: string; set: string; where: string }> = [
  { table: "queue_items", set: "payload = '{\"x\":1}'", where: "id = 'item_1'" },
  { table: "queue_events", set: "actor = 'mark'", where: "id = 'ev_1'" },
  { table: "rm_reports", set: "parsed = NULL", where: "id = 'rep_1'" },
  { table: "agent_runs", set: "cost_usd = 99", where: "id = 'run_1'" },
  { table: "etl_runs", set: "source = 'x'", where: "id = 'etl_1'" },
  { table: "etl_run_status", set: "status = 'failed'", where: "etl_run_id = 'etl_1'" },
];

describe("T-Q-01 bảng chỉ thêm", () => {
  for (const { table, set, where } of APPEND_ONLY) {
    test(`T-Q-01 ${table}: UPDATE bị chặn`, () => {
      const db = openReadWrite(":memory:");
      migrate(db);
      seed(db);
      expect(() => db.run(`UPDATE ${table} SET ${set} WHERE ${where}`)).toThrow(/append_only/);
    });

    test(`T-Q-01 ${table}: DELETE bị chặn`, () => {
      const db = openReadWrite(":memory:");
      migrate(db);
      seed(db);
      expect(() => db.run(`DELETE FROM ${table} WHERE ${where}`)).toThrow(/append_only/);
      const row = db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number };
      expect(row.n).toBe(1);
    });
  }

  test("T-Q-01 INSERT vẫn được phép trên bảng chỉ thêm", () => {
    const db = openReadWrite(":memory:");
    migrate(db);
    seed(db);
    db.run(
      "INSERT INTO queue_events (id, item_id, actor, action, created_at) VALUES ('ev_2', NULL, 'amy', 'queue_opened', ?)",
      [NOW],
    );
    const row = db.query("SELECT COUNT(*) AS n FROM queue_events").get() as { n: number };
    expect(row.n).toBe(2);
  });

  test("T-Q-01 bảng snapshot crm_* không thuộc nhóm chỉ thêm (dọn snapshot theo etl_run_id, D-09)", () => {
    const db = openReadWrite(":memory:");
    migrate(db);
    seed(db);
    db.run(
      "INSERT INTO crm_opportunities (etl_run_id, opportunity_id, stage) VALUES ('etl_1', 'opp_1', 'S1')",
    );
    db.run("DELETE FROM crm_opportunities WHERE etl_run_id = 'etl_1'");
    const row = db.query("SELECT COUNT(*) AS n FROM crm_opportunities").get() as { n: number };
    expect(row.n).toBe(0);
  });

  test("T-Q-01 migrate chạy lại không lỗi và không tạo lại bảng", () => {
    const db = openReadWrite(":memory:");
    migrate(db);
    seed(db);
    migrate(db);
    const row = db.query("SELECT COUNT(*) AS n FROM queue_items").get() as { n: number };
    expect(row.n).toBe(1);
  });

  test("T-MCP-02 (phần DB, bước 1) openReadOnly: INSERT bị lỗi", () => {
    const path = `${tmpdir()}/gw-test-${crypto.randomUUID()}.sqlite`;
    const rw = openReadWrite(path);
    migrate(rw);
    rw.close();
    const ro = openReadOnly(path);
    expect(() =>
      ro.run("INSERT INTO etl_runs (id, source, started_at) VALUES ('etl_x', 'crm', ?)", [NOW]),
    ).toThrow();
    ro.close();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  });
});
