// T-MCP-01 tới T-MCP-06: crm-read-mcp đọc Growth DB ở chế độ chỉ đọc, đúng 3 tool.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Database } from "bun:sqlite";
import { createCrmReadServer, openCrmReadDb } from "../../src/mcp/crm-read/server.ts";
import { checkResellerFlag, findDuplicateLeads, getPipelineByCloseDate } from "../../src/mcp/crm-read/tools.ts";
import { pipelineInPeriod } from "../../src/metrics/pipeline-in-period.ts";
import { client, freshDb, opp, seedSnapshot, tempDbPath } from "../helpers/db.ts";

const lead = (id: string, rm: string, email: string | null, phone: string | null) => ({
  lead_id: id, owner_rm_id: rm, created_at: null, status: "Open", email_hash: email, phone_hash: phone,
});

let tmp: ReturnType<typeof tempDbPath>;
let ro: Database;
let latestRunId: string;

beforeAll(() => {
  tmp = tempDbPath();
  const rw = freshDb(tmp.path);
  seedSnapshot(rw, { opportunities: [opp("OLD_1")] }, { id: "run_old", at: "2026-10-31T06:30:00.000Z" });
  latestRunId = seedSnapshot(rw, {
    opportunities: [
      opp("O1", { stage: "Quotation", close_date: "2026-11-05" }),
      opp("O2", { stage: "Negotiation", close_date: "2026-11-20", owner_rm_id: "RM_B" }),
      opp("O3", { stage: "Closed Won", close_date: "2026-11-10" }),
      opp("O4", { stage: "Quotation", close_date: "2026-12-05" }),
    ],
    clients: [client("C1", { is_reseller_end_client: null }), client("C2", { is_reseller_end_client: 1 })],
    leads: [
      lead("L1", "RM_A", "h_email_1", "h_phone_1"),
      lead("L2", "RM_B", "h_email_1", null),
      lead("L3", "RM_B", null, "h_phone_1"),
      lead("L4", "RM_A", "h_email_9", "h_phone_9"),
    ],
  }, { id: "run_new", at: "2026-11-02T06:30:00.000Z" });
  // Snapshot failed mới hơn phải bị bỏ qua.
  seedSnapshot(rw, {}, { id: "run_failed", at: "2026-11-02T07:00:00.000Z", status: "failed" });
  rw.close();
  ro = openCrmReadDb(tmp.path);
});

afterAll(() => {
  ro.close();
  tmp.cleanup();
});

async function connect() {
  const server = createCrmReadServer(ro);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name: "test", version: "0" });
  await c.connect(b);
  return c;
}

describe("T-MCP-01 danh sách tool", () => {
  test("T-MCP-01 tools/list trả đúng 3 tool với đúng tên", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_reseller_flag", "find_duplicate_leads", "get_pipeline_by_close_date"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  test("T-MCP-01 (luật 5) schema tool pipeline không có tham số Created Date", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    const t = tools.find((x) => x.name === "get_pipeline_by_close_date")!;
    const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
    expect(props.sort()).toEqual(["owner_rm_id", "period_end", "period_start"]);
    expect(JSON.stringify(t.inputSchema)).not.toMatch(/created/i);
  });
});

describe("T-MCP-02 kết nối chỉ đọc", () => {
  test("T-MCP-02 INSERT qua kết nối của server bị lỗi", () => {
    expect(() => ro.run("INSERT INTO etl_runs (id, source, started_at) VALUES ('x', 'crm', 'x')")).toThrow();
    expect(() => ro.run("DELETE FROM crm_opportunities")).toThrow();
  });
});

describe("T-MCP-03 pipeline", () => {
  test("T-MCP-03 khớp pipeline_in_period trên Opportunity mở của cùng snapshot, luôn trả etl_run_id", () => {
    const r = getPipelineByCloseDate(ro, { period_start: "2026-11-01", period_end: "2026-11-30" });
    expect(r.etl_run_id).toBe(latestRunId);
    expect(r.snapshot_at).toBe("2026-11-02T06:30:00.000Z");
    const openRows = [
      opp("O1", { stage: "Quotation", close_date: "2026-11-05" }),
      opp("O2", { stage: "Negotiation", close_date: "2026-11-20", owner_rm_id: "RM_B" }),
      opp("O4", { stage: "Quotation", close_date: "2026-12-05" }),
    ];
    expect(r.groups).toEqual(pipelineInPeriod(openRows, { periodStart: "2026-11-01", periodEnd: "2026-11-30" }));
  });

  test("T-MCP-03 qua giao thức MCP cũng trả etl_run_id; tham số lạ bị từ chối", async () => {
    const c = await connect();
    const res = await c.callTool({ name: "get_pipeline_by_close_date", arguments: { period_start: "2026-11-01", period_end: "2026-11-30", owner_rm_id: "RM_B" } });
    const body = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(body.etl_run_id).toBe(latestRunId);
    expect(body.groups).toEqual([{ stage: "Negotiation", count: 1, opportunity_ids: ["O2"] }]);
    const bad = await c.callTool({ name: "get_pipeline_by_close_date", arguments: { period_start: "2026-11-01", period_end: "2026-11-30", created_from: "2026-11-01" } });
    expect(bad.isError).toBe(true);
  });
});

describe("T-MCP-04 snapshot mới nhất", () => {
  test("T-MCP-04 chỉ đọc snapshot succeeded mới nhất; failed bị bỏ qua", () => {
    const r = getPipelineByCloseDate(ro, { period_start: "2026-01-01", period_end: "2026-12-31" });
    expect(r.etl_run_id).toBe("run_new");
    expect(r.groups.flatMap((g) => g.opportunity_ids)).not.toContain("OLD_1");
  });

  test("T-MCP-04 không có snapshot succeeded thì báo lỗi rõ ràng", () => {
    const empty = freshDb();
    expect(() => getPipelineByCloseDate(empty, { period_start: "2026-11-01", period_end: "2026-11-30" })).toThrow(/NO_SNAPSHOT/);
  });
});

describe("T-MCP-05 cờ reseller", () => {
  test("T-MCP-05 trường trống trả unknown; client không có trong snapshot trả unknown, source missing", () => {
    expect(checkResellerFlag(ro, { client_id: "C1" })).toMatchObject({ client_id: "C1", is_reseller_end_client: "unknown", source: "missing", etl_run_id: "run_new" });
    expect(checkResellerFlag(ro, { client_id: "C2" })).toMatchObject({ is_reseller_end_client: true, source: "crm_field" });
    expect(checkResellerFlag(ro, { client_id: "C_NONE" })).toMatchObject({ is_reseller_end_client: "unknown", source: "missing" });
  });
});

describe("T-MCP-06 Lead trùng", () => {
  test("T-MCP-06 gom theo email hoặc SĐT, không trả mã băm", () => {
    const r = findDuplicateLeads(ro, { lead_id: "L1" });
    expect(r.groups).toEqual([
      { match_on: "email", lead_ids: ["L1", "L2"], owner_rm_ids: ["RM_A", "RM_B"] },
      { match_on: "phone", lead_ids: ["L1", "L3"], owner_rm_ids: ["RM_A", "RM_B"] },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/h_email|h_phone/);
  });

  test("T-MCP-06 Lead không trùng trả rỗng; Lead không tồn tại trả rỗng", () => {
    expect(findDuplicateLeads(ro, { lead_id: "L4" }).groups).toEqual([]);
    expect(findDuplicateLeads(ro, { lead_id: "L_NONE" }).groups).toEqual([]);
  });

  test("T-MCP-06 không truyền lead_id thì trả mọi nhóm trùng của snapshot", () => {
    const r = findDuplicateLeads(ro, {});
    expect(r.groups.length).toBe(2);
    expect(JSON.stringify(r)).not.toMatch(/h_email|h_phone/);
  });
});
