# Phiên GĐ3: khung quyết định, đề xuất chiến lược, Command Center 3D

Dán phần dưới vào Claude Code sau khi đã chép bộ tài liệu này vào repo.

---

Mark Ng gửi bổ sung để làm GĐ3. Trả lời câu hỏi của bạn: **khung quyết định Awareness/Traffic vs Conversion đã có bản Tạm** ở `docs/spec/khung-quyet-dinh-awareness-conversion.md`, và **Command Center đầy đủ đã có spec** ở `docs/spec/command-center-3d.md` kèm prototype tham chiếu trong `docs/reference/command-center/`. Bạn đúng về Phụ lục B: không xây.

Đọc trước: `CLAUDE.md`, `docs/STATUS.md`, hai file spec mới trên, `docs/reference/command-center/prototype.html` (đọc để hiểu hành vi, không chép nguyên), `docs/reference/architecture-overview.html`.

Ràng buộc giữ nguyên: CRM chỉ đọc; không PII; số do hàm tính, LLM không tự cộng số; tiền, gửi ra ngoài, xuất bản luôn cần người duyệt; mỗi PR dưới 400 dòng chưa tính test; dữ liệu tổng hợp; mọi giá trị chưa chốt nằm trong `config/provisional.json` và hiện nhãn "Tạm". Không thêm nguồn dữ liệu, chế độ đăng nhập hay cách triển khai mới.

## Việc 1. Bộ máy khung quyết định (`src/metrics/budget-framework.ts`)

- Cài đúng mục 2 tới 6 của file khung: cổng G1 tới G4, quy tắc R1 tới R6, chỉ số theo mục tiêu, tham số phân bổ.
- Mọi tham số đọc từ `config/provisional.json` (thêm khoá `budget_framework`), sửa được ở `/tuning`, kích hoạt sau khi eval chạy lại và pass như các tham số khác.
- `/budget` dùng bộ máy này để sinh `draft_budget_change` mỗi tuần; mỗi dòng ghi quy tắc đã áp và số dẫn chứng; dòng vượt ngưỡng gắn cờ cần anh Jimmy.
- CRON-07 gọi bộ máy này.
- Test: mỗi quy tắc và mỗi cổng ít nhất một ca; G1 đè lên mọi quy tắc; không dòng nào vượt biên ±20% trừ R5; đổi tham số trong config thì kết quả đổi theo.

## Việc 2. Đề xuất chiến lược tuần (`src/mi1/strategy.ts`, trang `/strategy`)

- Mi1 gom câu trả lời của 7 câu hỏi đầu ra (spec mục 1) từ các hàm đã có, cộng: nháp ngân sách (việc 1), Hook cần dừng hay nhân rộng (Win gate), NBA tồn, đối tác nên đầu tư thêm, bài học mới có bằng chứng.
- LLM chỉ viết phần lời dẫn từ một gói số đã tính sẵn; mỗi nhận định phải trỏ tới mã số liệu trong gói; câu nào không trỏ được thì bị loại. Có Eval Gate riêng (`evals/mi1-strategy/`), ngưỡng 0,8, như `/ask`.
- Đầu ra là một bản nháp vào Hàng chờ của Mark; Mark duyệt thì bản tóm tắt đi vào Digest tuần cho anh Jimmy. Không tự áp bất kỳ thay đổi nào.
- Câu hỏi nào chưa đủ dữ liệu thì ghi rõ "chưa đủ dữ liệu" kèm lý do, không viết suy đoán.
- Test: bản nháp không có số nào ngoài gói; thiếu dữ liệu thì không sinh nhận định; eval chưa pass thì trang khoá như `/ask`.

## Việc 3. API dữ liệu cho Command Center (`/command/data.json`)

- Tách dữ liệu đang dựng `/command` thành một endpoint JSON (có kiểm quyền theo vai trò, không PII): lượt chạy hiện tại hoặc gần nhất kèm các bước con, sổ thuyền viên, mục chờ Mark, dự báo tải, chi phí tháng, module theo vai trò (bảng ở mục 2 file spec 3D).
- `/command` bản phẳng chuyển sang đọc endpoint này. Test: cùng lượt chạy cho cùng JSON với cả hai bản.

## Việc 4. Command Center 3D (`/command/3d`)

- Làm đúng `docs/spec/command-center-3d.md` mục 1 tới 6, đọc dữ liệu từ việc 3. Chia nhỏ PR: (a) cảnh, Mi1, bệ xoay, ảnh dự phòng và tự về bản phẳng; (b) vệ tinh, nhãn ẩn, nhìn theo lựa chọn, bảng frosted glass; (c) đầu thuyền viên, màn hình treo tường hiện vết lượt chạy; (d) thanh động tác, âm thanh bật tắt, gắn sự kiện thật.
- Model: chép `docs/reference/command-center/mi1.glb` vào thư mục tĩnh của app. Three.js r0.160.0 vendored, không CDN.
- Chạy nghiệm thu mục 7 của file spec 3D trên bản demo, chụp màn hình desktop và 375 px để Mark so với `screenshot-desktop.png`, `screenshot-mobile.png`.

## Việc 5. Bảng sẵn sàng của Phụ lục B (trên `/command`)

- Không xây các mục Phụ lục B. Chỉ thêm một bảng: mỗi mục, điều kiện bật theo spec, tiến độ hiện tại đo được (ví dụ "Quyết định thật trong Hàng chờ: 0/50", "Hàng chờ chạy ổn: 0/4 tuần", "Cổng 3: chưa"), ai mở khoá.

## Kết thúc

Cập nhật `docs/STATUS.md`, `docs/progress.json`, ghi quyết định mới vào sổ quyết định. Báo bằng bảng: việc, PR, test, chỗ còn Tạm, chỗ cần Mark chốt. Rồi dừng.
