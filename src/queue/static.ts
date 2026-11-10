// File tĩnh của app (D-93): Three.js vendored, model Mi1, script Command Center 3D. Chỉ phục vụ file có sẵn trong
// src/queue/static lúc khởi động (danh sách cố định, không đọc đường dẫn tuỳ ý); không có dữ liệu nghiệp vụ.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("./static/", import.meta.url).pathname;
const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".glb": "model/gltf-binary", ".png": "image/png", ".css": "text/css; charset=utf-8" };

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TYPES[extname(n)]) out.push(relative(ROOT, p));
  }
  return out;
}
const FILES: ReadonlySet<string> = new Set(walk(ROOT));

export function staticFile(path: string): { body: Uint8Array; type: string } | null {
  const rel = path.replace(/^\/static\//, "");
  if (!FILES.has(rel)) return null;
  return { body: readFileSync(join(ROOT, rel)), type: TYPES[extname(rel)]! };
}
