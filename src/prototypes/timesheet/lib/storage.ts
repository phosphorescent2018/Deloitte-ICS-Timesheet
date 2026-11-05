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

/** 刷新即重置：每次加载都使用全新的演示数据，不读取本地历史。 */
export function loadState(): AppState {
  return seedState();
}

export function persist(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式 / 配额不足时静默失败，原型仍可继续使用
  }
}
