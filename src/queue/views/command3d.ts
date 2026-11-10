// Trang /command/3d (spec command-center-3d; D-93). Cùng payload với /command và /command/data.json. Trang hiện ngay bảng
// rút gọn (phẳng) từ payload, rồi script mới nạp model; không WebGL, prefers-reduced-motion hoặc người dùng chọn thì
// script tự chuyển về /command. Không PII: chỉ mã và số tổng hợp.
import type { CommandPayload } from "../../fleet/command-json.ts";
import { html, SafeHtml } from "./html.ts";

const CSS = `:root{--ink:#1d1e20;--muted:#5d564c;--beige:#e4dbcd;--glass:rgba(250,246,239,.62)}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--beige);color:var(--ink);font-family:system-ui,sans-serif}
#stage{position:fixed;inset:0}#stage canvas{display:block;touch-action:none}
.glass{background:var(--glass);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.55);border-radius:14px;box-shadow:0 8px 30px rgba(60,46,28,.12)}
#top{position:fixed;left:16px;top:16px;right:16px;display:flex;gap:8px;align-items:center;justify-content:space-between;pointer-events:none}
#top>*{pointer-events:auto}#brand{padding:8px 12px;font-weight:600}#brand small{display:block;font-weight:400;color:var(--muted);font-size:12px}
#top a{color:var(--ink);font-size:13px;padding:8px 12px;text-decoration:none}
#flat{position:fixed;right:16px;bottom:16px;max-width:min(360px,calc(100vw - 32px));max-height:40vh;overflow:auto;padding:12px;font-size:13px}
#flat h2{font-size:13px;margin:0 0 6px}#flat ul{margin:0;padding-left:16px}
#hint{position:fixed;left:16px;bottom:16px;padding:8px 12px;font-size:12px;color:var(--muted)}
#fallback{position:fixed;left:16px;top:96px;max-width:40vw}#fallback img{max-width:100%;height:auto}
#loading{position:fixed;left:16px;top:96px;padding:8px 12px;font-size:12px}
[hidden]{display:none!important}
@media (max-width:760px){#flat{left:16px;right:16px;max-height:30vh}#hint{bottom:auto;top:72px}}`;

export function renderCommand3dPage(d: CommandPayload): string {
  return html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mi1 Command Center</title><style>${new SafeHtml(CSS)}</style></head><body>
<div id="stage" aria-hidden="true"></div>
<div id="top"><div id="brand" class="glass">Mi1 Command Center<small>Growth Workspace · ${d.userId}</small></div><a id="to-flat" class="glass" href="/command?flat=1">Bản phẳng</a></div>
<div id="loading" class="glass" role="status">Đang nạp Mi1…</div>
<div id="fallback" hidden><img src="/static/command3d/mi1-fallback.png" alt="Mi1 (ảnh tĩnh: không nạp được model 3D)"></div>
<div id="hint" class="glass">Kéo để xoay Mi1 360°</div>
<section id="flat" class="glass" aria-label="Tóm tắt">
<h2>${d.session ? `Lượt gần nhất: ${d.session.trigger} · ${d.session.status} · ${d.session.steps.length} bước` : "Chưa có lượt chạy"}</h2>
<ul>${d.modules.map((m) => html`<li>${m.href ? html`<a href="${m.href}">${m.label}</a>` : m.label}: ${m.summary}</li>`)}</ul>
${d.waitingMark ? html`<p>Việc chờ Mark: ${d.waitingMark.length}</p>` : ""}
<p>Chi phí LLM tháng: ${d.monthCostUsd.toFixed(2)} / ${d.capUsd} USD</p></section>
<script type="module" src="/static/command3d/app.js"></script>
</body></html>`.value;
}
