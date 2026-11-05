import { daysInMonth, fromKey, isWeekend, round1, toKey } from './date';

export interface ActivityLine {
  id: string;
  code: string;
  hours: number;
  remark: string;
  /** 「单据」弹窗里的补充说明，可选。 */
  note: string;
}

export interface DayRecord {
  /** yyyy-mm-dd */
  date: string;
  location: string;
  target: number;
  lines: ActivityLine[];
  /** 最后一次保存时间（ISO）；null 表示尚未保存。 */
  savedAt: string | null;
}

export interface AppState {
  version: number;
  days: Record<string, DayRecord>;
  defaultLocation: string;
  defaultTarget: number;
}

export type DayStatus = 'empty' | 'partial' | 'complete';

let sequence = 0;

export function uid(prefix = 'line'): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createLine(code = ''): ActivityLine {
  return { id: uid(), code, hours: 0, remark: '', note: '' };
}

export function blankDay(date: string, location: string, target: number): DayRecord {
  return { date, location, target, lines: [createLine()], savedAt: null };
}

export function cloneDay(day: DayRecord): DayRecord {
  return { ...day, lines: day.lines.map((line) => ({ ...line, id: uid() })) };
}

export function dayTotal(day: DayRecord | undefined): number {
  if (!day) return 0;
  return round1(
    day.lines.reduce((sum, line) => sum + (Number.isFinite(line.hours) ? line.hours : 0), 0),
  );
}

export function overtimeHours(day: DayRecord): number {
  const total = dayTotal(day);
  if (total <= 0) return 0;
  if (isWeekend(fromKey(day.date))) return total;
  const standard = day.target > 0 ? day.target : 8;
  return round1(Math.max(0, total - standard));
}

export function statusOf(day: DayRecord | undefined): DayStatus {
  if (!day) return 'empty';
  const total = dayTotal(day);
  if (total <= 0) return 'empty';
  const target = day.target > 0 ? day.target : 8;
  return total + 1e-9 >= target ? 'complete' : 'partial';
}

export function isOtDay(day: DayRecord | undefined): boolean {
  if (!day) return false;
  return overtimeHours(day) > 0;
}

export interface ValidationIssue {
  key: string;
  vars?: Record<string, string | number>;
}

export function validateDay(day: DayRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const total = dayTotal(day);
  const target = day.target > 0 ? day.target : 8;

  if (!Number.isFinite(day.target) || day.target <= 0) {
    issues.push({ key: 'err.targetMin' });
  }

  day.lines.forEach((line, index) => {
    const vars = { n: index + 1 };
    if (line.hours < 0) issues.push({ key: 'err.lineNegative', vars });
    if (line.code && line.hours <= 0) issues.push({ key: 'err.lineHours', vars });
    if (line.hours > 0 && !line.code) issues.push({ key: 'err.lineCode', vars });
  });

  if (total > target + 1e-9) {
    issues.push({ key: 'err.totalOver', vars: { target: target.toFixed(1), total: total.toFixed(1) } });
  }
  if (total <= 0) issues.push({ key: 'err.totalMin' });

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const id = `${issue.key}:${JSON.stringify(issue.vars ?? {})}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export interface MonthStats {
  workdays: number;
  filledDays: number;
  hours: number;
  overtime: number;
  targetHours: number;
  completeDays: number;
}

export function monthStats(days: Record<string, DayRecord>, year: number, month: number): MonthStats {
  const total = daysInMonth(year, month);
  let workdays = 0;
  let filledDays = 0;
  let hours = 0;
  let overtime = 0;
  let completeDays = 0;

  for (let day = 1; day <= total; day += 1) {
    const date = new Date(year, month, day);
    const record = days[toKey(date)];
    if (!isWeekend(date)) workdays += 1;
    if (!record) continue;
    const dayHours = dayTotal(record);
    if (dayHours > 0) {
      filledDays += 1;
      hours += dayHours;
      overtime += overtimeHours(record);
      if (statusOf(record) === 'complete') completeDays += 1;
    }
  }

  return {
    workdays,
    filledDays,
    hours: round1(hours),
    overtime: round1(overtime),
    targetHours: workdays * 8,
    completeDays,
  };
}

/** 该日期所在周（周一至周五）的 5 个 key。 */
export function weekdaysOf(dateKey: string): string[] {
  const date = fromKey(dateKey);
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - ((date.getDay() + 6) % 7),
  );
  return Array.from({ length: 5 }, (_, index) => {
    const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    return toKey(next);
  });
}
