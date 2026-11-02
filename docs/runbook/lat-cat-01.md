# Runbook lát cắt 01: Hàng chờ buổi sáng của Amy

Dành cho người vận hành và người chịu trách nhiệm kỹ thuật. Thiết kế: `docs/design/slice-01-amy-queue.md`. Dựng máy: `deploy/README.md` (không Docker, D-23). Lệnh `bun run <file>` dưới đây chạy trên máy chủ bằng `sudo growth-run <file>`.

## 1. Thành phần và lịch

Một máy Ubuntu, dữ liệu trên ổ bền `/srv/growth/data`. systemd của máy lo lịch (D-03, D-23), không có thư viện cron trong tiến trình. Giờ dưới đây là giờ Việt Nam. Dựng máy và cài lịch: `deploy/README.md` (lệnh `setup.sh`, chạy được trên Azure, Oracle hay máy Ubuntu 24.04 khác).

| Việc | Lệnh | Lịch |
|---|---|---|
| Web Hàng chờ | dịch vụ `growth-queue` (`bun run src/queue/server.ts`) | Luôn chạy |
| Backup Growth DB, giữ 14 bản | `bun run src/jobs/backup-db.ts` | 06:15 hằng ngày |
| Đẩy backup ra kho ngoài máy (rclone, đã mã hoá) | timer `growth-offsite-backup` của máy chủ | 06:20 hằng ngày |
| ETL CRM, chỉ đọc | `bun run src/jobs/etl-crm.ts` | 06:30 hằng ngày |
| Dọn snapshot cũ hơn 14 ngày (D-09) | `bun run src/jobs/prune-snapshots.ts` | 06:45 hằng ngày |
| Mi1-sa-01 | `bun run src/jobs/sa01-morning.ts` | 08:00 thứ Hai tới thứ Bảy |
| Eval Mi1-sa-01 (gọi Claude API thật, tốn token) | `bun run eval:sa01` | Chạy tay khi đổi prompt, danh mục mã, luật, hoặc thêm ca |
| Kiểm trước khi bật | `bun run preflight` và `bun run preflight -- --network` | Chạy tay trước khi bật, sau mỗi lần đổi cấu hình |

Biến môi trường: xem `.env.example`. Đường dẫn dữ liệu, kết quả eval và backup trên ổ bền đặt sẵn trong `deploy/paths.env`. Secret chỉ đặt trong kho bí mật của nền tảng, không bao giờ trong repo.

## 2. Checklist bật cho Amy (bước 9)

Làm theo thứ tự; mục nào chưa xong thì chưa bật (spec mục 6, quy tắc vận hành 3; design doc C5).

1. **Gỡ chặn nguồn** (STATUS a, b): MobCEC cấp token CRM chỉ đọc kèm văn bản xác nhận (lưu ở kho tài liệu nội bộ, không lưu trong repo); admin tenant cấp quyền Graph đọc channel (Q-02).
2. **Đối chiếu schema** với tài liệu API thật. Mỗi chỗ dưới đây là tên tạm, sửa qua PR:

   | Chỗ | File | Cần đối chiếu |
   |---|---|---|
   | Host, đường dẫn resource, xác thực | `src/crm/http.ts` | Q-01 |
   | Lọc phạm vi kéo và phân trang | `src/crm/etl.ts` (`SYNTHETIC_PAGINATION`) | Q-01, D-09 |
   | Tên trường nguồn, múi giờ, kiểu cờ reseller | `src/crm/mappers.ts` | Q-01, A-02, A-03 |
   | Định dạng SĐT, mã quốc gia mặc định | `PII_PHONE_DEFAULT_COUNTRY_CODE` | design doc mục 7.2 |
   | Tên Stage đã đóng, trọng số Stage | `src/config.ts` (`NBA_PARAMS`) | Q-09 |
   | Mã ngành bị hạ ưu tiên | `src/config.ts` (`NBA_PARAMS.restrictedIndustryCodes`) | Q-14 |
   | "Khách cũ" lấy từ Order hay Opportunity | `src/crm/mappers.ts` (`First_Won_Date__c`) | A-09 |
   | Liên kết Lead với Client (để bật `NBA_X_DUP`) | `src/mcp/crm-read/tools.ts`, `src/agents/sa-01/nba/rules.ts` | chưa có trong schema |
   | Id team, channel, cách nhận diện thread ngày | `GRAPH_TEAM_ID`, `GRAPH_CHANNEL_ID`, `src/teams/graph-read.ts` | design doc mục 5.3, A-05 |
   | Thân tin webhook Teams | `src/teams/notify.ts` | Q-11 |

   Dò nhanh: `bun run preflight -- --network` GET trang đầu của từng resource và báo đúng tên trường lệch (ví dụ `CRM_MAP_INVALID:Opportunity.StageName`), không in giá trị bản ghi.
3. **Danh bạ RM** (Q-07): người vận hành giữ file JSON ngoài repo, nạp bằng `bun run ops:load-rm-directory <file>`. RM vắng trong file được đánh dấu nghỉ.
4. **Eval**: Amy xác nhận khoảng 30 ca dựng từ tự báo thật; ca đặt ở kho nội bộ, trỏ `SA01_PRIVATE_EVAL_DIR` tới đó (D-13). Chạy `bun run eval:sa01`. Ca NBA và PII phải pass 100% (D-07); ca scored từ 0,8.
5. **Preflight xanh**: `bun run preflight -- --network` thoát mã 0.
6. **Chạy thử một tuần chỉ Mark xem**: để trống `TEAMS_WEBHOOK_URL_AMY`, Mark mở Hàng chờ mỗi sáng, báo mục sai hoặc còn PII.
7. **Bật cho Amy**: đặt `TEAMS_WEBHOOK_URL_AMY`. Từ đây đo Cổng 2 theo D-10 bằng `queue_events`.

## 3. Sự cố thường gặp

| Dấu hiệu | Kiểm | Làm |
|---|---|---|
| Hàng chờ dải đỏ "Thiếu nguồn dữ liệu" | log `etl.failed` (mã lỗi), `sa01.teams_failed` | `CRM_AUTH` hoặc `GRAPH_AUTH`: báo MobCEC hoặc admin tenant, không thử lại tự động. `CRM_MAP_INVALID`: schema CRM đổi, chạy preflight `--network` để biết trường nào |
| Không có mục NBA, có mục "NBA tạm tắt" | `latest.json` trong thư mục kết quả eval | Chạy lại `bun run eval:sa01`; kết quả cũ hơn prompt hiện tại bị coi là 0 |
| Mục "Tạm dừng đọc tự báo do chạm trần chi phí" | tổng `agent_runs.cost_usd` tháng này | Trần 100 USD/tháng (spec mục 10); chỉ Mark đổi |
| Amy báo PII (`pii_flag`) | `queue_events` có `pii_flag` | Xem mục 4 |
| Thông báo Teams không tới | log `notify.failed`, `notify.rejected` | Kiểm URL webhook; host phải là webhook.office.com, logic.azure.com hoặc api.powerplatform.com |

## 4. Xoá có kiểm soát (D-12)

Chỉ người vận hành chạy tay, không có đường nào từ web hay agent:

```bash
bun run ops:redact-row --table queue_items --id <mã mục> --reason PII_FLAG --operator <mã người vận hành>
```

Bảng cho phép: `queue_items` (payload), `queue_events` (payload), `rm_reports` (parsed). Xoá một mục `queue_items` thì xoá luôn các bản sửa của mục đó và `rm_reports` nguồn (với mục tự báo và mã lý do), vì cùng nội dung nằm ở cả ba chỗ. Lệnh thay nội dung bằng `{"redacted":true}` trong một transaction, dựng lại trigger chỉ thêm, ghi `redaction_log` (không ghi nội dung đã xoá). Sau đó kiểm backup của nền tảng: bản backup cũ vẫn còn nội dung, xử lý theo chính sách lưu giữ của nền tảng (Q-13).

## 5. Tắt khẩn cấp

Tắt lịch `sa01-morning` trên nền tảng host là đủ: không còn mục mới, không còn gọi LLM. Web Hàng chờ vẫn mở được để xem lịch sử. Hệ thống không ghi gì vào CRM, nên không có gì phải hoàn tác bên CRM.
