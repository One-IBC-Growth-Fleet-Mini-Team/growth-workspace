// Gợi ý ngân hàng (D-34): đọc lượt nạp ma trận mới nhất, chỉ đọc.
import type { Database } from "bun:sqlite";
import { BANK_PARAMS, type BankParams } from "../config.ts";
import { suggestBanks, type BankCandidate } from "../metrics/bank-suggest.ts";

export type BankInfo = { complexity: string | null; processing: string | null; deposit: string | null; meeting: string | null };
export type BankAdvice = {
  importedAt: string | null;
  jurisdictions: string[];
  suggestion: ReturnType<typeof suggestBanks> | null; // null khi chưa chọn tài phán hoặc tài phán không có trong ma trận
  details: Map<string, BankInfo>;
};

export function buildBankAdvice(db: Database, q: { jurisdiction: string | null; newCompany: boolean }, p: BankParams = BANK_PARAMS): BankAdvice {
  const imp = db.query("SELECT i.id, i.imported_at AS at FROM bank_imports i WHERE EXISTS (SELECT 1 FROM bank_support s WHERE s.import_id = i.id) ORDER BY i.imported_at DESC, i.id DESC LIMIT 1").get() as { id: string; at: string } | null;
  const advice: BankAdvice = { importedAt: imp?.at ?? null, jurisdictions: [], suggestion: null, details: new Map() };
  if (!imp) return advice;
  advice.jurisdictions = (db.query("SELECT DISTINCT jurisdiction FROM bank_support WHERE import_id = ? ORDER BY jurisdiction").all(imp.id) as { jurisdiction: string }[]).map((r) => r.jurisdiction);
  for (const r of db.query("SELECT bank, complexity, processing_time AS processing, initial_deposit AS deposit, meeting FROM bank_info WHERE import_id = ?").all(imp.id) as (BankInfo & { bank: string })[]) {
    const { bank, ...rest } = r;
    advice.details.set(bank, rest);
  }
  if (!q.jurisdiction || !advice.jurisdictions.includes(q.jurisdiction)) return advice;
  const rows = db.query("SELECT bank, category, supported FROM bank_support WHERE import_id = ? AND jurisdiction = ?").all(imp.id, q.jurisdiction) as { bank: string; category: "emi" | "traditional"; supported: number }[];
  const candidates: BankCandidate[] = rows.map((r) => ({ bank: r.bank, category: r.category, supported: r.supported === 1, complexity: advice.details.get(r.bank)?.complexity ?? null }));
  advice.suggestion = suggestBanks(candidates, { newCompany: q.newCompany }, p);
  return advice;
}
