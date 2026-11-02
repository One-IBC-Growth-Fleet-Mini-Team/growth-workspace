// compute_confidence (D-07, design doc mục 5.6). Không lấy từ việc model tự chấm (C6):
//   confidence = eval_pass_rate × field_coverage × min(1, eval_case_count / 30) × 0,8 cho mỗi cờ
// Cờ truncated và unstructured: mỗi cờ nhân thêm 0,8 (hai cờ thì 0,64).
// Đầu vào chỉ nhận đúng các khoá khai báo, để không có đường nào đưa điểm do LLM tự chấm vào.
import { METRIC_PARAMS } from "../config.ts";

export type ConfidenceFlag = "truncated" | "unstructured";

export type ConfidenceInputs = {
  evalPassRate: number; // từ lần chạy eval gần nhất của task và prompt_version
  fieldCoverage: number; // tỷ lệ trường cần thiết đã biết, từ fieldCoverage()
  evalCaseCount: number; // số ca eval của task
  flags: readonly ConfidenceFlag[];
};

export type ConfidenceResult = {
  confidence: number;
  escalate: boolean;
  components: { evalPassRate: number; fieldCoverage: number; sampleFactor: number; flagFactor: number };
};

const INPUT_KEYS = new Set(["evalPassRate", "fieldCoverage", "evalCaseCount", "flags"]);
const FLAGS = new Set<string>(["truncated", "unstructured"]);

function assertUnit(name: string, v: number): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new RangeError(`compute_confidence: ${name} must be in [0, 1]`);
  }
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  for (const key of Object.keys(inputs)) {
    if (!INPUT_KEYS.has(key)) throw new TypeError(`compute_confidence: unknown input ${key}`);
  }
  assertUnit("evalPassRate", inputs.evalPassRate);
  assertUnit("fieldCoverage", inputs.fieldCoverage);
  if (!Number.isInteger(inputs.evalCaseCount) || inputs.evalCaseCount < 0) {
    throw new RangeError("compute_confidence: evalCaseCount must be a non-negative integer");
  }
  const uniqueFlags = new Set(inputs.flags);
  for (const f of uniqueFlags) if (!FLAGS.has(f)) throw new TypeError(`compute_confidence: unknown flag ${f}`);

  const sampleFactor = Math.min(1, inputs.evalCaseCount / METRIC_PARAMS.evalMinCaseCount);
  const flagFactor = METRIC_PARAMS.flagPenalty ** uniqueFlags.size;
  const raw = inputs.evalPassRate * inputs.fieldCoverage * sampleFactor * flagFactor;
  // Làm tròn 6 chữ số để so ngưỡng 0,8 ổn định (tránh 0,7999999 do số thực).
  const confidence = Math.round(raw * 1e6) / 1e6;
  return {
    confidence,
    escalate: confidence < METRIC_PARAMS.confidenceEscalateBelow,
    components: { evalPassRate: inputs.evalPassRate, fieldCoverage: inputs.fieldCoverage, sampleFactor, flagFactor },
  };
}

// field_coverage: tỷ lệ trường cần thiết đã biết. null, undefined và "unknown" là chưa biết.
export function fieldCoverage(fields: Record<string, unknown>): number {
  const values = Object.values(fields);
  if (values.length === 0) throw new RangeError("field_coverage: no fields");
  let known = 0;
  for (const v of values) if (v !== null && v !== undefined && v !== "unknown") known++;
  return known / values.length;
}
