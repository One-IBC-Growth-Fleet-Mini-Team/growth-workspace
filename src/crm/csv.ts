// Đọc CSV theo RFC 4180: ô có ngoặc kép, dấu phẩy và xuống dòng trong ô, "" là một dấu ngoặc kép.
// Chấp nhận BOM của Excel, CRLF, và dấu chấm phẩy làm dấu phân cách (Excel bản tiếng Việt hay xuất như vậy).
// rowNo: số thứ tự bản ghi trong file (dòng tiêu đề là 1), để báo lỗi đúng dòng Excel sau khi bỏ dòng trống (D-78).
export type Csv = { header: string[]; rows: string[][]; rowNo: number[] };

export class CsvError extends Error {
  readonly code = "CSV_INVALID";
  constructor() {
    super("CSV_INVALID");
  }
}

export function parseCsv(text: string): Csv {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
    } else cell += ch;
    i += 1;
  }
  if (quoted) throw new CsvError();
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  // Bỏ dòng trống và dòng toàn ô trống (Excel hay để lại ";;" hoặc ",,"), giữ số thứ tự bản ghi gốc.
  const kept = records.map((r, k) => ({ r, n: k + 1 })).filter(({ r }) => r.some((c) => c.trim() !== ""));
  if (kept.length === 0) throw new CsvError();
  return { header: kept[0]!.r.map((h) => h.trim()), rows: kept.slice(1).map((x) => x.r), rowNo: kept.slice(1).map((x) => x.n) };
}
