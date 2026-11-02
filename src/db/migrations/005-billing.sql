-- Đối soát đơn hàng cho Mi1-sa-01: khớp PO với SO, nhắc invoice quá hạn (spec mục 11; D-30). Mọi bảng chỉ thêm.
-- Nguồn: file CSV Amy tải lên (cổng "Đơn hàng và invoice", adapter tải file). [ĐỐI CHIẾU SCHEMA] tên cột thật.
-- Allowlist: chỉ mã đơn, mã liên kết, Status, ngày. KHÔNG lưu tên khách, số tiền, ghi chú.
CREATE TABLE billing_imports (
  id           TEXT PRIMARY KEY,
  actor        TEXT NOT NULL,
  imported_at  TEXT NOT NULL
);
CREATE TABLE billing_sales_orders (
  import_id     TEXT NOT NULL REFERENCES billing_imports(id),
  so_number     TEXT NOT NULL,
  account_id    TEXT,
  owner_rm_id   TEXT,
  status        TEXT NOT NULL,
  needs_po      INTEGER NOT NULL CHECK (needs_po IN (0,1)),  -- 1 nếu dịch vụ cần đặt nhà cung cấp
  PRIMARY KEY (import_id, so_number)
);
CREATE TABLE billing_purchase_orders (
  import_id   TEXT NOT NULL REFERENCES billing_imports(id),
  po_number   TEXT NOT NULL,
  so_number   TEXT,          -- SO mà PO phục vụ; NULL nếu chưa gắn
  status      TEXT NOT NULL,
  PRIMARY KEY (import_id, po_number)
);
CREATE TABLE billing_invoices (
  import_id       TEXT NOT NULL REFERENCES billing_imports(id),
  invoice_number  TEXT NOT NULL,
  so_number       TEXT,
  owner_rm_id     TEXT,
  due_date        TEXT,      -- YYYY-MM-DD
  status          TEXT NOT NULL,
  PRIMARY KEY (import_id, invoice_number)
);
CREATE TRIGGER billing_imports_no_update BEFORE UPDATE ON billing_imports BEGIN SELECT RAISE(ABORT, 'append_only:billing_imports'); END;
CREATE TRIGGER billing_imports_no_delete BEFORE DELETE ON billing_imports BEGIN SELECT RAISE(ABORT, 'append_only:billing_imports'); END;
CREATE TRIGGER billing_sales_orders_no_update BEFORE UPDATE ON billing_sales_orders BEGIN SELECT RAISE(ABORT, 'append_only:billing_sales_orders'); END;
CREATE TRIGGER billing_sales_orders_no_delete BEFORE DELETE ON billing_sales_orders BEGIN SELECT RAISE(ABORT, 'append_only:billing_sales_orders'); END;
CREATE TRIGGER billing_purchase_orders_no_update BEFORE UPDATE ON billing_purchase_orders BEGIN SELECT RAISE(ABORT, 'append_only:billing_purchase_orders'); END;
CREATE TRIGGER billing_purchase_orders_no_delete BEFORE DELETE ON billing_purchase_orders BEGIN SELECT RAISE(ABORT, 'append_only:billing_purchase_orders'); END;
CREATE TRIGGER billing_invoices_no_update BEFORE UPDATE ON billing_invoices BEGIN SELECT RAISE(ABORT, 'append_only:billing_invoices'); END;
CREATE TRIGGER billing_invoices_no_delete BEFORE DELETE ON billing_invoices BEGIN SELECT RAISE(ABORT, 'append_only:billing_invoices'); END;
