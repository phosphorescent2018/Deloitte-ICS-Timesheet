import { DEFAULT_LOCATION } from './catalog';
import { addDays, startOfWeekMonday, toKey } from './date';
import type { AppState, DayRecord } from './model';
import { createLine } from './model';

const STORAGE_KEY = 'deloitte-ics-timesheet.v3';

interface SeedLine {
  code: string;
  hours: number;
  remark?: string;
}

/** 生成一份「本周已填」的演示数据，首屏即接近真实截图的状态。 */
export function seedState(): AppState {
  const monday = startOfWeekMonday(new Date());
  const plan: SeedLine[][] = [
    [{ code: 'UG-OD-运营', hours: 4 }, { code: 'UG-OD-交付', hours: 4 }],
    [{ code: 'CDI-OD-运营', hours: 8, remark: 'Billing batch #2410-03' }],
    [{ code: 'GH-OD-运营', hours: 8 }],
    [{ code: 'UG-AirtimeLending-运营', hours: 8 }],
    [{ code: 'CDI-BL-交付', hours: 8, remark: 'Evidence index hand-off' }],
  ];

  const days: Record<string, DayRecord> = {};
  plan.forEach((lines, index) => {
    const date = addDays(monday, index);
    const key = toKey(date);
    const savedAt = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      18,
      30,
    ).toISOString();
    days[key] = {
      date: key,
      location: DEFAULT_LOCATION,
      target: 8,
      savedAt,
      lines: lines.map((line) => ({
        ...createLine(line.code),
        hours: line.hours,
        remark: line.remark ?? '',
      })),
    };
  });

  return { version: 1, days, defaultLocation: DEFAULT_LOCATION, defaultTarget: 8 };
}

function normalize(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<AppState>;
  if (candidate.version !== 1 || !candidate.days || typeof candidate.days !== 'object') {
    return null;
  }
  const days: Record<string, DayRecord> = {};
  Object.entries(candidate.days).forEach(([key, value]) => {
    const record = value as DayRecord;
    if (!record || typeof record !== 'object') return;
    days[key] = {
      date: record.date ?? key,
      location: record.location ?? DEFAULT_LOCATION,
      target: Number.isFinite(record.target) ? record.target : 8,
      savedAt: record.savedAt ?? null,
      lines: Array.isArray(record.lines)
        ? record.lines.map((line) => ({
            id: line.id ?? createLine().id,
            code: line.code ?? '',
            hours: Number.isFinite(line.hours) ? line.hours : 0,
            remark: line.remark ?? '',
            note: line.note ?? '',
          }))
        : [],
    };
  });

  return {
    version: 1,
    days,
    defaultLocation: candidate.defaultLocation ?? DEFAULT_LOCATION,
    defaultTarget: Number.isFinite(candidate.defaultTarget) ? Number(candidate.defaultTarget) : 8,
  };
}

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = normalize(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
    }
  } catch {
    // 读取失败时回退到演示数据
  }
  const seeded = seedState();
  persist(seeded);
  return seeded;
}

export function persist(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式 / 配额不足时静默失败，原型仍可继续使用
  }
}

export function resetState(): AppState {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const seeded = seedState();
  persist(seeded);
  return seeded;
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ics-timesheet-${toKey(new Date())}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
