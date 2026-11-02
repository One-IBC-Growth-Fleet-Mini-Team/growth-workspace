# Growth Workspace: hướng dẫn cho Claude Code

Bắt đầu mọi phiên bằng việc đọc docs/STATUS.md; kết thúc mọi phiên bằng việc cập nhật nó.

Repo này xây Growth Workspace của One IBC. Spec nguồn: `docs/spec/growth-workspace-spec-v0.3.2.md`. Khi spec và code mâu thuẫn, spec thắng; khi spec mơ hồ, dừng lại và hỏi.

## Hai fleet, đừng nhầm

- **Fleet kỹ thuật**: chính bạn (Claude Code) và các skill gstack, dùng để XÂY repo này.
- **Fleet nghiệp vụ**: Mi1 và các thuyền viên (Mi1-data-01, Mi1-sa-01, ...), là SẢN PHẨM mà repo này tạo ra. Spec mục 6.

## Quy tắc cứng

1. **CRM chỉ đọc.** Không viết code, script hay test nào ghi, sửa, xoá dữ liệu trên crm.oneibc.com hoặc api-crm.oneibc.com. Mọi client CRM phải là read-only và có test chứng minh điều đó.
2. **Không PII khách trong repo, log, fixture, eval.** Không tên, email, số điện thoại, số hộ chiếu, ngày sinh. Fixture dùng dữ liệu tổng hợp. Kiểm trùng Lead dùng mã băm (SHA-256 của email và số điện thoại đã chuẩn hoá).
3. **Agent nghiệp vụ không tự cộng số bằng LLM.** Mọi chỉ số đi qua hàm trong `docs/spec/metric-definitions.md`, có unit test.
4. **Việc có tiền, gửi ra ngoài, xuất bản công khai: luôn cần người duyệt.** Không có code path nào bỏ qua được cổng này, kể cả khi điểm tự tin cao.
5. **Không tự merge, không tự deploy.** Mở PR bằng `/ship`; người chịu trách nhiệm kỹ thuật merge.
6. **Secret** chỉ nằm trong biến môi trường hoặc kho bí mật của tổ chức. Không commit `.env`.
7. Tài liệu và comment viết tiếng Việt, không dùng dấu gạch ngang dài. Tên biến, hàm, schema bằng tiếng Anh.

## Đi dây chừa ổ cắm (cổng kết nối)

- Mọi kết nối ra ngoài (CRM, tự báo RM, thông báo, LLM, đăng nhập, lưu trữ; sau này ads, Teams, MCP khác) đi qua MỘT cổng (port), chọn adapter bằng biến môi trường.
- Mỗi cổng có ít nhất một adapter chạy ngay không cần ai ngoài (csv, paste, password, sqlite, không gửi thông báo) và một adapter thật, có thể để trống hoặc stub.
- Thêm nguồn mới = thêm một file adapter và một dòng cấu hình. Không sửa code nghiệp vụ.
- Bảng mọi cổng, adapter đang có, adapter chờ, biến môi trường: `docs/context/ports.md`. Thêm hay đổi cổng thì cập nhật bảng trong cùng PR.

## Trần độ phức tạp

- Dự án chưa cần chuẩn bảo mật hay hạ tầng doanh nghiệp. Chọn cách đơn giản nhất chạy được cho người dùng hiện tại (Amy, một người). Bảo mật giữ ở mức: CRM chỉ đọc, không PII, có mật khẩu, không lộ secret. Không thêm SSO, hạ tầng hay công cụ vận hành mới khi chưa có người dùng thứ hai cần nó.
- Không thêm dependency, chế độ đăng nhập hay cách triển khai mới nếu người chịu trách nhiệm kỹ thuật chưa yêu cầu rõ.
- Chỉ một cách triển khai: cài trên máy Ubuntu, chạy ở localhost (`deploy/local/`, D-26). Bộ máy chủ trong `deploy/` là "để sau", không bảo trì thêm.
- Mỗi PR dưới khoảng 400 dòng thay đổi (không tính test). Lớn hơn thì tách.
- Không mở phạm vi mới nếu việc đó không có trong "Việc tiếp theo" của `docs/STATUS.md`.
- Khi có hai cách, nêu cách đơn giản trước; ghi cách khó vào `docs/context/ports.md` mục "Để sau".

## Nguyên tắc viết code

Nối thêm bộ Karpathy guidelines vào cuối file này khi setup (xem `docs/kickoff/setup.md`). Tóm tắt: nêu giả định trước khi code; đơn giản trước; chỉ sửa đúng chỗ cần sửa; định nghĩa tiêu chí thành công bằng test rồi lặp tới khi pass.

## Nhịp làm việc (gstack)

`/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → build (test trước) → `/review` → `/cso` → `/qa` (nếu chạm web) → `/ship`. Cuối tuần `/retro`.

## Bản đồ tài liệu

| File | Dùng khi |
|---|---|
| `docs/spec/growth-workspace-spec-v0.3.2.md` | Mọi quyết định phạm vi |
| `docs/spec/metric-definitions.md` | Viết bất kỳ hàm tính số nào |
| `docs/spec/rejection-reason-codes.md` | Mi1-sa-01, phân loại lý do từ chối |
| `docs/spec/data-contract-mobcec.md` | Sự kiện, chuỗi ID, API Internal Control |
| `docs/context/decisions.md` | Quyết định đã chốt ngoài spec; bẫy dữ liệu đã biết |
| `docs/context/ports.md` | Thêm hay đổi một kết nối ra ngoài |
| `docs/kickoff/` | Đề bài từng phiên |
| `evals/` | Bộ eval của agent nghiệp vụ |

## Karpathy guidelines (nguồn: multica-ai/andrej-karpathy-skills)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
