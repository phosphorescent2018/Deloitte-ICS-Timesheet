import { LOCATIONS, type LocationOption } from './catalog';

export type ActivityCategory = string;

export interface ActivityCode {
  /** 业务线-产品-业务阶段，例如 UG-OD-运营 */
  code: string;
  /** 产品 · 阶段（英文） */
  name: string;
  /** 产品 · 阶段（中文） */
  nameZh: string;
  /** 业务线 */
  client: string;
  clientZh: string;
  category: ActivityCategory;
  product: string;
  stage: string;
  description: string;
  descriptionZh: string;
}

export interface AdminConfig {
  businessLines: string[];
  products: string[];
  stages: string[];
  locations: LocationOption[];
  /** 可补填最近 N 个自然日，0 = 仅今天；跨月始终锁定 */
  backfillDays: number;
}

export const DEFAULT_CONFIG: AdminConfig = {
  businessLines: ['UG', 'CDI', 'GH'],
  products: ['OD', 'AirtimeLending', 'BL'],
  stages: ['运营', '交付'],
  locations: LOCATIONS.map((location) => ({ ...location })),
  backfillDays: 2,
};

const CONFIG_KEY = 'deloitte-ics-config.v1';

const STAGE_EN: Record<string, string> = {
  运营: 'Operations',
  交付: 'Delivery',
};

export function loadConfig(): AdminConfig {
  // 刷新即重置：每次进入都使用默认配置，不读取本地历史。
  return {
    businessLines: [...DEFAULT_CONFIG.businessLines],
    products: [...DEFAULT_CONFIG.products],
    stages: [...DEFAULT_CONFIG.stages],
    locations: DEFAULT_CONFIG.locations.map((location) => ({ ...location })),
    backfillDays: DEFAULT_CONFIG.backfillDays,
  };
}

export function saveConfig(config: AdminConfig): void {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 忽略隐私模式下的写入失败
  }
}

export function buildActivities(config: AdminConfig): ActivityCode[] {
  return config.businessLines.flatMap((line) =>
    config.products.flatMap((product) =>
      config.stages.map((stage) => ({
        code: `${line}-${product}-${stage}`,
        name: `${product} · ${STAGE_EN[stage] ?? stage}`,
        nameZh: `${product} · ${stage}`,
        client: line,
        clientZh: line,
        category: line,
        product,
        stage,
        description: `Business line ${line} / product ${product} / stage ${STAGE_EN[stage] ?? stage}.`,
        descriptionZh: `业务线 ${line} / 产品 ${product} / 业务阶段 ${stage}。`,
      })),
    ),
  );
}

export function findActivity(activities: ActivityCode[], code: string): ActivityCode | undefined {
  return activities.find((item) => item.code === code);
}
