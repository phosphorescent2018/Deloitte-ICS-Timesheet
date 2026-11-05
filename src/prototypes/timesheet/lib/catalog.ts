export interface LocationOption {
  value: string;
  label: string;
  labelZh: string;
}

export const LOCATIONS: LocationOption[] = [
  { value: 'cq', label: 'Chongqing 重庆', labelZh: '重庆' },
  { value: 'bj', label: 'Beijing 北京', labelZh: '北京' },
  { value: 'sh', label: 'Shanghai 上海', labelZh: '上海' },
  { value: 'gz', label: 'Guangzhou 广州', labelZh: '广州' },
  { value: 'sz', label: 'Shenzhen 深圳', labelZh: '深圳' },
  { value: 'hk', label: 'Hong Kong 香港', labelZh: '香港' },
  { value: 'remote', label: 'Remote 远程', labelZh: '远程' },
];

export const DEFAULT_LOCATION = 'cq';

export function locationLabel(value: string, lang: 'zh' | 'en' = 'zh'): string {
  const option = LOCATIONS.find((item) => item.value === value);
  if (!option) return value;
  return lang === 'zh' ? option.labelZh : option.label;
}
