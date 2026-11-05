export type ActivityCategory =
  | 'ESH'
  | 'Tax'
  | 'Consulting'
  | 'Risk Advisory'
  | 'Administration'
  | 'Leave';

export interface ActivityCode {
  code: string;
  name: string;
  /** 客户/业务线短名，对应界面上的 Client Name。 */
  client: string;
  category: ActivityCategory;
  /** 详情弹窗里的说明文案。 */
  description: string;
}

export const ACTIVITIES: ActivityCode[] = [
  {
    code: 'ICS-GDC-ESH-20100',
    name: 'ESH Billing Creation&Post (if any)_A&A',
    client: 'ESH',
    category: 'ESH',
    description:
      'Monthly billing creation and posting for Engineering, Sciences & Health (ESH) engagements; reconciles amounts, tax codes and billing entities against the engagement ledger.',
  },
  {
    code: 'ICS-GDC-ESH-20110',
    name: 'ESH Audit Support – Evidence Collection_A&A',
    client: 'ESH',
    category: 'ESH',
    description: 'Audit support: collect, index and archive vouchers, contracts and interview notes; maintain the evidence index.',
  },
  {
    code: 'ICS-GDC-ESH-20120',
    name: 'ESH Month-end Closing Support_A&A',
    client: 'ESH',
    category: 'ESH',
    description: 'Month-end close support: accruals, amortisation, intercompany reconciliation and variance commentary for the engagement team.',
  },
  {
    code: 'ICS-GDC-ESH-20130',
    name: 'ESH Engagement File Review_A&A',
    client: 'ESH',
    category: 'ESH',
    description: 'Engagement file review: completeness, sign-off chain and archiving standards; log review notes and track remediation.',
  },
  {
    code: 'ICS-GDC-TAX-30100',
    name: 'Tax Compliance Filing Support_Tax',
    client: 'GDC Tax',
    category: 'Tax',
    description: 'Tax compliance filing support: prepare return data, run cross-checks and archive filing receipts.',
  },
  {
    code: 'ICS-GDC-TAX-30110',
    name: 'Tax Return Data Preparation_Tax',
    client: 'GDC Tax',
    category: 'Tax',
    description: 'Tax return data preparation: reconcile trial balances, invoice details and tax computation workpapers.',
  },
  {
    code: 'ICS-GDC-CON-40100',
    name: 'Consulting Project Delivery_Consulting',
    client: 'Consulting',
    category: 'Consulting',
    description: 'Consulting project delivery: interviews, analysis, report writing and client communication, tracked by workstream.',
  },
  {
    code: 'ICS-GDC-CON-40110',
    name: 'Client Workshop Preparation_Consulting',
    client: 'Consulting',
    category: 'Consulting',
    description: 'Client workshop preparation: agenda, materials, case studies and dry runs, including on-site support.',
  },
  {
    code: 'ICS-GDC-RISK-50100',
    name: 'Risk Advisory Control Testing_Risk',
    client: 'Risk Advisory',
    category: 'Risk Advisory',
    description: 'Internal control testing: sampling, walkthroughs, defect rating and remediation recommendations.',
  },
  {
    code: 'ICS-GDC-ADM-90010',
    name: 'Internal Training & Learning_ADM',
    client: 'GDC Internal',
    category: 'Administration',
    description: 'Internal training and learning: mandatory courses, professional certification hours and knowledge-sharing sessions.',
  },
  {
    code: 'ICS-GDC-ADM-90020',
    name: 'Team Meeting & Administration_ADM',
    client: 'GDC Internal',
    category: 'Administration',
    description: 'Team meetings, weekly status reports, administrative tasks and non-billable support.',
  },
  {
    code: 'ICS-GDC-LV-00010',
    name: 'Annual Leave_ADM',
    client: 'GDC Internal',
    category: 'Leave',
    description: 'Annual leave, counted at 8 hours per day and excluded from overtime.',
  },
  {
    code: 'ICS-GDC-LV-00020',
    name: 'Sick Leave_ADM',
    client: 'GDC Internal',
    category: 'Leave',
    description: 'Sick leave, filed at the actual hours taken and excluded from overtime.',
  },
  {
    code: 'ICS-GDC-LV-00030',
    name: 'Statutory Holiday_ADM',
    client: 'GDC Internal',
    category: 'Leave',
    description: 'Statutory holiday, counted as a standard 8-hour working day.',
  },
];

export interface LocationOption {
  value: string;
  label: string;
}

export const LOCATIONS: LocationOption[] = [
  { value: 'cq', label: 'Chongqing 重庆' },
  { value: 'bj', label: 'Beijing 北京' },
  { value: 'sh', label: 'Shanghai 上海' },
  { value: 'gz', label: 'Guangzhou 广州' },
  { value: 'sz', label: 'Shenzhen 深圳' },
  { value: 'hk', label: 'Hong Kong 香港' },
  { value: 'remote', label: 'Remote 远程' },
];

export const DEFAULT_LOCATION = 'cq';

export function findActivity(code: string): ActivityCode | undefined {
  return ACTIVITIES.find((item) => item.code === code);
}

export function activityLabel(code: string): string {
  const activity = findActivity(code);
  return activity ? `${activity.code} ${activity.name}` : code || '—';
}
