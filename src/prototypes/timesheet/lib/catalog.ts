export type ActivityCategory = 'UG' | 'CDI' | 'GH';

export interface ActivityCode {
  /** 业务线-产品-业务阶段，例如 UG-OD-运营 */
  code: string;
  /** 产品 · 阶段（英文） */
  name: string;
  /** 产品 · 阶段（中文） */
  nameZh: string;
  /** 业务线（英文） */
  client: string;
  clientZh: string;
  category: ActivityCategory;
  description: string;
  descriptionZh: string;
}

const BUSINESS_LINES = ['UG', 'CDI', 'GH'] as const;
const PRODUCTS = ['OD', 'AirtimeLending', 'BL'] as const;
const STAGES = ['运营', '交付'] as const;

const STAGE_EN: Record<string, string> = {
  运营: 'Operations',
  交付: 'Delivery',
};

/** 3 条业务线 × 3 个产品 × 2 个业务阶段 = 18 个可选组合。 */
export const ACTIVITIES: ActivityCode[] = BUSINESS_LINES.flatMap((line) =>
  PRODUCTS.flatMap((product) =>
    STAGES.map((stage) => ({
      code: `${line}-${product}-${stage}`,
      name: `${product} · ${STAGE_EN[stage]}`,
      nameZh: `${product} · ${stage}`,
      client: line,
      clientZh: line,
      category: line,
      description: `Business line ${line} / product ${product} / stage ${STAGE_EN[stage]}.`,
      descriptionZh: `业务线 ${line} / 产品 ${product} / 业务阶段 ${stage}。`,
    })),
  ),
);

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

export function findActivity(code: string): ActivityCode | undefined {
  return ACTIVITIES.find((item) => item.code === code);
}

export function activityLabel(code: string, lang: 'zh' | 'en' = 'zh'): string {
  const activity = findActivity(code);
  if (!activity) return code || '—';
  return `${activity.code} ${lang === 'zh' ? activity.nameZh : activity.name}`;
}

export function locationLabel(value: string, lang: 'zh' | 'en' = 'zh'): string {
  const option = LOCATIONS.find((item) => item.value === value);
  if (!option) return value;
  return lang === 'zh' ? option.labelZh : option.label;
}
