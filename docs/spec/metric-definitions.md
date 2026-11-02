# Định nghĩa chỉ số đã khóa v0.1

Mọi agent và dashboard chỉ được lấy số qua các hàm dưới đây. Thay đổi định nghĩa phải có PR riêng, Mark Ng duyệt.
Trạng thái: bản nháp từ ghi chú vận hành, cần đối chiếu lại với schema thật của crm.oneibc.com ở phiên kỹ thuật đầu tiên.

| Chỉ số | Định nghĩa | Nguồn | Không dùng | Ghi chú |
|---|---|---|---|---|
| `pipeline_in_period` | Opportunity có Close Date trong kỳ (kể cả deal tạo trước kỳ), nhóm theo Stage | CRM Opportunity | Lọc theo Created Date | Giống report Stage cũ trên Salesforce |
| `net_profit_ic` | Lợi nhuận ghi nhận theo trang Internal Control, theo tháng commission, nhóm theo Division của Order | API GET Internal Control | Doanh thu thô (gồm phí nhà nước thu hộ); tự cộng WorkOrder | Division: 01 RM, 02 Service & Formation, 03 Renewal, 04 Bank, 05 ATA |
| `services_purchased` | Khách đã mua dịch vụ gì | OrderItem → Product2.Family (IBC13 Bank, IBC14 ATA, IBC11 Renew, IBC01 Formation) | WorkOrder.Work_Order_Team__c (hay trống hoặc gắn nhầm) | |
| `is_reseller_end_client` | Khách cuối của reseller | Trường CRM mới (Data Contract A4); trước khi có thì RM xác nhận | Suy đoán từ dữ liệu | Lọc khỏi mọi mẫu đo hiệu quả MKT và NBA upsell |
| `rm_active_on_deal` | RM đang thật sự chăm deal | LastModifiedDate lẻ, riêng biệt hoặc NextStep có nội dung | LastModifiedDate trùng hàng loạt tới từng giây | Cập nhật hàng loạt không tính |
| `id_coverage` | Tỷ lệ phiên web hoặc WhatsApp nối được tới Contact | Sự kiện contact_captured / phiên có session_id | Ước lượng | Mốc 25/09/2026: 19% phiên WhatsApp |
| `win_rate` | Close Won / (Close Won + Lost) theo Close Date trong kỳ, đã lọc reseller | CRM Opportunity | Gồm deal còn mở | Hiển thị kèm cỡ mẫu |
| `nba_priority` | Điểm xếp hạng một mục NBA: (trọng số Stage × 10 + độ gần Close Date + 2 nếu RM không chăm deal) × hệ số. Độ gần Close Date = (30 − số ngày tới Close Date, chặn trong 0 tới 30) / 30 × 3. Hệ số trong (0, 1]; luật 3 (ngành hạn chế) đặt hệ số 0,5 | Snapshot Opportunity, `rm_active_on_deal`, tham số `NBA_PARAMS` | LLM xếp hạng; hệ số lớn hơn 1 | `src/metrics/nba-priority.ts`. Trọng số Stage tạm, chờ Amy (Q-09). Luật 3 không bao giờ làm điểm tăng (test thuộc tính) |
| `cost_usd` | Chi phí một phiên agent = (input_tokens × giá input + output_tokens × giá output) / 1.000.000. Chi phí tháng = tổng `cost_usd` các phiên bắt đầu trong tháng dương lịch (UTC) | `usage` do Claude API trả; bảng giá trong biến môi trường | Số chi phí do LLM tự báo | `src/metrics/cost.ts`. Trần 100 USD/tháng (spec mục 10); chạm trần thì dừng gọi LLM |
| `compute_confidence` | Điểm tự tin của một mục hàng chờ = tỷ lệ pass eval × độ phủ trường × min(1, số ca eval / 30) × 0,8 cho mỗi cờ `truncated`, `unstructured`. Độ phủ trường = số trường cần thiết đã biết / tổng số trường cần thiết. Dưới 0,8 thì có nút Escalate | Kết quả eval gần nhất của đúng prompt và danh mục; các trường của mục | Điểm do model tự chấm | `src/metrics/confidence.ts`, D-07, D-19 (mỗi cờ nhân 0,8) |
| `wo_idle_days` | Số ngày lịch (giờ Việt Nam) một Work Order đang mở không có cập nhật, tính tới hôm nay. Mốc cập nhật = mốc muộn hơn giữa (1) lượt nạp đầu tiên của chuỗi lượt nạp liên tiếp gần nhất có cùng Status, và (2) lần Amy bấm "Đã cập nhật" gần nhất. WO có từ trước lượt nạp đầu tính từ lượt nạp đầu. Từ N ngày thì nhắc PIC, từ M ngày thì báo Amy | File Work Order xuất từ CRM (số WO, Status), bảng `wo_touches`; tham số `WO_PARAMS` | Created Date (tuổi WO không phải thời gian đứng yên); LLM tự đếm | `src/metrics/wo-idle.ts`, D-25. N = 7, M = 14 là giá trị tạm, chờ Amy chốt. File xuất không có ngày cập nhật cuối, nên WO đang được làm mà Status chưa đổi vẫn bị đếm cho tới khi Amy ghi nhận |

## Bẫy dữ liệu đã biết

- 89% Opportunity mở có Close Date đã qua (đo 23/09/2026); pipeline "mở" phải lọc theo kỳ.
- Trang Internal Control chỉ tính lợi nhuận khi team S&F cập nhật expected done date rơi vào tháng báo cáo.
- Khách cũ nhắn WhatsApp nhiều lần có thể rơi vào nhiều RM khác nhau.
