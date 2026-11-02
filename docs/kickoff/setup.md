# Setup Claude Code cho Growth Workspace (làm một lần)

## 1. Tạo repo mới

- Tạo repo **private** `growth-workspace` trong GitHub organization của One IBC (tài khoản quản lý chung là owner). Không dùng repo cá nhân, không gộp vào repo Mi1.
- Thêm người chịu trách nhiệm kỹ thuật làm reviewer bắt buộc; bật branch protection cho `main` (cần 1 approve, cấm force push).
- Đẩy toàn bộ thư mục bootstrap này làm commit đầu tiên.

## 2. Cài bộ quy tắc

Karpathy guidelines (chọn một):
```
# Cách A: plugin, trong Claude Code
/plugin marketplace add forrestchang/andrej-karpathy-skills
/plugin install andrej-karpathy-skills@karpathy-skills

# Cách B: nối vào CLAUDE.md của repo
echo "" >> CLAUDE.md
curl https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/main/CLAUDE.md >> CLAUDE.md
```
Khuyến nghị cách B để quy tắc đi theo repo, ai mở repo cũng có.

gstack (trên máy hoặc môi trường chạy Claude Code):
```
git clone https://github.com/garrytan/gstack ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

## Môi trường cloud

gstack đã nằm sẵn trong repo tại `.claude/skills/gstack` (bản 1.92.56.0, commit upstream `f5cb6ec`, chỉ mã nguồn, giấy phép MIT). Không cần clone. Bản trong repo chưa có binary và skill chưa được render, nên mỗi môi trường mới phải chạy setup một lần:

```
# Yêu cầu: git và Bun >= 1.3.3 (gstack thử nghiệm trên 1.4.2; bản cũ hơn bị setup từ chối)
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
bash /tmp/bun-install.sh bun-v1.4.2
export PATH="$HOME/.bun/bin:$PATH"

cd .claude/skills/gstack && ./setup --no-team < /dev/null
```

- Chạy từ trong repo, setup tự nhận phạm vi `project`: render các skill vào `.claude/skills/<tên>/` (đã bị `.gitignore` chặn) và build binary vào `browse/dist`, `design/dist`, `bin/` (bị `.gitignore` của gstack chặn). Không ghi gì vào `~/.claude` (không skill global, không hook); chỉ tạo thư mục trạng thái `~/.gstack`. Đã chạy thử ngày 02/11/2026 với HOME trống.
- `--no-team`: không cài hook tự cập nhật, giữ đúng phiên bản đã khoá trong repo.
- `< /dev/null`: chạy không hỏi; mặc định không bật telemetry, không cài hook `/plan-tune`.
- Thêm `--no-browser` nếu môi trường không cần `/qa`, `/browse` (bỏ tải Chromium khoảng 270 MB).
- `/cso` cần Docker để chạy đầy đủ; không có thì chỉ phân tích tĩnh.
- Nâng phiên bản gstack: copy mã nguồn bản mới vào `.claude/skills/gstack` qua một PR riêng; không chạy `/gstack-upgrade` trong repo này.

## 3. Mở phiên Claude Code

- Mở Claude Code trỏ vào repo `growth-workspace` (bản desktop, web hoặc CLI đều được). Claude Code đọc file trong repo, không đọc được lịch sử Claude Chat; mọi bối cảnh đã nằm trong `docs/`.
- Dán nội dung `docs/kickoff/session-01.md` làm tin nhắn đầu tiên.

## 4. Tài liệu bổ sung sau này

- Tài liệu mới (Word, PDF) chuyển sang Markdown rồi đặt vào `docs/`. Không đặt file chứa dữ liệu khách vào repo.
- Quyết định mới chốt ở Claude Chat thì thêm một dòng vào `docs/context/decisions.md` qua PR.
