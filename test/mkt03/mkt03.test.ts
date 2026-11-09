// T-MKT3-01 tới T-MKT3-03: verify quảng cáo Meta theo quốc gia (Mi1-mkt-03; spec tầng 1B; D-41). Dữ liệu tổng hợp.
import { describe, expect, test } from "bun:test";
import { checkAdBatch } from "../../src/ads/check.ts";
import { AD_RULES } from "../../src/config.ts";
import { countryHold, latestCountryStatus, recordCountryVerification } from "../../src/db/meta-verify.ts";
import { freshDb } from "../helpers/db.ts";
import { get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const T = (h: string) => new Date(`2026-11-09T${h}:00Z`);
const REQ = ["Taiwan", "India"];

describe("T-MKT3 verify Meta theo quốc gia", () => {
  test("T-MKT3-01 lần ghi mới nhất thắng; quốc gia cần verify mà chưa verified thì hold; quốc gia khác không xét", () => {
    const db = freshDb();
    recordCountryVerification(db, { country: "taiwan", status: "pending", note: "" }, { now: T("01:00"), actor: "mark" });
    recordCountryVerification(db, { country: "Taiwan", status: "verified", note: "" }, { now: T("02:00"), actor: "mark" });
    expect(latestCountryStatus(db)).toEqual([{ country: "Taiwan", status: "verified", checkedAt: "2026-11-09T02:00:00.000Z", note: null }]);
    expect(countryHold(db, "TW", REQ)).toBeNull();
    expect(countryHold(db, "IN", REQ)).toEqual({ code: "HOLD_META_NOT_VERIFIED", field: "target_country", detail: "India" });
    expect(countryHold(db, "Vietnam", REQ)).toBeNull();
    expect(recordCountryVerification(db, { country: "", status: "verified", note: "" }, { now: T("03:00"), actor: "mark" })).toBe("VERIFY_INVALID");
    expect(() => db.run("DELETE FROM meta_country_verifications")).toThrow("append_only:meta_country_verifications");
  });

  test("T-MKT3-02 cổng /ads-check: cột target_country giữ lại mẫu nhắm quốc gia chưa verify", () => {
    const db = freshDb();
    const csv = ["id,target_country,primary_text,headline,description", "A1,India,Hello.,Hi,x", "A2,Vietnam,Hello.,Hi,x"].join("\n");
    const r = checkAdBatch(db, csv, AD_RULES);
    expect(r.rows.map((x) => [x.id, x.verdict])).toEqual([["A1", "hold"], ["A2", "pass"]]);
  });

  test("T-MKT3-03 trang /channels có mục verify theo quốc gia; ghi có CSRF", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const res = await post(app, "/channels/verify", { csrf: s.csrf, country: "India", status: "pending", note: "Đã nộp giấy phép" }, s.cookie);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã ghi trạng thái verify India.");
    expect(page).toContain("Taiwan: chưa ghi");
    expect((await post(app, "/channels/verify", { csrf: "sai", country: "India", status: "verified" }, s.cookie)).status).toBe(403);
    expect(await (await get(app, "/channels", s.cookie)).text()).toContain("India");
  });
});
