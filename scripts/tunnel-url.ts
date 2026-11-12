// bun run tunnel:url (D-98): in link truy cập từ xa hiện tại. Hỏi cloudflared ở cổng metrics (TUNNEL_METRICS, mặc định
// 127.0.0.1:20241); link mới thì ghi vào Growth DB để /settings và Brief sáng hiện. Lịch growth-tunnel-url chạy lệnh này
// mỗi phút. Tunnel không chạy thì in link gần nhất đã ghi và nói rõ.
import { getDbPath } from "../src/config.ts";
import { migrate } from "../src/db/migrate.ts";
import { openReadWrite } from "../src/db/open.ts";
import { fetchTunnelHostname, latestTunnelUrl, recordTunnelUrl } from "../src/db/tunnel.ts";

const metrics = process.env.TUNNEL_METRICS?.trim() || "127.0.0.1:20241";
const db = openReadWrite(getDbPath());
migrate(db);
const host = await fetchTunnelHostname(metrics);
const fresh = host ? recordTunnelUrl(db, host, new Date()) : false;
const cur = latestTunnelUrl(db);
db.close();
if (host) process.stdout.write(`${cur!.url}${fresh ? " (link mới)" : ""}\n`);
else {
  process.stderr.write(cur ? `Tunnel không chạy. Link gần nhất (đã hết dùng được): ${cur.url}\n` : "Tunnel không chạy và chưa có link nào. Chạy: bash deploy/local/quick-tunnel.sh\n");
  process.exit(1);
}
