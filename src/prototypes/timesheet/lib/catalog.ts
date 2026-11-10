export interface LocationOption {
  value: string;
  label: string;
  labelZh: string;
}

export const LOCATIONS: LocationOption[] = [
  { value: 'cq', label: 'Chongqing 重庆', labelZh: '重庆' },
  { value: 'bj', label: 'Beijing 北京', labelZh: '北京' },
  { value: 'sg', label: 'Singapore 新加坡', labelZh: '新加坡' },
  { value: 'remote', label: 'Remote 远程', labelZh: '远程' },
];

export const DEFAULT_LOCATION = 'cq';

export function locationLabel(
  value: string,
  lang: 'zh' | 'en' = 'zh',
  locations: LocationOption[] = LOCATIONS,
): string {
  const option = locations.find((item) => item.value === value);
  if (!option) return value;
  return lang === 'zh' ? option.labelZh : option.label;
}
