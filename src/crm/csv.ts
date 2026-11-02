// Đọc CSV theo RFC 4180: ô có ngoặc kép, dấu phẩy và xuống dòng trong ô, "" là một dấu ngoặc kép.
// Chấp nhận BOM của Excel, CRLF, và dấu chấm phẩy làm dấu phân cách (Excel bản tiếng Việt hay xuất như vậy).
export type Csv = { header: string[]; rows: string[][] };

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
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
  if (nonEmpty.length === 0) throw new CsvError();
  return { header: nonEmpty[0]!.map((h) => h.trim()), rows: nonEmpty.slice(1) };
}
