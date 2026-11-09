// bundle_name (D-71): tên bundle theo mẫu tạm getProvisional("bundle_name"), ví dụ
// oneibc_{channel}_{jurisdiction}_{hook_id}_{yyyymmdd}_v{n}. Mỗi phần chỉ còn chữ thường, số và gạch nối; thiếu thì "all".
const slug = (v: string | null) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "all";

export function bundleName(pattern: string, b: { channel: string; jurisdiction: string | null; hookId: string | null; date: string; n: number }): string {
  return pattern.replace("{channel}", slug(b.channel)).replace("{jurisdiction}", slug(b.jurisdiction)).replace("{hook_id}", slug(b.hookId))
    .replace("{yyyymmdd}", b.date.replace(/-/g, "").slice(0, 8)).replace("{n}", String(b.n));
}
