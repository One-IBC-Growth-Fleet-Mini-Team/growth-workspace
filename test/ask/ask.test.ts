// T-ASK-01 tới T-ASK-03: Mi1 nhận câu hỏi (spec mục 6; D-58). LLM chỉ chọn truy vấn mẫu đã duyệt và tham số;
// số liệu do hàm tính. Câu hỏi qua lọc R1 trước khi gửi LLM. Không khớp mẫu thì nói rõ, không để LLM tự trả lời.
import { describe, expect, test } from "bun:test";
import { askMi1 } from "../../src/mi1/ask.ts";
import { insertAgentRun } from "../../src/db/queue.ts";
import { createSessionCookie } from "../../src/queue/auth.ts";
import type { LlmRequest } from "../../src/agents/sa-01/llm.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, SECRET } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const PRICE = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const opts = { now: NOW, actor: "mark", price: PRICE };
// LLM giả: trả đúng chuỗi cho trước, 1000 token vào, 200 token ra.
function fakeLlm(text = '{"template":null}') {
  const calls: LlmRequest[] = [];
  return { calls, async complete(req: LlmRequest) { calls.push(req); return { text, inputTokens: 1000, outputTokens: 200, model: "fake", refused: false }; } };
}

describe("T-ASK Mi1 nhận câu hỏi", () => {
  test("T-ASK-01 LLM chọn mẫu, hàm trả số; ghi phiên mi1 kèm token và chi phí; câu hỏi đã lọc PII", async () => {
    const db = freshDb();
    const llm = fakeLlm('{"template":"fleet_operations","params":{"week":"2026-11-02"}}');
    const r = await askMi1(db, llm, "Fleet tuần này ra sao? Gửi kết quả cho canary.person@example.com", opts);
    expect(r).toMatchObject({ status: "answered", template: "fleet_operations", question: 7, result: { capUsd: 100, queue: { weekStart: "2026-11-02" } } });
    expect(llm.calls[0]!.user).not.toContain("canary.person");
    expect(llm.calls[0]!.system).toContain("output_readiness");
    const run = db.query("SELECT agent, trigger, input_tokens, cost_usd FROM agent_runs").get();
    expect(run).toEqual({ agent: "mi1", trigger: "ask", input_tokens: 1000, cost_usd: 0.004 });
  });

  test("T-ASK-02 không khớp mẫu, mẫu lạ, JSON hỏng: không trả số; chạm trần chi phí thì không gọi LLM", async () => {
    const db = freshDb();
    expect(await askMi1(db, fakeLlm('{"template":null}'), "Doanh thu năm sau?", opts)).toMatchObject({ status: "no_template" });
    expect(await askMi1(db, fakeLlm('{"template":"drop_all","params":{}}'), "x", opts)).toMatchObject({ status: "no_template" });
    expect(await askMi1(db, fakeLlm("không phải JSON"), "x", opts)).toMatchObject({ status: "failed", errorCode: "ASK_BAD_OUTPUT" });
    expect(await askMi1(db, fakeLlm('{"template":"fleet_operations","params":{"week":"tuần này"}}'), "x", opts)).toMatchObject({ status: "failed", errorCode: "PARAMS_INVALID" });
    insertAgentRun(db, { id: "big", agent: "mi1-sa-01", trigger: "cron-05", prompt_version: "p", eval_version: "e", model: "m", input_tokens: 1, output_tokens: 1, cost_usd: 100, status: "succeeded", started_at: "2026-11-05T01:00:00Z", finished_at: "2026-11-05T01:00:00Z" });
    const llm = fakeLlm();
    expect(await askMi1(db, llm, "x", opts)).toMatchObject({ status: "failed", errorCode: "COST_CAP" });
    expect(llm.calls).toHaveLength(0);
    expect(await askMi1(db, fakeLlm(), " ", opts)).toMatchObject({ status: "failed", errorCode: "QUESTION_REQUIRED" });
  });

  test("T-ASK-04 LLM từ chối báo riêng; JSON trong khối code vẫn đọc được; câu hỏi gửi trong khối dữ liệu", async () => {
    const db = freshDb();
    const refused = { calls: [] as LlmRequest[], async complete() { return { text: "Tôi không thể.", inputTokens: 10, outputTokens: 5, model: "fake", refused: true }; } };
    expect(await askMi1(db, refused, "x", opts)).toMatchObject({ status: "failed", errorCode: "ASK_REFUSED" });
    const fenced = fakeLlm('```json\n{"template":"channel_health","params":{}}\n```');
    expect(await askMi1(db, fenced, "Kênh ổn không?", opts)).toMatchObject({ status: "answered", template: "channel_health" });
    expect(fenced.calls[0]!.user).toBe("<cau_hoi>\nKênh ổn không?\n</cau_hoi>");
  });

  test("T-ASK-03 trang /ask: hỏi có CSRF; chưa cấu hình LLM thì báo; Hàng chờ có link", async () => {
    const db = freshDb();
    const c = createSessionCookie(SECRET, { sub: "mark", csrf: "k", exp: Date.parse("2026-11-10T00:00:00Z") });
    const llm = fakeLlm('{"template":"channel_health","params":{}}');
    const { app } = makeApp(db, { now: () => NOW, askLlm: { llm, price: PRICE } });
    const ask = (csrf: string, a = app) => a.fetch(new Request(`${BASE}/ask`, { method: "POST", headers: { cookie: c, origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, q: "Kênh có ổn không?" }).toString() }));
    const res = await ask("k");
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Mẫu channel_health (câu hỏi đầu ra số 3)");
    expect(page).toContain("Kênh có ổn không?");
    expect((await ask("sai")).status).toBe(403);
    const noLlm = makeApp(db, { now: () => NOW }).app;
    expect(await (await noLlm.fetch(new Request(`${BASE}/ask`, { headers: { cookie: c } }))).text()).toContain("Chưa cấu hình LLM");
    expect(await (await app.fetch(new Request(`${BASE}/queue`, { headers: { cookie: c } }))).text()).toContain('href="/ask"');
  });
});
