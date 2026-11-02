// Schema đầu ra của Mi1-sa-01 (design doc mục 5.4). Không có trường tên khách; customer_ref là nhãn KHACH_n.
// Số đếm là số RM tự ghi, LLM chỉ chép; RM không ghi thì null (C3).
import { z } from "zod";
import { REASON_CODES } from "./catalog.ts";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const COUNT = z.number().int().min(0).nullable();
const NOTE = z.string().max(300);
const CODE = z.string().max(16).nullable();
const CUSTOMER_REF = z.string().regex(/^KHACH_\d{1,3}$/);

const countNote = z.strictObject({ count: COUNT, note: NOTE }).nullable();

export const Sa01OutputSchema = z
  .strictObject({
    report_date: DATE,
    sections: z.strictObject({
      outreach: z.strictObject({ count: COUNT, channels: z.array(z.string().max(32)).max(10), note: NOTE }).nullable(),
      posts: countNote,
      conversations: countNote,
      quotes: z
        .array(
          z.strictObject({
            jurisdiction_code: CODE,
            service_family: CODE,
            status: z.enum(["sent", "accepted", "pending", "unknown"]),
          }),
        )
        .max(20),
      customer_said: z
        .array(z.strictObject({ customer_ref: CUSTOMER_REF, quote_vi: NOTE, quote_original: NOTE }))
        .max(20),
      not_in_crm: countNote,
      needs_support: z.array(z.strictObject({ topic: z.string().max(80), note: NOTE })).max(10),
    }),
    reason_code_proposals: z
      .array(
        z.strictObject({
          customer_ref: CUSTOMER_REF,
          primary: z.enum(REASON_CODES),
          secondary: z.enum(REASON_CODES).nullable(),
          is_final: z.boolean(),
          evidence_quote: NOTE.nullable(),
          opportunity_hint: z.strictObject({ jurisdiction_code: CODE, service_family: CODE }),
        }),
      )
      .max(20),
    flags: z.array(z.enum(["unstructured", "truncated"])).max(2),
  })
  .superRefine((out, ctx) => {
    out.reason_code_proposals.forEach((p, i) => {
      if (p.primary === "OTHER" && (p.evidence_quote === null || p.evidence_quote.trim() === "")) {
        ctx.addIssue({ code: "custom", path: ["reason_code_proposals", i, "evidence_quote"], message: "OTHER_NEEDS_QUOTE" });
      }
    });
  });

export type Sa01Output = z.infer<typeof Sa01OutputSchema>;
