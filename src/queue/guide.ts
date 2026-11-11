// Trang hướng dẫn theo vai trò (D-80): docs/huong-dan/<vai trò>.md, dựng HTML bằng bộ chuyển markdown tối giản
// (tiêu đề, danh sách, bảng, đoạn, `code`, **đậm**). Nội dung được escape trước khi dựng.
import { readFileSync } from "node:fs";
import { accountRoleOf, type QueueUser } from "./auth.ts";

const DIR = new URL("../../docs/huong-dan/", import.meta.url).pathname;
export function guideFor(u: QueueUser): string {
  return accountRoleOf(u);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

export function renderGuide(name: string): string | null {
  if (!["amy", "mkt", "mark", "bod"].includes(name)) return null;
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let table = false;
  const close = () => { if (list) out.push(`</${list}>`); if (table) out.push("</table></div>"); list = null; table = false; };
  for (const raw of readFileSync(DIR + `${name}.md`, "utf8").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3}) (.*)$/.exec(line);
    const ul = /^\s*- (.*)$/.exec(line);
    const ol = /^\d+\. (.*)$/.exec(line);
    if (h) { close(); out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`); }
    else if (line.startsWith("|")) {
      if (/^\|[\s|:-]+\|$/.test(line)) continue;
      if (!table) { close(); out.push('<div style="overflow-x:auto"><table class="kv">'); table = true; }
      out.push(`<tr>${line.slice(1, -1).split("|").map((c) => `<td>${inline(c.trim())}</td>`).join("")}</tr>`);
    } else if (ol && !line.startsWith(" ")) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(ol[1]!)}</li>`); }
    // Gạch đầu dòng thụt vào trong danh sách đánh số là danh sách con, không đánh số tiếp.
    else if (ul && list === "ol") out.push(`<ul style="margin:0"><li>${inline(ul[1]!)}</li></ul>`);
    else if (ul) { if (!list) { out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(ul[1]!)}</li>`); }
    else if (line.trim() === "") close();
    else if (list) out.push(`<li style="list-style:none">${inline(line.trim())}</li>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join("\n");
}
