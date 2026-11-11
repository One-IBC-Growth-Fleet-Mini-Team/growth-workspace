// Kiểm trước khi bật cho Amy (bước 9). `bun run preflight` kiểm cấu hình, DB, eval, danh bạ RM;
// thêm `--network` để dò CRM (chỉ GET, trang đầu mỗi resource) và lấy token Graph.
// Kết quả chỉ có tên kiểm tra và mã lỗi, không in giá trị biến môi trường.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ConfigError,
  getCrmConfig,
  getDbPath,
  getAuthConfig,
  getCrmColumnsPath,
  getCrmSource,
  getEntraConfig,
  getEvalResultsDir,
  getReportSource,
  getGraphChannel,
  getLlmPricing,
  getPiiHashKey,
  getQueueConfig,
  getTeamsWebhooks,
  legacyPasswordVars,
  METRIC_PARAMS,
  type Env,
} from "../config.ts";
import { readEvalStats } from "../agents/sa-01/eval/runner.ts";
import { probeCrm } from "../crm/etl.ts";
import { loadColumnMap } from "../crm/csv-import.ts";
import { listRmDirectory } from "../db/queue.ts";
import { SCHEMA_VERSION } from "../db/migrate.ts";
import { openReadOnly } from "../db/open.ts";
import type { EvalStats } from "../agents/sa-01/run.ts";
import { log } from "../log.ts";
import { createGraphClient } from "../teams/graph-read.ts";
import { createGraphTokenProvider } from "../teams/graph-token.ts";
import { isAllowedWebhook } from "../teams/notify.ts";

export type Check = { name: string; ok: boolean; error_code?: string };

function attempt(name: string, fn: () => unknown): Check[] {
  try {
    fn();
    return [{ name, ok: true }];
  } catch (e) {
    return [{ name: e instanceof ConfigError ? e.variable : name, ok: false, error_code: e instanceof ConfigError ? e.code : "CHECK_FAILED" }];
  }
}

// Kiểm cấu hình thuần (không I/O): mỗi nhóm biến của từng thành phần.
export function checkConfig(env: Env): Check[] {
  const out: Check[] = [];
  out.push(...attempt("GROWTH_DB_PATH", () => getDbPath(env)));
  out.push(...attempt("PII_HASH_KEY", () => getPiiHashKey(env)));
  out.push(...attempt("CRM_SOURCE", () => getCrmSource(env)));
  if ((env.CRM_SOURCE ?? "").trim() === "api") {
    out.push(...attempt("CRM_API_BASE", () => {
      const c = getCrmConfig(env);
      if (!c.baseUrl.startsWith("https://")) throw new ConfigError("CRM_API_BASE");
    }));
  } else {
    out.push(...attempt("CRM_CSV_COLUMNS_PATH", () => loadColumnMap(getCrmColumnsPath(env))));
  }
  out.push(...attempt("LLM_MODEL", () => getLlmPricing(env)));
  out.push(...attempt("QUEUE_BASE_URL", () => getQueueConfig(env)));
  out.push(...attempt("AUTH_MODE", () => getAuthConfig(env)));
  // Mã băm mật khẩu trong biến môi trường không còn được đọc (D-97). Không tự xoá: báo để người vận hành cấp mật khẩu tạm
  // bằng "growth-run reset-password <tài khoản>" (hoặc add-user nếu chưa có tài khoản) rồi tự xoá dòng đó trong growth.env.
  for (const n of legacyPasswordVars(env)) out.push({ name: n, ok: false, error_code: "LEGACY_UNUSED_RUN_ADD_USER_THEN_REMOVE" });
  if ((env.AUTH_MODE ?? "").trim() === "entra") out.push(...attempt("ENTRA_CLIENT_ID", () => getEntraConfig(env)));
  out.push(...attempt("REPORT_SOURCE", () => getReportSource(env)));
  if ((env.REPORT_SOURCE ?? "").trim() === "graph") {
    out.push({ name: "GRAPH_CHANNEL", ok: getGraphChannel(env) !== null, error_code: getGraphChannel(env) ? undefined : "CONFIG_MISSING_OR_INVALID" });
  }
  const hooks = getTeamsWebhooks(env);
  for (const [who, url] of [["TEAMS_WEBHOOK_URL_AMY", hooks.amy], ["TEAMS_WEBHOOK_URL_MARK", hooks.mark]] as const) {
    out.push({ name: who, ok: url !== undefined && isAllowedWebhook(url), error_code: url !== undefined && isAllowedWebhook(url) ? undefined : "WEBHOOK_MISSING_OR_NOT_ALLOWED" });
  }
  return out;
}

// Kiểm DB ở chế độ chỉ đọc: preflight không được sửa DB đang chạy (migration do job hoặc lệnh db:migrate làm).
export function checkDb(path: string): Check[] {
  if (!existsSync(path)) return [{ name: "db.exists", ok: false, error_code: "DB_MISSING" }];
  const db = openReadOnly(path);
  try {
    const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    const out: Check[] = [{ name: "db.schema_version", ok: version === SCHEMA_VERSION, error_code: version === SCHEMA_VERSION ? undefined : "DB_NEEDS_MIGRATION" }];
    if (version >= 1) {
      const ok = listRmDirectory(db).some((r) => r.active === 1 && r.teams_user_id !== null);
      out.push({ name: "db.rm_directory", ok, error_code: ok ? undefined : "RM_DIRECTORY_EMPTY" });
    }
    if (db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get()) {
      const n = (db.query("SELECT COUNT(*) AS n FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM account_disabled d WHERE d.account_id = a.id)").get() as { n: number }).n;
      out.push({ name: "db.accounts", ok: n > 0, error_code: n > 0 ? undefined : "NO_ACCOUNTS_RUN_ADD_USER" });
    }
    return out;
  } finally {
    db.close();
  }
}

// Mỗi tác vụ cần đủ cỡ mẫu riêng: compute_confidence phạt cỡ mẫu theo từng tác vụ (D-07).
export function checkEval(stats: EvalStats, resultsExist: boolean): Check[] {
  const out: Check[] = [{ name: "eval.results", ok: resultsExist, error_code: resultsExist ? undefined : "EVAL_NOT_RUN" }];
  out.push({ name: "eval.nba_gate", ok: stats.nba.passRate === 1, error_code: stats.nba.passRate === 1 ? undefined : "NBA_EVAL_NOT_100" });
  for (const task of ["self_report_parse", "reason_code"] as const) {
    const ok = stats[task].caseCount >= METRIC_PARAMS.evalMinCaseCount;
    out.push({ name: `eval.case_count.${task}`, ok, error_code: ok ? undefined : "EVAL_TOO_FEW_CASES" });
  }
  return out;
}

async function main(): Promise<number> {
  const checks = checkConfig(process.env);
  const root = new URL("../../", import.meta.url).pathname;

  if (checks.find((c) => c.name === "GROWTH_DB_PATH")?.ok) checks.push(...checkDb(getDbPath()));
  const evalDir = getEvalResultsDir(root);
  checks.push(...checkEval(readEvalStats(evalDir).stats, existsSync(join(evalDir, "latest.json"))));

  if (process.argv.includes("--network")) {
    if (getCrmSource() === "api" && checks.find((c) => c.name === "CRM_API_BASE")?.ok) {
      const probe = await probeCrm(getCrmConfig(), new Date());
      for (const [resource, r] of Object.entries(probe)) {
        checks.push({ name: `crm.${resource}`, ok: r.ok, error_code: r.ok ? undefined : r.field ? `${r.error_code}:${r.field}` : r.error_code });
      }
    }
    const channel = getReportSource() === "graph" ? getGraphChannel() : null;
    if (channel && checks.find((c) => c.name === "ENTRA_CLIENT_ID")?.ok) {
      try {
        const client = createGraphClient({ getToken: createGraphTokenProvider(getEntraConfig()) });
        await client.get(`/v1.0/teams/${encodeURIComponent(channel.teamId)}/channels/${encodeURIComponent(channel.channelId)}/messages?$top=1`);
        checks.push({ name: "graph.channel_read", ok: true });
      } catch (e) {
        checks.push({ name: "graph.channel_read", ok: false, error_code: e instanceof Error && "code" in e ? String(e.code) : "GRAPH_UNKNOWN" });
      }
    }
  }

  for (const c of checks) {
    // Mã lỗi có tên trường CRM (Lead.Email...) nên chuẩn hoá về dạng mã máy cho logger.
    log({ event: `preflight.${c.name.toLowerCase().replace(/[^a-z0-9_.]/g, "_")}`, error_code: c.ok ? undefined : (c.error_code ?? "FAILED").toUpperCase().replace(/[^A-Z0-9_]/g, "_") });
  }
  return checks.every((c) => c.ok) ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
