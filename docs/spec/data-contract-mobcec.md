# Yêu cầu Data Contract cho web OCC mới và CRM

02/11/2026 · Mark Ng, One IBC

Gửi: MobCEC (đội dựng web OCC mới và CRM). Từ: Mark Ng, One IBC. Áp dụng cho: sandbox8.offshorecompanycorp.com, offshorecompanycorp.com, oneibc.com, crm.oneibc.com.

**Mục đích:** nối được hành trình khách từ quảng cáo tới thanh toán. Hiện chỉ 19% phiên WhatsApp nối được với Contact (mốc 25/09/2026). Gài tracking trước khi web mới launch rẻ hơn nhiều so với vá sau.

**Hạn đề nghị:** có mặt trên sandbox8 và nghiệm thu xong trước ngày launch web mới.

## A1. Trường chung cho mọi sự kiện

event_id (duy nhất), event_name, event_time (UTC, ISO 8601), source (web, crm, platform), anonymous_id. Không gửi email, số điện thoại hay tên khách vào tham số GA4 hoặc Pixel.

## A2. 15 sự kiện

| **Sự kiện**           | **Phát từ**          | **Trường bắt buộc thêm**                                                                   | **Phát khi**                                     |
|-----------------------|----------------------|--------------------------------------------------------------------------------------------|--------------------------------------------------|
| price_sheet_published | Platform             | jurisdiction_code, price_sheet_version                                                     | Bảng giá một tài phán được duyệt và đăng         |
| asset_packaged        | Platform             | asset_id, creative_ir_id, hook_id, channel_account_id, qa_status                           | Asset qua QA và được đóng gói                    |
| asset_view            | Web                  | session_id, asset_id, utm\_\*, landing_url, platform_campaign_id, ad_id                    | Khách vào trang từ một asset                     |
| ask_occ_started       | Web                  | session_id, conversation_id, landing_url                                                   | Khách mở Ask OCC                                 |
| contact_captured      | Web                  | session_id, conversation_id, contact_id, kênh (form, WA, gọi), wa_business_number, consent | Khách để lại thông tin hoặc chuyển sang WhatsApp |
| lead_verified         | CRM                  | lead_id, contact_id                                                                        | Lead được xác nhận                               |
| opportunity_created   | CRM                  | opportunity_id, lead_id, jurisdiction_code, service_type                                   | Tạo Opportunity                                  |
| quote_sent            | CRM                  | quote_id, opportunity_id, price_sheet_version                                              | Gửi báo giá                                      |
| order_created         | CRM                  | order_id, opportunity_id, gross_order_value                                                | Tạo đơn                                          |
| payment_confirmed     | CRM                  | payment_id, order_id, số tiền, tiền tệ                                                     | Xác nhận thanh toán                              |
| order_refunded        | CRM                  | order_id, refund                                                                           | Hoàn tiền                                        |
| renewal_due           | CRM                  | customer_id, renewal_due_date                                                              | Tới hạn gia hạn                                  |
| renewal_paid          | CRM                  | customer_id, payment_id                                                                    | Khách đã gia hạn                                 |
| referral_submitted    | Web (Partner Portal) | referral_id, partner_id, partner_type, contact_id                                          | Đối tác gửi lead                                 |
| referral_converted    | CRM                  | referral_id, order_id, is_reseller_end_client                                              | Lead của đối tác thành đơn                       |

## A3. Chuyển phiên từ web sang WhatsApp

- Khi khách bấm chuyển sang một trong 3 số WhatsApp Business, web tạo token hội thoại có thời hạn gắn với session_id và conversation_id, đưa vào tin nhắn mở đầu.

- Khi tin nhắn tới số WhatsApp, token được đọc lại để nối conversation_id với contact_id.

- Thiếu token thì ghi trạng thái thiếu, không suy đoán danh tính khách.

## A4. Trường bổ sung trên CRM

- **is_reseller_end_client** trên Client: đánh dấu khách cuối của reseller.

- **rejection_reason_code** trên Opportunity: mã chuẩn lý do khách từ chối. Danh mục mã do One IBC gửi kèm.

- **partner_id, referral_id** trên Lead và Opportunity khi khách đến từ đối tác.

## A5. API GET Internal Control

Đề nghị mở API chỉ đọc trả về theo từng Order: order_id, gross_order_value, net_revenue, third_party_pass_through, refund, gross_margin, Division, Commission_Date. Có lọc theo khoảng ngày. Xác thực bằng token riêng cho Growth Workspace, chỉ có quyền đọc.

## A6. Tiêu chí nghiệm thu trên sandbox8

1.  Mỗi sự kiện web phát đúng một lần cho một thao tác, thấy được trong GA4 DebugView và log server.

2.  100% phiên có session_id; utm\_\* và asset_id được giữ suốt phiên.

3.  Chuyển sang WhatsApp mang theo token; thử 3 lần trên cả 3 số đều nối được conversation_id.

4.  Không có email, số điện thoại hay tên khách trong tham số GA4 hoặc Pixel.

5.  Sự kiện CRM có đủ mã ID liên kết ngược lên bước trước.

6.  API Internal Control trả đúng số trên màn hình Internal Control cho 5 đơn chọn ngẫu nhiên.

Đầu mối phía One IBC: Mark Ng, mark.ng@oneibc.com.
