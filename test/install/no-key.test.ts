// T-INST-01: cài được khi chưa có API key Claude (D-89). Key trống thì LLM tắt; install.sh cho Enter để bỏ qua.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { hasLlmKey } from "../../src/config.ts";

describe("T-INST cài đặt", () => {
  test("T-INST-01 key trống hoặc toàn khoảng trắng thì coi như chưa có; install.sh không dừng khi bỏ qua key", () => {
    expect(hasLlmKey({})).toBe(false);
    expect(hasLlmKey({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(hasLlmKey({ ANTHROPIC_API_KEY: "  " })).toBe(false);
    expect(hasLlmKey({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe(true);
    const sh = readFileSync(new URL("../../deploy/local/install.sh", import.meta.url), "utf8");
    expect(sh).toContain("hoặc Enter để điền sau");
    expect(sh).not.toContain("API key không đúng dạng; chạy lại script.");
    expect(sh).toContain("growth-harness.timer");
  });
});
