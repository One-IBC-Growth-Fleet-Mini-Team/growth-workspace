// Ngày nghiệp vụ theo giờ Việt Nam (A-07, UTC+7). Chuỗi ngày dạng YYYY-MM-DD.
const VN_OFFSET_MS = 7 * 3600 * 1000;

export function vnDate(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Ngày tự báo của lượt sáng ngày D: ngày làm việc liền trước. Amy làm thứ Hai tới thứ Bảy (A-06),
// nên sáng thứ Hai đọc tự báo thứ Bảy.
export function previousWorkingDay(queueDate: string): string {
  const prev = addDays(queueDate, -1);
  return new Date(`${prev}T00:00:00Z`).getUTCDay() === 0 ? addDays(prev, -1) : prev;
}

// Kỳ pipeline mặc định: tháng dương lịch chứa ngày D (A-10).
export function monthPeriod(date: string): { start: string; end: string } {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

// Hạn của mục hàng chờ: 17:59:59 giờ Việt Nam của ngày D.
export function endOfVnWorkday(date: string): string {
  return `${date}T10:59:59.000Z`;
}

// Định dạng dd/mm cho tin Teams và nhãn trên trang.
export function ddmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

// "dd/mm hh:mm" theo giờ Việt Nam, cho dòng lịch sử trên thẻ (D-74).
export function vnShortTime(iso: string): string {
  const t = new Date(Date.parse(iso) + 7 * 3600_000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}`;
}
