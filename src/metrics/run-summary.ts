// run_summary (D-73): đếm cho câu báo sau mỗi lần dán hoặc nạp: mục tạo mới theo loại (bỏ thông báo hệ thống), mục trùng
// đã có trên Hàng chờ, tổng số chỗ đã che PII (R1). Đếm bằng code, không do LLM.
export function summarizeRun(items: readonly { item_type: string }[], created: readonly boolean[], redactions: readonly Record<string, number>[]) {
  const byType: Record<string, number> = {};
  let made = 0;
  items.forEach((it, k) => {
    if (!created[k]) return;
    made += 1;
    if (it.item_type !== "system_notice") byType[it.item_type] = (byType[it.item_type] ?? 0) + 1;
  });
  let pii = 0;
  for (const r of redactions) for (const v of Object.values(r)) pii += v;
  return { byType, duplicates: items.length - made, piiMasked: pii };
}
