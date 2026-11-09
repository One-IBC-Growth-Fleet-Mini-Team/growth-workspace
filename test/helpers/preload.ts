// Chạy trước mọi test: file ghi đè giá trị tạm (D-67) nằm ở thư mục tạm riêng, không đọc file của máy đang chạy.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setProvisionalPaths } from "../../src/provisional.ts";

setProvisionalPaths({ overrides: join(mkdtempSync(join(tmpdir(), "growth-prov-")), "overrides.jsonl") });
