// Gọi LLM một lần cho mỗi bản tự báo; sai schema thì thử lại 1 lần, vẫn sai thì parse_failed (design doc mục 5.4).
// Đầu vào chỉ là bản đã tách khung và đã qua R1 (parse-report), đặt trong khối dữ liệu.
import { CATALOG_VERSION, REASON_CODES } from "./catalog.ts";
import type { LlmClient } from "./llm.ts";
import { Sa01OutputSchema, type Sa01Output } from "./output-schema.ts";
import type { ParsedReport } from "../../teams/parse-report.ts";
import type { TokenUsage } from "../../metrics/cost.ts";

const PROMPT_FILE = await Bun.file(new URL("./prompt.md", import.meta.url)).text();
export const PROMPT_VERSION = /sa01-prompt\/[0-9.]+/.exec(PROMPT_FILE)?.[0] ?? "sa01-prompt/unknown";
const SYSTEM_PROMPT = PROMPT_FILE.replace(/^<!--.*-->\n/, "").replace("{{CATALOG}}", REASON_CODES.join(", "));
const MAX_TOKENS = 4000;

export type StructureInput = { reportDate: string; parsed: ParsedReport };
export type StructureResult =
  | { status: "ok"; output: Sa01Output; usages: TokenUsage[]; model: string }
  | { status: "parse_failed" | "refused" | "llm_error"; usages: TokenUsage[]; model: string | null };

export function buildUserPrompt(input: StructureInput): string {
  const data = {
    report_date: input.reportDate,
    catalog_version: CATALOG_VERSION,
    sections: input.parsed.sections,
    unlabeled: input.parsed.unlabeled,
    flags: input.parsed.flags,
  };
  return `<du_lieu_tu_bao>\n${JSON.stringify(data)}\n</du_lieu_tu_bao>`;
}

function parseOutput(text: string): Sa01Output | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const r = Sa01OutputSchema.safeParse(json);
  return r.success ? r.data : null;
}

export async function structureReport(llm: LlmClient, input: StructureInput): Promise<StructureResult> {
  const user = buildUserPrompt(input);
  const usages: TokenUsage[] = [];
  let model: string | null = null;
  for (const _attempt of [1, 2]) {
    let res;
    try {
      res = await llm.complete({ system: SYSTEM_PROMPT, user, maxTokens: MAX_TOKENS });
    } catch {
      return { status: "llm_error", usages, model };
    }
    usages.push({ inputTokens: res.inputTokens, outputTokens: res.outputTokens });
    model = res.model;
    if (res.refused) return { status: "refused", usages, model };
    const output = parseOutput(res.text);
    if (output) return { status: "ok", output, usages, model };
  }
  return { status: "parse_failed", usages, model };
}
