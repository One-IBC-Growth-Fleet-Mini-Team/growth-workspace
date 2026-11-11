**Growth Workspace Platform**

Spec yêu cầu v0.3.2

02/11/2026 · Mark Ng · Bản dọn lại từ v0.3.1, kèm yêu cầu Data Contract gửi MobCEC (Phụ lục A)

# 0. Thay đổi so với v0.3.1

Bản này không thêm tính năng. Mục tiêu là làm cho số liệu trong spec khớp với nhau, chốt các điểm còn mâu thuẫn và thu gọn phạm vi Giai đoạn 1 để làm được với nguồn lực hiện có.

| **Hạng mục**                          | **v0.3.1**                                          | **v0.3.2**                                                                                            |
|---------------------------------------|-----------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Nhãn phiên bản                        | Bìa ghi v0.3.1, thân bài và sơ đồ còn ghi v0.2      | Thống nhất v0.3.2                                                                                     |
| Số MCP server                         | Ghi 8, thực tế nêu 10                               | 8 MCP cho Giai đoạn 0 tới 2; owned-channel-mcp và cross-audit-mcp chuyển sang Giai đoạn 3 (Phụ lục B) |
| Fleet nghiệp vụ                       | Ghi 1 + 8, thực tế có thêm Sentinel-01              | 1 thuyền trưởng + 8 thuyền viên; Sentinel-01 chuyển sang Phụ lục B                                    |
| Cron                                  | Ghi 9, liệt kê 11                                   | 9 job chạy trong Giai đoạn 0 tới 2; CRON-10, CRON-11 thuộc Giai đoạn 3                                |
| Luật NBA                              | Mục 9 ghi 5 luật, mục 7 và CRON-05 ghi 4            | Thống nhất 5 luật                                                                                     |
| Chuỗi định danh                       | Mục 6.6 ghi 9 bước, mục 5 liệt kê 12 mã             | Thống nhất chuỗi 12 mã ID                                                                             |
| Ontology                              | 27 thực thể, mục 6.3 và 6.4 thêm 2 label            | 27 thực thể; 2 label mới chỉ thêm khi bật Giai đoạn 3                                                 |
| Nơi duyệt                             | Thẻ Claude Chat, Hàng chờ Workspace và Digest Teams | Hàng chờ trong Workspace là nơi duyệt duy nhất; Teams và Claude Chat chỉ thông báo kèm link           |
| Lệnh /steer, Sentinel-01, Monte-Carlo | Nằm trong lõi                                       | Chuyển sang Phụ lục B, kèm điều kiện bật                                                              |
| Bộ từ cấm                             | 13 từ, có "banking", "finance", "tax heaven"        | Chờ chốt (mục 7): 2 từ chặn sản phẩm Bank; thêm "tax haven"                                           |
| PII trong Growth DB                   | "Không lưu PII" nhưng cần kiểm trùng Lead           | Lưu mã băm email và số điện thoại; dữ liệu gốc chỉ nằm ở CRM                                          |
| Tài khoản và quyền                    | Đếm ngược hạn tài khoản cũ 08/11/2026               | Đã bàn giao xong; mọi tài khoản dùng mail quản lý chung, kể cả quyền BM                               |
| Xây dựng kỹ thuật                     | Cần 1 kỹ sư AI/Data toàn thời gian                  | Fleet kỹ thuật chạy bằng Claude Code (mục 13), có 1 người chịu trách nhiệm kỹ thuật                   |

# 1. Mục đích và người dùng

Growth Workspace là nơi bộ phận Growth của One IBC ra quyết định tăng trưởng và điều phối phân phối nội dung dựa trên dữ liệu khách hàng thật. Platform dựng độc lập, chỉ đọc từ các hệ thống ghi nhận hiện có, không thay CRM và không thay Jira.

| **Người dùng**                        | **Vai trò trong platform**                                                                                                                      |
|---------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Mark Ng                               | Trưởng Growth. Giám sát Mi1 và 6 thuyền viên phía MKT và Dữ liệu; duyệt việc có tiền, gửi ra ngoài, xuất bản công khai.                         |
| Team MKT, Team Content (Kylie, Nancy) | Chọn Hook card đầu tuần, theo dõi đóng gói SKD Userguide eKYC, nghiệm thu nội dung web OCC, cập nhật bảng giá 45 tài phán, duyệt lịch xuất bản. |
| Amy (Sales Admin)                     | Giám sát Mi1-sa-01 và Mi1-ptn-01; xác nhận bản nháp tự báo RM và lý do từ chối, quyết định theo đề xuất NBA, duyệt bảng đề xuất hoa hồng.       |
| Anh Jimmy, BOD                        | Không đăng nhập. Nhận Digest tuần qua Teams kèm điểm tự tin, duyệt ngân sách tổng.                                                              |

*Không phải người dùng: MobCEC, RM, đối tác. RM đóng góp qua channel Đồng bộ dữ liệu trên Teams; đối tác gửi lead qua Partner Portal trên web OCC mới.*

## Bảy câu hỏi đầu ra

| **Câu hỏi**                                                | **Độ khó** | **Điều kiện để trả lời đúng**                                                              |
|------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1\. Khách hiện tại là ai?                                  | Thấp       | Closed Won có cờ is_reseller_end_client; giá trị theo lợi nhuận ròng Internal Control.     |
| 2\. Khách tiềm năng là ai?                                 | Trung bình | Persona tổng hợp không chứa PII, kết hợp tín hiệu thị trường và quy định.                  |
| 3\. Đầu ra, bảng giá 45 tài phán và kênh đã sẵn sàng chưa? | Trung bình | Trạng thái chốt giá từng tài phán, đủ 10 file SKD, nghiệm thu sandbox8, verify Meta TW/IN. |
| 4\. Hook và kênh nào thực sự hoạt động?                    | Cao        | Chuỗi ID nối từ Hook tới Payment, đủ chu kỳ bán, có lý do từ chối từ RM.                   |
| 5\. Bài học sau mỗi chu kỳ?                                | Cao        | Mỗi bài học gắn bằng chứng truy vấn lại được.                                              |
| 6\. Điều chỉnh chiến lược và ngân sách?                    | Rất cao    | Bốn câu trên đã đáng tin; theo Khung quyết định Awareness/Traffic vs Conversion.           |
| 7\. Fleet đang vận hành ra sao?                            | Phụ thuộc  | Mỗi thuyền viên có nguồn thật, qua Eval Gate, chi phí dưới trần.                           |

# 2. Kiến trúc tổng thể

Sáu lớp theo repo Mi1 (ai-native-professional-services), một instance Neo4j AuraDB dùng chung với repo Mi1, vector index gắn trực tiếp vào nút đồ thị.

| **Lớp**          | **Thành phần**                                                                                                                               | **Trạng thái**                           |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| L6 Giao diện     | Mi1 Command Center, Hàng chờ quyết định, Workspace MKT (Hook, 45 tài phán, SKD, lịch kênh), Digest Teams                                     | Cần build; Teams có sẵn                  |
| L5 Đội agent     | Mi1 (EA + Orchestrator) và 8 thuyền viên (mục 6)                                                                                             | Cần build                                |
| L4 Skill và cổng | Cypher mẫu đã duyệt, Eval Gate, Win gate, chấm Hook 25/25/20/15/15, luật NBA, qa-engine của creative-factory-v2, cổng chính sách             | Cần build                                |
| L3 Kết nối       | 8 MCP server (mục 9)                                                                                                                         | Cần build 7; Atlassian/M365/Drive có sẵn |
| L2 Bộ nhớ        | Quyết định, bài học, skill và Creative IR, nhật ký phiên chạy và audit (chỉ thêm, không sửa)                                                 | Cần build                                |
| L1 Tri thức      | Đồ thị 27 thực thể, vector index, lớp định nghĩa chỉ số chuẩn                                                                                | Cần build                                |
| Nguồn            | crm.oneibc.com, web OCC (sandbox8), creative-factory-v2, bảng giá 45 tài phán, Jira MKT, Teams, Meta/GG Ads, GA4, Partner Portal, KB Bedrock | Có sẵn, chỉ đọc                          |

## Nguyên tắc ranh giới

- CRM là nguồn sự thật cho đơn và lợi nhuận; platform chỉ đọc qua crm-read-mcp và API GET Internal Control.

- Jira MKT vẫn là nơi giao và theo dõi task sản xuất; platform tạo task và lưu link, không giữ bản sao file nặng.

- **Hàng chờ trong Workspace là nơi duyệt duy nhất.** Teams, email và Claude Chat chỉ gửi thông báo kèm link về Hàng chờ. Một quyết định chỉ có một trạng thái, một hạn và một người duyệt.

- Agent không chạm thẳng vào cơ sở dữ liệu; mọi thao tác đi qua MCP có phân quyền.

- Nhật ký và audit ghi trong Growth DB, chỉ thêm không sửa. Google Sheets chỉ là bản hiển thị, không phải sổ gốc.

- Không đọc nhánh KYC của repo Mi1. Growth DB lưu mã băm email và số điện thoại để kiểm trùng; dữ liệu gốc chỉ nằm ở CRM.

- Mọi repo, API key, instance Neo4j và quyền kênh đứng tên tổ chức, dùng mail quản lý chung.

# 3. Ma trận vai trò

Đóng góp vào hệ thống phải là sản phẩm phụ của công việc sẵn có, không tạo thêm việc nhập liệu.

| **Vai trò**  | **Quyết định**                                                 | **Dữ liệu cần thấy**                                                                     | **Đóng góp**                              | **Màn hình**                      |
|--------------|----------------------------------------------------------------|------------------------------------------------------------------------------------------|-------------------------------------------|-----------------------------------|
| Mark Ng      | Chiến lược, ngân sách tuần, đề xuất vượt ngưỡng, mở chiến dịch | Phễu tới lợi nhuận ròng, nhật ký quyết định, bài học, tiến độ 45 tài phán, chi phí token | Duyệt hoặc từ chối có lý do, chốt bài học | Command Center, Hàng chờ, Digest  |
| Team MKT     | Hook đầu tuần, kênh, lịch đăng                                 | Hiệu quả theo hook, kênh, phân khúc; gói đối thủ; điểm QA                                | Chọn Hook, gắn Asset ID và link bài thật  | Sổ kịch bản, Lịch kênh            |
| Team Content | Nội dung web OCC, bộ SKD                                       | Checklist 10 file SKD, issue log sandbox8, kết quả QA                                    | Upload bản hoàn thiện, bấm xác nhận       | Tracker Đầu ra                    |
| Amy          | Ưu tiên deal, chuyển giao, duyệt đề xuất hoa hồng              | Pipeline theo Close Date và Stage, NBA, tự báo RM, Lead trùng                            | Xác nhận hoặc sửa bản nháp                | Hàng chờ Amy, Pipeline và Đối tác |
| Anh Jimmy    | Ngân sách tổng, định hướng                                     | Digest có điểm tự tin, độ phủ nối, lợi nhuận ròng                                        | Quyết định duyệt chi                      | Teams                             |
| RM           | Tư vấn khách                                                   | Bảng so sánh gói, SKD, NBA nháp                                                          | Tự báo hằng ngày, lý do từ chối           | Teams                             |

# 4. Ontology Growth (27 thực thể)

| **Nhóm**                        | **Thực thể**                                                                | **Mapping Enterprise Ontology**         |
|---------------------------------|-----------------------------------------------------------------------------|-----------------------------------------|
| Thị trường và kịch bản (6)      | Channel, Campaign, Hook, Asset, Competitor, Competitor_Package              | Riêng của Growth                        |
| Đầu ra và phân phối (4)         | Channel_Account, Package_Price_Sheet, Deliverable_Bundle, Compliance_Policy | Riêng của Growth                        |
| Hành trình web và hội thoại (2) | Web_Session, Conversation                                                   | Riêng của Growth                        |
| Hành trình CRM và doanh thu (6) | Contact, Lead, Opportunity, Quote, Order, Payment                           | Giữ định nghĩa chung                    |
| Khách hàng và phân khúc (4)     | Client, Service_Type, Jurisdiction, Segment                                 | Dùng chung nút với repo Mi1             |
| Đối tác và học tập (5)          | Partner, Referral, Experiment, Decision, Lesson                             | Kiểm lại với mục reseller của Crosswalk |

Hai quy tắc truy vấn bắt buộc:

- Mọi chỉ số (lợi nhuận ròng, CPL, tỷ lệ chuyển đổi, hoa hồng) đi qua hàm tính đã khóa công thức; agent không tự cộng số bằng LLM.

- Agent dùng bộ Cypher mẫu đã duyệt cho câu hỏi vận hành. Truy vấn tự viết chỉ dùng cho câu hỏi khám phá, gắn nhãn "Chưa xác minh" kèm tỷ lệ độ phủ nối (mốc 25/09/2026: 19% phiên WhatsApp nối được Contact).

# 5. Data contract và chuỗi định danh

Chuỗi 12 mã ID: channel_account_id → platform_campaign_id → hook_id → creative_ir_id → asset_id → session_id → conversation_id → contact_id / lead_id → opportunity_id → quote_id → order_id → payment_id.

Đây là chuỗi liên kết mềm: bước nào thiếu ID thì ghi trạng thái thiếu, không suy đoán danh tính khách. Toàn bộ yêu cầu gửi MobCEC (15 sự kiện, trường bắt buộc, tiêu chí nghiệm thu, API Internal Control) nằm ở **Phụ lục A** để gửi riêng được.

# 6. Fleet nghiệp vụ (1 thuyền trưởng + 8 thuyền viên)

*Fleet nghiệp vụ là đội agent chạy trong platform. Khác với fleet kỹ thuật ở mục 13, là đội dùng để xây platform.*

| **Agent**       | **Việc chính**                                                                | **Giám sát** | **Bật ở** |
|-----------------|-------------------------------------------------------------------------------|--------------|-----------|
| Mi1 (Mark i0.1) | Nhận câu hỏi, gọi thuyền viên, gom kết quả, dự báo việc và nguồn lực tuần tới | Mark         | GĐ 0      |
| Mi1-data-01     | Độ phủ ID, gãy tracking GA4/CRM, sức khỏe 3 số WA, kiểm trùng Lead            | Mark         | GĐ 0      |
| Mi1-sa-01       | Tự báo RM, lý do từ chối, khớp PO và SO, nhắc invoice, NBA                    | Amy          | GĐ 1      |
| Mi1-ptn-01      | Hiệu suất đối tác, cờ reseller, bảng đề xuất hoa hồng                         | Amy          | GĐ 1      |
| Mi1-mkt-05      | Bảng giá 45 tài phán, bộ SKD, nghiệm thu sandbox8, lịch kênh                  | Mark         | GĐ 1      |
| Mi1-mkt-01      | Overview Meta/GG, Win gate, nháp đổi ngân sách                                | Mark         | GĐ 2      |
| Mi1-mkt-02      | Chấm Hook 25/25/20/15/15, gọi creative-factory-v2 bước 1 tới 4                | Mark         | GĐ 2      |
| Mi1-mkt-03      | Quy định, tiếng khách, verify Meta TW/IN                                      | Mark         | GĐ 2      |
| Mi1-mkt-04      | Gói và giá đối thủ khớp 45 tài phán                                           | Mark         | GĐ 2      |

## Bốn quy tắc vận hành

1.  Thuyền viên chỉ đề xuất và soạn nháp. Việc có tiền, gửi ra ngoài, xuất bản công khai hoặc ghi vào hệ thống khác đều qua Mark hoặc Amy.

2.  Mỗi phiên chạy ghi và hiển thị: Mi1 gọi ai, mỗi agent trả gì, tốn bao nhiêu token, người giám sát đã xem chưa.

3.  Thuyền viên chưa có nguồn dữ liệu thật thì chưa bật; không sinh đề xuất từ dữ liệu mẫu.

4.  Mi1 chỉ đưa lên Mark đề xuất dưới ngưỡng hoặc có tiền, gửi ra ngoài.

## Ngưỡng ủy quyền, mặc định có hạn, tuổi hàng chờ

- **Điểm tự tin** tính từ tỷ lệ pass eval của skill, tỷ lệ pass QA, độ phủ nối dữ liệu và cỡ mẫu. Không lấy từ việc model tự chấm. Từ 0,8 trở lên: Amy và Team MKT tự quyết trong phạm vi nội bộ. Dưới 0,8: hiện kèm nút escalate lên Mark.

- **Luôn cần người duyệt**, bất kể điểm: tiền, ngân sách, gửi ra ngoài, xuất bản công khai.

- **Mặc định có hạn:** quá hạn thì Mi1 áp mặc định nếu việc không tốn tiền và không gửi ra ngoài; ngược lại giữ chờ và nhắc lại.

- **Tuổi hàng chờ:** đo từng quyết định, nêu các quyết định ngâm lâu trong Digest tuần.

- **Quyền chỉnh ngưỡng:** chỉ Mark được đổi ngưỡng 0,8 và trọng số chấm. Ngưỡng tiền và gửi ra ngoài không chỉnh được. Mọi thay đổi ngưỡng hoặc quy tắc phải chạy lại bộ eval trước khi có hiệu lực.

# 7. Creative Factory v2 và cổng tuân thủ

Mi1-mkt-02 gọi bước 1 tới 4 (compile, translate, generate, QA) ở chế độ ValidationMode.STRICT; Mi1-mkt-05 gọi bước 5 tới 6 (catalog, export); Mi1-mkt-01 gọi bước 7 (analyze). Chỉ gọi model tạo ảnh và video sau khi Storyboard đã được duyệt.

Bốn việc cần nối trên repo creative-factory-v2: plugin thương hiệu plugins/brands/one-ibc; thay InMemory\*Source bằng adapter đọc Neo4j và Google Sheets; bọc pipeline thành 4 tool MCP (compile_creative_ir, run_creative_pipeline, validate_brand_qa, export_channel_bundle); chặn gọi API tạo ảnh và video trước cổng Storyboard.

Quy chuẩn kiểm bằng code (\$0 token): Hook + câu 1 dưới 125 ký tự; Headline tối đa 40 ký tự; Description tối đa 30 ký tự; nền \#F0F0F2; đỏ \#8B0000 khoảng 10%.

## Bộ từ cấm: chờ chốt trước khi khóa vào code

| **Từ**                                                                                                            | **Vấn đề**                                                                                                  | **Đề xuất**                                                                                                                                |
|-------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| offshore, no tax, zero tax, tax free, tax evasion, incognito, money laundering, hide assets, break the law, cheat | Không có                                                                                                    | Giữ                                                                                                                                        |
| tax heaven                                                                                                        | Lỗi chính tả, từ thật là "tax haven"                                                                        | Thêm "tax haven"; giữ "tax heaven" nếu đã xuất hiện trong bài cũ                                                                           |
| banking, finance                                                                                                  | Bank là dịch vụ chủ lực, RM chỉ bán Bank cho khách cũ. Chặn tuyệt đối thì mọi Hook về mở tài khoản đều FAIL | Chờ Mark chốt: đối chiếu chính sách Meta về hạng mục quảng cáo tài chính; có thể chuyển sang danh sách "cần người duyệt" thay vì chặn cứng |

# 8. Điểm nhận biết và luồng chẩn đoán 5 tầng

Mục tiêu là tách lỗi Nội dung khỏi lỗi Phân phối và Kỹ thuật, tránh hai sai lầm: tắt nhầm kịch bản tốt vì đứt tracking, và dồn tiền vào quảng cáo có CPL rẻ nhưng RM từ chối.

| **Tầng**                  | **Điểm nhận biết**                                                      | **Hành động**                                                         | **Ai làm, ai duyệt**                      |
|---------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------------------------------------|
| 1A. Trước đăng, nội dung  | qaStatus = FAIL: dính từ cấm, câu 1 từ 125 ký tự, sai màu               | Biên dịch lại Creative IR ở chế độ STRICT                             | Mi1-mkt-02 tự sửa trước khi trình         |
| 1B. Trước đăng, phân phối | Tài phán chưa chốt giá; quốc gia chưa verify Meta                       | Hold lịch tài phán hoặc quốc gia đó, chuyển sang tài phán đã khóa giá | Cổng tự động; báo Mark trong Brief        |
| 2\. Thượng nguồn          | Impressions từ 3.000/tuần, CTR dưới trung vị hoặc Frequency \> 2,5      | Đổi pattern Hook hoặc Scene 1, giữ nguyên offer                       | Team MKT chọn biến thể sáng thứ Hai       |
| 3A. Giữa phễu, kỹ thuật   | Độ phủ nối Session → WA → Contact tụt dưới 19%                          | Gắn cờ TRACKING_DEGRADED, cấm tắt ad, mở ticket cho MobCEC            | Mi1-data-01; Mark và MobCEC               |
| 3B. Giữa phễu, trang đích | Tracking bình thường, CTR cao, ask_occ_started và contact_captured thấp | Khớp LP theo tài phán, nhúng SKD eKYC                                 | Team MKT và Team Content                  |
| 4\. Cuối phễu             | CPL rẻ nhưng Close Won thấp; rejection_reason_code lặp lại              | Thêm câu lọc vào câu 2 tới 3; bảng so sánh phí với đối thủ            | Mi1-sa-01 nháp, Amy xác nhận; Amy và Mark |
| 5\. Kênh và ngân sách     | Đủ chu kỳ bán, gross margin âm sau khi lọc reseller                     | Nháp draft_budget_change; áp 5 luật NBA khi giao RM                   | Mark và anh Jimmy, bắt buộc               |

**Khóa chéo giữa các tầng:** khi 3A bật cờ, hệ thống đóng băng việc đánh giá xấu các Hook ở tầng 2 và 5 cho tới khi tracking phục hồi. Lý do từ chối lặp lại ở tầng 4 được đẩy về bước 1 của creative-factory-v2.

# 9. Lớp kết nối MCP

Bốn chế độ quyền: READ_ONLY, WRITE_INTERNAL (ghi vào Growth DB), DRAFT_ONLY (chỉ tạo nháp chờ duyệt), GATE_REQUIRED (phải qua cổng kiểm tra xác định).

| **MCP**                  | **Tool chính**                                                                                                                                   | **Quyền**                  | **Giai đoạn** |
|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------|---------------|
| growth-mcp               | execute_approved_cypher, search_knowledge, propose_hook_card, log_decision, log_lesson                                                           | READ_ONLY, WRITE_INTERNAL  | 0             |
| crm-read-mcp             | get_pipeline_by_close_date, get_orders_payments, get_net_profit_ic, check_reseller_flag, find_duplicate_leads                                    | READ_ONLY                  | 1             |
| content-dist-mcp         | sync_45_juris_pricing, audit_media_kit_bundle, verify_sandbox8_release, check_ad_compliance, schedule_channel_post, check_channel_account_health | GATE_REQUIRED, DRAFT_ONLY  | 1             |
| partner-mcp              | track_referral, match_to_contact, calc_commission                                                                                                | DRAFT_ONLY                 | 1             |
| atlassian-m365-drive-mcp | create_jira_mkt_task, read_teams_rm_channel, send_teams_digest, sync_social_calendar_sheet                                                       | WRITE_INTERNAL, DRAFT_ONLY | 1             |
| ads-mcp                  | sync_meta_gg_report, get_campaign_stats, get_ga4_funnel, draft_budget_change                                                                     | READ_ONLY, DRAFT_ONLY      | 2             |
| creative-factory-mcp     | compile_creative_ir, run_creative_pipeline, validate_brand_qa, export_channel_bundle                                                             | GATE_REQUIRED              | 2             |
| market-scan-mcp          | scan_competitor_packages, watch_regulation, collect_reviews_anonymized                                                                           | READ_ONLY                  | 2             |

# 10. Lịch chạy tự động

Đồng bộ dữ liệu, khớp ID và kiểm file chạy bằng script (\$0 token). Chỉ phân tích, bóc tách lý do từ chối và viết đề xuất mới gọi LLM. Trần token Fleet 100 USD/tháng.

| **Mã**  | **Lịch**                         | **Thực thi**                       | **Việc**                                                      | **GĐ** |
|---------|----------------------------------|------------------------------------|---------------------------------------------------------------|--------|
| CRON-01 | Mỗi 15 phút                      | Script, Mi1-data-01                | Đồng bộ sự kiện web OCC, khớp chuỗi ID, cảnh báo gãy tracking | 1      |
| CRON-02 | 08:00, 14:00                     | Script + Haiku                     | Sức khỏe 3 BM, 3 số WA, quyền 6 Fanpage                       | 0      |
| CRON-03 | 06:30 hằng ngày                  | ETL, Mi1-mkt-01                    | Kéo Meta, GG Ads, GA4, CRM vào Neo4j và Overview Tracking     | 1      |
| CRON-04 | 07:30 thứ Hai tới thứ Bảy        | Script, Mi1-mkt-05                 | Tiến độ 45 tài phán, đủ 10 file SKD, issue log sandbox8       | 1      |
| CRON-05 | 08:00, 13:00 thứ Hai tới thứ Bảy | Sonnet, Mi1-sa-01                  | Tự báo RM, lý do từ chối, NBA vào Hàng chờ Amy                | 1      |
| CRON-06 | 08:15 thứ Hai tới thứ Bảy        | Sonnet, Mi1                        | Tuổi hàng chờ, áp mặc định, Brief sáng và dự báo tải          | 0      |
| CRON-07 | 02:00 thứ Hai                    | Sonnet Batch + creative-factory-v2 | Vòng lặp Harness tuần                                         | 2      |
| CRON-08 | 08:30 thứ Hai                    | Sonnet, Mi1                        | Digest tuần qua Teams                                         | 1      |
| CRON-09 | 07:00 ngày 1                     | Script + Sonnet Batch              | Báo cáo tháng, đề xuất hoa hồng, bài học chu kỳ               | 1      |

# 11. Sales Admin Agent và NBA

Mọi đầu ra của Mi1-sa-01 là bản nháp chờ Amy xác nhận trước khi ghi vào đồ thị: nhập tự báo RM, phân loại lý do từ chối theo mã chuẩn, khớp PO vào SO và nhắc invoice, xếp hạng NBA kèm lý do, kiểm trùng Lead (Amy quyết định gộp).

**Năm luật NBA**, kiểm cứng trong Eval Gate của Mi1-sa-01:

1.  Khách cũ: RM chỉ bán thêm Bank. Renew, ATA, Service chỉ đề xuất chuyển giao cho đúng team sở hữu.

2.  Khách của reseller (is_reseller_end_client = true): không đề xuất upsell trực tiếp.

3.  Ngành Forex, Markets, môi giới tài chính: chỉ dùng để hạ ưu tiên, không bao giờ để nâng.

4.  Danh sách giao RM luôn là bản nháp cần RM xác nhận (bài học: 36 trên 44 khách từng giao bị RM phản hồi đã xử lý hoặc không bán được).

5.  Pipeline luôn lọc theo Close Date trong kỳ và nhóm theo Stage, không lọc theo Created Date.

# 12. Đối tác và reseller

Đối tác không đăng nhập Workspace; Partner Portal trên web OCC mới là cổng duy nhất để đăng ký và gửi lead. Platform trả lời: đối tác nào ra lợi nhuận thật, khách cuối của reseller là ai, nên đầu tư thêm vào đối tác nào, hoa hồng kỳ này bao nhiêu. Chi trả thực tế đi theo luồng duyệt tiền hiện có của Amy và tài chính.

Cờ is_reseller_end_client gắn từ Giai đoạn 0, vì khách qua đại lý chủ yếu mua lẻ dịch vụ thành lập và đang kéo lệch cả persona lẫn NBA.

# 13. Cách xây: fleet kỹ thuật trên Claude Code

Platform được xây bởi một fleet kỹ thuật chạy trên Claude Code, tách biệt hoàn toàn với fleet nghiệp vụ ở mục 6. Fleet kỹ thuật dùng hai bộ quy tắc sẵn có:

| **Bộ**                             | **Dùng để**                                                                                                                                                        | **Áp vào đâu**                                       |
|------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| andrej-karpathy-skills (CLAUDE.md) | Bốn nguyên tắc viết code: nghĩ trước khi code và nêu giả định; đơn giản trước; sửa đúng chỗ cần sửa; định nghĩa tiêu chí thành công và lặp tới khi kiểm chứng được | Đặt CLAUDE.md ở gốc mọi repo của platform            |
| gstack (garrytan)                  | Các vai chuyên trách theo nhịp sprint: lên ý tưởng, duyệt kế hoạch, review, QA, bảo mật, ship, retro                                                               | Cài cho mọi phiên Claude Code của người làm kỹ thuật |

## Nhịp một hạng mục

1.  **/office-hours**: viết design doc ngắn cho một hạng mục (ví dụ crm-read-mcp), bám đúng spec này.

2.  **/plan-ceo-review** rồi **/plan-eng-review**: cắt phạm vi thừa, khóa luồng dữ liệu, ca biên và test.

3.  **Build** theo CLAUDE.md: test viết trước, mỗi thay đổi truy được về yêu cầu.

4.  **/review**, **/cso**: soát lỗi chỉ lộ khi chạy thật và soát bảo mật, đặc biệt quyền chỉ đọc CRM và việc không lộ PII.

5.  **/qa** trên sandbox8 cho phần chạm web OCC; **/ship** mở PR.

6.  **Người chịu trách nhiệm kỹ thuật duyệt và merge PR.** Fleet kỹ thuật không tự merge vào nhánh chính và không tự deploy.

7.  **/retro** hằng tuần, gửi kèm Digest cho Mark.

## Điều kiện để fleet kỹ thuật chạy an toàn

- Repo đặt trong GitHub organization của One IBC, không phải tài khoản cá nhân. Secret lưu ở kho bí mật của tổ chức.

- Có một người chịu trách nhiệm kỹ thuật, bán thời gian cũng được, để duyệt PR, giữ secret và trả lời khi agent dừng lại hỏi.

- Fleet kỹ thuật chỉ có quyền đọc CRM ở môi trường thật; quyền ghi chỉ cấp cho Growth DB.

- Mỗi MCP phải có bộ test chứng minh đúng chế độ quyền đã khai (mục 9) trước khi bật cho fleet nghiệp vụ.

# 14. Lộ trình và cổng kiểm soát

<table>
<colgroup>
<col style="width: 21%" />
<col style="width: 52%" />
<col style="width: 26%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Giai đoạn</strong></th>
<th><strong>Nội dung</strong></th>
<th><strong>Cổng để qua</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>0. Nền móng (đang làm)</td>
<td><p>Đã xong: bàn giao tài khoản và kênh sang mail quản lý chung.</p>
<p>Còn lại: gửi Data Contract (Phụ lục A), cờ reseller, dựng repo và Growth DB, growth-mcp, bật Mi1-data-01, CRON-02, CRON-06</p></td>
<td>Cổng 1: đo được độ phủ ID; có API Internal Control</td>
</tr>
<tr class="even">
<td>1. Biết khách và chuẩn đầu ra</td>
<td>crm-read-mcp, content-dist-mcp, partner-mcp; bật Mi1-sa-01, Mi1-ptn-01, Mi1-mkt-05; chốt 45 tài phán, nghiệm thu sandbox8, đủ 10 file SKD; Hàng chờ và Digest</td>
<td>Cổng 2: Amy dùng hằng tuần; cờ reseller và 45 tài phán đã khóa giá</td>
</tr>
<tr class="odd">
<td>2. Thử, đo và Creative Factory</td>
<td>ads-mcp, creative-factory-mcp, market-scan-mcp; bật mkt-01 tới mkt-04; verify Meta TW/IN; vận hành ma trận 5 tầng</td>
<td>Cổng 3: một chu kỳ bán thật nối suốt tới Payment</td>
</tr>
<tr class="even">
<td>3. Học và điều chỉnh</td>
<td>Thư viện bài học có bằng chứng, đề xuất chiến lược và ngân sách, Command Center đầy đủ; các mục ở Phụ lục B nếu đủ điều kiện</td>
<td>Chỉ bật từng mục Phụ lục B khi đạt điều kiện riêng</td>
</tr>
</tbody>
</table>

# 15. Rủi ro và câu hỏi mở

| **Rủi ro**                            | **Hậu quả**                                    | **Hướng xử lý**                                                                                                     |
|---------------------------------------|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| Mark là điểm nghẽn duy nhất           | Đề xuất dồn ứ                                  | Chỉ đưa lên phần vượt ngưỡng; mặc định có hạn; dự báo tải trước 1 tuần                                              |
| MobCEC chậm Data Contract hoặc API IC | Không đo được tới lợi nhuận ròng               | Gửi Phụ lục A ngay; trong lúc chờ, dùng Opportunity đã xác nhận (loại reseller) làm tín hiệu tạm, gắn nhãn cảnh báo |
| Chậm 25/45 tài phán hoặc verify TW/IN | Không bung chiến dịch giá gói, nguy cơ khóa BM | Chạy trước 20 tài phán đã chốt; tự động hold phần chưa đủ điều kiện                                                 |
| Cỡ mẫu nhỏ                            | Đề xuất trông chắc nhưng là nhiễu              | Ngưỡng mẫu tối thiểu trước Win gate; luôn hiển thị điểm tự tin                                                      |
| Attribution đứt (19%)                 | Đánh giá sai kênh                              | Data Contract trước launch; cấm tắt ad khi cờ TRACKING_DEGRADED bật                                                 |
| Fleet kỹ thuật làm vượt phạm vi       | Code phình, khó bảo trì                        | CLAUDE.md, /plan-ceo-review cắt phạm vi, người chịu trách nhiệm duyệt PR                                            |
| Token cạn giữa chu kỳ                 | Fleet dừng giữa tuần                           | Tách lớp script khỏi lớp LLM; Batch API cho vòng lặp tuần                                                           |

**Câu hỏi mở:**

- MobCEC xác nhận đưa đủ Phụ lục A vào web OCC mới trước khi launch không, và ngày mở API GET Internal Control?

- Khi nào hoàn tất 25/45 tài phán còn lại?

- Ngân sách quảng cáo trả phí thực tế hiện nay; mức 50.000 USD/tháng trong playbook cũ còn hiệu lực không?

- Người duyệt cuối cho đề xuất đổi ngân sách tuần: anh Jimmy hay cần trình chị Mary Kim?

- Ai là người chịu trách nhiệm kỹ thuật duyệt PR cho fleet kỹ thuật?

- Chốt xử lý "banking" và "finance" trong bộ từ cấm.

# 16. Nguồn lực

Giữ ước tính của v0.3.1 cho phần lõi: token Fleet nghiệp vụ khoảng 31 USD/tháng (trần 100), Neo4j AuraDB 66 tới 131 USD/tháng, container 20 tới 50 USD/tháng, Claude API và ghế Claude 130 tới 200 USD/tháng. Tổng khoảng 215 tới 380 USD/tháng.

Thay đổi ở v0.3.2: thay "1 kỹ sư toàn thời gian 6 tới 8 tuần" bằng fleet kỹ thuật trên Claude Code cộng một người chịu trách nhiệm kỹ thuật bán thời gian. Chi phí token của fleet kỹ thuật và của các mục Phụ lục B chưa ước tính; sẽ đo trong 2 tuần đầu Giai đoạn 0 rồi cập nhật.

# Phụ lục A. Yêu cầu Data Contract gửi MobCEC

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

Đầu mối phía One IBC: Mark Ng (liên hệ qua kênh nội bộ; repo public nên không ghi email).

# Phụ lục B. Hạng mục để sau (Giai đoạn 3)

Các mục dưới đây có giá trị nhưng chưa nên làm khi chưa có dữ liệu thật. Giữ thiết kế từ v0.3.1, kèm điều kiện bật và phần cần sửa.

| **Hạng mục**                       | **Điều kiện bật**                                | **Cần sửa so với v0.3.1**                                                                                                                                 |
|------------------------------------|--------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Lệnh /steer và User_Activities_Log | Hàng chờ Workspace đã chạy ổn 4 tuần             | Nhận lệnh trong Workspace, không qua Claude Chat; chỉ Mark được chỉnh ngưỡng; chỉ thị mới chạy qua eval trước khi nạp vào prompt; log ghi trong Growth DB |
| Sentinel-01 (kiểm toán độc lập)    | Có ít nhất 50 quyết định thật trong Hàng chờ     | Phần độc lập chính là script tính lại số từ nguồn; LLM chỉ đọc lý do. Bỏ câu "bắt 100% lỗi"; ghi rõ tỷ lệ mẫu; tính chi phí token                         |
| Monte-Carlo ngân sách              | Qua Cổng 3; mỗi bước phễu có đủ cỡ mẫu tối thiểu | Ghi rõ giả định ban đầu (α0, β0); hiển thị khi phân phối còn phụ thuộc chủ yếu vào giả định; bỏ các câu về độ trễ                                         |
| owned-channel-mcp (CRON-10)        | Đã được duyệt quyền API của từng nền tảng        | TikTok, Instagram, GBP cần app review, thường mất vài tuần; làm từng kênh, bắt đầu từ Facebook                                                            |
| cross-audit-mcp (CRON-11)          | Đi cùng Sentinel-01                              | Như trên                                                                                                                                                  |
