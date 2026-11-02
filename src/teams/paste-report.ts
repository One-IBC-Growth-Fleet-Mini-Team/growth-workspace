// Nguồn tự báo thay Graph khi chưa có quyền đọc channel (D-24): Amy dán thread tự báo của ngày vào Hàng chờ.
// Tách theo dòng tiêu đề của mẫu "[dd/mm] [RM] Tên"; mỗi khối là một bản tự báo. Văn bản thô chỉ sống
// trong bộ nhớ, đi tiếp qua parse-report (R1), LLM, R3 như nguồn Graph; không được lưu hay ghi log.
// Vì không có id tác giả của Teams, RM được map theo tên trong dòng tiêu đề khớp đúng display_name
// trong danh bạ (không phân biệt hoa thường); không khớp thì để trống (RM chưa xác định).
import { createHash } from "node:crypto";
import type { TeamsMessage } from "./graph-read.ts";
import type { RmDirectoryEntry } from "./parse-report.ts";

export type PastedReport = { message: TeamsMessage; rmId: string | null };

const HEADER_RE = /^\s*\[\s*\d{1,2}\s*\/\s*\d{1,2}\s*\]\s*\[\s*RM\s*\]\s*(.+?)\s*$/i;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function splitPastedThread(
  text: string,
  reportDate: string,
  directory: readonly (RmDirectoryEntry & { display_name: string })[],
): { reports: PastedReport[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: { name: string | null; lines: string[] }[] = [];
  for (const line of lines) {
    const h = HEADER_RE.exec(line);
    if (h) blocks.push({ name: h[1]!, lines: [line.trim()] });
    else if (blocks.length > 0) blocks.at(-1)!.lines.push(line);
  }
  // Không có dòng tiêu đề nào: cả đoạn là một bản, RM chưa xác định.
  if (blocks.length === 0 && text.trim() !== "") blocks.push({ name: null, lines });

  const byName = new Map(directory.filter((d) => d.active === 1).map((d) => [d.display_name.trim().toLowerCase(), d.rm_id]));
  return {
    reports: blocks.map((b, i) => {
      const content = b.lines.join("\n").trim();
      const rmId = b.name ? (byName.get(b.name.trim().toLowerCase()) ?? null) : null;
      // Mã tin ổn định theo ngày và RM (hoặc vị trí khi chưa map được); phiên bản là mã băm nội dung.
      const messageId = `paste-${sha(`${reportDate}\n${rmId ?? `#${i}`}`).slice(0, 24)}`;
      return {
        rmId,
        message: {
          messageId,
          rootId: `paste-${reportDate}`,
          authorTeamsUserId: null,
          createdAt: `${reportDate}T00:00:00.000Z`,
          lastModifiedAt: `v-${sha(content).slice(0, 16)}`,
          contentType: "text",
          content,
          webUrl: "",
        },
      };
    }),
  };
}
