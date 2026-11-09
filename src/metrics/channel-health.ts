// Sức khoẻ tài khoản kênh (CRON-02; D-37). Tính bằng code, không do LLM.
//   Mỗi tài khoản lấy lần kiểm mới nhất. Có vấn đề: trạng thái restricted hoặc disabled.
//   Quá hạn kiểm: lần kiểm mới nhất cũ hơn staleHours. Chưa theo dõi: số tài khoản theo spec trừ số đã có lần kiểm.
import type { ChannelParams } from "../config.ts";

export const KINDS = ["bm", "wa", "fanpage"] as const;
export type ChannelKind = (typeof KINDS)[number];
export type ChannelCheck = { kind: ChannelKind; label: string; status: "ok" | "restricted" | "disabled"; checkedAt: string };

export function channelSummary(latest: ChannelCheck[], now: Date, p: ChannelParams) {
  const staleBefore = now.getTime() - p.staleHours * 3_600_000;
  const count = (k: ChannelKind) => latest.filter((c) => c.kind === k).length;
  return {
    ok: latest.filter((c) => c.status === "ok").length,
    issues: latest.filter((c) => c.status !== "ok"),
    stale: latest.filter((c) => Date.parse(c.checkedAt) < staleBefore),
    notTracked: Object.fromEntries(KINDS.map((k) => [k, Math.max(0, p.expected[k] - count(k))])) as Record<ChannelKind, number>,
  };
}
