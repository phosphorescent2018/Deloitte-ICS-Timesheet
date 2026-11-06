export const WEEKDAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 本地日期 → `yyyy-mm-dd`（不使用 UTC，避免时区串日）。 */
export function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 固定 42 格（6 行 × 7 列）的月历矩阵，从周日开始。 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function isWeekend(date: Date): boolean {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`;
}

export function monthShort(month: number): string {
  return MONTHS_LONG[month].slice(0, 3);
}

export function shortDate(key: string): string {
  const date = fromKey(key);
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

export function longDate(key: string): string {
  const date = fromKey(key);
  return `${WEEKDAYS_LONG[date.getDay()]}, ${MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[fromKey(key).getDay()];
}

/** 周一为一周起点（用于 Prefill one week）。 */
export function startOfWeekMonday(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

export function isoWeek(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

export function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 可编辑窗口起始日：默认 3 天（含当天）→ 今天、昨天、前天。 */
export function editableFromKey(todayKey: string, windowDays = 3): string {
  return toKey(addDays(fromKey(todayKey), -(windowDays - 1)));
}

/** 是否属于「下个月及以后」的日期。 */
export function isFutureMonthKey(key: string, todayKey: string): boolean {
  const today = fromKey(todayKey);
  const monthEnd = toKey(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  return key > monthEnd;
}

/** 历史窗口之外、或晚于当月最后一天的日期视为锁定。 */
export function isLockedKey(key: string, todayKey: string, windowDays = 3): boolean {
  const from = editableFromKey(todayKey, windowDays);
  return key < from || isFutureMonthKey(key, todayKey);
}
