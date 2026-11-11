// Adapter API GET Internal Control (Data Contract mục A5; D-96). Chỉ đọc. Trả theo từng Order đúng các trường A5:
// order_id, gross_order_value, net_revenue, third_party_pass_through, refund, gross_margin, Division, Commission_Date;
// trường khác trong phản hồi bị bỏ. Lọc theo khoảng ngày, phân trang bằng next_page_token.
// [ĐỐI CHIẾU SCHEMA] Đường dẫn /orders, tên tham số from, to, page_token: tên tạm, chờ tài liệu API của MobCEC.
import { z } from "zod";
import { readAll, staticToken, type ReadOptions } from "./read-http.ts";

const Row = z.object({
  order_id: z.string().min(1), gross_order_value: z.number().nullable(), net_revenue: z.number().nullable(), third_party_pass_through: z.number().nullable(),
  refund: z.number().nullable(), gross_margin: z.number().nullable(), Division: z.string().nullable(), Commission_Date: z.string().nullable(),
});
export type IcOrder = z.infer<typeof Row>;
const Page = z.object({ data: z.array(z.unknown()), next_page_token: z.string().nullish() });

export function icOptions(base: string, token: string, extra: Partial<ReadOptions> = {}): ReadOptions {
  return { connector: "internal-control", hosts: [new URL(base).hostname], token: staticToken(token), ...extra };
}

export async function readIcOrders(base: string, from: string, to: string, o: ReadOptions): Promise<IcOrder[]> {
  const url = (pageToken?: string) => {
    const u = new URL(`${base.replace(/\/+$/, "")}/orders`);
    u.searchParams.set("from", from); u.searchParams.set("to", to);
    if (pageToken) u.searchParams.set("page_token", pageToken);
    return u.href;
  };
  return readAll({ url: url() }, o,
    (b) => Page.parse(b).data.flatMap((r) => { const p = Row.safeParse(r); return p.success ? [p.data] : []; }),
    (b) => { const t = Page.parse(b).next_page_token; return t ? { url: url(t) } : null; });
}
