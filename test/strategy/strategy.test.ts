// T-STR-01 tới T-STR-04: đề xuất chiến lược tuần (D-91). Lời dẫn không có số nào ngoài gói; câu hỏi thiếu dữ liệu không
// sinh nhận định; eval chưa pass thì khoá như /ask; Mark duyệt thì vào Digest; bộ eval chạy đúng khuôn.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmRequest } from "../../src/agents/sa-01/llm.ts";
import { latestSession } from "../../src/fleet/orchestrate.ts";
import { buildStrategyPack, validateStatements, type StrategyPack } from "../../src/mi1/strategy.ts";
import { approvedStrategy, decideStrategy, generateStrategy, latestStrategy } from "../../src/mi1/strategy-run.ts";
import { loadStrategyEval, readStrategyEvalGate, runStrategyEval, writeStrategyEval } from "../../src/mi1/strategy-eval.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, post, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const PRICE = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const PACK: StrategyPack = { weekStart: "2026-11-09", answers: [
  { question: 3, title: "q3", status: "ok", facts: [{ id: "q3.price_locked", label: "khoá giá", value: 12 }, { id: "q3.price_total", label: "tổng", value: 45 }] },
  { question: 6, title: "q6", status: "ok", facts: [{ id: "q6.total_new", label: "đề xuất", value: 2400 }] },
  { question: 1, title: "q1", status: "insufficient", reason: "Chưa nạp", facts: [] },
] };
// LLM giả: trả câu dựng từ gói (một câu đúng mỗi câu hỏi có dữ liệu) cộng một câu bịa số.
function fakeLlm(extra = true) {
  const calls: LlmRequest[] = [];
  return { calls, async complete(req: LlmRequest) {
    calls.push(req);
    const pack = JSON.parse(req.user.replace(/^<goi_so>\n|\n<\/goi_so>$/g, "")) as StrategyPack;
    const st = pack.answers.filter((a) => a.status === "ok").map((a) => ({ text: `${a.facts[0]!.label}: ${String(a.facts[0]!.value)}`, refs: [a.facts[0]!.id] }));
    if (extra) st.push({ text: "Doanh thu sẽ tăng 37%", refs: [pack.answers.find((a) => a.status === "ok")!.facts[0]!.id] });
    return { text: JSON.stringify({ statements: st }), inputTokens: 2000, outputTokens: 300, model: "fake", refused: false };
  } };
}
const GATE = { passed: true, version: "1.0.0@t" };

describe("T-STR đề xuất chiến lược tuần", () => {
  test("T-STR-01 bộ kiểm: số ngoài mã được trỏ, mã lạ, câu hỏi thiếu dữ liệu đều bị loại; số có dấu phẩy nghìn vẫn khớp", () => {
    const r = validateStatements(PACK, { statements: [
      { text: "Đã khoá giá 12 trên 45 tài phán", refs: ["q3.price_locked", "q3.price_total"] },
      { text: "Ngân sách đề xuất 2,400 USD cho câu 6", refs: ["q6.total_new"] },
      { text: "Đã khoá giá 13 tài phán", refs: ["q3.price_locked"] },
      { text: "Khoá giá 12", refs: ["q9.x"] },
      { text: "Khách hiện tại chủ yếu là công ty phần mềm", refs: ["q1.deals"] },
      { text: "Không trỏ", refs: [] },
    ] });
    expect(r.kept.map((s) => s.text)).toEqual(["Đã khoá giá 12 trên 45 tài phán", "Ngân sách đề xuất 2,400 USD cho câu 6"]);
    expect(r.dropped).toBe(4);
    expect(validateStatements(PACK, "không phải JSON")).toEqual({ kept: [], dropped: 0 });
  });

  test("T-STR-02 thiếu dữ liệu thì ghi lý do, không có số liệu, không sinh nhận định", async () => {
    const db = freshDb();
    const pack = buildStrategyPack(db, NOW);
    expect(pack.answers.map((a) => [a.question, a.status])).toEqual([[1, "insufficient"], [2, "insufficient"], [3, "ok"], [4, "insufficient"], [5, "insufficient"], [6, "insufficient"], [7, "ok"]]);
    expect(pack.answers.find((a) => a.question === 6)!.reason).toBe("Chưa có kế hoạch ngân sách tuần (khung quyết định).");
    const r = await generateStrategy(db, fakeLlm(false), { now: NOW, actor: "mark", price: PRICE, evalGate: GATE });
    expect(r).toMatchObject({ status: "created", kept: 2, dropped: 0 });
    const refs = latestStrategy(db)!.statements.flatMap((s) => s.refs);
    expect(refs.every((x) => x.startsWith("q3.") || x.startsWith("q7."))).toBe(true);
  });

  test("T-STR-03 eval chưa pass thì khoá, không gọi LLM; pass thì soạn nháp, loại câu bịa số; chỉ Mark duyệt; duyệt xong vào Digest", async () => {
    const db = freshDb();
    const llm = fakeLlm();
    expect(await generateStrategy(db, llm, { now: NOW, actor: "mark", price: PRICE, evalGate: { passed: false, version: "none" } })).toEqual({ status: "failed", errorCode: "EVAL_NOT_PASSED" });
    expect(llm.calls.length).toBe(0);
    expect(latestSession(db)).toMatchObject({ trigger: "strategy", status: "blocked", reason: "EVAL_NOT_PASSED" });
    const { app } = makeApp(db, { askLlm: { llm, price: PRICE, evalGate: () => GATE }, strategyGate: () => ({ passed: false, version: "none" }) });
    const mark = session({ id: "mark", role: "viewer" });
    expect(await (await get(app, "/strategy", mark.cookie)).text()).toContain("Bộ eval đề xuất chiến lược chưa pass");
    expect((await post(app, "/strategy", { csrf: mark.csrf, op: "write" }, mark.cookie)).status).toBe(422);
    const ok = makeApp(db, { askLlm: { llm, price: PRICE, evalGate: () => GATE }, strategyGate: () => GATE }).app;
    const page = await (await post(ok, "/strategy", { csrf: mark.csrf, op: "write" }, mark.cookie)).text();
    expect(page).toContain("Đã soạn: 2 câu giữ, 1 câu loại.");
    expect(page).not.toContain("37%");
    expect(page).toContain("Chưa đủ dữ liệu: Chưa nạp file Closed Won thật.");
    const bod = session({ id: "bod", role: "viewer" });
    expect((await get(ok, "/strategy", bod.cookie)).status).toBe(200);
    expect((await post(ok, "/strategy", { csrf: bod.csrf, op: "write" }, bod.cookie)).status).toBe(403);
    const d = latestStrategy(db)!;
    expect(decideStrategy(db, d.id, "approve", "", { now: NOW, actor: "bod" })).toBe("ONLY_MARK");
    expect(approvedStrategy(db, d.weekStart)).toBeNull();
    expect(decideStrategy(db, d.id, "approve", "ok", { now: NOW, actor: "mark" })).toBe("ok");
    expect(approvedStrategy(db, d.weekStart)!.id).toBe(d.id);
    expect(await (await get(ok, `/digest?week=${d.weekStart}`, mark.cookie)).text()).toContain("Đề xuất chiến lược tuần (Mark đã duyệt)");
  });

  test("T-STR-04 bộ eval: 10 ca, ngưỡng 0,8; LLM bịa số thì không qua cổng; LLM đúng thì qua và cổng đọc được", async () => {
    const file = loadStrategyEval(new URL("../../evals/mi1-strategy/EVAL_mi1-strategy.json", import.meta.url).pathname);
    expect([file.test_cases.length, file.minimum_pass_rate]).toEqual([10, 0.8]);
    expect((await runStrategyEval(file, fakeLlm(true), NOW)).gate_passed).toBe(false);
    const good = await runStrategyEval(file, fakeLlm(false), NOW);
    expect(good).toMatchObject({ total: 10, gate_passed: true });
    const dir = mkdtempSync(join(tmpdir(), "str-eval-"));
    expect(readStrategyEvalGate(dir).passed).toBe(false);
    writeStrategyEval(dir, good);
    expect(readStrategyEvalGate(dir).passed).toBe(true);
  });
});
