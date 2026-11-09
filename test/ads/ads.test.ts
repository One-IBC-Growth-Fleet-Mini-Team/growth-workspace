// T-ADS-01 tới T-ADS-04: cổng tuân thủ trước khi đăng (spec mục 7, tầng 1A, 1B; D-38). Kiểm bằng code, $0 token.
import { describe, expect, test } from "bun:test";
import { checkAdCopy, firstSentence } from "../../src/metrics/ad-compliance.ts";
import { checkAdBatch } from "../../src/ads/check.ts";
import { importPriceSheet } from "../../src/crm/jurisdiction-import.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, get, makeApp, MARK, post, session } from "../helpers/queue.ts";

const R = {
  banned: ["offshore", "no tax", "tax haven", "tax heaven", "money laundering"],
  review: ["banking", "finance"],
  brandAllow: ["offshore company corp", "offshorecompanycorp.com"],
  maxOpening: 124, maxHeadline: 40, maxDescription: 30,
};
const ok = { primaryText: "Set up your Hong Kong company in 2 days. Our team handles the paperwork.", headline: "Hong Kong company in 2 days", description: "From USD 1,968" };

describe("T-ADS cổng tuân thủ", () => {
  test("T-ADS-01 từ cấm (không phân biệt hoa thường, nguyên từ), tên thương hiệu được loại trước khi so", () => {
    expect(checkAdCopy(ok, R)).toEqual({ verdict: "pass", issues: [] });
    expect(checkAdCopy({ ...ok, primaryText: "Offshore Company Corp helps you. Visit offshorecompanycorp.com today." }, R).verdict).toBe("pass");
    const bad = checkAdCopy({ ...ok, headline: "Go OFFSHORE, No Tax" }, R);
    expect(bad.verdict).toBe("fail");
    expect(bad.issues).toEqual([{ code: "BANNED_WORD", field: "headline", detail: "offshore" }, { code: "BANNED_WORD", field: "headline", detail: "no tax" }]);
    expect(checkAdCopy({ ...ok, description: "Taxonomy notes" }, R).verdict).toBe("pass"); // "tax" trong từ khác không tính
  });

  test("T-ADS-02 từ cần người duyệt và giới hạn độ dài", () => {
    expect(checkAdCopy({ ...ok, primaryText: "Open a business banking account. Fast." }, R)).toEqual({ verdict: "review", issues: [{ code: "REVIEW_WORD", field: "primaryText", detail: "banking" }] });
    expect(firstSentence("Hello world. Second one!")).toBe("Hello world.");
    expect(firstSentence("Mở công ty Hong Kong trong 2 ngày! Đội ngũ lo hồ sơ.")).toBe("Mở công ty Hong Kong trong 2 ngày!");
    const long = checkAdCopy({ primaryText: `${"a".repeat(125)}. Rest.`, headline: "x".repeat(41), description: "y".repeat(31) }, R);
    expect(long.verdict).toBe("fail");
    expect(long.issues.map((i) => [i.code, i.detail])).toEqual([["TOO_LONG_OPENING", "126/124"], ["TOO_LONG_HEADLINE", "41/40"], ["TOO_LONG_DESCRIPTION", "31/30"]]);
  });

  test("T-ADS-03 lô CSV: giữ lại (hold) khi tài phán chưa chốt giá theo sheet FINAL; thiếu tài phán thì bỏ qua bước này", () => {
    const db = freshDb();
    importPriceSheet(db, [
      "Jurisdiction,Loại hình công ty,Starter,Grow,Premium,Renewal,2y,3y",
      'Hong Kong,Ltd,"$1,000","$2,000","$3,000",$500,"$1,500","$2,000"',
      "Switzerland,GmbH,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote,Get a Quote",
    ].join("\n"), { now: new Date("2026-11-09T02:00:00Z"), actor: "mark" });
    const csv = ["id,jurisdiction,primary_text,headline,description",
      `A1,Hong Kong,"${ok.primaryText}",${ok.headline},x`, "A2,Switzerland,Swiss GmbH in 3 weeks.,Swiss GmbH,x", "A3,Atlantis,Hello.,Hi,x", "A4,,Hello.,Hi,x"].join("\n");
    const r = checkAdBatch(db, csv, R);
    expect(r.status).toBe("succeeded");
    expect(r.rows.map((x) => [x.id, x.verdict])).toEqual([["A1", "pass"], ["A2", "hold"], ["A3", "hold"], ["A4", "pass"]]);
    expect(r.rows[1]!.issues).toEqual([{ code: "HOLD_PRICE_NOT_LOCKED", field: "jurisdiction", detail: "Switzerland" }]);
    expect(checkAdBatch(db, "a,b\n1,2", R).errorCode).toBe("ADS_HEADER_NOT_FOUND");
  });

  test("T-ADS-04 trang /ads-check: dán một mẫu hoặc tải CSV; cần đăng nhập; Hàng chờ có link", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const res = await post(app, "/ads-check", { csrf: s.csrf, primary_text: "Zero worries. Go offshore today.", headline: "Hi", description: "x" }, s.cookie);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Không đạt");
    expect(page).toContain("offshore");
    expect((await get(app, "/ads-check")).status).toBe(302);
    expect(await (await get(app, "/queue", s.cookie)).text()).toContain('href="/ads-check"');
  });
});
