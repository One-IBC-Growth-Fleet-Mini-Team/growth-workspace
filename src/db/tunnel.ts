// Link Quick Tunnel hiện tại (D-98). cloudflared trả tên máy ở cổng metrics (/quicktunnel); lệnh tunnel:url đọc rồi ghi
// vào DB khi đổi. App dùng link mới nhất để nhận Origin và đặt cookie Secure cho yêu cầu đến qua tunnel.
import type { Database } from "bun:sqlite";

export const TUNNEL_HOST_RE = /^[a-z0-9-]+\.trycloudflare\.com$/;

export function latestTunnelUrl(db: Database): { url: string; since: string } | null {
  const r = db.query("SELECT url, seen_at FROM tunnel_urls ORDER BY seen_at DESC, id DESC LIMIT 1").get() as { url: string; seen_at: string } | null;
  return r ? { url: r.url, since: r.seen_at } : null;
}

// Ghi link nếu khác link mới nhất; trả true khi là link mới. Tên máy sai dạng thì bỏ qua.
export function recordTunnelUrl(db: Database, hostname: string, now: Date): boolean {
  const host = hostname.trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/+$/, "");
  if (!TUNNEL_HOST_RE.test(host)) return false;
  const url = `https://${host}`;
  if (latestTunnelUrl(db)?.url === url) return false;
  db.run("INSERT INTO tunnel_urls (id, url, seen_at) VALUES (?, ?, ?)", [Bun.randomUUIDv7(), url, now.toISOString()]);
  return true;
}

// Hỏi cloudflared đang chạy; null nếu tunnel không chạy hoặc chưa có link.
export async function fetchTunnelHostname(metrics: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`http://${metrics}/quicktunnel`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const h = ((await res.json()) as { hostname?: string }).hostname ?? "";
    return TUNNEL_HOST_RE.test(h) ? h : null;
  } catch {
    return null;
  }
}
