// Tạo mã băm argon2id cho mật khẩu đăng nhập Hàng chờ (D-24). Mật khẩu đọc từ stdin, không nằm trong lệnh
// (để không lưu vào lịch sử shell). Chép kết quả vào AMY_PASSWORD_HASH hoặc MARK_PASSWORD_HASH trong growth.env.
//   echo -n 'mật khẩu' | bun run scripts/hash-password.ts       (máy cá nhân)
//   sudo growth-run scripts/hash-password.ts                      (máy chủ: gõ mật khẩu, Enter, Ctrl+D)
const input = (await Bun.stdin.text()).replace(/\r?\n$/, "");
if (input.length < 12) {
  process.stderr.write("Mật khẩu cần ít nhất 12 ký tự.\n");
  process.exit(2);
}
process.stdout.write(`${await Bun.password.hash(input, { algorithm: "argon2id" })}\n`);

export {};
