// Render HTML phía server; mọi chuỗi đi qua escapeHtml (T-Q-08). Không có script phía client.
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Thẻ HTML an toàn: giá trị nội suy được escape, trừ khi đã là SafeHtml.
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  const out: string[] = [strings[0]!];
  values.forEach((v, i) => {
    out.push(render(v), strings[i + 1]!);
  });
  return new SafeHtml(out.join(""));
}

function render(v: unknown): string {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === null || v === undefined || v === false) return "";
  return escapeHtml(v);
}
