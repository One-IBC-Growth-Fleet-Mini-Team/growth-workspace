// T-DEPLOY-01 tới T-DEPLOY-04: bộ máy chủ (D-97) không mở cổng thừa, Caddyfile thay chỗ giữ chỗ an toàn, backup ngoài máy
// luôn kiểm mã hoá trước khi đẩy, không còn đường mã băm mật khẩu trong env. Kiểm tĩnh; chạy thật ghi ở D-97.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

describe("T-DEPLOY bộ máy chủ", () => {
  test("T-DEPLOY-01 setup.sh: chỉ mở 80, 443; cổng 22 chỉ theo admin-ips; không bao giờ mở 3000; dừng khi admin-ips trống", () => {
    const s = read("deploy/setup.sh");
    const allows = [...code(s).matchAll(/ufw allow ([^>\n]+?)\s*>/g)].map((m) => m[1]!.trim());
    expect(allows).toEqual(["80/tcp", "443/tcp", 'from "$ip" to any port 22 proto tcp']);
    expect(code(s)).not.toMatch(/3000\/tcp|port 3000/);
    expect(s).toContain("ufw default deny incoming");
    expect(s).toMatch(/\[ -n "\$ADMIN_IPS" \] \|\| die/);
    expect(s).toMatch(/authorized_keys/);
    expect(s.indexOf("authorized_keys")).toBeLessThan(s.indexOf("PasswordAuthentication no"));
    expect(s).toMatch(/\[ -n "\$REPO_REF" \] \|\| die/);
  });

  test("T-DEPLOY-02 Caddyfile: chỗ giữ chỗ chỉ nằm ngoài chú thích, mỗi chỗ một lần; có header bảo mật và chặn đường MCP", () => {
    const c = read("deploy/Caddyfile");
    for (const p of ["__QUEUE_DOMAIN__", "__ACME_EMAIL__", "__ALLOW_IPS_BLOCK__"]) {
      expect(c.split(p).length - 1).toBe(1);
      expect(code(c)).toContain(p);
    }
    for (const h of ['X-Content-Type-Options "nosniff"', 'X-Frame-Options "DENY"', 'Referrer-Policy "same-origin"', "?Content-Security-Policy", "Strict-Transport-Security"]) expect(c).toContain(h);
    expect(c).toMatch(/@mcp path .*\/content-dist/);
    expect(c).toContain("respond @mcp 404");
    expect(c).toContain("reverse_proxy 127.0.0.1:3000");
  });

  test("T-DEPLOY-03 backup ngoài máy: kiểm remote crypt và mật khẩu trước lệnh copy; service không bỏ qua khi thiếu cấu hình", () => {
    const b = read("deploy/offsite-backup.sh");
    const copy = b.indexOf("rc copy");
    expect(copy).toBeGreaterThan(0);
    for (const guard of ['[ "$type" = "crypt" ] || fail', '[ -f "$CONF" ] || fail', "grep -q '^password"]) {
      expect(b.indexOf(guard)).toBeGreaterThan(0);
      expect(b.indexOf(guard)).toBeLessThan(copy);
    }
    expect(read("deploy/systemd/growth-offsite-backup.service")).not.toContain("ConditionPathExists");
  });

  test("T-DEPLOY-04 không còn đường mã băm mật khẩu trong env ở tài liệu cài và file mẫu", () => {
    for (const p of [".env.example", "deploy/README.md", "deploy/local/install.sh", "deploy/local/README.md"]) {
      expect(code(read(p))).not.toMatch(/^(AMY|MARK|MKT|BOD)_PASSWORD_HASH=/m);
      expect(read(p)).not.toContain("hash-password");
    }
  });
});
