# Mã luật được kiểm trong bộ eval Mi1-sa-01

Mỗi ca ghi các mã dưới đây trong `rules_checked`. Định nghĩa đầy đủ ở `evals/sa-01/README.md` và design doc mục 5.5, 12.

| Mã | Tác vụ | Cổng |
|---|---|---|
| `NBA_R1` tới `NBA_R5` | nba | hard |
| `PII_NO_LEAK` | pii | hard |
| `PARSE_SECTIONS`, `PARSE_COUNTS`, `PARSE_FLAGS` | self_report_parse | scored |
| `RC_CATALOG`, `RC_PRIMARY`, `RC_IS_FINAL` | reason_code | scored |

Chạy: `bun run eval:sa01` (gọi Claude API thật, tốn token; người vận hành chạy tay). Kết quả ở `evals/sa-01/results/` (không commit). Hiện chỉ có 10 ca synthetic; cần khoảng 30 ca do Amy xác nhận (STATUS mục c) thì hệ số cỡ mẫu của điểm tự tin mới đạt 1.
