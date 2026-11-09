// T-N-01, T-N-02: thông báo Teams chỉ có ngày và link.
import { describe, expect, test } from "bun:test";
import { digestReadyMessage, escalationMessage, postTeams, queueReadyMessage } from "../../src/teams/notify.ts";

const HOOK = "https://example.webhook.office.com/webhookb2/abc";

describe("T-N-01 nội dung cố định", () => {
  test("T-N-01 payload chỉ chứa ngày và link, đúng mẫu cố định", () => {
    expect(queueReadyMessage("2026-11-02", "https://queue.example.invalid")).toEqual({
      text: "Hàng chờ ngày 02/11 đã sẵn sàng: https://queue.example.invalid/queue?date=2026-11-02",
    });
    expect(escalationMessage("https://queue.example.invalid/queue?date=2026-11-02#item-1")).toEqual({
      text: "Amy cần anh xem một mục: https://queue.example.invalid/queue?date=2026-11-02#item-1",
    });
  });

  test("T-N-01 ngày sai định dạng hoặc link không phải https bị từ chối", () => {
    expect(() => queueReadyMessage("02/11", "https://queue.example.invalid")).toThrow();
    expect(() => queueReadyMessage("2026-11-02", "http://queue.example.invalid")).toThrow();
    expect(() => escalationMessage("javascript:alert(1)")).toThrow();
  });

  test("T-N-03 bản cài máy Ubuntu (D-26): link http chỉ nhận localhost; Digest tuần (CRON-08) chỉ có ngày và link", () => {
    expect(queueReadyMessage("2026-11-02", "http://localhost:3000").text).toBe("Hàng chờ ngày 02/11 đã sẵn sàng: http://localhost:3000/queue?date=2026-11-02");
    expect(digestReadyMessage("2026-11-02", "http://127.0.0.1:3000")).toEqual({ text: "Digest tuần từ 02/11 đã sẵn sàng: http://127.0.0.1:3000/digest?week=2026-11-02" });
    expect(() => digestReadyMessage("2026-11-02", "http://localhost.example.invalid")).toThrow();
    expect(() => digestReadyMessage("x", "https://queue.example.invalid")).toThrow();
  });

  test("T-N-01 thân request gửi đi đúng bằng mẫu, không thêm trường nào", async () => {
    const bodies: string[] = [];
    const impl = (async (_u: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response("1", { status: 200 });
    }) as typeof fetch;
    expect(await postTeams(HOOK, queueReadyMessage("2026-11-02", "https://queue.example.invalid"), { fetchImpl: impl, sleep: async () => {} })).toBe(true);
    expect(JSON.parse(bodies[0]!)).toEqual({ text: "Hàng chờ ngày 02/11 đã sẵn sàng: https://queue.example.invalid/queue?date=2026-11-02" });
  });

  test("T-N-01 webhook ngoài host Teams hoặc Power Automate bị từ chối, không gửi", async () => {
    let calls = 0;
    const impl = (async () => { calls += 1; return new Response("1"); }) as unknown as typeof fetch;
    expect(await postTeams("https://evil.example/hook", { text: "x" }, { fetchImpl: impl, sleep: async () => {} })).toBe(false);
    expect(calls).toBe(0);
  });
});

describe("T-N-02 webhook lỗi", () => {
  test("T-N-02 thử lại 3 lần (4 lượt gửi), không ném lỗi", async () => {
    let calls = 0;
    const impl = (async () => { calls += 1; return new Response("down", { status: 503 }); }) as unknown as typeof fetch;
    expect(await postTeams(HOOK, { text: "x" }, { fetchImpl: impl, sleep: async () => {} })).toBe(false);
    expect(calls).toBe(4);
    const throwing = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await postTeams(HOOK, { text: "x" }, { fetchImpl: throwing, sleep: async () => {} })).toBe(false);
  });
});
