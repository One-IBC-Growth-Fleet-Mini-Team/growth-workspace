-- Link truy cập từ xa qua Cloudflare Quick Tunnel (D-98). Mỗi lần tunnel khởi động lại thì có link mới; chỉ thêm, dòng
-- mới nhất là link hiện tại. Link không phải bí mật (tunnel khoá bằng email), nhưng chỉ hiện cho người đã đăng nhập.
CREATE TABLE tunnel_urls (
  id       TEXT PRIMARY KEY,
  url      TEXT NOT NULL CHECK (url LIKE 'https://%.trycloudflare.com'),
  seen_at  TEXT NOT NULL
);
CREATE TRIGGER tunnel_urls_no_update BEFORE UPDATE ON tunnel_urls BEGIN SELECT RAISE(ABORT, 'append_only:tunnel_urls'); END;
CREATE TRIGGER tunnel_urls_no_delete BEFORE DELETE ON tunnel_urls BEGIN SELECT RAISE(ABORT, 'append_only:tunnel_urls'); END;
