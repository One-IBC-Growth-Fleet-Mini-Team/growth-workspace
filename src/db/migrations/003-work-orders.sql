-- Work Order tồn đọng của Bank Team (BK-08, D-25). Mọi bảng chỉ thêm.
-- Nguồn: file CSV Work Order xuất từ CRM (không có ngày cập nhật cuối, không có Owner) và file ghép WO với PIC.
-- Allowlist: chỉ số WO, Status, ngày tạo, tên sản phẩm (danh mục dịch vụ). KHÔNG lưu tên Account, tên khách, ghi chú.

CREATE TABLE wo_imports (           -- (chỉ thêm) mỗi lượt Amy nạp file
  id               TEXT PRIMARY KEY,  -- UUIDv7
  actor            TEXT NOT NULL,     -- id người dùng đã xác thực
  imported_at      TEXT NOT NULL,
  has_work_orders  INTEGER NOT NULL CHECK (has_work_orders IN (0,1)),
  has_pics         INTEGER NOT NULL CHECK (has_pics IN (0,1))
);

CREATE TABLE wo_rows (              -- (chỉ thêm) danh sách WO của một lượt nạp; giữ lâu dài để biết Status đổi khi nào
  import_id          TEXT NOT NULL REFERENCES wo_imports(id),
  work_order_number  TEXT NOT NULL,
  status             TEXT NOT NULL,
  created_date       TEXT,          -- YYYY-MM-DD, NULL nếu ô trống hoặc không đọc được
  product_name       TEXT,          -- tên dịch vụ trong danh mục, không phải tên khách
  PRIMARY KEY (import_id, work_order_number)
);

CREATE TABLE wo_pics (              -- (chỉ thêm) người phụ trách theo file ghép; bản nạp mới nhất của từng WO thắng
  import_id          TEXT NOT NULL REFERENCES wo_imports(id),
  work_order_number  TEXT NOT NULL,
  pic                TEXT NOT NULL, -- tên nhân viên, không phải khách
  PRIMARY KEY (import_id, work_order_number)
);

CREATE TABLE wo_touches (           -- (chỉ thêm) Amy ghi nhận WO đã có cập nhật; đặt lại đồng hồ tồn đọng
  id                 TEXT PRIMARY KEY,
  work_order_number  TEXT NOT NULL,
  actor              TEXT NOT NULL,
  reason_code        TEXT NOT NULL CHECK (reason_code IN ('member_working','waiting_client','waiting_bank','waiting_internal')),
  created_at         TEXT NOT NULL
);
CREATE INDEX wo_touches_wo ON wo_touches(work_order_number, created_at);

CREATE TRIGGER wo_imports_no_update BEFORE UPDATE ON wo_imports
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_imports'); END;
CREATE TRIGGER wo_imports_no_delete BEFORE DELETE ON wo_imports
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_imports'); END;
CREATE TRIGGER wo_rows_no_update BEFORE UPDATE ON wo_rows
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_rows'); END;
CREATE TRIGGER wo_rows_no_delete BEFORE DELETE ON wo_rows
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_rows'); END;
CREATE TRIGGER wo_pics_no_update BEFORE UPDATE ON wo_pics
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_pics'); END;
CREATE TRIGGER wo_pics_no_delete BEFORE DELETE ON wo_pics
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_pics'); END;
CREATE TRIGGER wo_touches_no_update BEFORE UPDATE ON wo_touches
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_touches'); END;
CREATE TRIGGER wo_touches_no_delete BEFORE DELETE ON wo_touches
  BEGIN SELECT RAISE(ABORT, 'append_only:wo_touches'); END;
