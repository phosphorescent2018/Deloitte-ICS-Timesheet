export type ActivityCategory =
  | 'ESH'
  | 'Tax'
  | 'Consulting'
  | 'Risk Advisory'
  | 'Administration'
  | 'Leave';

export interface ActivityCode {
  code: string;
  /** 英文名称（原始系统口径） */
  name: string;
  /** 中文名称 */
  nameZh: string;
  /** 客户/业务线短名（英文） */
  client: string;
  clientZh: string;
  category: ActivityCategory;
  description: string;
  descriptionZh: string;
}

export const ACTIVITIES: ActivityCode[] = [
  {
    code: 'ICS-GDC-ESH-20100',
    name: 'ESH Billing Creation&Post (if any)_A&A',
    nameZh: 'ESH 账单创建与过账（如需）_A&A',
    client: 'ESH',
    clientZh: 'ESH',
    category: 'ESH',
    description:
      'Monthly billing creation and posting for Engineering, Sciences & Health (ESH) engagements; reconciles amounts, tax codes and billing entities against the engagement ledger.',
    descriptionZh:
      'Engineering, Sciences & Health（ESH）业务线月度账单创建与过账，按项目台账核对金额、税率与开票主体。',
  },
  {
    code: 'ICS-GDC-ESH-20110',
    name: 'ESH Audit Support – Evidence Collection_A&A',
    nameZh: 'ESH 审计支持 – 证据收集_A&A',
    client: 'ESH',
    clientZh: 'ESH',
    category: 'ESH',
    description:
      'Audit support: collect, index and archive vouchers, contracts and interview notes; maintain the evidence index.',
    descriptionZh: '审计项目支持：凭证、合同与访谈记录的收集、编号与归档，维护证据索引。',
  },
  {
    code: 'ICS-GDC-ESH-20120',
    name: 'ESH Month-end Closing Support_A&A',
    nameZh: 'ESH 月末结账支持_A&A',
    client: 'ESH',
    clientZh: 'ESH',
    category: 'ESH',
    description:
      'Month-end close support: accruals, amortisation, intercompany reconciliation and variance commentary for the engagement team.',
    descriptionZh: '月末结账支持：预提、摊销、往来对账与差异说明，输出结账包给项目组。',
  },
  {
    code: 'ICS-GDC-ESH-20130',
    name: 'ESH Engagement File Review_A&A',
    nameZh: 'ESH 项目档案复核_A&A',
    client: 'ESH',
    clientZh: 'ESH',
    category: 'ESH',
    description:
      'Engagement file review: completeness, sign-off chain and archiving standards; log review notes and track remediation.',
    descriptionZh: '项目档案复核：完整性、签批链与归档规范检查，记录复核意见并跟踪整改。',
  },
  {
    code: 'ICS-GDC-TAX-30100',
    name: 'Tax Compliance Filing Support_Tax',
    nameZh: '税务合规申报支持_税务',
    client: 'GDC Tax',
    clientZh: 'GDC 税务',
    category: 'Tax',
    description:
      'Tax compliance filing support: prepare return data, run cross-checks and archive filing receipts.',
    descriptionZh: '税务合规申报支持：申报表数据准备、勾稽校验与申报回执归档。',
  },
  {
    code: 'ICS-GDC-TAX-30110',
    name: 'Tax Return Data Preparation_Tax',
    nameZh: '申报数据整理_税务',
    client: 'GDC Tax',
    clientZh: 'GDC 税务',
    category: 'Tax',
    description:
      'Tax return data preparation: reconcile trial balances, invoice details and tax computation workpapers.',
    descriptionZh: '申报数据整理：科目余额、发票明细与税款计算表的多源核对。',
  },
  {
    code: 'ICS-GDC-CON-40100',
    name: 'Consulting Project Delivery_Consulting',
    nameZh: '咨询项目交付_咨询',
    client: 'Consulting',
    clientZh: '咨询',
    category: 'Consulting',
    description:
      'Consulting project delivery: interviews, analysis, report writing and client communication, tracked by workstream.',
    descriptionZh: '咨询项目交付：访谈、分析、报告撰写与客户沟通，按工作流归集工时。',
  },
  {
    code: 'ICS-GDC-CON-40110',
    name: 'Client Workshop Preparation_Consulting',
    nameZh: '客户工作坊准备_咨询',
    client: 'Consulting',
    clientZh: '咨询',
    category: 'Consulting',
    description:
      'Client workshop preparation: agenda, materials, case studies and dry runs, including on-site support.',
    descriptionZh: '客户工作坊准备：议程、材料、案例与演练脚本，含现场支持。',
  },
  {
    code: 'ICS-GDC-RISK-50100',
    name: 'Risk Advisory Control Testing_Risk',
    nameZh: '风险咨询内控测试_风险',
    client: 'Risk Advisory',
    clientZh: '风险咨询',
    category: 'Risk Advisory',
    description:
      'Internal control testing: sampling, walkthroughs, defect rating and remediation recommendations.',
    descriptionZh: '内控测试执行：抽样、穿行测试、缺陷分级与整改建议。',
  },
  {
    code: 'ICS-GDC-ADM-90010',
    name: 'Internal Training & Learning_ADM',
    nameZh: '内部培训与学习_行政',
    client: 'GDC Internal',
    clientZh: 'GDC 内部',
    category: 'Administration',
    description:
      'Internal training and learning: mandatory courses, professional certification hours and knowledge-sharing sessions.',
    descriptionZh: '内部培训与学习：必修课程、专业认证学时与分享会。',
  },
  {
    code: 'ICS-GDC-ADM-90020',
    name: 'Team Meeting & Administration_ADM',
    nameZh: '团队例会与行政事务_行政',
    client: 'GDC Internal',
    clientZh: 'GDC 内部',
    category: 'Administration',
    description: 'Team meetings, weekly status reports, administrative tasks and non-billable support.',
    descriptionZh: '团队例会、周报、行政事务与非项目类支持工作。',
  },
  {
    code: 'ICS-GDC-LV-00010',
    name: 'Annual Leave_ADM',
    nameZh: '年假_行政',
    client: 'GDC Internal',
    clientZh: 'GDC 内部',
    category: 'Leave',
    description: 'Annual leave, counted at 8 hours per day and excluded from overtime.',
    descriptionZh: '年假，按 8 小时/天计入，不计入加班。',
  },
  {
    code: 'ICS-GDC-LV-00020',
    name: 'Sick Leave_ADM',
    nameZh: '病假_行政',
    client: 'GDC Internal',
    clientZh: 'GDC 内部',
    category: 'Leave',
    description: 'Sick leave, filed at the actual hours taken and excluded from overtime.',
    descriptionZh: '病假，按实际请假时长填报，不计入加班。',
  },
  {
    code: 'ICS-GDC-LV-00030',
    name: 'Statutory Holiday_ADM',
    nameZh: '法定节假日_行政',
    client: 'GDC Internal',
    clientZh: 'GDC 内部',
    category: 'Leave',
    description: 'Statutory holiday, counted as a standard 8-hour working day.',
    descriptionZh: '法定节假日，按标准工作日 8 小时计。',
  },
];

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
