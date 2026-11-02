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

## 3. Mở phiên Claude Code

- Mở Claude Code trỏ vào repo `growth-workspace` (bản desktop, web hoặc CLI đều được). Claude Code đọc file trong repo, không đọc được lịch sử Claude Chat; mọi bối cảnh đã nằm trong `docs/`.
- Dán nội dung `docs/kickoff/session-01.md` làm tin nhắn đầu tiên.

## 4. Tài liệu bổ sung sau này

- Tài liệu mới (Word, PDF) chuyển sang Markdown rồi đặt vào `docs/`. Không đặt file chứa dữ liệu khách vào repo.
- Quyết định mới chốt ở Claude Chat thì thêm một dòng vào `docs/context/decisions.md` qua PR.
