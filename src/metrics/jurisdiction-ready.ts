// Chỉ số Mi1-mkt-05 (spec mục 1 câu hỏi 3; D-32, D-33). Tính bằng code, không do LLM.
//   price_row_status: một dòng (tài phán, loại hình) của sheet giá FINAL là
//     no_price nếu thiếu số ở một trong 6 cột giá (ô "Get a Quote" hoặc chữ);
//     formula_mismatch nếu gói 2 năm khác Starter + 1 năm gia hạn, hoặc gói 3 năm khác Starter + 2 năm gia hạn,
//       quá dung sai (quy tắc ở sheet "Hướng dẫn đọc" của file giá);
//     locked nếu không rơi vào hai trường hợp trên.
//   jurisdiction_price_locked: mọi dòng của tài phán đều locked.
//   skd_kit_done: số file của bộ SKD eKYC đã có, trên tổng skdFiles.
import type { JurisdictionParams } from "../config.ts";

export type PriceRow = { starter: number | null; grow: number | null; premium: number | null; renewal: number | null; renewal2y: number | null; renewal3y: number | null };
export type PriceRowStatus = { status: "no_price" } | { status: "locked" } | { status: "formula_mismatch"; expected2y: number; expected3y: number };

export function priceRowStatus(r: PriceRow, p: JurisdictionParams): PriceRowStatus {
  const v = [r.starter, r.grow, r.premium, r.renewal, r.renewal2y, r.renewal3y];
  if (v.some((x) => x === null)) return { status: "no_price" };
  const expected2y = r.starter! + r.renewal!;
  const expected3y = r.starter! + 2 * r.renewal!;
  const off = (actual: number, expected: number) => Math.abs(actual - expected) > Math.max(p.absTolerance, p.relTolerance * expected);
  return off(r.renewal2y!, expected2y) || off(r.renewal3y!, expected3y) ? { status: "formula_mismatch", expected2y, expected3y } : { status: "locked" };
}

const RATIOS = ["16x9", "9x16"] as const;
const VARIANTS = ["clean", "subtitled"] as const;

// Tên clip theo quy ước của thư mục Userguide: <tên clip>-<16x9|9x16>-<clean|subtitled>.mp4
export function skdKitStatus(fileNames: string[], p: JurisdictionParams): { done: number; total: number; missing: string[] } {
  const names = fileNames.map((n) => n.trim()).filter(Boolean);
  const pdf = names.some((n) => /\.pdf$/i.test(n));
  const html = names.some((n) => /\.html?$/i.test(n));
  const clips = new Map<string, Set<string>>();
  for (const n of names) {
    const m = /^(.+)-(16x9|9x16)-(clean|subtitled)\.(mp4|mov)$/i.exec(n);
    if (!m) continue;
    const id = m[1]!;
    if (!clips.has(id)) clips.set(id, new Set());
    clips.get(id)!.add(`${m[2]!.toLowerCase()}-${m[3]!.toLowerCase()}`);
  }
  const missing: string[] = [];
  if (!pdf) missing.push("Thiếu file PDF hướng dẫn");
  if (!html) missing.push("Thiếu file HTML hướng dẫn");
  let videos = 0;
  for (const [id, have] of [...clips].slice(0, p.skdClips)) {
    videos += have.size;
    const lack = RATIOS.flatMap((r) => VARIANTS.map((v) => `${r}-${v}`)).filter((k) => !have.has(k));
    if (lack.length) missing.push(`Clip ${id}: thiếu ${lack.join(", ")}`);
  }
  const lackClips = p.skdClips - Math.min(clips.size, p.skdClips);
  if (lackClips) missing.push(`Thiếu ${lackClips} clip (mỗi clip 4 file: 16x9 và 9x16, bản sạch và bản phụ đề)`);
  return { done: Number(pdf) + Number(html) + videos, total: p.skdFiles, missing };
}
