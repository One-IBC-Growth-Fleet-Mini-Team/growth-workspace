-- Lượt đóng gói theo kênh của Creative Factory (bước 5 tới 6: catalog, export; spec mục 7; D-59). Chỉ thêm.
-- Chỉ chế độ chạy thử: không có gì được đăng. Đăng công khai luôn cần người duyệt, ngoài Growth.
CREATE TABLE creative_exports (
  id              TEXT PRIMARY KEY,
  creative_ir_id  TEXT NOT NULL REFERENCES storyboards(creative_ir_id),
  package_id      TEXT NOT NULL,
  bundles         TEXT NOT NULL,   -- JSON [{channel, aspectRatio, entries}]
  exported_at     TEXT NOT NULL,
  actor           TEXT NOT NULL
);
CREATE TRIGGER creative_exports_no_update BEFORE UPDATE ON creative_exports BEGIN SELECT RAISE(ABORT, 'append_only:creative_exports'); END;
CREATE TRIGGER creative_exports_no_delete BEFORE DELETE ON creative_exports BEGIN SELECT RAISE(ABORT, 'append_only:creative_exports'); END;
