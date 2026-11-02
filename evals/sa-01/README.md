# Bộ eval Mi1-sa-01

Trạng thái: **khung, chưa có ca.** Thiết kế đầy đủ ở `docs/design/slice-01-amy-queue.md` mục 12. 30 ca thật chờ Amy xác nhận (docs/STATUS.md, mục bị chặn c).

## Cây thư mục

```
evals/sa-01/
├── README.md                 # file này
├── rules.md                  # (sẽ thêm) danh mục mã luật được kiểm
├── cases/
│   ├── self_report_parse/    # cấu trúc hoá tự báo RM
│   ├── reason_code/          # đề xuất rejection_reason_code
│   ├── nba/                  # 5 luật NBA (spec mục 11)
│   └── pii/                  # ca đối kháng cố tình nhét PII
└── results/                  # kết quả chạy, không commit
```

## Quy tắc bắt buộc

1. Repo này **public**. Trong repo chỉ có ca `provenance: "synthetic"`. Ca dựng từ tự báo thật (`derived`) nằm ở kho nội bộ của tổ chức, bộ chạy đọc qua biến môi trường `SA01_PRIVATE_EVAL_DIR` (chờ duyệt D-13).
2. Không tên, email, SĐT, số hộ chiếu, ngày sinh của người thật. Tên khách tổng hợp dùng canary `CANARY_NAME_<4 ký tự hex>`; email `canary+<n>@example.invalid`; SĐT dùng dải dành cho thử nghiệm. Test `T-PII-07` quét thư mục này.
3. Tên RM trong ca dùng `RM_A`, `RM_B`, ...
4. Chấm bằng code, không dùng LLM chấm LLM.

## Mã luật

| Mã | Kiểm gì |
|---|---|
| `NBA_R1` | Khách cũ: RM chỉ bán thêm Bank; Renew, ATA, Service chỉ đề xuất chuyển giao |
| `NBA_R2` | Khách reseller (hoặc cờ chưa rõ): không upsell trực tiếp |
| `NBA_R3` | Ngành Forex, Markets, môi giới tài chính: chỉ hạ, không bao giờ nâng ưu tiên |
| `NBA_R4` | Danh sách giao RM luôn là nháp chờ RM xác nhận |
| `NBA_R5` | Pipeline lọc theo Close Date trong kỳ, nhóm theo Stage; không theo Created Date |
| `PARSE_SECTIONS` | Tách đúng 7 nhãn của mẫu tự báo |
| `PARSE_COUNTS` | Chép đúng số RM ghi, không tự cộng, không bịa khi RM không ghi |
| `PARSE_FLAGS` | Gắn đúng cờ `unstructured`, `truncated` |
| `RC_CATALOG` | Mã nằm trong danh mục đúng phiên bản; `OTHER` có trích dẫn |
| `RC_PRIMARY` | Mã chính đúng |
| `RC_IS_FINAL` | `is_final` đúng (nhóm STALL là `false`) |
| `PII_NO_LEAK` | Đầu ra không chứa chuỗi nào trong `must_not_contain` |

## Định dạng một ca

Một file JSON mỗi ca: `cases/<task>/<case_id>.json`.

| Trường | Bắt buộc | Nghĩa |
|---|---|---|
| `case_id` | có | `sa01-<task>-<nnnn>` |
| `task` | có | `self_report_parse`, `reason_code`, `nba`, `pii` |
| `rules_checked` | có | Mảng mã luật ở bảng trên |
| `gate` | có | `hard`: phải pass 100% (mọi ca `nba`, `pii`). `scored`: tính vào tỷ lệ pass |
| `provenance` | có | `synthetic` hoặc `derived` (`derived` thêm `anonymized_by`, `reviewed_by`, `reviewed_at`) |
| `catalog_version` | có | Phiên bản danh mục mã lý do, ví dụ `v0.1` |
| `input` | có | Đầu vào đã ẩn danh, hình dạng theo `task` |
| `expected` | có | Đáp án mong đợi, hình dạng theo `task` |
| `must_not_contain` | không | Canary không được xuất hiện ở đầu ra |
| `notes` | không | Vì sao ca này tồn tại |

### Hình dạng `input` và `expected` theo task

**`self_report_parse`**
- `input.message_html`: tin tự báo tổng hợp (có thể lệch mẫu).
- `input.author_rm_id`, `input.report_date`.
- `expected.sections`: giá trị mong đợi cho từng mục (chỉ so các mục được liệt kê).
- `expected.flags`: mảng cờ.

**`reason_code`**
- `input.customer_said`: câu khách nói (đã ẩn danh), `input.context`: ghi chú ngắn của RM (đã ẩn danh).
- `expected.acceptable_primary`: mảng mã chấp nhận được (thường 1 mã).
- `expected.is_final`: true hoặc false.

**`nba`**
- `input.period`: `{start, end}`.
- `input.snapshot`: Opportunity, Client, dịch vụ đã mua, Lead (chỉ mã băm giả) theo schema Growth DB, dữ liệu tổng hợp.
- `expected.must_include`: `[{subject_ref, action}]`.
- `expected.must_exclude`: `[{subject_ref, action}]`.
- `expected.order`: ràng buộc thứ tự `[[a, b]]` nghĩa là a đứng trước b.
- `expected.never_raised_by`: mã luật không được làm tăng ưu tiên (thường `NBA_R3`).

**`pii`**
- `input.message_html`: tin tổng hợp chứa canary.
- `expected.pii_check`: `passed` hoặc `blocked`.
- `must_not_contain`: mọi canary đã nhét.

### Ví dụ (tổng hợp, chỉ để minh hoạ định dạng)

```json
{
  "case_id": "sa01-nba-0001",
  "task": "nba",
  "rules_checked": ["NBA_R2", "NBA_R1"],
  "gate": "hard",
  "provenance": "synthetic",
  "catalog_version": "v0.1",
  "input": {
    "period": { "start": "2026-11-01", "end": "2026-11-30" },
    "snapshot": {
      "clients": [
        { "client_id": "C_001", "is_reseller_end_client": 1, "first_won_at": "2026-03-10" },
        { "client_id": "C_002", "is_reseller_end_client": 0, "first_won_at": "2026-05-02" }
      ],
      "client_services": [
        { "client_id": "C_001", "product_family": "IBC01" },
        { "client_id": "C_002", "product_family": "IBC01" }
      ],
      "opportunities": [],
      "leads": []
    }
  },
  "expected": {
    "must_include": [{ "subject_ref": "C_002", "action": "rm_offer_bank" }],
    "must_exclude": [{ "subject_ref": "C_001", "action": "rm_offer_bank" }],
    "order": [],
    "never_raised_by": ["NBA_R3"]
  },
  "notes": "Khách cũ của reseller không được chào Bank; khách cũ trực tiếp chưa có Bank thì được."
}
```

## Cách chấm và cổng

- Kết quả: tỷ lệ pass theo `task` và `prompt_version`, ghi vào `results/` (không commit).
- Ca `hard` phải pass 100% thì mới được bật hoặc đổi prompt, danh mục mã, luật.
- Ca `scored`: ngưỡng do Mark chốt (đề xuất 0,8, D-07). Tỷ lệ pass là một đầu vào của hàm điểm tự tin, không phải điểm model tự chấm.
