# Mi1 Command Center bản 3D: yêu cầu (v0.1)

Nguồn: các vòng prototype Mark Ng duyệt từ 28/10 tới 29/10/2026. Bản tham chiếu chạy được nằm ở `docs/reference/command-center/prototype.html` (dữ liệu trong prototype là dữ liệu giả, chỉ để xem hành vi). Model Mi1: `docs/reference/command-center/mi1.glb` (thiết kế 3D của Mark, khoảng 10 MB, có 11 animation: Idle, Jump, Excited, Neutral, Pointing, Resting_Happy, Scenario_Celebrate, Scenario_Dance, Scenario_Study, Thinking, Walk). Prototype nạp model từ `mi1-model.txt` (base64); khi đưa vào app thì nạp thẳng file `.glb`.

## 0. Nguyên tắc

- **Cùng dữ liệu với `/command` bản phẳng.** Bản 3D chỉ là một lớp hiển thị khác của cùng API; không có nguồn dữ liệu, quyền hay logic riêng.
- Bản phẳng giữ nguyên và là phương án dự phòng: tự dùng bản phẳng khi không có WebGL, khi `prefers-reduced-motion`, hoặc khi người dùng chọn.
- Mọi thông tin xem được trên 3D cũng xem được trên bản phẳng.

## 1. Bối cảnh và bố cục

| Hạng mục | Yêu cầu |
|---|---|
| Không gian | Phòng lab R&D, hightech tối giản, tông beige, chất liệu ceramic và carbon |
| Vị trí Mi1 | Không ở giữa màn hình; trên desktop chiếm tối đa 1/3 bên trái |
| Mi1 cho vai Mark | Toàn thân trên bệ đỡ |
| Bệ đỡ | Kéo chuột hoặc vuốt để xoay Mi1 360°; gợi ý "Kéo để xoay Mi1 360°" |
| Thuyền viên | Chỉ phần đầu, cỡ nhỏ, xếp một hàng dưới bệ đỡ, góc trái dưới, cùng trục với Mi1; không có thẻ tên nổi ra ngoài khung |
| Vai Amy, MKT | Agent của vai đó (Mi1-sa-01, Mi1-mkt-01) hiện dạng đầu |
| Điện thoại | Mi1 ở trên, màn hình tiến trình bên cạnh, các module thành lưới dock bên dưới; không tràn ngang |

## 2. Vệ tinh (module)

- Mỗi module là một khối bay quanh Mi1 theo quỹ đạo kiểu vệ tinh, quay chậm, bán kính ngắn; **đường quỹ đạo trong suốt** (không vẽ).
- **Nhãn chữ ẩn mặc định**; chỉ hiện khi rê chuột, bấm, hoặc Tab tới; nhãn đang ẩn không chiếm chỗ khi tránh chồng nhãn. Nhãn cỡ nhỏ.
- Rê vào vệ tinh thì vệ tinh dừng quay; bấm thì mở bảng chi tiết dạng frosted glass.
- Chọn vệ tinh nào thì **Mi1 quay đầu nhìn về hướng đó**, không giơ tay chỉ.
- Module theo vai trò (map sang trang thật):

| Vai | Module |
|---|---|
| Mark, BOD | Hỏi Mi1 (`/ask`), Hàng chờ quyết định, Dashboard Growth (`/overview`), Đồ thị và truy vấn mẫu (`/data`), Thuyền viên, Hook và Win gate (`/hooks`), Đối tác và reseller (`/partners`) |
| Amy | Hỏi Mi1-sa-01, Hàng chờ của Amy (`/queue`), Dashboard phần Amy, Đối tác, Thuyền viên |
| Team MKT | Hỏi Mi1-mkt-01, Hook và Win gate, Creative, Gói và giá đối thủ, Ngân sách (`/budget`), Lịch kênh |

## 3. Màn hình tiến trình treo tường

- Đặt **sau lưng Mi1**, dạng treo bằng dây, không có cột chống; mặt cong theo tường; viền ceramic beige; nền frosted glass ánh beige. Không có màn hình đen thừa nào khác.
- Hiển thị lượt chạy đang chạy hoặc gần nhất, kiểu vết bước và tool như Claude: từng bước, tool đã gọi, thuyền viên nào được gọi, mỗi thuyền viên đang làm gì, trạng thái (chờ, đang chạy, xong, lỗi), token và chi phí, cổng đã qua (Eval Gate, cổng tiền), kết quả đẩy vào Hàng chờ.
- Có tổng số thuyền viên được gọi trong lượt và tiến trình tổng.
- Trong lúc chạy, Mi1 nhìn thẳng về phía người dùng, không quay ra sau nhìn màn hình; bóng thoại cạnh Mi1 ẩn đi.

## 4. Thanh động tác và âm thanh

- Một thanh frosted glass gồm: **Join**, **Working**, **Done task**, vạch ngăn, nút **Âm thanh: Bật/Tắt**.
- Join = Jump rồi Excited; Working = Scenario_Study; Done task = Scenario_Celebrate; sau đó về Idle.
- Âm thanh kiểu studio, tổng hợp bằng WebAudio, không tải file âm thanh. Tắt âm thì dừng ngay âm đang phát; trình duyệt nhớ lựa chọn.
- **Gắn với sự kiện thật:** đăng nhập thì Join; lượt chạy bắt đầu thì Working; lượt chạy xong thì Done task. Nút bấm tay vẫn giữ để demo.

## 5. Bảng và popup

- Mọi popup, bảng module, bóng thoại dùng frosted glass; không trôi ra ngoài khung nhìn.
- Bảng module hiện đúng nội dung của trang thật tương ứng ở dạng rút gọn, có link "Mở trang đầy đủ".

## 6. Kỹ thuật

- Three.js r0.160.0 (GLTFLoader, SkeletonUtils, RoomEnvironment, RoundedBoxGeometry) phục vụ từ chính app (vendored), không gọi CDN ngoài.
- Nạp model sau khi bản phẳng đã hiện; có ảnh tĩnh dự phòng khi nạp lỗi.
- Đầu thuyền viên: dựng từ cùng rig, thu thân về gần 0 và giữ đầu (cách prototype làm).
- Không có PII trong bất kỳ nhãn, bóng thoại hay màn hình nào; chỉ mã và số tổng hợp.
- Hiệu năng: 60 fps trên laptop văn phòng; tự giảm chất lượng trên máy yếu.

## 7. Nghiệm thu

1. Cùng một lượt chạy hiện đúng như nhau trên `/command` và `/command/3d`.
2. Không WebGL hoặc `prefers-reduced-motion` thì tự về bản phẳng.
3. Ở 375 px không tràn ngang; mọi module bấm được bằng bàn phím.
4. Bắt đầu một lượt `/ask` thì Mi1 chuyển Working, màn hình tường hiện vết từng bước, xong thì Done task.
5. Tắt âm thanh, tải lại trang vẫn tắt.
