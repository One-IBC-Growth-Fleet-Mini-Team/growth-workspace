# Danh mục rejection_reason_code v0.1 (bản nháp)

Trạng thái: BẢN NHÁP, cần Amy và 2 RM xác nhận trước khi gửi MobCEC và trước khi dùng làm nhãn eval.
Nguồn: tự báo RM trong channel Teams "Đồng bộ dữ liệu", 28 tới 30/10/2026 (8 RM, khoảng 20 bản tự báo), cộng với quy tắc nghiệp vụ đã biết của One IBC.
Giới hạn: mẫu chỉ 3 ngày, nhiều tin bị cắt ở khoảng 1.000 ký tự. Mã có cột "Bằng chứng" ghi "quy tắc" là lấy từ luật bán hàng, chưa thấy trong mẫu tự báo.

## Cách dùng

- Mỗi Opportunity có tối đa 1 mã chính (`rejection_reason_code`) và 1 mã phụ (`rejection_reason_secondary`).
- `is_final`: `true` khi deal đã Lost; `false` khi deal đang kẹt (mã nhóm STALL). Nhóm STALL không tính là từ chối khi đo hiệu quả hook, chỉ dùng cho NBA.
- Kèm `rejection_note`: một câu khách nói nguyên văn (không có tên, email, số điện thoại khách).
- Mi1-sa-01 chỉ đề xuất mã; Amy xác nhận trước khi ghi.
- Không gán được mã nào thì dùng `OTHER` và ghi note. Sau 4 tuần, mã OTHER nào lặp từ 3 lần thì tách thành mã mới.

## Danh mục

| Mã | Nhóm | Nghĩa | is_final mặc định | Sửa ở tầng phễu nào (spec mục 8) | Bằng chứng trong mẫu |
|---|---|---|---|---|---|
| PRICE_TOO_HIGH | GIÁ | Khách chê giá cao so với kỳ vọng | true | Tầng 4: bảng so sánh phí trọn gói | Adele 30/10 ("Cost wise its expensive", khách Samoa) |
| PRICE_COMPARING | GIÁ | Khách đang so giá với nhà cung cấp khác, chưa quyết | false | Tầng 4: bảng so sánh phí ẩn với đối thủ (Mi1-mkt-04) | Mel 28/10 (đa số khách đang compare giá) |
| PRICE_DISCOUNT_ASK | GIÁ | Khách đồng ý về dịch vụ nhưng đòi giảm phí | false | Không sửa nội dung; NBA và duyệt giảm giá | Freya 30/10 (xin giảm phí hỗ trợ mở tài khoản) |
| NO_NEED_NOW | NHU CẦU | Có nhu cầu nhưng chưa cần ngay | false | Tầng 4: câu lọc thời điểm trong copy | Mel 30/10 (chưa cần tài khoản ngay) |
| NO_NEED | NHU CẦU | Không có nhu cầu | true | Tầng 2 hoặc 4: sai tệp | Dierick 30/10 (khách cũ accept connect, không có nhu cầu) |
| EXPECTATION_MISMATCH | KỲ VỌNG | Khách kỳ vọng sai về dịch vụ (ví dụ mở bank miễn phí, tức thì, cam kết chắc chắn được duyệt) | true | Tầng 4: câu 2 tới 3 của copy | quy tắc (spec mục 8, tầng 4) |
| SCOPE_ADVISORY_DEPTH | KỲ VỌNG | Khách cần tư vấn chuyên sâu vượt phạm vi gói | true | Tầng 4: làm rõ phạm vi gói; chuyển giao nếu có dịch vụ phù hợp | Tony 30/10 (khách không muốn memorandum chung chung) |
| RESTRICTED_INDUSTRY | PHÙ HỢP | Ngành Forex, Markets, môi giới tài chính hoặc ngành ngân hàng không nhận | true | Tầng 4: câu lọc ngành; NBA chỉ hạ ưu tiên | quy tắc (Briona xác nhận 23/09/2026); Dominic 29/10 có báo giá ngành Forex |
| KYC_NOT_COMPLETED | PHÙ HỢP | Khách không bổ sung hoặc không qua được hồ sơ KYC | true | Tầng 3B: nhúng SKD Userguide eKYC vào trang đích | Adele 30/10, Mel 29/10 (chờ khách bổ sung hồ sơ) |
| BANK_DECLINED | PHÙ HỢP | Ngân hàng hoặc EMI từ chối hồ sơ | true | Tầng 4: kỳ vọng về khả năng duyệt | quy tắc; chưa thấy trong mẫu |
| SLOW_TURNAROUND | DỊCH VỤ | Khách bỏ hoặc mất tin vì thời gian xử lý chậm | true | Không phải lỗi MKT; báo vận hành | Dierick 28/10 (khách reseller mất niềm tin do incorp chậm) |
| UNRESPONSIVE | STALL | Khách im lặng sau báo giá hoặc sau follow up | false | Tầng 4 nếu lặp theo cùng hook | Mel 29/10 (4 khách chưa trả lời báo giá) |
| PAYMENT_PENDING | STALL | Đã chốt nhưng chưa thanh toán quá hạn invoice | false | Không sửa nội dung; nhắc invoice (Mi1-sa-01) | Brian 28/10 (2 invoice quá hạn) |
| RESELLER_CHANNEL | KÊNH | Khách cuối của reseller; không upsell trực tiếp | true | Lọc khỏi mẫu đo (is_reseller_end_client) | quy tắc; Dierick 28/10 nhắc khách reseller |
| OTHER | KHÁC | Không khớp mã nào; bắt buộc có rejection_note | tùy | Xem lại sau 4 tuần | |

## Câu hỏi cần Amy và RM xác nhận

1. PRICE_DISCOUNT_ASK và PAYMENT_PENDING có nên tính là "lý do từ chối" không, hay tách sang trường trạng thái riêng?
2. Có lý do nào RM gặp thường xuyên mà danh mục còn thiếu (ví dụ khách chọn tài phán khác, khách tự làm, vấn đề đối tác ngân hàng)?
3. Ai là người gán mã trên CRM khi Opportunity chuyển sang Lost: RM hay Amy?
