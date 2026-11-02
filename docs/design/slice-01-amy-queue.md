# Thiết kế lát cắt 01: Hàng chờ buổi sáng của Amy

02/11/2026 · Fleet kỹ thuật (phiên 01) · Trạng thái: **BẢN NHÁP chờ duyệt ở PR**, chưa có code sản phẩm.

Nguồn: `docs/spec/growth-workspace-spec-v0.3.2.md` (mục 0, 2, 6, 9, 10, 11, 13, 14), `docs/spec/metric-definitions.md`, `docs/spec/rejection-reason-codes.md`, `docs/spec/data-contract-mobcec.md`, `docs/context/decisions.md`.

Quy ước trong file:
- **[ĐỐI CHIẾU SCHEMA]**: chỗ phụ thuộc schema thật của CRM, Internal Control hoặc Microsoft Graph. Chưa có schema nào được xem; mọi tên trường ở các chỗ này là tên tạm, không phải đoán đúng.
- **D-xx**: một quyết định đang chờ người duyệt (xem mục 13, Sổ quyết định).
- **Q-xx**: câu hỏi mở (xem mục 14).

Cách chạy các vòng review: các skill gstack `/office-hours`, `/plan-ceo-review`, `/plan-eng-review` được áp theo đúng khung của chúng (thách thức tiền đề, phương án, chọn chế độ phạm vi, 10 mục review, bản đồ lỗi, danh sách test). Các bước hỏi đáp tương tác của skill được thay bằng Sổ quyết định ở mục 13: mỗi quyết định có đề xuất mặc định, người duyệt trả lời ngay trong PR.

---

## Mục lục

1. Vòng 0: Office hours (bài toán, tiền đề, phương án)
2. Vòng 1: CEO review (cắt phạm vi cho Cổng 2)
3. Vòng 2: Eng review, kiến trúc và luồng dữ liệu
4. Schema Growth DB tối thiểu
5. Đặc tả từng thành phần
6. Chứng minh CRM chỉ đọc
7. Loại PII khỏi tự báo RM và khỏi dữ liệu CRM
8. Bản đồ lỗi và cách cứu
9. Bảo mật và mô hình đe doạ
10. Danh sách test
11. Cấu trúc thư mục và stack
12. Cấu trúc bộ eval Mi1-sa-01
13. Sổ quyết định
14. Giả định và câu hỏi mở
15. Thứ tự build đề xuất
16. Báo cáo review

---

## 1. Vòng 0: Office hours

### 1.1 Bài toán

Mỗi sáng Amy (Sales Admin) phải đọc tay khoảng 8 bản tự báo RM trong channel Teams "Đồng bộ dữ liệu", đoán lý do khách từ chối, đối chiếu pipeline trên CRM và tự nghĩ việc cần giao RM. Việc này tốn thời gian, không để lại dấu vết, và lặp lại lỗi đã biết: 36 trên 44 khách từng giao RM bị phản hồi là đã xử lý hoặc không bán được (spec mục 11, luật 4); pipeline bị đọc sai vì 89% Opportunity mở có Close Date đã qua (metric-definitions, bẫy dữ liệu).

Lát cắt này cho Amy một trang Hàng chờ duy nhất, mỗi sáng có sẵn:
- (a) bản nháp tự báo RM của ngày hôm trước đã được cấu trúc hoá và đã loại PII khách;
- (b) đề xuất `rejection_reason_code` theo danh mục v0.1;
- (c) danh sách NBA đã qua 5 luật ở spec mục 11;

và Amy bấm **Xác nhận**, **Sửa** hoặc **Bác** từng mục. Mọi thao tác được ghi nhật ký chỉ thêm, không sửa.

### 1.2 Bằng chứng nhu cầu

- Spec mục 3: Amy cần thấy "Pipeline theo Close Date và Stage, NBA, tự báo RM, Lead trùng"; đóng góp của Amy là "xác nhận hoặc sửa bản nháp".
- Danh mục mã lý do v0.1 được dựng từ khoảng 20 bản tự báo thật (28 tới 30/10/2026): định dạng tự báo đã tồn tại và RM đang viết hằng ngày, nghĩa là đầu vào có sẵn, không tạo thêm việc nhập liệu (spec mục 3).
- Cổng 2 (spec mục 14) định nghĩa thành công bằng hành vi: "Amy dùng hằng tuần".

### 1.3 Hiện trạng (nếu không làm gì)

Amy tiếp tục đọc tay; lý do từ chối không được mã hoá nên tầng 4 của luồng chẩn đoán (spec mục 8) không có dữ liệu; Mi1-mkt-02 về sau không có tín hiệu "RM từ chối" để sửa Hook. Chi phí không làm là chặn cả câu hỏi đầu ra số 4 của spec.

### 1.4 Người dùng mục tiêu và nêm hẹp nhất

Một người dùng: Amy. Một thời điểm: buổi sáng ngày làm việc. Một màn hình: Hàng chờ. Mark chỉ xem (và nhận escalate). RM không đăng nhập; RM vẫn chỉ viết tự báo trên Teams như hiện nay.

### 1.5 Ràng buộc

| # | Ràng buộc | Nguồn |
|---|---|---|
| C1 | CRM chỉ đọc; có test chứng minh | CLAUDE.md quy tắc 1, spec mục 13 |
| C2 | Không PII khách trong repo, log, fixture, eval; kiểm trùng Lead bằng mã băm | CLAUDE.md quy tắc 2, spec mục 2 |
| C3 | Không tự cộng số bằng LLM; số đi qua hàm trong metric-definitions | CLAUDE.md quy tắc 3, spec mục 4 |
| C4 | Hàng chờ là nơi duyệt duy nhất; Teams chỉ gửi link | spec mục 2, decisions.md |
| C5 | Thuyền viên chưa có nguồn thật thì chưa bật; không sinh đề xuất từ dữ liệu mẫu | spec mục 6, quy tắc vận hành 3 |
| C6 | Điểm tự tin không lấy từ việc model tự chấm | spec mục 6, decisions.md |
| C7 | Trần token Fleet 100 USD/tháng; đồng bộ chạy bằng script ($0 token) | spec mục 10 |
| C8 | Repo public: không mẫu tự báo thật, không URL hay schema nội bộ chưa công bố | session-01.md, decisions.md |
| C9 | Hai đầu vào đang bị chặn: API CRM chỉ đọc (STATUS a), quyền Graph đọc channel (STATUS b) | docs/STATUS.md |

### 1.6 Tiền đề (người duyệt đồng ý hoặc bác ở PR)

- **P1.** Bài toán đúng là "Amy duyệt nháp nhanh và có dấu vết", không phải "tự động hoá thay Amy". Mọi đầu ra của Mi1-sa-01 là nháp (spec mục 11).
- **P2.** Lát cắt được build và test hoàn toàn trên dữ liệu tổng hợp trong lúc chờ STATUS a và b, nhưng **không bật cho Amy** cho tới khi có cả hai nguồn thật (C5). Ngày bật phụ thuộc MobCEC và admin tenant, không phụ thuộc fleet kỹ thuật.
- **P3.** 5 luật NBA là luật xác định, nên được viết bằng code và unit test; LLM không quyết định NBA. LLM chỉ dùng cho hai việc cần đọc ngôn ngữ tự nhiên: cấu trúc hoá tự báo và đề xuất mã lý do.
- **P4.** Mã lý do do Amy xác nhận được lưu trong Growth DB. Việc ghi `rejection_reason_code` lên CRM (Data Contract A4) là thao tác tay của RM hoặc Amy trên CRM; hệ thống không ghi (C1).
- **P5.** Danh sách NBA sau khi Amy xác nhận vẫn là nháp chờ RM xác nhận (luật 4). Hệ thống không tự gửi cho RM; Amy tự chuyển và ghi lại phản hồi của RM.

### 1.7 Các phương án đã cân nhắc

```
PHƯƠNG ÁN A: Một ứng dụng, snapshot SQLite (tối thiểu khả thi)
  Tóm tắt: Một codebase TypeScript chạy trên Bun. ETL kéo CRM bằng GET vào
           snapshot SQLite; crm-read-mcp đọc snapshot ở chế độ read-only;
           Mi1-sa-01 chạy theo lịch; Hàng chờ là HTML render phía server.
  Công:    M
  Rủi ro:  Thấp
  Ưu:      Không cần cài thêm gì trên máy hiện có (Bun 1.4.2 có sẵn SQLite,
           test runner, HTTP server); một chỗ duy nhất gọi CRM nên dễ chứng
           minh chỉ đọc; snapshot cho phép tái hiện mọi đề xuất.
  Nhược:   Dữ liệu CRM trễ tối đa 1 ngày; SQLite cần ổ đĩa bền và backup;
           chưa ghi vào Neo4j (để lát sau).
  Tái dùng: bun:sqlite, bun test, Bun.serve, MCP TypeScript SDK, Anthropic SDK.

PHƯƠNG ÁN B: Kiến trúc đầy đủ (lý tưởng dài hạn)
  Tóm tắt: Postgres cho hàng chờ và audit, Neo4j AuraDB chung với Mi1 cho đồ
           thị, worker hàng đợi riêng, giao diện React, Mi1 điều phối sa-01.
  Công:    XL
  Rủi ro:  Cao
  Ưu:      Khớp sơ đồ 6 lớp của spec ngay từ đầu; không phải di chuyển dữ liệu.
  Nhược:   3 tới 4 dịch vụ phải vận hành trước khi Amy thấy gì; cần cài Node
           hoặc Docker; nhiều bề mặt bảo mật; vượt nguồn lực "1 người duyệt PR
           bán thời gian".
  Tái dùng: instance Neo4j của repo Mi1.

PHƯƠNG ÁN C: Không ETL, MCP gọi thẳng CRM theo lượt (lối khác)
  Tóm tắt: crm-read-mcp gọi API CRM mỗi khi agent cần, không có snapshot.
  Công:    S tới M
  Rủi ro:  Trung bình
  Ưu:      Dữ liệu luôn mới; ít bảng hơn.
  Nhược:   Không tái hiện được đề xuất ngày hôm qua đã dựa trên số nào; kiểm
           trùng Lead phải băm lại toàn bộ Lead mỗi lần; tăng tải lên CRM;
           nhiều điểm gọi CRM hơn nên khó chứng minh chỉ đọc.
```

**Khuyến nghị: Phương án A**, vì mục tiêu duy nhất của lát cắt là Cổng 2 (Amy dùng hằng tuần) và A là đường ngắn nhất tới một trang Amy mở được, với đúng một điểm chạm CRM để chứng minh chỉ đọc. Lối thoát sang B được giữ bằng cách tách Growth DB sau một lớp truy vấn mỏng (mục 11). Quyết định: **D-01, D-02**.

### 1.8 Tiêu chí thành công (Cổng 2)

Đề xuất cách đo "Amy dùng hằng tuần", chờ Mark chốt (**D-10**):
- Trong 3 tuần liên tiếp sau khi bật, mỗi tuần Amy mở Hàng chờ ít nhất 3 ngày làm việc và ra quyết định (xác nhận, sửa hoặc bác) cho ít nhất 80% mục được tạo trong tuần đó.
- Đo bằng chính nhật ký `queue_events` (sự kiện `queue_opened` và các quyết định), không hỏi miệng.
- Chỉ số phụ, chỉ để học, không phải cổng: tỷ lệ Amy sửa so với xác nhận nguyên bản theo từng loại mục; tỷ lệ NBA bị RM phản hồi "đã xử lý hoặc không bán được" (so với mốc 36/44).

---

## 2. Vòng 1: CEO review (cắt phạm vi cho Cổng 2)

### 2.1 Chế độ

**SCOPE REDUCTION.** Lý do: lát cắt chạm 7 thành phần mới (ước tính hơn 15 file khi build), hai nguồn đầu vào còn bị chặn, và cổng duy nhất cần qua là hành vi của một người dùng. Mọi thứ không làm Amy mở trang thường xuyên hơn đều bị cắt hoặc hoãn.

### 2.2 Thách thức tiền đề

- Vấn đề thật là thời gian và chất lượng của buổi duyệt sáng, không phải "có AI". Nếu bản nháp sai nhiều, Amy sẽ bỏ trang; vì thế độ chính xác của parser tự báo và của 5 luật NBA quan trọng hơn số tính năng.
- Hàng chờ chỉ có ích nếu có dữ liệu thật mỗi ngày (C5). Không có giá trị nào khi demo trên dữ liệu mẫu cho Amy; demo chỉ để người duyệt PR kiểm.

### 2.3 Giữ lại (cần cho Cổng 2)

| Thành phần | Phạm vi giữ |
|---|---|
| Growth DB | Snapshot CRM tối thiểu, tự báo đã ẩn danh, hàng chờ, nhật ký chỉ thêm, nhật ký phiên chạy agent |
| ETL CRM | 1 job hằng ngày, chỉ GET, chỉ các trường trong danh sách cho phép |
| crm-read-mcp | Đúng 3 tool: `get_pipeline_by_close_date`, `check_reseller_flag`, `find_duplicate_leads` |
| Bộ đọc tự báo RM | Đọc thread ngày hôm trước, tách mục theo mẫu, loại PII |
| Mi1-sa-01 | Cấu trúc hoá tự báo, đề xuất mã lý do, sinh NBA bằng luật |
| Hàng chờ | 1 trang danh sách theo ngày, 3 loại mục, 3 nút, form sửa, nút escalate khi điểm tự tin dưới 0,8, ô ghi phản hồi của RM cho NBA |
| Thông báo Teams | 1 tin mỗi sáng, chỉ có ngày và link |

### 2.4 Cắt hoặc hoãn (không cần cho Cổng 2)

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Lượt chạy CRON-05 lúc 13:00 | Hoãn | Amy duyệt buổi sáng; thêm lượt chiều khi Amy yêu cầu |
| Tự áp phương án mặc định khi quá hạn | Hoãn (chỉ lưu `default_action`, `due_at` và hiển thị tuổi mục) | Là việc của Mi1 và CRON-06; lát này không có Mi1 |
| Mi1 điều phối sa-01 | Hoãn; job chạy thẳng Mi1-sa-01 | Mi1 chưa tồn tại; giữ giao diện `runSa01()` để Mi1 gọi sau (**D-08**) |
| Ghi vào Neo4j sau khi Amy xác nhận | Hoãn | Không làm Amy dùng nhiều hơn; dữ liệu xác nhận nằm trong Growth DB, đồng bộ sang đồ thị ở lát sau (**D-02**) |
| Khớp PO và SO, nhắc invoice | Hoãn | Nhiệm vụ của sa-01 nhưng ngoài 3 loại mục của lát này |
| `get_orders_payments`, `get_net_profit_ic` | Hoãn | Cần API Internal Control (Cổng 1), không dùng cho 3 loại mục |
| Mục "Lead trùng" riêng trong Hàng chờ | Hoãn; `find_duplicate_leads` chỉ dùng để gắn cảnh báo lên mục NBA | Tránh giao một khách cho 2 RM (bẫy dữ liệu: khách WhatsApp rơi vào nhiều RM). Hỏi Amy có cần mục riêng không (**Q-12**) |
| LLM viết lời giải thích NBA | Cắt | Lý do NBA sinh từ luật đã kích hoạt, dạng mẫu câu cố định; $0 token và kiểm được |
| Hiển thị tên khách trong Hàng chờ | Cắt | Tên chỉ nằm ở CRM; mục hiển thị mã và link sang CRM (**Q-05**) |
| Phân quyền nhiều vai, nhiều người duyệt | Cắt | Hai tài khoản: Amy (duyệt), Mark (xem, nhận escalate) |
| Dashboard, biểu đồ, Digest tuần | Cắt | Không thuộc lát này |
| Command Center 3D, Creative Factory, ads, agent MKT, mọi mục Phụ lục B | Ngoài phạm vi | Ràng buộc phiên |

### 2.5 Trạng thái mơ ước và khoảng cách

Mơ ước 12 tháng: Hàng chờ là nơi duy nhất Amy và Mark duyệt mọi đề xuất của fleet, lý do từ chối chảy ngược về creative-factory-v2, NBA học từ phản hồi RM. Lát này đặt hai viên gạch không phải đập lại: (1) mô hình mục hàng chờ có một trạng thái, một hạn, một người duyệt, nhật ký chỉ thêm; (2) dữ liệu phản hồi của RM cho từng NBA, thứ hiện chưa ai thu.

---

## 3. Vòng 2: Eng review, kiến trúc và luồng dữ liệu

### 3.1 Sơ đồ thành phần

```
  NGUỒN (chỉ đọc)                      GROWTH WORKSPACE (1 container)                     NGƯỜI
 ┌──────────────────┐   GET   ┌──────────────────────────────┐
 │ API CRM           │◄───────┤ jobs/etl-crm (06:30)          │
 │ [ĐỐI CHIẾU SCHEMA]│        │  crm/http.ts: GET duy nhất    │
 └──────────────────┘        │  crm/mappers.ts: allowlist,   │
                              │  băm email và SĐT             │
                              └──────────────┬───────────────┘
                                             │ ghi snapshot
                                             ▼
                              ┌──────────────────────────────┐
                              │ Growth DB (SQLite)            │◄─── chỉ đọc ───┐
                              │ crm_* | rm_reports | queue_*  │                │
                              │ agent_runs | etl_runs         │                │
                              └──────▲─────────────▲─────────┘                │
                                     │ ghi nháp    │ ghi sự kiện              │
 ┌──────────────────┐   GET   ┌──────┴───────────┐ │                ┌─────────┴────────┐
 │ Microsoft Graph   │◄───────┤ jobs/sa01-morning │ │                │ mcp/crm-read     │
 │ channel "Đồng bộ  │        │ (08:00, T2 tới T7)│─┼── MCP stdio ──►│ 3 tool, READ_ONLY│
 │ dữ liệu"          │        │ 1 teams/read      │ │                └──────────────────┘
 └──────────────────┘        │ 2 pii/redact      │ │
                              │ 3 Mi1-sa-01 (LLM) │ │
 ┌──────────────────┐        │ 4 nba/rules (code)│ │
 │ Claude API        │◄──────┤ 5 queue: tạo mục  │ │
 └──────────────────┘ đã xoá │ 6 teams/notify    │─┼────────► Teams: "Hàng chờ dd/mm: <link>"
                     regex   └──────────────────┘ │
                                                   │
                              ┌────────────────────┴─┐  HTTPS + đăng nhập
                              │ queue/server (web)    │◄──────────────────────── Amy, Mark
                              │ xác nhận | sửa | bác  │
                              └───────────────────────┘
```

### 3.2 Luồng một ngày (D là ngày làm việc, D-1 là ngày tự báo)

1. **06:30** `etl-crm`: tạo `etl_runs` mới; kéo Opportunity, Client, Lead, OrderItem (qua Product2.Family) bằng GET; ánh xạ qua allowlist; băm email, SĐT của Lead; ghi vào bảng `crm_*` gắn `etl_run_id`; đánh dấu run `succeeded`. Lỗi thì run `failed`, snapshot cũ giữ nguyên.
2. **08:00** `sa01-morning` cho ngày D-1:
   1. Kiểm điều kiện bật (C5): có snapshot CRM `succeeded` trong 24 giờ và đọc được Graph. Thiếu một trong hai thì không sinh mục từ nguồn đó, tạo một mục hệ thống "Thiếu dữ liệu" để Amy biết, và vẫn gửi thông báo.
   2. Đọc thread ngày D-1 và các reply bằng Graph (GET). Văn bản thô chỉ tồn tại trong bộ nhớ của tiến trình.
   3. `pii/redact` bước 1 (regex): xoá email, SĐT, số hộ chiếu, ngày sinh, URL có tham số.
   4. Mi1-sa-01 (LLM) nhận văn bản đã qua bước 3 cùng danh mục mã lý do; trả JSON theo schema cố định (mục 5.4). Schema không có trường tự do nào cho tên khách.
   5. `pii/redact` bước 2 (sau LLM): quét lại mọi chuỗi trong JSON bằng regex và bộ lọc tên riêng (mục 7.3). Không qua thì mục bị chặn, chỉ lưu link sang tin Teams gốc.
   6. Ghi `rm_reports` (bản đã ẩn danh) và tạo mục hàng chờ loại `self_report` và `reason_code`.
   7. Gọi `crm-read-mcp` lấy pipeline kỳ hiện tại, cờ reseller, Lead trùng; `nba/rules` sinh ứng viên, áp 5 luật, xếp hạng, tạo mục `nba`.
   8. Tính điểm tự tin cho từng mục bằng hàm đã khoá (mục 5.6).
   9. Gửi một tin Teams chỉ có ngày và link.
3. **Trong ngày** Amy mở trang: mỗi lần mở ghi `queue_opened`; mỗi nút ghi một `queue_event`. Trạng thái mục là sự kiện quyết định mới nhất.

### 3.3 Ranh giới quyền (khớp spec mục 9)

| Thành phần | Đọc | Ghi | Chế độ spec |
|---|---|---|---|
| `etl-crm` | API CRM (GET) | Growth DB bảng `crm_*`, `etl_runs` | READ_ONLY với CRM |
| `crm-read-mcp` | Growth DB (mở read-only) | Không | READ_ONLY |
| `sa01-morning` | Graph (GET), crm-read-mcp | Growth DB `rm_reports`, `queue_items`, `agent_runs` | WRITE_INTERNAL, DRAFT_ONLY |
| `queue/server` | Growth DB | Growth DB `queue_events` | WRITE_INTERNAL |
| `teams/notify` | Không | Một webhook Teams, nội dung cố định | Thông báo, không phải duyệt |

Không thành phần nào ghi vào CRM, Graph (ngoài tin thông báo), Neo4j hay Google Sheets trong lát này.

---

## 4. Schema Growth DB tối thiểu

Lưu trữ: SQLite (**D-02**). Kiểu thời gian: chuỗi ISO 8601 UTC. Ngày nghiệp vụ (`report_date`, `close_date`): `YYYY-MM-DD`. Mọi bảng đánh dấu **(chỉ thêm)** có trigger chặn `UPDATE` và `DELETE`.

### 4.1 Snapshot CRM

Mọi cột dưới đây là **[ĐỐI CHIẾU SCHEMA]**: tên và kiểu thật phải lấy từ tài liệu API CRM khi MobCEC mở (STATUS a). Danh sách cột chính là allowlist: trường nào không có ở đây thì không bao giờ được lưu.

```sql
CREATE TABLE etl_runs (            -- (chỉ thêm; trạng thái kết thúc ghi bằng dòng etl_run_status)
  id            TEXT PRIMARY KEY,  -- ulid
  source        TEXT NOT NULL,     -- 'crm'
  started_at    TEXT NOT NULL
);
CREATE TABLE etl_run_status (      -- (chỉ thêm)
  etl_run_id    TEXT NOT NULL REFERENCES etl_runs(id),
  status        TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  finished_at   TEXT NOT NULL,
  row_counts    TEXT NOT NULL,     -- JSON {opportunity: n, ...}
  error_code    TEXT               -- mã lỗi, không có nội dung bản ghi
);

CREATE TABLE crm_opportunities (
  etl_run_id        TEXT NOT NULL REFERENCES etl_runs(id),
  opportunity_id    TEXT NOT NULL,
  client_id         TEXT,          -- NULL nếu chưa gắn Client
  owner_rm_id       TEXT,
  stage             TEXT NOT NULL,
  close_date        TEXT,          -- dùng cho pipeline_in_period
  last_modified_at  TEXT,          -- dùng cho rm_active_on_deal
  has_next_step     INTEGER,       -- 0/1; KHÔNG lưu nội dung NextStep (có thể chứa tên khách)
  jurisdiction_code TEXT,
  service_family    TEXT,          -- IBC01/IBC11/IBC13/IBC14 nếu suy được từ sản phẩm
  industry_code     TEXT,          -- dùng cho luật 3; [ĐỐI CHIẾU SCHEMA] có trường này không
  rejection_reason_code TEXT,      -- trường A4, NULL khi CRM chưa có
  PRIMARY KEY (etl_run_id, opportunity_id)
);
-- KHÔNG lưu: Opportunity.Name (thường chứa tên khách), Description, NextStep text, số tiền.

CREATE TABLE crm_clients (
  etl_run_id              TEXT NOT NULL REFERENCES etl_runs(id),
  client_id               TEXT NOT NULL,
  is_reseller_end_client  INTEGER,  -- 1/0/NULL; NULL = CRM chưa có trường A4 hoặc chưa điền
  industry_code           TEXT,
  first_won_at            TEXT,     -- xác định "khách cũ" (luật 1); [ĐỐI CHIẾU SCHEMA] lấy từ Order hay Opportunity
  PRIMARY KEY (etl_run_id, client_id)
);
-- KHÔNG lưu: tên Client, địa chỉ, người đại diện, UBO, mọi trường KYC.

CREATE TABLE crm_client_services (  -- nguồn của services_purchased
  etl_run_id     TEXT NOT NULL REFERENCES etl_runs(id),
  client_id      TEXT NOT NULL,
  product_family TEXT NOT NULL,     -- OrderItem → Product2.Family; không dùng WorkOrder.Work_Order_Team__c
  PRIMARY KEY (etl_run_id, client_id, product_family)
);

CREATE TABLE crm_leads (
  etl_run_id   TEXT NOT NULL REFERENCES etl_runs(id),
  lead_id      TEXT NOT NULL,
  owner_rm_id  TEXT,
  created_at   TEXT,
  status       TEXT,
  email_hash   TEXT,                -- hex SHA-256 (hoặc HMAC, D-05) của email đã chuẩn hoá
  phone_hash   TEXT,                -- như trên, SĐT đã chuẩn hoá
  PRIMARY KEY (etl_run_id, lead_id)
);
CREATE INDEX crm_leads_email ON crm_leads(etl_run_id, email_hash);
CREATE INDEX crm_leads_phone ON crm_leads(etl_run_id, phone_hash);
```

Giữ snapshot 14 ngày rồi xoá snapshot cũ (job dọn dẹp xoá theo `etl_run_id`, bảng snapshot không thuộc nhóm chỉ thêm). Mục hàng chờ tham chiếu `etl_run_id` nên vẫn biết mình được sinh từ snapshot nào; sau 14 ngày chỉ còn mã, không còn số. Đề xuất, chờ duyệt (**D-09**).

### 4.2 Danh bạ RM

```sql
CREATE TABLE rm_directory (
  rm_id          TEXT PRIMARY KEY,   -- = owner id trên CRM [ĐỐI CHIẾU SCHEMA]
  display_name   TEXT NOT NULL,      -- tên nhân viên, không phải khách
  teams_user_id  TEXT UNIQUE,        -- AAD object id, để nối tác giả reply với RM
  active         INTEGER NOT NULL DEFAULT 1
);
```

Nạp từ một file cấu hình ngoài repo hoặc biến môi trường do người vận hành điền (**Q-07**). Fixture trong repo dùng `RM_A`, `RM_B`.

### 4.3 Tự báo RM đã ẩn danh

```sql
CREATE TABLE rm_reports (           -- (chỉ thêm)
  id                  TEXT PRIMARY KEY,
  report_date         TEXT NOT NULL,     -- ngày D-1 theo giờ Việt Nam
  rm_id               TEXT REFERENCES rm_directory(rm_id),  -- NULL nếu chưa map được tác giả
  source_message_ref  TEXT NOT NULL,     -- SHA-256 của (team, channel, message id); không lưu nội dung
  source_link         TEXT NOT NULL,     -- deep link Teams để Amy mở bản gốc
  source_version      TEXT NOT NULL,     -- lastModifiedDateTime của tin; tin sửa thì tạo dòng mới
  parsed              TEXT,              -- JSON đã ẩn danh theo schema mục 5.4; NULL nếu bị chặn
  pii_check           TEXT NOT NULL CHECK (pii_check IN ('passed','blocked')),
  redaction_stats     TEXT NOT NULL,     -- JSON đếm số chỗ đã xoá theo loại, không có giá trị
  parser_version      TEXT NOT NULL,
  agent_run_id        TEXT NOT NULL REFERENCES agent_runs(id),
  created_at          TEXT NOT NULL,
  UNIQUE (source_message_ref, source_version)
);
```

### 4.4 Hàng chờ và nhật ký

```sql
CREATE TABLE queue_items (          -- (chỉ thêm) nội dung đề xuất là bất biến
  id              TEXT PRIMARY KEY,
  item_type       TEXT NOT NULL CHECK (item_type IN ('self_report','reason_code','nba','system_notice')),
  queue_date      TEXT NOT NULL,     -- ngày D hiển thị trên Hàng chờ
  dedupe_key      TEXT NOT NULL UNIQUE,  -- chạy lại job không sinh mục trùng
  subject_ref     TEXT,              -- opportunity_id, client_id hoặc rm_reports.id
  payload         TEXT NOT NULL,     -- JSON đề xuất, đã ẩn danh
  rules_fired     TEXT NOT NULL,     -- JSON mảng mã luật, ví dụ ["NBA_R1","NBA_R5"]
  confidence      REAL NOT NULL,     -- từ hàm compute_confidence, 0..1
  confidence_inputs TEXT NOT NULL,   -- JSON các thành phần của điểm, để giải thích
  assignee        TEXT NOT NULL,     -- 'amy'
  default_action  TEXT NOT NULL,     -- phương án mặc định (spec mục 6); lát này chỉ hiển thị
  due_at          TEXT NOT NULL,
  etl_run_id      TEXT REFERENCES etl_runs(id),
  agent_run_id    TEXT NOT NULL REFERENCES agent_runs(id),
  created_at      TEXT NOT NULL
);

CREATE TABLE queue_events (         -- (chỉ thêm) mọi thao tác của Amy và Mark
  id          TEXT PRIMARY KEY,
  item_id     TEXT REFERENCES queue_items(id),  -- NULL với queue_opened
  actor       TEXT NOT NULL,        -- id người dùng đã xác thực, không lấy từ form
  action      TEXT NOT NULL CHECK (action IN
              ('queue_opened','confirm','edit','reject','escalate','rm_outcome','pii_flag')),
  payload     TEXT,                 -- edit: bản đã sửa đầy đủ; reject: lý do; rm_outcome: kết quả
  created_at  TEXT NOT NULL
);

CREATE VIEW queue_item_state AS     -- một mục chỉ có một trạng thái
  SELECT i.id,
         COALESCE((SELECT e.action FROM queue_events e
                   WHERE e.item_id = i.id AND e.action IN ('confirm','edit','reject','escalate','pii_flag')
                   ORDER BY e.created_at DESC, e.id DESC LIMIT 1), 'pending') AS state
  FROM queue_items i;
```

Quy tắc trạng thái: `pending` → `confirm` | `edit` | `reject` | `escalate`. `edit` tính là đã quyết định, bản có hiệu lực là `payload` của sự kiện `edit` mới nhất. Mục `nba` sau khi `confirm` hoặc `edit` nhận thêm đúng một `rm_outcome` (`rm_accepted`, `rm_already_handled`, `rm_not_sellable`, `rm_no_reply`). `pii_flag`: Amy báo mục còn PII; mục bị ẩn khỏi trang và chuyển cho người vận hành xử lý (mục 7.5).

### 4.5 Nhật ký phiên chạy agent

```sql
CREATE TABLE agent_runs (           -- (chỉ thêm) spec mục 6, quy tắc vận hành 2
  id              TEXT PRIMARY KEY,
  agent           TEXT NOT NULL,    -- 'mi1-sa-01'
  trigger         TEXT NOT NULL,    -- 'cron-05', 'manual'
  prompt_version  TEXT NOT NULL,
  eval_version    TEXT NOT NULL,    -- bộ eval đã pass gần nhất của prompt này
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cost_usd        REAL NOT NULL,    -- tính bằng hàm từ bảng giá cấu hình, không do LLM
  status          TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  finished_at     TEXT NOT NULL
);
```

Ghi chú: `agent_runs` và `etl_runs` chỉ ghi khi phiên kết thúc (một lần insert), nên không cần update.

---

## 5. Đặc tả từng thành phần

### 5.1 ETL CRM (`jobs/etl-crm`)

- Lịch: 06:30 hằng ngày (khớp CRON-03, chỉ phần CRM).
- Đối tượng: Opportunity, Client, Lead, OrderItem kèm Product2.Family. **[ĐỐI CHIẾU SCHEMA]** tên endpoint, phân trang, giới hạn tần suất, múi giờ của trường ngày.
- Phạm vi kéo: toàn bộ Opportunity có Close Date trong 13 tháng gần nhất và mọi Opportunity mở; mọi Client có Order; Lead tạo trong 180 ngày (đủ cho kiểm trùng). Chờ duyệt (**D-09**).
- Ánh xạ: mỗi đối tượng có một hàm `mapX(raw): Row` chỉ chép trường trong allowlist; trường lạ bị bỏ qua, không lỗi. Email, SĐT được chuẩn hoá và băm ngay trong hàm map; giá trị gốc không rời khỏi hàm.
- Idempotent: mỗi lần chạy là một snapshot mới; chạy lại không đụng snapshot cũ.

### 5.2 `crm-read-mcp`

Server MCP qua stdio, mở Growth DB ở chế độ read-only, luôn đọc snapshot `succeeded` mới nhất (trả kèm `etl_run_id`, `snapshot_at` trong mọi kết quả).

| Tool | Đầu vào | Đầu ra | Hàm chỉ số |
|---|---|---|---|
| `get_pipeline_by_close_date` | `period_start`, `period_end` (ngày), tuỳ chọn `owner_rm_id` | Opportunity mở có Close Date trong kỳ, nhóm theo Stage: `{stage, count, opportunity_ids[]}` | `pipeline_in_period` |
| `check_reseller_flag` | `client_id` | `{client_id, is_reseller_end_client: true \| false \| "unknown", source: "crm_field" \| "missing"}` | `is_reseller_end_client` |
| `find_duplicate_leads` | `lead_id` hoặc `client_id` | Nhóm Lead chung `email_hash` hoặc `phone_hash`: `{match_on, lead_ids[], owner_rm_ids[]}` | không có (so khớp mã băm) |

- Không có tham số lọc theo Created Date ở bất kỳ tool nào (luật 5 kiểm được bằng schema của tool).
- Không tool nào trả mã băm ra ngoài; chỉ trả mã Lead.
- `check_reseller_flag` không bao giờ suy đoán: trường trống trả `"unknown"` (metric-definitions: "Không dùng: suy đoán từ dữ liệu").

### 5.3 Bộ đọc tự báo RM (`teams/graph-read`, `teams/parse-report`)

- Đọc bằng Microsoft Graph, quyền application chỉ đọc channel (**Q-02**: tên quyền cụ thể do admin tenant chốt). **[ĐỐI CHIẾU SCHEMA]** id team, id channel, cách nhận diện thread ngày (tin gốc có chứa `dd/mm` của ngày D-1?).
- Graph trả toàn văn reply, nên giới hạn 1.000 ký tự của công cụ đọc hiện tại (decisions.md) không áp dụng. Nếu buộc phải dùng công cụ cũ, mục được gắn cờ `truncated` và điểm tự tin giảm (mục 5.6).
- Parser xác định (không LLM) tách khung trước: dòng tiêu đề `[dd/mm] [RM] Tên` và 7 nhãn TIẾP CẬN, ĐĂNG BÀI, HỘI THOẠI, BÁO GIÁ, KHÁCH NÓI, CHƯA LÊN HỆ THỐNG, CẦN HỖ TRỢ. Chịu được: HTML, bullet, nhãn viết thường hoặc không dấu, thiếu nhãn, nhãn lặp, nhiều reply của một RM trong một ngày (gộp theo thứ tự thời gian). Không nhận ra khung thì đưa nguyên văn (đã qua regex) cho LLM với cờ `unstructured`.
- Tác giả reply map sang `rm_id` bằng `teams_user_id`, không bằng tên trong dòng tiêu đề.

### 5.4 Mi1-sa-01

Gọi LLM một lần cho mỗi bản tự báo (khoảng 8 lần mỗi sáng). Đầu ra là JSON kiểm bằng schema; sai schema thì thử lại 1 lần, vẫn sai thì mục bị đánh dấu `parse_failed` và chỉ hiện link Teams.

```jsonc
// Schema đầu ra (bản đề xuất). Không có trường tên khách.
{
  "report_date": "2026-10-30",
  "sections": {
    "outreach":        { "count": 12,  "channels": ["linkedin"], "note": "..." },
    "posts":           { "count": 1,   "note": "..." },
    "conversations":   { "count": 4,   "note": "..." },
    "quotes":          [{ "jurisdiction_code": "WS", "service_family": "IBC01", "status": "sent" }],
    "customer_said":   [{ "customer_ref": "KHACH_1", "quote_vi": "...", "quote_original": "..." }],
    "not_in_crm":      { "count": 2, "note": "..." },
    "needs_support":   [{ "topic": "...", "note": "..." }]
  },
  "reason_code_proposals": [
    { "customer_ref": "KHACH_1", "primary": "PRICE_TOO_HIGH", "secondary": null,
      "is_final": true, "evidence_quote": "...", "opportunity_hint": {
        "jurisdiction_code": "WS", "service_family": "IBC01" } }
  ],
  "flags": ["unstructured", "truncated"]
}
```

- `customer_ref` là nhãn giả `KHACH_n` trong phạm vi một bản tự báo; không nối được giữa các ngày.
- Mọi số đếm (`count`) là số RM tự ghi, LLM chỉ chép, không cộng (C3). Nếu RM không ghi số, để `null`.
- Đề xuất mã lý do chỉ được chọn từ danh mục v0.1; ngoài danh mục thì `OTHER` kèm `evidence_quote` bắt buộc.
- Nối đề xuất mã lý do với Opportunity: tên khách đã bị xoá nên không nối tự động được. Mục `reason_code` hiện danh sách Opportunity mở của RM đó khớp `jurisdiction_code` và `service_family`, Amy chọn đúng mã (**Q-04**).
- Văn bản tự báo là dữ liệu không tin cậy: prompt đặt văn bản trong khối dữ liệu, agent không có tool ghi nào, đầu ra chỉ là JSON kiểm schema (mục 9).

### 5.5 Luật NBA (`agents/sa-01/nba`)

Hoàn toàn bằng code. Ứng viên lấy từ hai nguồn:
1. Opportunity mở có Close Date trong kỳ hiện tại (qua `get_pipeline_by_close_date`); hành động mặc định "RM theo tiếp".
2. Khách cũ (Client có `first_won_at`) chưa có `IBC13` trong `services_purchased`; hành động "RM chào Bank".

Thứ tự áp luật (mỗi luật có mã để ghi vào `rules_fired` và để eval tham chiếu):

| Mã | Luật (spec mục 11) | Cách áp |
|---|---|---|
| `NBA_R5` | Pipeline lọc theo Close Date trong kỳ, nhóm theo Stage | Ứng viên nguồn 1 chỉ đến từ `get_pipeline_by_close_date`; không có đường nào khác |
| `NBA_R2` | Khách reseller: không upsell trực tiếp | `true` → loại mọi hành động upsell; `"unknown"` → không upsell, thay bằng hành động "Nhờ RM xác nhận cờ reseller" (**D-06**) |
| `NBA_R1` | Khách cũ: RM chỉ bán thêm Bank | Hành động upsell nào khác Bank (Renew, ATA, Service) chuyển thành "Đề xuất chuyển giao cho team sở hữu" kèm tên team |
| `NBA_R3` | Ngành Forex, Markets, môi giới tài chính: chỉ hạ ưu tiên | Ngành cấm hoặc mã `RESTRICTED_INDUSTRY` đã xác nhận → nhân hệ số ưu tiên với một số nhỏ hơn 1; hàm xếp hạng có kiểm tra cứng: luật 3 không bao giờ làm điểm tăng |
| `NBA_R4` | Danh sách giao RM luôn là nháp chờ RM xác nhận | Mọi mục `nba` sinh ra với `default_action = "giữ nháp"`; sau khi Amy xác nhận, trạng thái hiển thị là "chờ RM xác nhận" cho tới khi có `rm_outcome` |

Bổ sung (không phải luật spec, chờ duyệt):
- `NBA_X_DUP`: ứng viên có Lead trùng thuộc RM khác → gắn cảnh báo "có thể trùng khách với RM X" (dùng `find_duplicate_leads`).
- `NBA_X_STALL`: Opportunity có mã STALL đã xác nhận (`UNRESPONSIVE`, `PAYMENT_PENDING`) → hành động gợi ý tương ứng (follow up, nhắc invoice).
- Xếp hạng: Stage gần chốt trước, Close Date sớm trước, `rm_active_on_deal = false` được ưu tiên nhắc. Trọng số Stage cần Amy cho (**Q-09**). Giới hạn 20 mục NBA mỗi sáng (**Q-10**).
- Lời giải thích của mỗi mục ghép từ mẫu câu cố định theo luật đã kích hoạt, không dùng LLM.

### 5.6 Điểm tự tin (`metrics/confidence`)

Không lấy từ model tự chấm (C6). Đề xuất công thức, Mark duyệt (**D-07**), khoá bằng unit test:

```
confidence(item) = eval_pass_rate(task, prompt_version)       // từ lần chạy eval gần nhất
                 × field_coverage(item)                        // tỷ lệ trường cần thiết đã biết
                 × min(1, eval_case_count(task) / 30)          // phạt cỡ mẫu eval nhỏ
```

- `task` thuộc `self_report_parse`, `reason_code`, `nba`. Với `nba`, `eval_pass_rate` là tỷ lệ pass ca luật, phải bằng 1,0 mới được bật (mục 12.4).
- `field_coverage`: ví dụ NBA cần cờ reseller, ngành, `services_purchased`; mỗi trường `unknown` làm giảm.
- `truncated`, `unstructured` nhân thêm 0,8.
- Dưới 0,8: thẻ mục có nút Escalate lên Mark. Escalate ghi `queue_event` và gửi Mark một tin Teams chỉ có link.

### 5.7 Trang Hàng chờ (`queue/server`)

- Một route chính `GET /queue?date=YYYY-MM-DD` (mặc định hôm nay), nhóm theo loại: Tự báo RM, Mã lý do, NBA, Thông báo hệ thống. Đầu trang: thời điểm snapshot CRM và trạng thái nguồn (xanh, vàng khi snapshot cũ hơn 24 giờ, đỏ khi thiếu nguồn).
- Mỗi thẻ: nội dung đề xuất, luật đã kích hoạt, điểm tự tin và thành phần, tuổi mục, link Teams hoặc link CRM, nút Xác nhận, Sửa, Bác (bác bắt buộc nhập lý do), Escalate khi điểm dưới 0,8.
- Sửa: form có trường cố định theo loại mục (chọn mã từ danh sách, sửa số đếm, chọn Opportunity), không có ô văn bản dài tự do cho NBA; ô ghi chú có giới hạn độ dài và đi qua bộ lọc PII trước khi lưu.
- Mục NBA đã xác nhận: có khối "Danh sách cho RM" dạng văn bản để Amy tự sao chép sang Teams; có nút ghi phản hồi RM.
- HTML render phía server, không framework phía client; mọi chuỗi được escape. Form có CSRF token.
- Đăng nhập: **D-04**. Danh sách người dùng cố định: Amy (duyệt), Mark (xem, nhận escalate).

### 5.8 Thông báo Teams (`teams/notify`)

- Một tin sau mỗi lượt `sa01-morning`, gửi tới chat hoặc channel do Amy chọn (**Q-11**), qua Incoming Webhook hoặc Workflows (**D-11**).
- Nội dung cố định: `Hàng chờ ngày dd/mm đã sẵn sàng: <link>`. Không số liệu, không tên, không nội dung mục. Payload được dựng từ một mẫu duy nhất; test kiểm payload không chứa gì khác ngoài ngày và link.
- Escalate gửi Mark tin cùng dạng: `Amy cần anh xem một mục: <link>`.

---

## 6. Chứng minh CRM chỉ đọc

Năm lớp, mỗi lớp có test hoặc bằng chứng riêng:

| Lớp | Cơ chế | Bằng chứng |
|---|---|---|
| L1 Quyền | Token CRM do MobCEC cấp với phạm vi chỉ đọc, riêng cho Growth Workspace | Văn bản xác nhận của MobCEC lưu ở kho tài liệu nội bộ (không lưu trong repo); **không** viết test thử ghi vào CRM thật, vì nếu token có quyền ghi thì test đó sẽ ghi thật (vi phạm quy tắc 1) |
| L2 Một cửa | Chỉ `src/crm/http.ts` được gọi mạng tới CRM. Module chỉ xuất `crmGet(resource, query)`; phương thức HTTP được gán cứng `"GET"` bên trong, không có tham số `method`, `body` | Unit test: gọi mọi hàm xuất ra với fetch giả, kiểm mọi request là GET và không có body |
| L3 Allowlist | `resource` thuộc một enum cố định (Opportunity, Client, Lead, OrderItem); host phải khớp `CRM_API_BASE`; chuyển hướng (redirect) bị từ chối | Unit test: resource lạ, host lạ, redirect sang host khác đều ném lỗi trước khi gửi |
| L4 Kiểm tĩnh | Test quét mã nguồn: ngoài `src/crm/http.ts` không file nào chứa host CRM hoặc gọi `fetch` với biến `CRM_API_BASE`; trong `src/crm/` không có chuỗi `POST`, `PUT`, `PATCH`, `DELETE`; không file nào import `crm/http` ngoài `crm/etl` | Test `test/static/crm-readonly.test.ts`, chạy trong `bun test` và CI |
| L5 Tích hợp | Chạy toàn bộ job ETL với một CRM giả (Bun.serve trong test) ghi lại mọi request | Test kiểm: mọi request là GET, chỉ tới đúng các resource cho phép; số request có giới hạn |

Thêm cho `crm-read-mcp`: mở SQLite với `readonly: true`; test thử `INSERT` qua kết nối đó phải lỗi; test `tools/list` trả đúng 3 tool, không hơn.

---

## 7. Loại PII khỏi tự báo RM và khỏi dữ liệu CRM

### 7.1 Nguyên tắc

1. **Không lưu trước, lọc sau.** Văn bản thô của Teams và bản ghi thô của CRM chỉ sống trong bộ nhớ của một lần chạy; thứ được ghi xuống là kết quả đã lọc.
2. **Allowlist, không denylist** cho dữ liệu có cấu trúc (CRM): chỉ chép trường đã liệt kê ở mục 4.1.
3. **Nhiều lớp** cho văn bản tự do (Teams), vì không lớp nào một mình bắt được hết tên người.
4. **Thất bại thì chặn**: lớp cuối không chắc chắn thì không lưu nội dung, chỉ lưu link về bản gốc trong Teams (nơi RM và Amy vốn đã thấy).

### 7.2 Dữ liệu CRM

- Allowlist cột như mục 4.1. Cụ thể không lưu `Opportunity.Name`, nội dung `NextStep`, `Description`, tên Client, mọi trường KYC.
- Email chuẩn hoá: cắt khoảng trắng, chữ thường. SĐT chuẩn hoá: chỉ giữ chữ số, thêm mã quốc gia theo quy tắc **[ĐỐI CHIẾU SCHEMA]** (CRM lưu SĐT dạng nào). Băm SHA-256 theo spec; khuyến nghị đổi sang HMAC-SHA256 với khoá bí mật trong biến môi trường, vì không gian SĐT nhỏ nên SHA-256 trần có thể bị dò ngược (**D-05**).

### 7.3 Tự báo RM: bốn lớp

| Lớp | Khi nào | Làm gì |
|---|---|---|
| R1 Regex | Trước khi gửi LLM | Thay email, SĐT (nhiều định dạng quốc tế), chuỗi giống số hộ chiếu, ngày sinh (ngày có ngữ cảnh "DOB", "sinh"), URL có tham số bằng `[EMAIL]`, `[SĐT]`, `[GIẤY_TỜ]`, `[NGÀY_SINH]`, `[URL]` |
| R2 Schema | LLM | Prompt yêu cầu thay mọi tên người hoặc công ty khách bằng `KHACH_n`; schema đầu ra không có trường tên; trích dẫn khách giới hạn 1 câu |
| R3 Quét sau | Sau LLM, trước khi ghi | Chạy lại R1 trên mọi chuỗi; bộ lọc tên riêng: chuỗi viết hoa liên tiếp không thuộc danh sách cho phép (tên tài phán, tên sản phẩm, nhãn mẫu, tên RM trong `rm_directory`, từ thông dụng) bị coi là nghi tên khách. Có nghi vấn thì `pii_check = blocked` |
| R4 Người | Trên Hàng chờ | Amy thấy mục còn PII thì bấm "Báo PII": mục bị ẩn, sự kiện `pii_flag` được ghi, người vận hành chạy lệnh xoá có kiểm soát (mục 7.5) |

Ghi chú: R3 sẽ chặn nhầm (ví dụ tên thành phố không có trong danh sách cho phép). Chặn nhầm chỉ làm mất bản nháp, Amy vẫn có link Teams; lọt PII thì vi phạm quy tắc cứng. Danh sách cho phép được mở rộng qua PR khi thấy chặn nhầm lặp lại.

### 7.4 Log, fixture, eval

- Logger chỉ nhận đối tượng có trường khai báo trước (`event`, `run_id`, `count`, `error_code`); không có API ghi chuỗi tuỳ ý. Lỗi từ thư viện được rút gọn về mã lỗi, không kèm thông điệp có thể chứa nội dung bản ghi.
- Fixture và ca eval: chỉ dữ liệu tổng hợp. Tên khách tổng hợp dùng dạng canary (`CANARY_NAME_7f3a`), email `canary+n@example.invalid`, SĐT trong dải dành cho thử nghiệm, để test quét được.
- Test quét repo: mọi file trong `test/fixtures/` và `evals/` không chứa email trừ đuôi `example.invalid`, không chứa chuỗi giống SĐT ngoài dải thử nghiệm.

### 7.5 Xoá có kiểm soát

Các bảng chỉ thêm không cho xoá bằng ứng dụng. Khi có `pii_flag` hoặc yêu cầu xoá, người vận hành chạy một script riêng tạm tắt trigger trong một transaction, thay `payload`/`parsed` của đúng dòng đó bằng `{"redacted": true}`, rồi ghi một sự kiện kiểm toán. Script này không chạy được từ web hay agent. Chờ duyệt (**D-12**).

---

## 8. Bản đồ lỗi và cách cứu

| Lỗi | Phát hiện | Cách cứu | Amy thấy gì |
|---|---|---|---|
| ETL CRM lỗi mạng hoặc 5xx | `etl_run_status = failed` | Thử lại có giãn cách 3 lần; vẫn lỗi thì giữ snapshot cũ | Dải vàng "Dữ liệu CRM từ dd/mm hh:mm"; NBA không sinh nếu snapshot cũ hơn 24 giờ (C5) |
| ETL CRM 401/403 | mã lỗi | Không thử lại; báo người vận hành | Mục hệ thống "Mất quyền đọc CRM" |
| Schema CRM đổi (thiếu trường bắt buộc) | hàm map ném lỗi kiểu | Run `failed`, không ghi snapshot dở | Như trên |
| Graph lỗi hoặc mất quyền | mã lỗi | Không sinh mục tự báo và mã lý do | Mục hệ thống "Không đọc được Teams" |
| Không có thread ngày D-1 (ngày nghỉ) | không tìm thấy tin gốc | Không sinh mục | Dòng "Không có tự báo ngày dd/mm" |
| RM chưa map được (`teams_user_id` lạ) | `rm_id = NULL` | Vẫn cấu trúc hoá; điểm tự tin giảm | Thẻ ghi "RM chưa xác định" |
| RM sửa tin sau 08:00 | `source_version` mới ở lượt sau | Lát này chỉ chạy 08:00 nên bỏ lỡ; ghi vào Q-08 | Không thấy bản sửa tới khi có lượt chiều |
| LLM lỗi, hết hạn mức, sai schema 2 lần | lỗi API hoặc kiểm schema | Mục `parse_failed`; không thử thêm | Thẻ "Không cấu trúc được, mở bản gốc trong Teams" |
| Lớp R3 chặn | `pii_check = blocked` | Không lưu `parsed` | Thẻ "Đã chặn vì nghi có thông tin khách, mở bản gốc" |
| Chạy job 2 lần | `dedupe_key` trùng | Bỏ qua mục đã có | Không thấy trùng |
| Gửi Teams lỗi | lỗi webhook | Thử lại 3 lần; ghi log; không chặn hàng chờ | Amy vẫn mở trang theo thói quen |
| Token vượt trần tháng | tổng `agent_runs.cost_usd` | Dừng gọi LLM, chỉ sinh NBA (bằng code) | Mục hệ thống "Tạm dừng đọc tự báo do chạm trần chi phí" |

---

## 9. Bảo mật và mô hình đe doạ

| Đe doạ | Biện pháp |
|---|---|
| Người ngoài mở Hàng chờ | Bắt buộc đăng nhập (D-04); danh sách người dùng cố định; mọi route trừ health check yêu cầu phiên hợp lệ |
| Giả mạo thao tác của Amy | `actor` lấy từ phiên đăng nhập, không từ form; CSRF token; cookie `HttpOnly`, `Secure`, `SameSite=Strict` |
| XSS qua nội dung tự báo | Render phía server, escape mọi chuỗi; Content-Security-Policy chặn script ngoài |
| Prompt injection trong tự báo RM | Agent không có tool ghi; đầu ra kiểm schema; mã lý do chỉ trong danh mục; NBA không phụ thuộc LLM |
| Lộ secret | Chỉ biến môi trường (`.env.example` có tên biến, không giá trị); test kiểm không có chuỗi giống token trong repo; khuyến nghị bật Secret scanning (STATUS việc 2) |
| Lộ PII qua log, backup | Mục 7; file SQLite và backup nằm trên ổ có mã hoá của nền tảng host (**Q-13**) |
| Ghi nhầm vào CRM | Mục 6 |
| Sửa lịch sử quyết định | Trigger chặn `UPDATE`/`DELETE` trên bảng chỉ thêm; test chứng minh |

`/cso` sẽ chạy ở giai đoạn build (chỉ phân tích tĩnh nếu máy không có Docker).

---

## 10. Danh sách test

Viết trước khi viết code (CLAUDE.md, nguyên tắc 4). Mọi test chạy bằng `bun test`, không gọi mạng thật, không gọi LLM thật (LLM được thay bằng bản ghi đáp cố định; chất lượng LLM đo bằng eval ở mục 12).

### 10.1 CRM chỉ đọc (mục 6)

- T-CRM-01 `crmGet` luôn gửi GET, không body, với mọi resource trong enum.
- T-CRM-02 Resource ngoài enum ném lỗi, không gửi request.
- T-CRM-03 Host khác `CRM_API_BASE` ném lỗi; redirect sang host khác bị từ chối.
- T-CRM-04 (tĩnh) Ngoài `src/crm/http.ts` không file nào gọi mạng tới CRM; `src/crm/` không chứa `POST|PUT|PATCH|DELETE`; chỉ `crm/etl` import `crm/http`.
- T-CRM-05 (tích hợp) Chạy ETL với CRM giả: 100% request là GET, chỉ tới resource cho phép.
- T-CRM-06 401/403 không thử lại; 5xx thử lại đúng 3 lần.

### 10.2 Ánh xạ và PII của dữ liệu CRM

- T-MAP-01 Bản ghi tổng hợp có tên, email, SĐT, Opportunity.Name, NextStep chứa canary: sau map và ghi DB, dump toàn bộ DB không chứa canary nào.
- T-MAP-02 Trường lạ bị bỏ qua; thiếu trường bắt buộc ném lỗi kiểu, run `failed`, không có dòng snapshot dở.
- T-HASH-01 Chuẩn hoá email: hoa thường và khoảng trắng cho cùng mã băm.
- T-HASH-02 Chuẩn hoá SĐT: các định dạng khác nhau của cùng một số cho cùng mã băm; số khác cho mã khác.
- T-HASH-03 Vector cố định: đầu vào tổng hợp biết trước cho mã băm biết trước (khoá thuật toán theo D-05).

### 10.3 Hàm chỉ số (metric-definitions)

- T-MET-01 `pipeline_in_period`: deal tạo trước kỳ nhưng Close Date trong kỳ được tính; deal tạo trong kỳ nhưng Close Date ngoài kỳ không tính; nhóm theo Stage; biên đầu và cuối kỳ.
- T-MET-02 `pipeline_in_period` không nhận tham số Created Date (kiểm chữ ký hàm và schema tool).
- T-MET-03 `is_reseller_end_client`: `1` → true, `0` → false, `NULL` → `"unknown"`; không có nhánh suy đoán.
- T-MET-04 `services_purchased`: lấy từ `crm_client_services`; không đọc WorkOrder.
- T-MET-05 `rm_active_on_deal`: nhiều Opportunity có `last_modified_at` trùng tới từng giây bị coi là cập nhật hàng loạt, không tính; `has_next_step = 1` thì tính. Ngưỡng "hàng loạt" cần chốt (**Q-09**).
- T-MET-06 `compute_confidence`: công thức đúng theo D-07; dưới 0,8 bật cờ escalate; không có đầu vào nào từ đầu ra của LLM.
- T-MET-07 `cost_usd` tính từ token và bảng giá cấu hình.

### 10.4 `crm-read-mcp`

- T-MCP-01 `tools/list` trả đúng 3 tool với đúng tên.
- T-MCP-02 Kết nối DB của server là read-only: thử `INSERT` lỗi.
- T-MCP-03 `get_pipeline_by_close_date` khớp `pipeline_in_period` trên cùng snapshot; luôn trả `etl_run_id`.
- T-MCP-04 Chỉ đọc snapshot `succeeded` mới nhất; snapshot `failed` bị bỏ qua.
- T-MCP-05 `check_reseller_flag` trả `"unknown"` khi trường trống.
- T-MCP-06 `find_duplicate_leads` gom theo email hoặc SĐT; không trả mã băm; Lead không trùng trả rỗng.

### 10.5 Bộ đọc và parser tự báo

- T-TEAMS-01 Đọc Graph chỉ bằng GET (client Graph giả).
- T-PARSE-01 Mẫu chuẩn 7 nhãn tách đúng mục.
- T-PARSE-02 Biến thể: HTML, bullet, nhãn thường hoặc không dấu, thiếu nhãn, nhãn lặp, hai reply của cùng RM.
- T-PARSE-03 Không nhận khung thì cờ `unstructured`.
- T-PARSE-04 Tác giả map theo `teams_user_id`; tên trong tiêu đề không được dùng để map.
- T-PARSE-05 Tin sửa (`source_version` mới) tạo dòng mới, không đè.

### 10.6 Loại PII khỏi tự báo (mục 7.3)

- T-PII-01 R1 xoá email, SĐT (ít nhất 6 định dạng quốc tế), số giống hộ chiếu, ngày sinh có ngữ cảnh, URL có tham số.
- T-PII-02 Văn bản gửi tới LLM giả không chứa canary email, SĐT.
- T-PII-03 R3 chặn khi đầu ra LLM giả còn canary tên; `parsed = NULL`, `pii_check = blocked`.
- T-PII-04 R3 không chặn tên tài phán, sản phẩm, tên RM có trong danh sách cho phép.
- T-PII-05 (đầu cuối) Chạy cả `sa01-morning` với bộ tin tổng hợp chứa canary: dump DB và toàn bộ log thu được không chứa canary nào.
- T-PII-06 Ghi chú Amy nhập ở form sửa đi qua R1 và R3.
- T-PII-07 (repo) `test/fixtures/` và `evals/` không chứa email ngoài `example.invalid`, không có SĐT ngoài dải thử nghiệm.

### 10.7 Mi1-sa-01 (phần code bao quanh LLM)

- T-SA-01 Đầu ra sai schema: thử lại 1 lần rồi `parse_failed`.
- T-SA-02 Mã lý do ngoài danh mục bị từ chối; `OTHER` thiếu `evidence_quote` bị từ chối.
- T-SA-03 Số đếm trong payload bằng đúng số trong đầu ra đã kiểm schema; mọi phép tổng chỉ nằm trong `src/metrics/` (kiểm tĩnh: `src/agents/` và `src/queue/` không có `reduce` hay phép cộng trên số đếm).
- T-SA-04 Ghi `agent_runs` với token và chi phí; chạm trần chi phí thì dừng gọi LLM, vẫn sinh NBA.
- T-SA-05 Điều kiện bật: không có snapshot `succeeded` trong 24 giờ thì không sinh NBA, sinh mục hệ thống.

### 10.8 Luật NBA (mỗi luật ít nhất một ca dương, một ca âm)

- T-NBA-R1a Khách cũ chưa có Bank → hành động "RM chào Bank".
- T-NBA-R1b Ứng viên upsell Renew, ATA, Service cho khách cũ → chuyển thành "chuyển giao team", không bao giờ là "RM bán".
- T-NBA-R2a Reseller `true` → không có hành động upsell nào.
- T-NBA-R2b Reseller `"unknown"` → không upsell, có hành động "xác nhận cờ reseller".
- T-NBA-R3a Ngành cấm → điểm ưu tiên giảm.
- T-NBA-R3b (thuộc tính) Với mọi đầu vào sinh ngẫu nhiên, áp luật 3 không bao giờ làm điểm tăng.
- T-NBA-R4 Mọi mục NBA có `default_action = "giữ nháp"`; sau `confirm` trạng thái hiển thị "chờ RM xác nhận" tới khi có `rm_outcome`.
- T-NBA-R5 Opportunity ngoài kỳ theo Close Date không bao giờ thành ứng viên dù tạo trong kỳ.
- T-NBA-DUP Lead trùng với RM khác gắn cảnh báo.
- T-NBA-CAP Không quá giới hạn mục mỗi sáng (Q-10); thứ tự xác định với cùng đầu vào.

### 10.9 Hàng chờ và nhật ký

- T-Q-01 Trigger chặn `UPDATE`, `DELETE` trên `queue_items`, `queue_events`, `rm_reports`, `agent_runs`, `etl_runs`, `etl_run_status`.
- T-Q-02 Mỗi nút (xác nhận, sửa, bác, escalate, phản hồi RM, báo PII) ghi đúng một `queue_event` với `actor` từ phiên.
- T-Q-03 Mở trang ghi `queue_opened`.
- T-Q-04 `queue_item_state` trả trạng thái của quyết định mới nhất; mục chưa có sự kiện là `pending`.
- T-Q-05 Bác thiếu lý do bị từ chối; sửa lưu bản đầy đủ.
- T-Q-06 Không đăng nhập thì mọi route trừ health trả 401 hoặc chuyển sang đăng nhập; Mark không có nút duyệt.
- T-Q-07 Thiếu hoặc sai CSRF token bị từ chối.
- T-Q-08 Chuỗi chứa `<script>` trong payload được escape khi render.
- T-Q-09 Chạy `sa01-morning` hai lần cùng ngày không sinh mục trùng (`dedupe_key`).
- T-Q-10 Mục dưới 0,8 có nút Escalate; từ 0,8 không có.
- T-Q-11 `pii_flag` ẩn mục khỏi trang.

### 10.10 Thông báo Teams

- T-N-01 Payload chỉ chứa ngày và link; không chứa nội dung mục, số liệu, tên (so với mẫu cố định).
- T-N-02 Webhook lỗi: thử lại 3 lần, không làm lỗi lượt chạy.

### 10.11 Đường đi chính (một test đầu cuối)

- T-E2E-01 Với CRM giả, Graph giả, LLM giả: chạy `etl-crm` rồi `sa01-morning`, mở `GET /queue` với phiên Amy, thấy đủ 3 loại mục; bấm xác nhận một mục NBA, ghi phản hồi RM; kiểm `queue_events` có đúng 3 sự kiện (`queue_opened`, `confirm`, `rm_outcome`).

---

## 11. Cấu trúc thư mục và stack

### 11.1 Stack (D-01)

**Một ngôn ngữ: TypeScript chạy trên Bun 1.4.x.** Lý do: Bun 1.4.2 đã có trên máy người làm và đã được dùng cho gstack; Bun có sẵn SQLite (`bun:sqlite`), test runner (`bun test`), HTTP server (`Bun.serve`) và chạy được gói npm, nên không cần cài Node, Docker hay Python mới. MCP SDK và Anthropic SDK chính thức đều có bản TypeScript.

Phụ thuộc dự kiến (giữ tối thiểu, mỗi gói cần lý do):

| Gói | Dùng cho |
|---|---|
| `@modelcontextprotocol/sdk` | `crm-read-mcp` và client MCP trong sa-01 |
| `@anthropic-ai/sdk` | Gọi LLM cho Mi1-sa-01 |
| `zod` | Kiểm schema đầu ra LLM, đầu vào tool MCP, form |

Không ORM, không framework web, không thư viện cron (lịch do nền tảng host gọi `bun run jobs/...`, **D-03**). Model LLM cấu hình qua biến môi trường; spec mục 10 chỉ định dòng Sonnet cho CRON-05.

Phương án thay thế: Python 3.12 trở lên (máy hiện có 3.9.6, phải cài thêm). Không khuyến nghị vì thêm một runtime cần quản lý.

### 11.2 Cấu trúc thư mục đề xuất

```
growth-workspace/
├── package.json  bunfig.toml  tsconfig.json
├── src/
│   ├── config.ts                 # đọc biến môi trường, kiểm bắt buộc
│   ├── log.ts                    # logger chỉ nhận trường khai báo
│   ├── db/
│   │   ├── schema.sql            # mục 4, gồm trigger chỉ thêm
│   │   ├── migrate.ts
│   │   └── open.ts               # openReadWrite(), openReadOnly()
│   ├── metrics/                  # mỗi hàm một file, khớp metric-definitions.md
│   │   ├── pipeline-in-period.ts
│   │   ├── reseller-flag.ts
│   │   ├── services-purchased.ts
│   │   ├── rm-active-on-deal.ts
│   │   ├── confidence.ts
│   │   └── cost.ts
│   ├── crm/
│   │   ├── http.ts               # crmGet duy nhất, GET cứng
│   │   ├── mappers.ts            # allowlist trường, băm
│   │   └── etl.ts
│   ├── pii/
│   │   ├── hash.ts
│   │   ├── redact-regex.ts       # R1
│   │   └── name-guard.ts         # R3
│   ├── teams/
│   │   ├── graph-read.ts         # GET channel messages
│   │   ├── parse-report.ts       # tách khung 7 nhãn
│   │   └── notify.ts             # mẫu tin chỉ có link
│   ├── mcp/crm-read/
│   │   ├── server.ts
│   │   └── tools.ts
│   ├── agents/sa-01/
│   │   ├── run.ts                # runSa01(date): điểm vào cho cron và Mi1 sau này
│   │   ├── prompt.md             # có version
│   │   ├── output-schema.ts
│   │   └── nba/
│   │       ├── candidates.ts
│   │       ├── rules.ts          # NBA_R1..R5
│   │       └── rank.ts
│   ├── queue/
│   │   ├── server.ts             # Bun.serve
│   │   ├── auth.ts
│   │   ├── items.ts              # tạo mục, dedupe
│   │   └── views/                # hàm render HTML có escape
│   └── jobs/
│       ├── etl-crm.ts
│       └── sa01-morning.ts
├── test/
│   ├── static/                   # T-CRM-04, T-PII-07
│   ├── fixtures/synthetic/       # chỉ dữ liệu tổng hợp, có canary
│   └── ...                       # cùng cây với src/
├── evals/sa-01/                  # mục 12
├── scripts/
│   └── redact-row.ts             # xoá có kiểm soát (mục 7.5), chỉ chạy tay
└── docs/
```

`src/db/` chỉ được dùng qua các hàm truy vấn đặt tên rõ (không rải SQL khắp nơi), để nếu sau này chuyển sang Postgres (phương án B) chỉ phải sửa một tầng.

---

## 12. Cấu trúc bộ eval Mi1-sa-01 (`evals/sa-01/`)

Chi tiết định dạng ở `evals/sa-01/README.md`. Tóm tắt:

### 12.1 Cây thư mục

```
evals/sa-01/
├── README.md                 # định dạng ca, cách chấm, quy tắc ẩn danh
├── rules.md                  # danh mục mã luật được kiểm (NBA_R1..R5, PII_*, PARSE_*, RC_*)
├── cases/
│   ├── self_report_parse/    # cấu trúc hoá tự báo
│   ├── reason_code/          # đề xuất mã lý do
│   ├── nba/                  # 5 luật NBA
│   └── pii/                  # ca đối kháng cố tình nhét PII
└── results/                  # kết quả chạy, bị .gitignore chặn
```

### 12.2 Định dạng một ca

Mỗi ca là một file JSON: `cases/<task>/<case_id>.json`.

| Trường | Bắt buộc | Nghĩa |
|---|---|---|
| `case_id` | có | `sa01-<task>-<nnnn>` |
| `task` | có | `self_report_parse` \| `reason_code` \| `nba` \| `pii` |
| `rules_checked` | có | Mảng mã luật trong `rules.md` mà ca này kiểm |
| `gate` | có | `hard` (phải pass 100%, ví dụ mọi ca NBA và PII) hoặc `scored` (tính vào tỷ lệ pass) |
| `provenance` | có | `synthetic` hoặc `derived`; `derived` phải có `anonymized_by`, `reviewed_by`, `reviewed_at` |
| `catalog_version` | có | Phiên bản danh mục mã lý do (`v0.1`) |
| `input` | có | Đầu vào đã ẩn danh; hình dạng theo `task` |
| `expected` | có | Đáp án mong đợi; hình dạng theo `task` |
| `must_not_contain` | không | Chuỗi canary không được xuất hiện ở đầu ra |
| `notes` | không | Vì sao ca này tồn tại |

### 12.3 Cách chấm

- Chấm xác định bằng code, không dùng LLM chấm LLM.
- `self_report_parse`: so từng mục; số đếm phải khớp tuyệt đối; cờ phải khớp.
- `reason_code`: `primary` khớp một trong `expected.acceptable_primary`; `is_final` khớp.
- `nba`: chạy đúng hàm luật với `input.snapshot`; kiểm `must_include`, `must_exclude`, ràng buộc thứ tự, ràng buộc "không tăng ưu tiên".
- `pii`: đầu ra không chứa bất kỳ chuỗi nào trong `must_not_contain`.
- Kết quả: tỷ lệ pass theo `task` và `prompt_version`, ghi vào `results/` và vào bảng cấu hình để `compute_confidence` đọc.

### 12.4 Cổng eval

- Ca `hard` (NBA, PII) phải pass 100% thì mới được bật hoặc đổi prompt.
- Ca `scored`: ngưỡng bật do Mark chốt (**D-07**); đề xuất 0,8 khớp ngưỡng uỷ quyền.
- Mọi thay đổi prompt, danh mục mã hoặc luật phải chạy lại toàn bộ eval trước khi có hiệu lực (spec mục 6).

### 12.5 Ca thật và repo public

Repo public nên ca `derived` (dựng từ tự báo thật, kể cả đã ẩn danh) có rủi ro lộ ngữ cảnh khách. Khuyến nghị: trong repo chỉ có ca `synthetic`; khoảng 30 ca do Amy xác nhận (STATUS c) nằm ở kho nội bộ của tổ chức, bộ chạy eval đọc thêm thư mục đó qua biến môi trường `SA01_PRIVATE_EVAL_DIR` (**D-13**).

---

## 13. Sổ quyết định

Người duyệt trả lời ở PR bằng mã: "D-01 đồng ý", "D-02 chọn B", v.v. Cột "Đề xuất" là mặc định nếu không có phản hồi khác; chưa duyệt thì chưa build phần đó.

| Mã | Quyết định | Đề xuất | Lựa chọn khác | Người chốt | Trạng thái |
|---|---|---|---|---|---|
| D-01 | Stack | TypeScript trên Bun 1.4.x | Python 3.12+ (cài thêm) | Mark, người chịu trách nhiệm kỹ thuật | chờ |
| D-02 | Growth DB của lát này | SQLite (`bun:sqlite`) trên ổ bền; Neo4j để lát sau | Postgres có quản lý; ghi thẳng Neo4j AuraDB chung | Mark, người chịu trách nhiệm kỹ thuật | chờ |
| D-03 | Nơi chạy và lập lịch | 1 container trên nền tảng có cron và ổ bền; nền tảng gọi `bun run jobs/...` | Lịch trong tiến trình | Người chịu trách nhiệm kỹ thuật | chờ |
| D-04 | Đăng nhập Hàng chờ | Microsoft Entra ID (OIDC), dùng chung app đăng ký với quyền Graph | Lớp truy cập của nền tảng host; mật khẩu riêng | Admin tenant, Mark | chờ |
| D-05 | Thuật toán băm email, SĐT | HMAC-SHA256, khoá trong kho bí mật | SHA-256 trần như spec ghi | Mark (lệch spec, cần duyệt) | chờ |
| D-06 | Cờ reseller `"unknown"` | Không upsell; sinh hành động "nhờ RM xác nhận cờ" | Coi như `false` | Amy | chờ |
| D-07 | Công thức điểm tự tin và ngưỡng eval | Mục 5.6; ngưỡng ca `scored` 0,8 | Công thức khác | Mark (spec: chỉ Mark đổi ngưỡng, trọng số) | chờ |
| D-08 | Ai gọi Mi1-sa-01 trong lát này | Cron gọi thẳng `runSa01`; Mi1 gọi sau | Dựng Mi1 tối giản ngay | Mark | chờ |
| D-09 | Phạm vi kéo CRM và thời gian giữ snapshot | Mục 5.1; giữ 14 ngày | Khác | Mark, Amy | chờ |
| D-10 | Cách đo Cổng 2 | Mục 1.8 | Khác | Mark | chờ |
| D-11 | Kênh gửi thông báo Teams | Workflows hoặc Incoming Webhook tới chat của Amy | Bot qua Graph (cần quyền gửi) | Admin tenant | chờ |
| D-12 | Xoá có kiểm soát trên bảng chỉ thêm | Script tay, mục 7.5 | Không cho xoá | Mark, người chịu trách nhiệm kỹ thuật | chờ |
| D-13 | Ca eval từ dữ liệu thật | Để ngoài repo public | Đưa vào repo sau khi ẩn danh | Mark | chờ |

---

## 14. Giả định và câu hỏi mở

### 14.1 Giả định (đúng thì thiết kế giữ nguyên; sai thì phải sửa)

- A-01 MobCEC sẽ mở API REST chỉ đọc cho Opportunity, Lead, Order (STATUS a) có xác thực bằng token, có phân trang và có trường `LastModifiedDate`. **[ĐỐI CHIẾU SCHEMA]**
- A-02 CRM có khoá liên kết Opportunity → Client và OrderItem → Product2.Family như metric-definitions mô tả (tên kiểu Salesforce). **[ĐỐI CHIẾU SCHEMA]** CRM mới của MobCEC có thể đặt tên khác.
- A-03 Trường `is_reseller_end_client` và `rejection_reason_code` chưa có trên CRM (Data Contract A4); thiết kế chịu được trường vắng mặt.
- A-04 Owner của Opportunity trên CRM nối được với tài khoản Teams của RM qua một bảng ánh xạ do người vận hành điền.
- A-05 Mỗi ngày có một tin gốc (thread) trong channel và RM trả lời vào đó; tin gốc nhận diện được theo ngày.
- A-06 Amy làm việc thứ Hai tới thứ Bảy (khớp CRON-05); tự báo ngày thứ Bảy được duyệt sáng thứ Hai.
- A-07 Ngày nghiệp vụ tính theo giờ Việt Nam (UTC+7).
- A-08 Khoảng 8 RM, khoảng 8 bản tự báo mỗi ngày; chi phí LLM ước dưới 5 USD/tháng, dưới trần 100 USD.
- A-09 "Khách cũ" = Client có ít nhất một Order hoặc Opportunity Closed Won. **[ĐỐI CHIẾU SCHEMA]**
- A-10 Kỳ pipeline mặc định là tháng dương lịch hiện tại.
- A-11 Gửi văn bản tự báo (đã qua R1) sang Claude API là chấp nhận được về chính sách dữ liệu (xem Q-03).

### 14.2 Câu hỏi mở

| Mã | Câu hỏi | Hỏi ai |
|---|---|---|
| Q-01 | Tài liệu API CRM: endpoint, tên trường, kiểu ngày, giới hạn tần suất, phạm vi token. Token có thật sự chỉ đọc không, xác nhận bằng văn bản? | MobCEC |
| Q-02 | Quyền Graph cụ thể được cấp để đọc channel "Đồng bộ dữ liệu" (application hay delegated), và có dùng chung app đăng ký cho đăng nhập Hàng chờ được không? | Admin tenant |
| Q-03 | Có được gửi văn bản tự báo RM (còn tên khách sau R1) sang Claude API không? Nếu không, chỉ còn đường lọc tên bằng luật trước LLM, chất lượng thấp hơn. | Mark |
| Q-04 | Amy có chấp nhận tự chọn Opportunity cho mỗi mã lý do không? Hay RM nên ghi mã Opportunity trong tự báo (thêm một dòng vào mẫu)? | Amy, Mark |
| Q-05 | Không hiện tên khách trong Hàng chờ, chỉ mã và link CRM: Amy có làm việc được không? | Amy |
| Q-06 | Ai ghi `rejection_reason_code` lên CRM sau khi Amy xác nhận: RM hay Amy (trùng câu hỏi 3 của danh mục mã)? | Amy |
| Q-07 | Ai giữ bảng ánh xạ RM ↔ tài khoản Teams ↔ owner CRM, cập nhật khi có RM mới hoặc nghỉ? | Amy |
| Q-08 | RM có hay sửa hoặc nộp tự báo sau 08:00 không? Nếu có, cần lượt 13:00 sớm hơn dự kiến. | Amy |
| Q-09 | Thứ tự ưu tiên giữa các Stage; ngưỡng "cập nhật hàng loạt" của `rm_active_on_deal` (bao nhiêu bản ghi trùng tới từng giây). | Amy, Mark |
| Q-10 | Mỗi sáng tối đa bao nhiêu mục NBA thì Amy vẫn duyệt hết? Đề xuất 20. | Amy |
| Q-11 | Thông báo gửi vào chat riêng của Amy hay một channel? | Amy |
| Q-12 | Amy có cần mục "Lead trùng" riêng để quyết định gộp không, hay chỉ cần cảnh báo trên NBA? | Amy |
| Q-13 | Nền tảng host container (D-03) và việc mã hoá ổ đĩa, backup của file SQLite. | Người chịu trách nhiệm kỹ thuật |
| Q-14 | Danh sách ngành cấm (luật 3) lấy từ trường nào trên CRM? Có trường ngành không, hay chỉ dựa vào mã `RESTRICTED_INDUSTRY` đã xác nhận? | MobCEC, Amy |
| Q-15 | Danh mục mã lý do v0.1 còn là bản nháp (STATUS d). Lát này build với v0.1 và cho phép đổi danh mục qua cấu hình có version; Amy đồng ý không? | Amy, RM |
| Q-16 | Mark cần quyền gì trên Hàng chờ ngoài xem và nhận escalate? | Mark |

### 14.3 Chỗ phải đối chiếu schema thật (tổng hợp)

Mục 4.1 (toàn bộ bảng `crm_*`), 4.2 (`rm_id`), 5.1 (endpoint, phân trang, múi giờ), 5.3 (id team, channel, cách nhận diện thread ngày), 7.2 (định dạng SĐT trên CRM), A-01, A-02, A-09, Q-14.

---

## 15. Thứ tự build đề xuất

Mỗi bước: test trước, rồi code, rồi `/review`. Các bước 2, 3, 4 làm song song được (không chung file).

| Bước | Nội dung | Phụ thuộc | Kiểm bằng |
|---|---|---|---|
| 1 | Khung dự án Bun, `db/schema.sql` với trigger, `log.ts`, `config.ts` | D-01, D-02 | T-Q-01 |
| 2 | `metrics/*` | 1 | T-MET-* |
| 3 | `crm/*` với CRM giả, `pii/hash` | 1, D-05 | T-CRM-*, T-MAP-*, T-HASH-* |
| 4 | `teams/graph-read`, `teams/parse-report`, `pii/redact-regex`, `pii/name-guard` | 1 | T-TEAMS-*, T-PARSE-*, T-PII-01..04 |
| 5 | `mcp/crm-read` | 2, 3 | T-MCP-* |
| 6 | `agents/sa-01` (LLM giả), `nba/*`, bộ chạy eval với ca tổng hợp | 4, 5 | T-SA-*, T-NBA-*, T-PII-05 |
| 7 | `queue/*`, `teams/notify` | 6, D-04 | T-Q-*, T-N-*, T-E2E-01 |
| 8 | `/cso`, `/qa` cục bộ, `/ship` | 7 | báo cáo |
| 9 | Nối nguồn thật khi STATUS a, b được gỡ; đối chiếu mọi chỗ **[ĐỐI CHIẾU SCHEMA]**; chạy eval với ca thật của Amy; bật cho Amy | STATUS a, b, c | Cổng eval mục 12.4 |

Bước 1 tới 8 không cần dữ liệu thật. Bước 9 là điều kiện để bật (C5).

---

## 16. Báo cáo review

| Vòng | Skill áp dụng | Kết quả |
|---|---|---|
| 0 | `/office-hours` | Bài toán, 5 tiền đề, 3 phương án; khuyến nghị A (mục 1) |
| 1 | `/plan-ceo-review` | Chế độ SCOPE REDUCTION; giữ 7 thành phần ở dạng tối thiểu, cắt hoặc hoãn 12 hạng mục (mục 2.4) |
| 2 | `/plan-eng-review` | Khoá luồng dữ liệu, schema, ranh giới quyền, 5 lớp chứng minh chỉ đọc, 4 lớp loại PII, bản đồ lỗi, mô hình đe doạ, 70+ test (mục 3 tới 10) |

Chưa giải quyết: 13 quyết định (mục 13) và 16 câu hỏi (mục 14) chờ người duyệt. Không có code sản phẩm trong PR này.

Ngoài phạm vi lát này (nhắc lại): Command Center 3D, Creative Factory, ads, agent MKT, Mi1-ptn-01, hoa hồng, API Internal Control, Digest tuần, mọi mục Phụ lục B.
