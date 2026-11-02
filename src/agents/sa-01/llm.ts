// Client LLM cho Mi1-sa-01. Test và eval thay bằng LLM giả cùng interface; không test nào gọi API thật.
// Model cấu hình qua LLM_MODEL (spec mục 10: dòng Sonnet cho CRON-05, ví dụ claude-sonnet-5-5).
import Anthropic from "@anthropic-ai/sdk";

export type LlmRequest = { system: string; user: string; maxTokens: number };
export type LlmResponse = { text: string; inputTokens: number; outputTokens: number; model: string; refused: boolean };
export type LlmClient = { complete(req: LlmRequest): Promise<LlmResponse> };

// Model nhận tham số fallbacks phía server (khi bị từ chối vì an toàn thì chạy lại trên model khác).
const SERVER_FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function createAnthropicLlm(opts: { model: string; client?: Anthropic }): LlmClient {
  const client = opts.client ?? new Anthropic();
  return {
    async complete(req) {
      const params = {
        model: opts.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user" as const, content: req.user }],
      };
      const res = SERVER_FALLBACK_MODELS.has(opts.model)
        ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.beta.messages.create(params);
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model: res.model,
        refused: res.stop_reason === "refusal",
      };
    },
  };
}
