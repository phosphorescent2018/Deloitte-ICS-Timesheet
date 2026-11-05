import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MONTHS_LONG, WEEKDAYS_LONG, fromKey } from './lib/date';

export type Lang = 'zh' | 'en';

type Vars = Record<string, string | number>;
type Entry = { zh: string; en: string };

const DICT: Record<string, Entry> = {
  'app.title': { zh: '内部客户服务工时表', en: 'Internal Client Service Timesheet' },
  'app.subtitle': { zh: '德勤全球交付中心 · 重庆', en: 'Deloitte Global Delivery Center · Chongqing' },
  'app.day': { zh: '按天', en: 'Day' },
  'app.month': { zh: '按月', en: 'Month' },
  'app.role': { zh: '工时填报用户', en: 'Timesheet user' },
  'app.lang': { zh: '语言', en: 'Language' },

  'menu.export': { zh: '导出 JSON', en: 'Export JSON' },
  'menu.about': { zh: '关于此原型', en: 'About this prototype' },
  'menu.reset': { zh: '重置演示数据', en: 'Reset demo data' },

  'banner.reminder': { zh: '提醒：', en: 'Reminder:' },
  'banner.text': {
    zh: '历史工时仅允许填写和修改最近 3 天（含当天）的数据，更早日期需发起企业微信 OA 审批流。',
    en: 'timesheets can only be created or edited within the last 3 days (including today); earlier dates require a WeCom OA approval.',
  },
  'banner.period': { zh: '{{month}} · 目标 {{hours}} 小时/天', en: '{{month}} · Target {{hours}} h / day' },

  'cal.week': { zh: '第 {{week}} 周 · 5 个工作日', en: 'Week {{week}} · 5 working days' },
  'cal.today': { zh: '今天', en: 'Today' },
  'cal.prev': { zh: '上个月', en: 'Previous month' },
  'cal.next': { zh: '下个月', en: 'Next month' },
  'cal.filled': { zh: '已填', en: 'Filled' },
  'cal.hours': { zh: '工时', en: 'Hours' },
  'cal.cell': { zh: '{{date}} · {{hours}} 小时', en: '{{date}} · {{hours}} h' },
  'cal.cellEmpty': { zh: '{{date}} · 无记录', en: '{{date}} · no entry' },
  'cal.cellLocked': { zh: '{{date}} · 已锁定，需 OA 审批', en: '{{date}} · locked, OA approval required' },

  'legend.unfinished': { zh: '未完成', en: 'Unfinished' },
  'legend.partial': { zh: '部分', en: 'Partial' },
  'legend.completed': { zh: '已完成', en: 'Completed' },
  'legend.today': { zh: '今天', en: 'Today' },
  'legend.selected': { zh: '选中', en: 'Selected' },
  'legend.locked': { zh: '已锁定', en: 'Locked' },

  'status.empty': { zh: '未完成', en: 'Unfinished' },
  'status.partial': { zh: '部分填写', en: 'Partial' },
  'status.complete': { zh: '已完成', en: 'Completed' },
  'status.locked': { zh: '已锁定', en: 'Locked' },

  'editor.kicker': { zh: '每日填报', en: 'Daily entry' },
  'editor.clear': { zh: '清空当天', en: 'Clear day' },
  'th.activity': { zh: '活动', en: 'Activity' },
  'th.client': { zh: '客户名称', en: 'Client Name' },
  'th.remark': { zh: '备注', en: 'Remark' },
  'th.operation': { zh: '操作', en: 'Operation' },
  'field.workLocation': { zh: '工作地点', en: 'Work Location' },
  'field.targetHours': { zh: '目标工时', en: 'Target Hours' },
  'field.totalHours': { zh: '实际工时合计', en: 'Total Actual Hours' },
  'field.remarkPlaceholder': { zh: '选填备注', en: 'Optional remark' },
  'field.hoursAria': { zh: '第 {{n}} 行工时', en: 'Line {{n}} hours' },
  'field.remarkAria': { zh: '第 {{n}} 行备注', en: 'Line {{n}} remark' },
  'btn.addLine': { zh: '添加活动行', en: 'Add activity line' },
  'btn.removeLine': { zh: '删除这一行', en: 'Remove line' },
  'empty.lines': {
    zh: '还没有活动行，点左下角的绿色加号添加一行。',
    en: 'No activity lines yet — add one to start filling this day.',
  },
  'foot.lastSaved': { zh: '上次保存 {{time}}', en: 'Last saved {{time}}' },
  'foot.notSaved': { zh: '尚未保存', en: 'Not saved yet' },
  'foot.summary': { zh: '{{total}} / {{target}} 小时', en: '{{total}} / {{target}} h' },
  'foot.unsaved': { zh: '有未保存修改', en: 'Unsaved changes' },
  'btn.prefill': { zh: '预填一周', en: 'Prefill one week' },
  'btn.copyLast': { zh: '复制上一天', en: 'Copy last day' },
  'btn.save': { zh: '保存', en: 'Save' },

  'picker.placeholder': { zh: '选择业务线-产品-业务阶段…', en: 'Select business line / product / stage…' },
  'picker.search': { zh: '搜索业务线、产品或阶段…', en: 'Search business line, product or stage…' },
  'picker.empty': { zh: '没有匹配“{{query}}”的选项。', en: 'No option matches “{{query}}”.' },
  'picker.clear': { zh: '清空搜索', en: 'Clear' },

  'mv.kicker': { zh: '月度概览', en: 'Month overview' },
  'mv.summary': {
    zh: '{{done}} / {{workdays}} 个工作日已完成',
    en: '{{done}} of {{workdays}} working days completed',
  },
  'mv.hint': { zh: '点击任意一行可回到当天填报。', en: 'Click any row to open that day in the daily editor.' },
  'mv.hours': { zh: '工时', en: 'Hours' },
  'mv.completion': { zh: '完成度', en: 'Completion' },
  'th.date': { zh: '日期', en: 'Date' },
  'th.weekday': { zh: '星期', en: 'Day' },
  'th.location': { zh: '地点', en: 'Location' },
  'th.status': { zh: '状态', en: 'Status' },

  'ws.kicker': { zh: '本周一览', en: 'Week at a glance' },
  'ws.title': { zh: '第 {{week}} 周 · {{range}}', en: 'Week {{week}} · {{range}}' },
  'ws.target': { zh: '/ 40 小时目标', en: '/ 40 h target' },
  'ws.filled': { zh: '5 个工作日中已填 {{filled}} 天', en: '{{filled}} of 5 weekdays filled' },
  'ws.remaining': { zh: '剩余 {{hours}} 小时', en: 'Remaining {{hours}} h' },

  'mix.kicker': { zh: '工时构成', en: 'Activity mix' },
  'mix.title': { zh: '工时都花在哪', en: 'Where the hours went' },
  'mix.month': { zh: '本月', en: 'this month' },
  'mix.empty': {
    zh: '本月还没有记录，保存一天后就能看到构成。',
    en: 'No entries yet — save a day to see the breakdown.',
  },

  'foot.note': {
    zh: '原型演示 · 所有记录只保存在本机浏览器。',
    en: 'Prototype · All entries are stored locally in this browser.',
  },
  'foot.changeDay': { zh: '切换日期', en: 'change day' },
  'foot.save': { zh: '保存', en: 'save' },

  'discard.title': { zh: '放弃未保存的修改？', en: 'Discard unsaved changes?' },
  'discard.subtitle': { zh: '{{date}} 的修改尚未保存。', en: 'Your edits to {{date}} have not been saved.' },
  'discard.body': {
    zh: '即将{{action}}，未保存的工时将丢失；如需保留请先保存。',
    en: 'You are about to {{action}}. Unsaved time will be lost — save first if you want to keep it.',
  },
  'action.switch': { zh: '切换到 {{date}}', en: 'switch to {{date}}' },
  'action.month': { zh: '切换月份', en: 'change month' },
  'action.today': { zh: '回到今天', en: 'jump to today' },
  'btn.keepEditing': { zh: '继续编辑', en: 'Keep editing' },
  'btn.discard': { zh: '放弃修改', en: 'Discard changes' },

  'approval.title': { zh: '企业微信 OA 审批流', en: 'WeCom OA approval' },
  'approval.subtitle': { zh: '{{date}} 已超出可编辑范围', en: '{{date}} is outside the editable window' },
  'approval.body': {
    zh: '历史工时仅允许填写和修改最近 3 天（含当天）的数据。继续将发起企业微信 OA 审批流，审批通过后才能修改 {{date}} 的工时。',
    en: 'Timesheets can only be created or edited within the last 3 days (including today). Continuing will start a WeCom OA approval; once approved you can edit the hours for {{date}}.',
  },
  'approval.confirm': { zh: '发起审批', en: 'Start approval' },
  'toast.approval': { zh: '已发起企业微信 OA 审批流（演示）。', en: 'WeCom OA approval started (demo).' },

  'reset.title': { zh: '重置演示数据？', en: 'Reset demo data?' },
  'reset.subtitle': {
    zh: '会清空本浏览器内的全部记录，并恢复演示周。',
    en: 'This clears every entry in this browser and restores the seeded week.',
  },
  'reset.body': {
    zh: '演示数据包含周一到周五的填报，每天 8 小时。',
    en: 'The seeded week contains Monday to Friday entries of 8 hours each, so the calendar shows every state at a glance.',
  },
  'btn.cancel': { zh: '取消', en: 'Cancel' },
  'btn.reset': { zh: '重置数据', en: 'Reset data' },

  'about.title': { zh: '内部客户服务工时表', en: 'Internal Client Service Timesheet' },
  'about.subtitle': { zh: '高保真原型 · React + Vite · GitHub Pages', en: 'High-fidelity prototype · React + Vite · GitHub Pages' },
  'about.body': {
    zh: '德勤 GDC 内部工时填报的可交互复刻：月历状态、每日工时明细、活动代码、工作地点与目标工时，以及预填一周、复制上一天、保存等操作。数据保存在浏览器 localStorage，刷新不丢。',
    en: 'A working reproduction of the Deloitte GDC internal timesheet: month calendar with status colours, daily entry sheet with activity codes, work location and target hours, plus prefill and copy actions. Data is persisted in localStorage, so a reload keeps your entries.',
  },
  'btn.close': { zh: '关闭', en: 'Close' },

  'detail.title': { zh: '活动详情', en: 'Activity detail' },
  'detail.subtitle': { zh: '{{date}} · {{hours}} 小时', en: '{{date}} · {{hours}} h' },
  'detail.code': { zh: '活动代码', en: 'Activity code' },
  'detail.name': { zh: '活动名称', en: 'Activity name' },
  'detail.client': { zh: '客户', en: 'Client' },
  'detail.category': { zh: '类别', en: 'Category' },
  'detail.note': { zh: '备注（随本行一起保存）', en: 'Note (saved with this line)' },
  'detail.notePlaceholder': {
    zh: '填写审阅说明，例如账单批次号或凭证编号…',
    en: 'Add context for reviewers, e.g. billing batch number or evidence reference…',
  },
  'detail.noDescription': { zh: '暂无说明', en: 'No description available.' },
  'btn.done': { zh: '完成', en: 'Done' },

  'toast.saved': { zh: '{{date}} 已保存 · {{hours}} 小时', en: '{{date}} saved · {{hours}} h' },
  'toast.fixIssues': { zh: '请先修正下方的问题再保存。', en: 'Please fix the issues below before saving.' },
  'toast.prefillDone': {
    zh: '已预填 {{count}} 个工作日（{{dates}}）{{skipped}}',
    en: 'Prefilled {{count}} weekday(s) ({{dates}}){{skipped}}',
  },
  'toast.prefillSkipped': { zh: ' · 跳过 {{count}} 天已有记录', en: ' · skipped {{count}} existing' },
  'toast.weekFull': { zh: '本周已填满，无需预填。', en: 'This week is already filled — nothing to prefill.' },
  'toast.noCode': { zh: '请先选择活动代码再预填一周。', en: 'Select an activity code before prefilling the week.' },
  'toast.copied': {
    zh: '已复制 {{date}}（{{hours}} 小时），请确认后保存。',
    en: 'Copied {{date}} ({{hours}} h) — review and save.',
  },
  'toast.noPrevious': { zh: '前 90 天没有可复制的记录。', en: 'No earlier entry found in the previous 90 days.' },
  'toast.cleared': { zh: '已清空当天内容，保存后生效。', en: 'Entry cleared — save to apply.' },
  'toast.reset': { zh: '演示数据已恢复。', en: 'Demo data restored.' },
  'toast.exported': { zh: '已导出 JSON 文件。', en: 'Timesheet JSON exported.' },

  'cat.UG': { zh: 'UG 业务线', en: 'UG' },
  'cat.CDI': { zh: 'CDI 业务线', en: 'CDI' },
  'cat.GH': { zh: 'GH 业务线', en: 'GH' },

  'err.targetMin': { zh: '目标工时必须大于 0。', en: 'Target hours must be greater than 0.' },
  'err.lineNegative': { zh: '第 {{n}} 行：工时不能为负数。', en: 'Line {{n}}: hours cannot be negative.' },
  'err.lineCode': { zh: '第 {{n}} 行：请选择活动代码。', en: 'Line {{n}}: select an activity code.' },
  'err.lineHours': { zh: '第 {{n}} 行：已选活动需填写工时。', en: 'Line {{n}}: enter hours for the selected activity.' },
  'err.totalOver': {
    zh: '当天工时合计 {{total}} 小时，不能超过 {{target}} 小时。',
    en: 'Total hours ({{total}}) cannot exceed {{target}} hours per day.',
  },
  'err.totalMin': { zh: '至少填写 0.5 小时后再保存。', en: 'Enter at least 0.5 hour before saving.' },
};

const LANG_STORAGE_KEY = 'deloitte-ics-timesheet.lang';

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '内部客户服务工时表 · ICS' : 'Internal Client Service Timesheet · ICS';
  }, [lang]);

  const t = (key: string, vars?: Vars) => {
    const entry = DICT[key];
    const template = entry ? entry[lang] : key;
    if (!vars) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
      vars[name] === undefined ? '' : String(vars[name]),
    );
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

const CN_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const CN_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export function weekdayLabels(lang: Lang): string[] {
  return lang === 'zh' ? CN_WEEKDAYS : WEEKDAYS_SHORT_EN;
}

const WEEKDAYS_SHORT_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function formatMonth(year: number, month: number, lang: Lang): string {
  return lang === 'zh' ? `${year}年${CN_MONTHS[month]}` : `${MONTHS_LONG[month]} ${year}`;
}

export function formatLongDate(key: string, lang: Lang): string {
  const date = fromKey(key);
  if (lang === 'zh') {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${CN_WEEKDAYS[date.getDay()]}`;
  }
  return `${WEEKDAYS_LONG[date.getDay()]}, ${MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

export function formatWeekdayShort(key: string, lang: Lang): string {
  return weekdayLabels(lang)[fromKey(key).getDay()];
}

export function formatWeekRange(start: Date, end: Date, lang: Lang): string {
  if (lang === 'zh') {
    return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
  }
  return `${MONTHS_LONG[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS_LONG[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
}

export function formatMonthShort(month: number, lang: Lang): string {
  return lang === 'zh' ? CN_MONTHS[month] : MONTHS_LONG[month].slice(0, 3);
}
