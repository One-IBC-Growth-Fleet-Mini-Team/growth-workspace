// T-SBX-01 tới T-SBX-04: issue log nghiệm thu sandbox8 cho Mi1-mkt-05 (CRON-04, D-35) và dòng Mi1-mkt-05 trên Brief sáng.
// Dữ liệu tổng hợp, cùng dạng CSV xuất từ tab "Bug" và "Test Cases" của file test case sandbox8 do MobCEC giữ.
import { describe, expect, test } from "bun:test";
import { importSandboxLog } from "../../src/crm/sandbox-import.ts";
import { buildSandboxBoard } from "../../src/db/sandbox.ts";
import { casePassRate, isBugOpen, sandboxReady } from "../../src/metrics/sandbox-qa.ts";
import { buildBrief } from "../../src/mi1/core.ts";
import { renderBriefPage } from "../../src/queue/views/page.ts";
import { freshDb } from "../helpers/db.ts";
import { BASE, makeApp, MARK, session } from "../helpers/queue.ts";

const NOW = new Date("2026-11-09T02:00:00Z");
const BUGS = [
  "Bug ID,Mức độ,Tiêu chí,Test case,Tiêu đề lỗi,Vị trí / URL,Bước tái hiện,Kết quả mong đợi,Kết quả thực tế,Ảnh chụp,Trạng thái,Người xử lý,Ngày phát hiện,Ghi chú Dev",
  'BUG-001,High,Function,TC-1,Trang trả 404,https://sandbox.example.invalid/a,"1. Mở",200,404,,Open,CANARY_DEV_9a1,24/10/2026,',
  "BUG-002,Critical,Function,TC-2,Thanh toán lỗi,https://sandbox.example.invalid/pay,b,c,d,,Closed,x,24/10/2026,",
  "BUG-003,Medium,Content,TC-3,Sai chữ,https://sandbox.example.invalid/b,b,c,d,,Fixed,x,25/10/2026,",
  "BUG-004,Low,UI/UX,TC-4,Lệch 2px,https://sandbox.example.invalid/c,b,c,d,,Reject,x,26/10/2026,",
  "BUG-005,Trung bình,Content,TC-5,Thiếu dòng,https://sandbox.example.invalid/d,b,c,d,,Open,x,03/11/2026,",
].join("\n");
const CASES = [
  "Mã TC,STT,Trang,Tiêu chí,Status,Nguồn đối chiếu",
  "TC-1,1,/a,3. Function,Fail,x", "TC-2,1,/a,3. Function,Pass,x", "TC-3,1,/a,1. Content,Pass,x",
  "TC-4,1,/a,1. Content,N/A,x", "TC-5,1,/a,1. Content,Blocked,x", "TC-6,1,/a,2. UI/UX,Not run,x",
].join("\n");

function load() {
  const db = freshDb();
  importSandboxLog(db, { bugs: BUGS, cases: CASES }, { now: NOW, actor: "mark" });
  return db;
}

describe("T-SBX nghiệm thu sandbox8", () => {
  test("T-SBX-01 hàm: bug mở là mọi trạng thái trừ Closed, Reject; % pass bỏ N/A khỏi mẫu; sẵn sàng khi không còn Critical, High mở", () => {
    expect(["Open", "Fixed", "Closed", "Reject", "closed"].map(isBugOpen)).toEqual([true, true, false, false, false]);
    expect(casePassRate(["Pass", "Pass", "Fail", "N/A"])).toBeCloseTo(2 / 3);
    expect(casePassRate(["N/A"])).toBeNull();
    expect(sandboxReady([{ severity: "Medium", status: "Open" }, { severity: "High", status: "Closed" }])).toBe(true);
    expect(sandboxReady([{ severity: "critical", status: "Fixed" }])).toBe(false);
    expect(sandboxReady([{ severity: "Cao", status: "Open" }])).toBe(false); // file MobCEC có bug ghi mức độ tiếng Việt
  });

  test("T-SBX-02 bảng: đếm theo mức độ, danh sách bug mở (nặng trước), % pass theo tiêu chí; không lưu người xử lý", () => {
    const db = load();
    const b = buildSandboxBoard(db);
    expect(b.ready).toBe(false);
    expect(b.bySeverity).toEqual([
      { severity: "Critical", total: 1, open: 0 }, { severity: "High", total: 1, open: 1 },
      { severity: "Medium", total: 2, open: 2 }, { severity: "Low", total: 1, open: 0 },
    ]);
    expect(b.open.map((x) => x.bugId)).toEqual(["BUG-001", "BUG-003", "BUG-005"]);
    expect(b.cases).toEqual({ total: 6, pass: 2, fail: 1, blocked: 1, passRate: 0.4 });
    expect(new TextDecoder().decode(db.serialize())).not.toContain("CANARY_DEV");
    expect(() => db.run("DELETE FROM sandbox_bugs")).toThrow("append_only:sandbox_bugs");
    expect(importSandboxLog(db, { bugs: "a,b\n1,2" }, { now: NOW, actor: "mark" }).errorCode).toBe("SANDBOX_BUG_HEADER_NOT_FOUND");
  });

  test("T-SBX-03 Brief sáng có dòng Mi1-mkt-05: tài phán đã chốt giá, SKD, sandbox8", () => {
    const page = renderBriefPage(buildBrief(load(), NOW));
    expect(page).toContain("Mi1-mkt-05: 0/45 tài phán đã chốt giá (chưa nạp bảng giá), bộ SKD 0/10, sandbox8 còn 3 bug mở (1 Critical, High), chưa sẵn sàng nghiệm thu");
  });

  test("T-SBX-04 trang /jurisdictions: nạp được tab Bug và Test Cases, hiện khối nghiệm thu", async () => {
    const { app } = makeApp(freshDb());
    const s = session(MARK);
    const fd = new FormData();
    fd.append("csrf", s.csrf);
    fd.append("bugs", new File([BUGS], "bug.csv", { type: "text/csv" }));
    fd.append("cases", new File([CASES], "tc.csv", { type: "text/csv" }));
    const res = await app.fetch(new Request(`${BASE}/jurisdictions`, { method: "POST", headers: { cookie: s.cookie, origin: BASE }, body: fd }));
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("Đã nạp issue log sandbox8: 5 bug, 6 test case.");
    expect(page).toContain("Nghiệm thu sandbox8: chưa sẵn sàng");
    expect(page).toContain("BUG-001");
  });
});
