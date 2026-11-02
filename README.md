# Growth Workspace

Repo xây Growth Workspace của One IBC: nơi Mi1 và các thuyền viên (agent nghiệp vụ) đọc dữ liệu chỉ đọc từ CRM và Teams, đề xuất việc, và người duyệt xác nhận trong một Hàng chờ duy nhất. Phạm vi đầy đủ nằm trong `docs/spec/growth-workspace-spec-v0.3.2.md`.

## Đọc gì trước

1. `CLAUDE.md`: quy tắc cứng (CRM chỉ đọc, không PII, không tự merge) và nhịp làm việc.
2. `docs/STATUS.md`: đang ở đâu, việc tiếp theo, cái gì đang bị chặn.
3. `docs/context/decisions.md`: các quyết định đã chốt ngoài spec.

## Mở phiên mới

1. Mở Claude Code trỏ vào thư mục repo. Môi trường mới (máy khác, cloud) thì cài theo `docs/kickoff/setup.md` trước.
2. Đọc `docs/STATUS.md` để biết việc tiếp theo; đề bài từng phiên nằm trong `docs/kickoff/`.
3. Làm trên nhánh riêng, mở PR bằng `/ship`. `main` được bảo vệ: cần code owner approve.
4. Kết thúc phiên bằng việc cập nhật `docs/STATUS.md` trong cùng PR.

## Lưu ý

Repo này **public**. Không commit dữ liệu khách, token, hay schema nội bộ chưa công bố. Secret chỉ nằm trong `.env` (đã bị `.gitignore` chặn); mẫu ở `.env.example`.
