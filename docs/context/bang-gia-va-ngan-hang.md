# Bảng giá gói OCC và ma trận ngân hàng: cách đọc, chỗ lệch đã kiểm

Rà ngày 03/11/2026 trên hai file nội bộ (không chép vào repo). Chỉ ghi giá bán (đã công khai trên web) và quy tắc; không ghi giá vốn, liên hệ đối tác, link referral hay case study khách.

## 1. File "Website mới OCC Bảng giá gói Sep 30 2026 v2"

- **Sheet đang dùng:** "FINAL - Gói & Giá năm 2 & năm 3" (D-33). Các sheet khác là dữ liệu gốc hoặc bản cũ.
- **Cách tính gói** (sheet "Hướng dẫn đọc"): giá gói = tổng các dịch vụ có Y ở sheet "Chi tiết dịch vụ".
  - **Starter:** thành lập công ty.
  - **Grow:** Starter, thêm hỗ trợ tài khoản EMI và giấy Incumbency, có nơi thêm văn phòng ảo.
  - **Premium:** thêm nominee director, kế toán, khai thuế.
  - **Gói 2 năm** = Starter + 1 năm gia hạn. **Gói 3 năm** = Starter + 2 năm gia hạn.
- **Hai loại dòng** trong FINAL:
  - **23 tài phán tính từ thành phần:** khớp công thức tuyệt đối.
  - **Khoảng 21 tài phán lấy giá từ website:** gói 2, 3 năm giảm nhẹ (khoảng 2 tới 3%) rồi làm tròn về đuôi 99. Vì vậy hàm kiểm dùng dung sai max(150 USD, 5%).
- **Còn "Get a Quote":** Singapore VCC, Liechtenstein, Luxembourg, New Zealand, Switzerland, và phần gia hạn của Vietnam.

### Mức giảm Premium: 5% (D-33), sheet FINAL đang áp 7%

Áp cho 23 tài phán có giá gốc; làm tròn đến đô la.

| Tài phán | Giá gốc | FINAL (7%) | Đúng (5%) |
|---|---|---|---|
| Hong Kong | 7,037 | 6,544 | 6,685 |
| Singapore (Pte Ltd) | 10,900 | 10,137 | 10,355 |
| United States | 5,514 | 5,128 | 5,238 |
| BVI | 5,221 | 4,856 | 4,960 |
| Seychelles | 4,216 | 3,921 | 4,005 |
| Nevis | 4,197 | 3,903 | 3,987 |
| Anguilla | 3,268 | 3,039 | 3,105 |
| Bahamas | 3,777 | 3,513 | 3,588 |
| Belize | 4,268 | 3,969 | 4,055 |
| Cayman Islands (Exempted, LLC) | 6,015 | 5,594 | 5,714 |
| Cyprus | 7,480 | 6,956 | 7,106 |
| Gibraltar | 7,134 | 6,635 | 6,777 |
| Labuan | 9,818 | 9,131 | 9,327 |
| Malta | 8,669 | 8,062 | 8,236 |
| Marshall Islands | 5,984 | 5,565 | 5,685 |
| Mauritius | 6,767 | 6,293 | 6,429 |
| Netherlands | 12,977 | 12,069 | 12,328 |
| Panama | 6,219 | 5,784 | 5,908 |
| Saint Lucia | 11,213 | 10,428 | 10,652 |
| Saint Vincent (LLC) | 4,596 | 4,274 | 4,366 |
| Saint Vincent (BC) | 6,218 | 5,783 | 5,907 |
| Samoa | 4,635 | 4,311 | 4,403 |
| United Kingdom (Ltd) | 6,303 | 5,862 | 5,988 |
| Vanuatu | 5,636 | 5,241 | 5,354 |

Khoảng 21 tài phán lấy giá từ website không có giá gốc trong file, nên chưa kiểm được Premium của nhóm này.

### Kết luận theo thành phần

- **Singapore Branch và LLP: đảo cột "Renewal per year" với cột "2 year Renewal".**
  - Nếu đảo lại, cả hai dòng khớp đúng mẫu giảm về đuôi 99 của các dòng website:
    - Branch: Starter 2,999, gia hạn 2,499; gói 2 năm 5,399 (2,999 + 2,499 = 5,498); gói 3 năm 7,799 (7,898).
    - LLP: Starter 3,799, gia hạn 2,999; gói 2 năm 6,699 (6,798); gói 3 năm 9,599 (9,698).
  - Giữ nguyên như sheet thì gói 2 năm rẻ hơn cả Starter, vô lý.
  - **Sửa:** Branch gia hạn = 2,499, gói 2 năm = 5,399. LLP gia hạn = 2,999, gói 2 năm = 6,699.
- **Cayman Islands (Exempted, LLC): không sai.**
  - Gia hạn 4,487 = phí gia hạn 3,489 (nhà nước 1,500 + dịch vụ 1,989) + nộp BOR 499 + nộp ESN 499. Hai khoản nộp này là nghĩa vụ hằng năm.
  - Gói 2 năm, 3 năm khớp công thức.
  - Chỗ dễ nhầm: Add-on "Company Renewal – Year 2" bán lẻ 3,489 chưa gồm BOR và ESN. Nên ghi rõ, hoặc gộp thành 4,487.
  - Phí nhà nước tăng từ 01/01/2027 (ghi chú trong file), cần cập nhật.
  - Cayman ELP và SPC là dòng website, lệch dưới 3%, đúng mẫu.
- **Hoa Kỳ: cột gia hạn và gói 2, 3 năm lấy từ hai loại hình khác nhau.**
  - Starter 1,843 = phí bang 499 + dịch vụ 845 + EIN 499 (khớp).
  - Gia hạn trong file: LLC (Wyoming) 799, LLC (Delaware) 1,214, Corporation 2,113.
  - Sheet FINAL ghi cả hai dòng: gia hạn 2,113 (Corporation) nhưng gói 2, 3 năm = 1,843 + 799 x 1 hoặc 2 (LLC). Quy tắc "lấy dòng rẻ nhất" chỉ đúng khi gộp hai loại hình vào một dòng; FINAL đã tách dòng nên phải theo từng loại.
  - **Sửa:** LLC gia hạn = 799 (giữ 2,642 và 3,441). Corporation giữ gia hạn 2,113, gói 2 năm = 3,956, gói 3 năm = 6,069.
  - Nếu muốn giá LLC theo Delaware thì gia hạn 1,214, gói 2 năm 3,057, gói 3 năm 4,271.
- **Nghi chép trùng:** BVI Limited Partnership và Belize International Foundation có 6 giá giống hệt nhau (3,599 / 4,999 / 6,699 / 3,707 / 7,199 / 10,699).

## 2. Bộ SKD eKYC (10 file)

Nguồn: file bàn giao của team MKT ("Userguide eKYC => hoàn thiện thành skd ... Media kit gồm: PDF; HTML; 4 clips 2 sizes, sub & non sub") và thư mục Userguide trên Drive.

- **SKD là một bộ kit chung cho mọi tài phán**, không phải 10 file mỗi tài phán.
- **Thư mục hiện có 6 file:**
  - Guide.pdf và Guide.html.
  - 4 video của clip "Daniel-B": 16x9 và 9x16, mỗi khổ có bản clean và bản subtitled.
- **Suy luận 10 = PDF + HTML + 2 clip x 4 video.** Tên "-B" gợi ý còn một clip A.
- **Quy ước tên video** mà trang đọc được: `<tên clip>-<16x9|9x16>-<clean|subtitled>.mp4`.
- **Dữ liệu cần cho mỗi file:** tên file đúng quy ước (đủ để biết loại, khổ, bản). Muốn theo dõi sâu hơn thì thêm trạng thái duyệt (nháp, đã duyệt) và ngày cập nhật; chưa làm vì file bàn giao không có.

## 3. File "[One IBC] BANKING INSTRUCTION"

- **Mục tiêu của Bank Team:** 2 tới 3 tài khoản mỗi khách, ít nhất 1 ngân hàng truyền thống. Công ty mới mở EMI trước; ngân hàng truyền thống sau 6 tới 12 tháng hoạt động.
- **Thứ tự chọn:**
  1. Nơi thành lập công ty (sheet "Product Matrix", YES/NO; 31 tổ chức, 28 tài phán).
  2. Quốc tịch, nơi cư trú của giám đốc, cổ đông, UBO (sheet "Quick Lookup", mã bằng màu ô: đỏ là ngân hàng công bố không nhận, vàng là hạn chế theo kinh nghiệm, trắng là nhận).
  3. Ngành nghề (danh sách cấm của từng tổ chức; crypto đi Unlimit, The Kingdom Bank).
  4. Nhu cầu: loại tiền, cổng thanh toán, thẻ.
  5. Khả năng của khách: tiền nạp đầu, gặp trực tiếp, thư giới thiệu của ngân hàng 2 năm.
  6. Ưu tiên EMI: Airwallex, Payoneer, Aspire.
- **Trang `/banks` (D-34)** dùng bước 1, 2 (độ khó), 6 và quy tắc công ty mới. Bước 2 (quốc tịch), 3, 4, 5 nhắc kiểm với Bank Team.
- **Chỗ ma trận mâu thuẫn với phần chữ của chính file (B-01):**
  - Mercury ghi YES với mọi tài phán, nhưng chỉ nhận công ty Mỹ và đã ngưng nhận quốc tịch Việt Nam.
  - Currenxie ghi YES với Hoa Kỳ, nhưng không nhận công ty đăng ký ở Mỹ.
  - Airwallex ghi NO với Belize, Marshall Islands nhưng được gợi ý ở "Suggested Jurisdictions".
  - Statrys đã ngưng.
  - Sheet Product Matrix đang ẩn.
  - Sheet tra quốc tịch bản mới vẫn "Pending", gần như mọi ngân hàng giống nhau.
- **Không đưa vào repo:**
  - Liên hệ đối tác ("Do not share").
  - Link referral có hoa hồng.
  - Sheet "Case Study" (mô tả kinh doanh của khách thật).
