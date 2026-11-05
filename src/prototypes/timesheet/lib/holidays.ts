export interface HolidayInfo {
  nameZh: string;
  nameEn: string;
}

/** 2026 年国务院法定节假日（含调休）。来源：国务院办公厅 2026 年部分节假日安排。 */
export const HOLIDAYS_2026: Record<string, HolidayInfo> = {
  '2026-01-01': { nameZh: '元旦', nameEn: "New Year's Day" },
  '2026-01-02': { nameZh: '元旦', nameEn: "New Year's Day" },
  '2026-01-03': { nameZh: '元旦', nameEn: "New Year's Day" },
  '2026-02-15': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-16': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-17': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-18': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-19': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-20': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-21': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-22': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-23': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-04-04': { nameZh: '清明', nameEn: 'Tomb-sweeping Day' },
  '2026-04-05': { nameZh: '清明', nameEn: 'Tomb-sweeping Day' },
  '2026-04-06': { nameZh: '清明', nameEn: 'Tomb-sweeping Day' },
  '2026-05-01': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-05-02': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-05-03': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-05-04': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-05-05': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-06-19': { nameZh: '端午', nameEn: 'Dragon Boat Festival' },
  '2026-06-20': { nameZh: '端午', nameEn: 'Dragon Boat Festival' },
  '2026-06-21': { nameZh: '端午', nameEn: 'Dragon Boat Festival' },
  '2026-09-25': { nameZh: '中秋', nameEn: 'Mid-autumn Festival' },
  '2026-09-26': { nameZh: '中秋', nameEn: 'Mid-autumn Festival' },
  '2026-09-27': { nameZh: '中秋', nameEn: 'Mid-autumn Festival' },
  '2026-10-01': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-02': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-03': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-04': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-05': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-06': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-07': { nameZh: '国庆节', nameEn: 'National Day' },
};

/** 2026 年调休上班日（周末但需上班）。 */
export const MAKEUP_WORKDAYS_2026: Record<string, HolidayInfo> = {
  '2026-01-04': { nameZh: '元旦', nameEn: "New Year's Day" },
  '2026-02-14': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-02-28': { nameZh: '春节', nameEn: 'Spring Festival' },
  '2026-05-09': { nameZh: '劳动节', nameEn: 'Labour Day' },
  '2026-09-20': { nameZh: '国庆节', nameEn: 'National Day' },
  '2026-10-10': { nameZh: '国庆节', nameEn: 'National Day' },
};

export function holidayInfo(key: string): HolidayInfo | undefined {
  return HOLIDAYS_2026[key];
}

export function makeupWorkdayInfo(key: string): HolidayInfo | undefined {
  return MAKEUP_WORKDAYS_2026[key];
}

export function isHoliday(key: string): boolean {
  return Boolean(HOLIDAYS_2026[key]);
}

export function isMakeupWorkday(key: string): boolean {
  return Boolean(MAKEUP_WORKDAYS_2026[key]);
}

export function isWorkday(date: Date): boolean {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (isMakeupWorkday(key)) return true;
  if (isHoliday(key)) return false;
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6;
}
