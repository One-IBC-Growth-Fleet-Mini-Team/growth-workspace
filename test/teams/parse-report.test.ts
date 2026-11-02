// T-PARSE-01 tới T-PARSE-05: tách khung 7 nhãn của tự báo RM, chịu được lệch định dạng.
import { describe, expect, test } from "bun:test";
import { parseDailyReplies, parseReport, resolveRmId } from "../../src/teams/parse-report.ts";
import { insertRmReport } from "../../src/db/rm-reports.ts";
import { openReadWrite } from "../../src/db/open.ts";
import { migrate } from "../../src/db/migrate.ts";
import { CANONICAL_TEXT, HTML_VARIANT, UNSTRUCTURED_TEXT } from "../fixtures/synthetic/teams.ts";
import type { TeamsMessage } from "../../src/teams/graph-read.ts";

function msg(id: string, author: string | null, content: string, createdAt: string, contentType: "text" | "html" = "text"): TeamsMessage {
  return {
    messageId: id,
    rootId: "root_0111",
    authorTeamsUserId: author,
    createdAt,
    lastModifiedAt: createdAt,
    contentType,
    content,
    webUrl: `https://teams.example.invalid/l/message/${id}`,
  };
}

describe("T-PARSE-01 mẫu chuẩn", () => {
  test("T-PARSE-01 mẫu chuẩn 7 nhãn tách đúng mục", () => {
    const p = parseReport(CANONICAL_TEXT, "text");
    expect(p.headerDate).toBe("01/11");
    expect(p.flags).toEqual([]);
    expect(p.sections).toEqual({
      outreach: ["12 lead qua LinkedIn"],
      posts: ["1 bài về Samoa IBC"],
      conversations: ["4"],
      quotes: ["2 báo giá WS IBC01"],
      customer_said: ["Cost wise its expensive"],
      not_in_crm: ["2"],
      needs_support: ["cần bảng so sánh phí"],
    });
    expect(p.unlabeled).toEqual([]);
  });

  test("T-PARSE-01 dòng tiêu đề (có tên RM) không vào mục nào", () => {
    const p = parseReport(CANONICAL_TEXT, "text");
    expect(JSON.stringify(p)).not.toContain("[RM]");
  });
});

describe("T-PARSE-02 biến thể", () => {
  test("T-PARSE-02 HTML, bullet, nhãn thường hoặc không dấu, nhãn lặp, nội dung xuống dòng", () => {
    const p = parseReport(HTML_VARIANT, "html");
    expect(p.headerDate).toBe("01/11");
    expect(p.flags).toEqual([]);
    expect(p.sections.outreach).toEqual(["8 lead"]);
    expect(p.sections.posts).toEqual(["0"]);
    expect(p.sections.conversations).toEqual(["3 khách, CANARY_NAME_7f3a hỏi giá"]);
    expect(p.sections.quotes).toEqual(["1 BVI", "thêm 1 HK"]);
    expect(p.sections.customer_said).toEqual(['"need it next month" & email [EMAIL]']);
    expect(p.sections.needs_support).toEqual(["gọi lại [SĐT]"]);
    expect(p.sections.not_in_crm).toBeUndefined();
  });

  test("T-PARSE-02 thiếu nhãn: các mục còn lại vẫn tách được", () => {
    const p = parseReport("TIẾP CẬN: 5\nKHÁCH NÓI: ok", "text");
    expect(Object.keys(p.sections).sort()).toEqual(["customer_said", "outreach"]);
    expect(p.flags).toEqual([]);
  });

  test("T-PARSE-02 từ đầu dòng giống nhãn nhưng dài hơn không bị nhận nhầm", () => {
    const p = parseReport("TIẾP CẬN: 5\nBáo giáo viên xong", "text");
    expect(p.sections.quotes).toBeUndefined();
    expect(p.sections.outreach).toEqual(["5", "Báo giáo viên xong"]);
  });

  test("T-PARSE-02 hai reply của cùng RM gộp theo thứ tự thời gian", () => {
    const out = parseDailyReplies([
      msg("r2", "aad_a", "BÁO GIÁ: 1 HK\nTIẾP CẬN: 2", "2026-11-01T12:00:00Z"),
      msg("r3", "aad_b", "TIẾP CẬN: 9", "2026-11-01T11:00:00Z"),
      msg("r1", "aad_a", "TIẾP CẬN: 5\nBÁO GIÁ: 2 WS", "2026-11-01T09:00:00Z"),
    ]);
    expect(out.map((o) => o.authorTeamsUserId)).toEqual(["aad_a", "aad_b"]);
    const a = out[0]!;
    expect(a.messageIds).toEqual(["r1", "r2"]);
    expect(a.parsed.sections.outreach).toEqual(["5", "2"]);
    expect(a.parsed.sections.quotes).toEqual(["2 WS", "1 HK"]);
  });
});

describe("T-PARSE-03 không nhận khung", () => {
  test("T-PARSE-03 không có nhãn nào thì cờ unstructured, văn bản đã qua R1", () => {
    const p = parseReport(UNSTRUCTURED_TEXT, "text");
    expect(p.flags).toEqual(["unstructured"]);
    expect(p.sections).toEqual({});
    const text = p.unlabeled.join("\n");
    expect(text).not.toContain("canary+2@example.invalid");
    expect(text).not.toContain("555 0142");
    expect(p.redactionStats.email).toBe(1);
    expect(p.redactionStats.phone).toBe(1);
  });
});

describe("T-PARSE-04 map tác giả", () => {
  const directory = [
    { rm_id: "RM_A", teams_user_id: "aad_a", active: 1 },
    { rm_id: "RM_B", teams_user_id: "aad_b", active: 1 },
    { rm_id: "RM_C", teams_user_id: "aad_c", active: 0 },
  ];

  test("T-PARSE-04 tác giả map theo teams_user_id", () => {
    expect(resolveRmId("aad_b", directory)).toBe("RM_B");
  });

  test("T-PARSE-04 tên trong tiêu đề không được dùng để map", () => {
    // Tiêu đề ghi RM_B nhưng tác giả là aad_a → RM_A.
    const [r] = parseDailyReplies([msg("r1", "aad_a", "[01/11] [RM] RM_B\nTIẾP CẬN: 1", "2026-11-01T09:00:00Z")]);
    expect(resolveRmId(r!.authorTeamsUserId, directory)).toBe("RM_A");
    // Tác giả lạ, tiêu đề ghi RM_A → không map được.
    expect(resolveRmId("aad_unknown", directory)).toBeNull();
    expect(resolveRmId(null, directory)).toBeNull();
  });

  test("T-PARSE-04 RM đã nghỉ (active = 0) không map", () => {
    expect(resolveRmId("aad_c", directory)).toBeNull();
  });
});

describe("T-PARSE-05 tin sửa", () => {
  test("T-PARSE-05 source_version mới tạo dòng mới, không đè; cùng version không tạo trùng", () => {
    const db = openReadWrite(":memory:");
    migrate(db);
    db.run(
      `INSERT INTO agent_runs (id, agent, trigger, prompt_version, eval_version, model, input_tokens, output_tokens,
         cost_usd, status, started_at, finished_at)
       VALUES ('run_1', 'mi1-sa-01', 'manual', 'p1', 'e1', 'm', 0, 0, 0, 'succeeded', 'x', 'x')`,
    );
    const base = {
      report_date: "2026-11-01",
      rm_id: null,
      source_message_ref: "ref_1",
      source_link: "https://teams.example.invalid/l/message/r1",
      parsed: '{"v":1}',
      pii_check: "passed" as const,
      redaction_stats: "{}",
      parser_version: "p",
      agent_run_id: "run_1",
      created_at: "2026-11-02T01:00:00Z",
    };
    expect(insertRmReport(db, { ...base, id: "rep_1", source_version: "2026-11-01T10:00:00Z" })).toBe(true);
    expect(insertRmReport(db, { ...base, id: "rep_2", source_version: "2026-11-01T10:05:00Z", parsed: '{"v":2}' })).toBe(true);
    expect(insertRmReport(db, { ...base, id: "rep_3", source_version: "2026-11-01T10:00:00Z" })).toBe(false);
    const rows = db.query("SELECT id, parsed FROM rm_reports ORDER BY id").all();
    expect(rows).toEqual([
      { id: "rep_1", parsed: '{"v":1}' },
      { id: "rep_2", parsed: '{"v":2}' },
    ]);
  });
});
