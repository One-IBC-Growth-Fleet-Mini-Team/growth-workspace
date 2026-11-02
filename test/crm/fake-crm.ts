// CRM giả bằng Bun.serve, chỉ dùng trong test. Ghi lại mọi request để kiểm chỉ đọc.
// Định dạng phân trang là bản tổng hợp (SYNTHETIC_PAGINATION), chờ đối chiếu API thật (Q-01).
import { RAW_BY_RESOURCE } from "../fixtures/synthetic/crm.ts";

export type RecordedRequest = { method: string; path: string; query: string; hasBody: boolean };

export type FakeCrm = {
  baseUrl: string;
  requests: RecordedRequest[];
  stop: () => void;
};

export function startFakeCrm(
  opts: { pageSize?: number; data?: Record<string, unknown[]>; respond?: (req: Request) => Response | null } = {},
): FakeCrm {
  const pageSize = opts.pageSize ?? 1;
  const data = opts.data ?? RAW_BY_RESOURCE;
  const requests: RecordedRequest[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const body = await req.arrayBuffer();
      requests.push({ method: req.method, path: url.pathname, query: url.search, hasBody: body.byteLength > 0 });
      const override = opts.respond?.(req);
      if (override) return override;
      const resource = url.pathname.replace(/^\/api\//, "");
      const records = data[resource];
      if (!records) return new Response("not found", { status: 404 });
      const page = Number(url.searchParams.get("page") ?? "1");
      const slice = records.slice((page - 1) * pageSize, page * pageSize);
      const next = page * pageSize < records.length ? page + 1 : null;
      return Response.json({ records: slice, next_page: next });
    },
  });
  return { baseUrl: `http://127.0.0.1:${server.port}/api`, requests, stop: () => server.stop(true) };
}
