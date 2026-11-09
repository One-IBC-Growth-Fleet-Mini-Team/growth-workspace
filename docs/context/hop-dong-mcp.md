# Hợp đồng MCP cho hệ thống bên ngoài

## Growth cung cấp: content-dist-mcp (D-47)

Chạy `bun run mcp:content-dist` (stdio, Growth DB chỉ đọc). Tool: `sync_45_juris_pricing`, `audit_media_kit_bundle`, `verify_sandbox8_release`, `check_ad_compliance` (`primary_text`, `headline`, `description`, `jurisdiction`, `target_country`), `check_channel_account_health`. Kết quả JSON trong nội dung text. Hệ thống SEO/AIO dùng `sync_45_juris_pricing` để lấy giá đã chốt và `check_ad_compliance` để kiểm nội dung trước khi đăng.

## Growth cung cấp: growth-mcp (D-48, D-51)

Chạy `bun run mcp:growth` (stdio). Tool: `search_knowledge`, `propose_hook_card`, `log_lesson`, `log_decision`, `execute_approved_cypher` (`template`, `params`). `execute_approved_cypher` chỉ chạy mẫu trong `src/mi1/approved-queries.ts`: `output_readiness`, `hook_board`, `lessons` (`query`), `fleet_operations` (`week` dạng yyyy-mm-dd), `channel_health`. Mẫu lạ trả `TEMPLATE_NOT_APPROVED`, tham số lạ trả `PARAMS_INVALID`. Kết quả có `question` (số câu hỏi đầu ra, spec mục 1) và `verified: true`.

## Growth cung cấp: partner-mcp (D-56)

Chạy `bun run mcp:partner` (stdio, Growth DB chỉ đọc, cần `PII_HASH_KEY` như bản cài). Không ghi gì.
- `track_referral` (`period_start`, `period_end` dạng yyyy-mm-dd, `partner_id` tuỳ chọn): số giới thiệu, số chốt, lợi nhuận ghi nhận theo đối tác; số khách reseller chưa gắn cờ; `commission: "pending_policy"`.
- `match_to_contact` (`email` hoặc `phone`): Growth băm ngay khi nhận rồi so với Lead trong snapshot CRM mới nhất; trả `{ lead_ids, matched }`. Không lưu, không ghi log email, SĐT.
- `calc_commission` chưa có, chờ chính sách hoa hồng.

## Growth gọi ra ngoài

Growth Workspace gọi các hệ thống khác qua MCP (Streamable HTTP), chỉ gọi tool đọc. Mỗi cổng chọn bằng biến môi trường `<PREFIX>_SOURCE=mcp`, `<PREFIX>_MCP_URL`, `<PREFIX>_MCP_TOKEN` (tuỳ chọn, gửi dạng `Authorization: Bearer`). Khi chưa có hệ thống, cổng chạy bằng adapter tải file với cùng dữ liệu.

Lỗi kết nối: server trả 401 hoặc 403 thì Growth báo `REMOTE_UNAUTHORIZED` (sai `<PREFIX>_MCP_TOKEN`); lỗi mạng hay lỗi khác báo `REMOTE_UNREACHABLE` (D-57).

Kết quả tool trả trong `structuredContent`, hoặc JSON trong nội dung text đầu tiên. Sai hợp đồng thì Growth Workspace không nạp gì và báo lỗi trên trang.

## get_hook_scores (cổng "Điểm Hook", `HOOK_*`, Mi1-mkt-02, D-43)

Hệ thống SEO/AIO (Astro, React, PostgreSQL) chấm Hook theo 5 tiêu chí; Growth Workspace chỉ áp trọng số 25/25/20/15/15 theo đúng thứ tự `criteria`.

Đầu vào: `{}` (để sau: `week_start`).

Đầu ra:

```json
{
  "criteria": [
    { "key": "intent", "label": "Tên tiêu chí 1 (trọng số 25)" },
    { "key": "k2", "label": "Tiêu chí 2 (25)" },
    { "key": "k3", "label": "Tiêu chí 3 (20)" },
    { "key": "k4", "label": "Tiêu chí 4 (15)" },
    { "key": "k5", "label": "Tiêu chí 5 (15)" }
  ],
  "hooks": [
    { "hook_id": "H-001", "text": "Câu Hook", "jurisdiction": "Hong Kong", "scores": { "intent": 80, "k2": 70, "k3": 60, "k4": 90, "k5": 50 } }
  ]
}
```

- `criteria` đúng 5 phần tử, thứ tự là thứ tự trọng số.
- Điểm thang 0 tới 100; thiếu điểm hoặc `null` thì Hook đó không được chấm.
- `jurisdiction` dùng tên như sheet giá FINAL; có thì Hook của tài phán chưa chốt giá bị giữ lại.
- Không gửi dữ liệu khách (tên, email, số điện thoại).

Adapter file tương đương: CSV cột `hook_id, text, jurisdiction, score_1 … score_5`.

## creative-factory-mcp (cổng "Creative Factory", `CREATIVE_*`, D-44)

Repo `creative-factory-v2` bọc pipeline thành tool MCP (spec mục 7). Growth Workspace gọi bốn tool sau; `validate_brand_qa` để lát sau (pipeline đã chạy QA).

`compile_creative_ir` đầu vào `{ hook_id, hook_text, jurisdiction, validation_mode: "STRICT", rejection_reasons }` (`rejection_reasons`: mảng mã lý do từ chối lặp lại, có thể rỗng; tầng 4, D-54; server chưa dùng thì bỏ qua), đầu ra:

`export_channel_bundle` (D-59) đầu vào `{ creative_ir_id }`, đầu ra `{ package_id, published: false, bundles: [{ bundle_id, channel, aspect_ratio, entries }] }`. Growth chỉ gọi khi Storyboard đang được duyệt và lần chạy gần nhất QA PASS; `published` khác `false` là sai hợp đồng, Growth không ghi gì. Chạy thử thật 09/11/2026: bản hiện tại trả `channel` bằng tỷ lệ khung (ví dụ `16:9`), chưa phải tên kênh.

`analyze_campaign` (D-64, bước 7, chỉ đọc; cần markng-byte/creative-factory-v2#20) đầu vào `{ creative_ir_id }`, đầu ra `{ report_id, assets: { total, generated, approved, rejected, pending }, quality: { assessed, passed, failed, pass_rate }, recommendations: [{ severity, category, message }] }`. Growth không lưu kết quả.

```json
{ "creative_ir_id": "IR-1", "storyboard": { "title": "Tên", "scenes": ["Cảnh 1", "Cảnh 2"] } }
```

`run_creative_pipeline` đầu vào `{ creative_ir_id, steps: ["translate", "generate", "qa"], validation_mode: "STRICT", approved_by }` (`approved_by`: người đã duyệt Storyboard trong Growth; thiếu thì creative-factory-v2 từ chối), đầu ra:

```json
{ "run_id": "R-1", "qa_status": "PASS", "assets": [{ "asset_id": "A-1", "kind": "image" }] }
```

Cổng Storyboard: Growth Workspace chỉ gọi `run_creative_pipeline` khi quyết định mới nhất về Storyboard là duyệt. Phía `creative-factory-v2` nên tự chặn thêm bước `generate` khi chưa có Storyboard được duyệt (việc thứ tư trong spec mục 7).

## get_campaign_stats của ads-mcp (cổng "Kết quả theo chiến dịch", `ADS_*`, tầng 5, D-45)

Đầu vào `{}`. Đầu ra:

```json
{ "campaigns": [ { "campaign": "C-HK", "platform": "meta", "period_start": "2026-09-01", "period_end": "2026-10-31",
  "spend_usd": 1000, "leads": 40, "closed_won": 4, "gross_margin_usd": 3000, "sales_cycle_complete": true } ] }
```

- `gross_margin_usd`: biên gộp theo Internal Control của các đơn nối được tới chiến dịch qua chuỗi ID, đã loại khách cuối của reseller.
- `sales_cycle_complete`: đã qua đủ một chu kỳ bán kể từ cuối kỳ. Chưa đủ thì Growth không đánh giá.
- `draft_budget_change` không gọi ra ngoài: nháp nằm trong Growth, Mark tự đổi ngân sách trên nền tảng sau khi duyệt.

Adapter file tương đương: CSV cùng tên cột, `sales_cycle_complete` là yes hoặc no.

## market-scan-mcp (cổng "Thị trường", `MARKET_*`, Mi1-mkt-03, mkt-04, D-46)

Ba tool, gọi trên cùng một kết nối, đầu vào `{}`:

- `scan_competitor_packages` → `{ "packages": [ { "competitor", "jurisdiction", "tier" (starter, grow, premium), "price_usd", "source_url", "collected_on" (YYYY-MM-DD) } ] }`. Vào cùng bảng giá đối thủ của `/competitors`.
- `watch_regulation` → `{ "items": [ { "jurisdiction", "title", "summary", "effective_date", "source_url" } ] }`.
- `collect_reviews_anonymized` → `{ "reviews": [ { "source", "jurisdiction", "theme", "rating" (1 tới 5), "text" } ] }`. Phải ẩn danh từ nguồn; Growth vẫn chạy lớp lọc R1 trước khi lưu và không lưu tên người viết.
