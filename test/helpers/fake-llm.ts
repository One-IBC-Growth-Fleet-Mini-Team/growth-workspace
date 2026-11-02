// LLM giả xác định cho test và eval: không gọi Claude API thật.
// Đọc khối dữ liệu đã ẩn danh trong user prompt và dựng đầu ra theo luật đơn giản.
import type { LlmClient, LlmRequest, LlmResponse } from "../../src/agents/sa-01/llm.ts";

type Parsed = {
  report_date: string;
  sections: Record<string, string[] | undefined>;
  unlabeled: string[];
  flags: string[];
};

function firstInt(lines: string[] | undefined): number | null {
  for (const l of lines ?? []) {
    const m = /\d+/.exec(l);
    if (m) return Number(m[0]);
  }
  return null;
}

function codeFor(text: string): string {
  const t = text.toLowerCase();
  if (/expensive|đắt|giá cao/.test(t)) return "PRICE_TOO_HIGH";
  if (/compar|so giá/.test(t)) return "PRICE_COMPARING";
  if (/next month|chưa cần/.test(t)) return "NO_NEED_NOW";
  if (/không trả lời|no reply|im lặng/.test(t)) return "UNRESPONSIVE";
  return "OTHER";
}

export function extractDataBlock(user: string): Parsed {
  const m = /<du_lieu_tu_bao>\n([\s\S]*?)\n<\/du_lieu_tu_bao>/.exec(user);
  if (!m) throw new Error("fake llm: no data block");
  return JSON.parse(m[1]!) as Parsed;
}

export function deterministicOutput(p: Parsed): Record<string, unknown> {
  const said = p.sections.customer_said ?? [];
  const flags = p.flags.includes("unstructured") ? ["unstructured"] : [];
  const note = (k: string) => (p.sections[k] ?? []).join("; ").slice(0, 300);
  return {
    report_date: p.report_date,
    sections: {
      outreach: p.sections.outreach ? { count: firstInt(p.sections.outreach), channels: [], note: note("outreach") } : null,
      posts: p.sections.posts ? { count: firstInt(p.sections.posts), note: note("posts") } : null,
      conversations: p.sections.conversations ? { count: firstInt(p.sections.conversations), note: note("conversations") } : null,
      quotes: (p.sections.quotes ?? []).map(() => ({ jurisdiction_code: null, service_family: null, status: "sent" })),
      customer_said: said.map((s, i) => ({ customer_ref: `KHACH_${i + 1}`, quote_vi: s.slice(0, 300), quote_original: s.slice(0, 300) })),
      not_in_crm: p.sections.not_in_crm ? { count: firstInt(p.sections.not_in_crm), note: note("not_in_crm") } : null,
      needs_support: (p.sections.needs_support ?? []).map((s) => ({ topic: "hỗ trợ", note: s.slice(0, 300) })),
    },
    reason_code_proposals: said.map((s, i) => {
      const code = codeFor(s);
      return {
        customer_ref: `KHACH_${i + 1}`,
        primary: code,
        secondary: null,
        is_final: !["UNRESPONSIVE", "NO_NEED_NOW", "PRICE_COMPARING"].includes(code),
        evidence_quote: s.slice(0, 300),
        opportunity_hint: { jurisdiction_code: null, service_family: null },
      };
    }),
    flags,
  };
}

export type FakeLlm = LlmClient & { calls: LlmRequest[] };

// respond: tuỳ biến đầu ra theo lượt gọi; mặc định là deterministicOutput.
export function fakeLlm(respond?: (req: LlmRequest, n: number) => string | Partial<LlmResponse>): FakeLlm {
  const calls: LlmRequest[] = [];
  return {
    calls,
    async complete(req) {
      calls.push(req);
      const custom = respond?.(req, calls.length);
      const base: LlmResponse = {
        text: JSON.stringify(deterministicOutput(extractDataBlock(req.user))),
        inputTokens: 1000,
        outputTokens: 200,
        model: "fake-model",
        refused: false,
      };
      if (custom === undefined) return base;
      if (typeof custom === "string") return { ...base, text: custom };
      return { ...base, ...custom };
    },
  };
}
