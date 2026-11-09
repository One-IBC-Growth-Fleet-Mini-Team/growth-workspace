# Hợp đồng MCP cho hệ thống bên ngoài

Growth Workspace gọi các hệ thống khác qua MCP (Streamable HTTP), chỉ gọi tool đọc. Mỗi cổng chọn bằng biến môi trường `<PREFIX>_SOURCE=mcp`, `<PREFIX>_MCP_URL`, `<PREFIX>_MCP_TOKEN` (tuỳ chọn, gửi dạng `Authorization: Bearer`). Khi chưa có hệ thống, cổng chạy bằng adapter tải file với cùng dữ liệu.

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
