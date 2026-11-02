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

## Bẫy dữ liệu đã biết

- 89% Opportunity mở có Close Date đã qua (đo 23/09/2026); pipeline "mở" phải lọc theo kỳ.
- Trang Internal Control chỉ tính lợi nhuận khi team S&F cập nhật expected done date rơi vào tháng báo cáo.
- Khách cũ nhắn WhatsApp nhiều lần có thể rơi vào nhiều RM khác nhau.
