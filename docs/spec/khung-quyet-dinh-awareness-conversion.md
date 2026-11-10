# Khung quyết định Awareness/Traffic vs Conversion (bản Tạm v0.1)

Trạng thái: **TẠM**. Mark Ng đề xuất ngày 10/11/2026 để fleet kỹ thuật xây được GĐ3. Spec v0.3.2 dẫn tới khung này nhưng bản gốc nằm trong tab "Khung quyết định" của file Excel "Report Social & Paid MKT (Overview Tracking)" bàn giao từ nhân sự cũ, chưa đưa vào repo. Khi có bản gốc, bản gốc thắng; mọi con số dưới đây nằm trong `config/provisional.json`, sửa được ở `/tuning`, không gán cứng trong code.

## 1. Đơn vị quyết định

- Một **tổ hợp** = Kênh × Tài phán (thêm Phân khúc khi có dữ liệu). Quyết định theo **tuần**, chạy cùng CRON-07.
- Mỗi tổ hợp mang đúng một mục tiêu trong tuần: **A** (Awareness/Traffic: mở rộng phễu) hoặc **C** (Conversion: thu contact và lead).

## 2. Cổng chặn (xét trước mọi quy tắc khác)

| Mã | Điều kiện | Hệ quả |
|---|---|---|
| G1 | Cờ `TRACKING_DEGRADED` đang bật (tầng 3A) | Đóng băng tổ hợp: không đổi mục tiêu, không đổi ngân sách, không đánh giá xấu |
| G2 | Tài phán chưa khoá giá hoặc quốc gia chưa verify Meta (tầng 1B) | Không được chạy C; chỉ được A nếu nội dung không nêu giá |
| G3 | Asset chưa QA PASS (tầng 1A) | Không vào lịch phân phối |
| G4 | Mẫu tính bằng dữ liệu chưa lọc `is_reseller_end_client` | Không dùng cho quyết định |

## 3. Gán mục tiêu A hay C

| Quy tắc | Điều kiện | Mục tiêu |
|---|---|---|
| R1 | Tổ hợp mới, hoặc Win gate trả `insufficient_data` | A, ngân sách thử nghiệm |
| R2 | Đủ mẫu tầng 2 (impressions từ 3.000/tuần) và tầng 3B không bật cờ, và `contact_captured` từ 10/tuần | Chuyển sang C |
| R3 | Đang C, tầng 3B bật cờ 2 tuần liền | Lùi về A, ticket trang đích cho Team MKT và Content |
| R4 | Đang C, CPL dưới trung vị nhưng Lead→Opportunity dưới trung vị sau một chu kỳ bán (tầng 4) | Giữ C, **không tăng tiền**; đẩy mã lý do từ chối lặp lại về Creative |
| R5 | Đang C, đủ chu kỳ bán, lợi nhuận ròng Internal Control âm sau khi lọc reseller (tầng 5) | Giảm 50%; âm 2 chu kỳ liền thì đề xuất dừng |
| R6 | Đang C, Win gate PASS và lợi nhuận ròng dương | Đề xuất tăng |

## 4. Chỉ số đánh giá theo mục tiêu

- **A** chỉ đo bằng: CPM, CTR, chi phí mỗi `asset_view`, tỷ lệ `asset_view` → `ask_occ_started`. **Không đánh giá A bằng CPL.**
- **C** đo bằng: CPL, Lead → Opportunity, tỷ lệ thắng (đã lọc reseller), lợi nhuận ròng theo tổ hợp.
- Mọi chỉ số tính bằng hàm trong `docs/spec/metric-definitions.md`; hiển thị kèm cỡ mẫu và điểm tự tin.

## 5. Phân bổ ngân sách tuần

| Tham số | Giá trị tạm |
|---|---|
| Tổng ngân sách tuần | Do anh Jimmy duyệt; platform không tự đặt |
| Tỷ trọng A / C | A 25%, C 75% |
| Ngân sách thử nghiệm mỗi tổ hợp mới (R1) | Tối đa 5% tổng tuần |
| Biên đổi mỗi tổ hợp mỗi tuần | Tối đa ±20% (trừ R5) |
| Khoảng cách giữa hai lần đổi cùng tổ hợp | Tối thiểu 7 ngày |
| Ngưỡng cần anh Jimmy duyệt | Tổng thay đổi tuần vượt 10% tổng ngân sách |

## 6. Đầu ra

- Mỗi tuần một bộ `draft_budget_change`: mỗi dòng gồm tổ hợp, mục tiêu cũ → mới, ngân sách cũ → mới, quy tắc áp dụng (R1 tới R6, G1 tới G4), số liệu dẫn chứng, điểm tự tin.
- Vào Hàng chờ của Mark; dòng vượt ngưỡng ở mục 5 gắn cờ cần anh Jimmy. Không có code path nào tự áp lên nền tảng quảng cáo.

## 7. Câu hỏi cần Mark chốt để bỏ nhãn Tạm

1. Có bản gốc tab "Khung quyết định" không; nếu có, xuất tab đó (không cần dữ liệu khách) để thay bản này.
2. Tỷ trọng A/C và biên ±20% có hợp với ngân sách thực tế hiện nay không.
3. Ngưỡng cần anh Jimmy duyệt: theo % hay theo số USD cố định.
