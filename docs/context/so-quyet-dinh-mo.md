# Sổ quyết định còn mở của lát cắt 01 (sau phiên 02 tới 04)

02/11/2026 · Fleet kỹ thuật · Người chốt: Mark Ng (và người chịu trách nhiệm kỹ thuật ở D-18).

Tiếp nối Sổ quyết định D-01 tới D-13 (design doc `docs/design/slice-01-amy-queue.md` mục 13, đã chốt). Mỗi dòng dưới đây là một chỗ code đang chạy theo cột "Đang làm"; trả lời ở PR bằng mã, ví dụ "D-14 đồng ý", "D-15 chọn B". Không có phản hồi khác thì giữ cột "Đang làm". Chốt xong thì chuyển dòng sang `docs/context/decisions.md`.

| Mã | Quyết định | Đang làm (đề xuất) | Lựa chọn khác | Ảnh hưởng nếu đổi | Trạng thái |
|---|---|---|---|---|---|
| D-14 | Cookie của luồng đăng nhập OIDC | `SameSite=Lax`, path `/auth`, sống 10 phút, có ký. Cookie phiên vẫn `Strict` như design doc mục 9 | Giữ Strict cho cả hai | Giữ Strict thì đăng nhập Entra thật không hoàn tất được (trình duyệt bỏ cookie khi Entra chuyển về) | chờ |
| D-15 | R3 cho qua tên khách một từ đứng đầu câu (ví dụ "Johnathan chê giá") | A: giữ như hiện tại; lớp R2 (prompt yêu cầu thay tên bằng `KHACH_n`) và R4 (Amy bấm "Báo PII", người vận hành xoá có kiểm soát) che lỗ này; theo dõi số `pii_flag` mỗi tuần | B: chặn mọi từ viết hoa đầu câu không có trong danh sách từ thông dụng tiếng Việt | B chặn nhầm nhiều bản nháp hơn (Amy chỉ còn link Teams); cần dựng và giữ danh sách từ thông dụng | chờ |
| D-16 | NBA đọc trường bổ sung từ đâu | Đọc thẳng snapshot chỉ đọc (`last_modified_at`, ngành, dịch vụ đã mua, khách cũ, cờ reseller), cùng `etl_run_id` với kết quả `get_pipeline_by_close_date`. Danh sách Opportunity vẫn chỉ đến từ tool đó (luật 5) | Thêm tool MCP thứ 4 trả các trường này | Thêm tool phải sửa T-MCP-01 ("đúng 3 tool") và design doc mục 5.2 | chờ |
| D-17 | `NBA_X_DUP` (Lead trùng với RM khác) | Code và test có, nhưng khi chạy thật không kích hoạt vì snapshot chưa có liên kết Lead với Client | Hỏi MobCEC trường liên kết (ví dụ Lead đã chuyển thành Client nào), thêm cột vào snapshot, bật luật | Cần MobCEC trả lời (gói câu hỏi, MobCEC câu M-03) | chờ |
| D-18 | Typecheck trên CI | Cài `typescript` và `@types/bun` tạm trong job CI, không thêm vào `package.json`, giữ D-01 nguyên văn | Thêm hai gói làm devDependency, chạy được `bun run typecheck` ở máy người làm | Không đổi gì ở runtime; chỉ là nới D-01 cho công cụ phát triển | chờ |
| D-19 | Cờ `truncated`, `unstructured` trong điểm tự tin | Mỗi cờ nhân 0,8 (hai cờ thành 0,64) | Có cờ nào thì nhân 0,8 đúng một lần | Đổi hằng số và test T-MET-06 | chờ |
| D-20 | Lớp R1 với URL | Xoá mọi URL (chặt hơn design doc, vì đường dẫn hồ sơ mạng xã hội chứa tên) | Chỉ xoá URL có tham số như design doc mục 7.3 | Giữ URL không tham số thì có thể lộ tên qua đường dẫn hồ sơ | chờ |
| D-21 | Khi Claude API từ chối vì lý do an toàn | Bật `fallbacks: "default"` (chạy lại trên model khác, tính phí theo model đó) cho các model hỗ trợ | Tắt; bị từ chối thì mục tự báo chỉ còn link Teams | Tắt thì không phát sinh chi phí của model dự phòng | chờ |
| D-22 | Ba công thức số chưa có trong `metric-definitions.md` | Thêm `nba_priority`, `cost_usd`, `compute_confidence` vào spec bằng PR riêng (phiên 05), đúng như code hiện tại | Sửa công thức trước khi ghi vào spec | Đổi công thức phải đổi code và test T-MET-06, T-MET-07, T-NBA-R3b | chờ |

Ngoài sổ này còn các giá trị tạm chờ câu trả lời từ người khác (Q-09, Q-10, Q-11, Q-14...): xem `docs/context/cau-hoi-mo-lat-cat-01.md`.
