import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MONTHS_LONG, WEEKDAYS_LONG, fromKey } from './lib/date';

export type Lang = 'zh' | 'en';

type Vars = Record<string, string | number>;
type Entry = { zh: string; en: string };

const DICT: Record<string, Entry> = {
  'app.title': { zh: 'Mindigital 服务工时填报系统', en: 'Mindigital Service Timesheet System' },
  'app.subtitle': { zh: 'Mindigital 全球交付中心', en: 'Mindigital Global Delivery Center' },
  'app.day': { zh: '按天', en: 'Day' },
  'app.month': { zh: '按月', en: 'Month' },
  'app.role': { zh: '工时填报用户', en: 'Timesheet user' },
  'app.lang': { zh: '语言', en: 'Language' },
  'login.brandTitle': { zh: 'Mindigital 服务工时填报系统', en: 'Mindigital Service Timesheet System' },
  'login.brandSubtitle': { zh: '全球交付中心 · 内部工时管理', en: 'Global Delivery Center · Internal time management' },
  'login.title': { zh: '登录', en: 'Sign in' },
  'login.subtitle': { zh: '使用企业微信账号，或邮箱密码登录', en: 'Continue with WeCom, or sign in with email and password' },
  'login.button': { zh: '企业微信登录', en: 'Sign in with WeCom' },
  'login.or': { zh: '或', en: 'or' },
  'login.emailPlaceholder': { zh: '邮箱', en: 'Email' },
  'login.passwordPlaceholder': { zh: '密码', en: 'Password' },
  'login.emailButton': { zh: '登录', en: 'Sign in' },
  'login.hint': { zh: '仅限 Mindigital 员工使用', en: 'For Mindigital employees only' },
  'feedback.entry': { zh: '匿名反馈', en: 'Anonymous feedback' },
  'feedback.title': { zh: '匿名反馈', en: 'Anonymous feedback' },
  'feedback.subtitle': {
    zh: '不需要登录，任何人可提交。',
    en: 'No sign-in required. Anyone can submit.',
  },
  'feedback.privacyTitle': { zh: '完全匿名', en: 'Fully anonymous' },
  'feedback.privacyBody': {
    zh: '不记录姓名、工号、账号或联系方式；后台只看到反馈内容、提交时间和处理状态。',
    en: 'No name, employee ID, account, or contact details are stored. Admins only see the message, time, and handling status.',
  },
  'feedback.placeholder': {
    zh: '写下你的建议、问题或想法…',
    en: 'Share a suggestion, problem, or idea…',
  },
  'feedback.submit': { zh: '提交反馈', en: 'Submit feedback' },
  'feedback.sent': { zh: '已收到，感谢反馈。', en: 'Received. Thank you for the feedback.' },

  'menu.export': { zh: '导出 JSON', en: 'Export JSON' },
  'menu.about': { zh: '关于此原型', en: 'About this prototype' },
  'menu.reset': { zh: '重置演示数据', en: 'Reset demo data' },

  'nav.timesheet': { zh: '工时填报', en: 'Timesheet' },
  'nav.admin': { zh: '后台配置', en: 'Admin' },

  'admin.kicker': { zh: '后台配置', en: 'Administration' },
  'admin.title': { zh: '基础数据配置', en: 'Master data' },
  'admin.subtitle': {
    zh: '维护业务线、产品、业务阶段和工作地点。',
    en: 'Maintain business lines, products, stages and work locations.',
  },
  'admin.businessLines': { zh: '业务线', en: 'Business lines' },
  'admin.products': { zh: '产品', en: 'Products' },
  'admin.stages': { zh: '业务阶段', en: 'Business stages' },
  'admin.locations': { zh: '工作地点', en: 'Work locations' },
  'admin.ruleTitle': { zh: '填报规则', en: 'Entry rules' },
  'admin.ruleDesc': {
    zh: '控制用户可补填最近几天的工时；跨月日期始终锁定，不可填写。',
    en: 'Controls how many recent days users can backfill. Dates outside the current month are always locked.',
  },
  'admin.backfillDays': { zh: '可补填天数', en: 'Backfill days' },
  'admin.daysUnit': { zh: '天', en: 'days' },
  'admin.ruleHint': {
    zh: '0 = 仅今天，最大 7 天；按自然日计算。',
    en: '0 = today only, maximum 7 days. Calendar days.',
  },
  'admin.ruleApply': { zh: '应用', en: 'Apply' },
  'admin.rulePending': { zh: '未应用', en: 'Not applied' },
  'admin.ruleConfirmTitle': { zh: '确认修改填报规则？', en: 'Apply entry rule change?' },
  'admin.ruleConfirmBody': {
    zh: '可补填天数将从 {{from}} 天改为 {{to}} 天。跨月日期仍然锁定。',
    en: 'Backfill window will change from {{from}} to {{to}} days. Dates outside the current month remain locked.',
  },
  'admin.alertsTitle': { zh: '告警配置', en: 'Alert settings' },
  'admin.alertsDesc': {
    zh: '选择需要触发的告警类型；达到条件后向填报用户本人发送短信。',
    en: 'Choose alert types. When triggered, an SMS is sent to the timesheet user.',
  },
  'admin.alertsSms': { zh: '短信通知', en: 'SMS notifications' },
  'admin.alertsRecipient': { zh: '发送对象：填报用户本人', en: 'Recipient: the timesheet user' },
  'admin.alertsSchedule': { zh: '每天 18:00 检查并发送', en: 'Checks and sends daily at 18:00' },
  'admin.alertsEnabled': { zh: '已启用 {{n}} 类', en: '{{n}} active' },
  'admin.alertsDaily': { zh: '每天 18:00', en: 'Daily 18:00' },
  'admin.alertsNote': {
    zh: '原型仅保存配置，不实际发送短信；真实网关接入后按此配置执行。',
    en: 'Prototype saves the configuration only; the real SMS gateway will follow it.',
  },
  'alert.missingDays.title': { zh: '连续 N 个工作日未填写工时', en: 'No timesheet for N workdays' },
  'alert.missingDays.desc': {
    zh: '跳过周末和法定节假日；达到阈值后给本人发短信。',
    en: 'Skips weekends and public holidays; sends an SMS to the user at the threshold.',
  },
  'alert.missingToday.title': { zh: '当天未填写工时', en: 'No entry for today' },
  'alert.missingToday.desc': {
    zh: '每天 18:00 检查，当天没有保存记录时提醒。',
    en: 'Checks at 18:00 and reminds when nothing was saved today.',
  },
  'alert.underTargetDays.title': { zh: '连续 N 个工作日工时不足 8 小时', en: 'Under 8 hours for N workdays' },
  'alert.underTargetDays.desc': {
    zh: '按每天实际工时合计判断，跳过周末和节假日。',
    en: 'Uses the daily actual total; skips weekends and holidays.',
  },
  'alert.monthlyLow.title': { zh: '当月完成率低于 X%', en: 'Monthly completion below X%' },
  'alert.monthlyLow.desc': {
    zh: '按应填工作日计算，月中达到阈值即提醒。',
    en: 'Calculated against required workdays; alerts when the threshold is reached mid-month.',
  },
  'alert.daysUnit': { zh: '个工作日', en: 'workdays' },
  'alert.percentUnit': { zh: '%', en: '%' },
  'admin.locationName': { zh: '地点名称', en: 'Location name' },
  'admin.locationSpecial': { zh: '不能包含特殊字符。', en: 'Special characters are not allowed.' },
  'admin.addPlaceholder': { zh: '输入名称后回车', en: 'Type a name and press Enter' },
  'admin.add': { zh: '添加', en: 'Add' },
  'admin.confirmAddTitle': { zh: '确认添加？', en: 'Confirm add?' },
  'admin.confirmAddBody': {
    zh: '将「{{value}}」加入{{title}}。',
    en: 'Add "{{value}}" to {{title}}.',
  },
  'admin.remove': { zh: '删除', en: 'Remove' },
  'admin.duplicate': { zh: '已存在', en: 'Already exists' },
  'admin.atLeastOne': { zh: '至少保留一项', en: 'Keep at least one item' },
  'admin.exportTitle': { zh: '数据导出', en: 'Data export' },
  'admin.exportDesc': {
    zh: '导出当月全部员工明细（CSV，Excel 可直接打开）。',
    en: 'Export all entries for the month as CSV (opens in Excel).',
  },
  'admin.exportBtn': { zh: '导出当月数据（Excel）', en: 'Export month (Excel)' },
  'admin.preview': { zh: '导出预览', en: 'Preview' },
  'admin.empty': { zh: '本月暂无填报数据。', en: 'No entries this month.' },
  'admin.back': { zh: '返回填报', en: 'Back to timesheet' },
  'admin.employeeName': { zh: '吕薇庆', en: 'Lü Weiqing' },
  'admin.employeeId': { zh: 'MG-0001', en: 'MG-0001' },
  'admin.department': { zh: 'Mindigital 全球交付中心', en: 'Mindigital Global Delivery Center' },
  'admin.usersTitle': { zh: '用户管理', en: 'User management' },
  'admin.feedbackTitle': { zh: '匿名反馈', en: 'Anonymous feedback' },
  'admin.feedbackDesc': { zh: '来自登录页的匿名反馈，不含提交人信息。', en: 'Feedback from the sign-in page, with no submitter identity.' },
  'admin.feedbackEmpty': { zh: '还没有收到反馈。', en: 'No feedback yet.' },
  'admin.feedbackTime': { zh: '提交时间', en: 'Submitted' },
  'admin.feedbackContent': { zh: '反馈内容', en: 'Feedback' },
  'admin.feedbackStatus': { zh: '状态', en: 'Status' },
  'admin.feedbackOpen': { zh: '待处理', en: 'Open' },
  'admin.feedbackDone': { zh: '已处理', en: 'Resolved' },
  'admin.feedbackResolve': { zh: '标记已处理', en: 'Mark resolved' },
  'admin.feedbackReopen': { zh: '重新打开', en: 'Reopen' },
  'admin.feedbackDelete': { zh: '删除', en: 'Delete' },
  'admin.addUser': { zh: '新建用户', en: 'New user' },
  'admin.editUser': { zh: '编辑用户', en: 'Edit user' },
  'admin.deleteUser': { zh: '删除', en: 'Delete' },
  'admin.userName': { zh: '姓名', en: 'Name' },
  'admin.userEmployeeId': { zh: '工号', en: 'Employee ID' },
  'admin.userDepartment': { zh: '部门', en: 'Department' },
  'admin.role': { zh: '角色', en: 'Role' },
  'admin.status': { zh: '状态', en: 'Status' },
  'admin.active': { zh: '启用', en: 'Active' },
  'admin.inactive': { zh: '停用', en: 'Disabled' },
  'admin.actions': { zh: '操作', en: 'Actions' },
  'admin.save': { zh: '保存', en: 'Save' },
  'admin.cancel': { zh: '取消', en: 'Cancel' },
  'admin.userSaved': { zh: '用户已保存。', en: 'User saved.' },
  'admin.userDeleted': { zh: '用户已删除。', en: 'User deleted.' },
  'admin.lastAdmin': { zh: '至少保留一名超级管理员。', en: 'Keep at least one super admin.' },
  'admin.duplicateEmployeeId': { zh: '工号已存在。', en: 'Employee ID already exists.' },
  'admin.required': { zh: '姓名和工号不能为空。', en: 'Name and employee ID are required.' },
  'role.employee': { zh: '填报用户', en: 'Timesheet user' },
  'role.super_admin': { zh: '超级管理员', en: 'Super admin' },
  'user.logout': { zh: '退出登录', en: 'Sign out' },
  'user.logoutArm': { zh: '再次点击退出账户', en: 'Click again to sign out' },
  'user.logoutArmDirty': { zh: '未保存修改将丢失，再次点击退出', en: 'Unsaved changes will be lost. Click again to sign out' },
  'col.index': { zh: '序号', en: 'No.' },
  'col.employee': { zh: '员工姓名', en: 'Employee' },
  'col.employeeId': { zh: '员工工号', en: 'Employee ID' },
  'col.department': { zh: '部门', en: 'Department' },
  'col.businessLine': { zh: '业务线', en: 'Business line' },
  'col.product': { zh: '产品', en: 'Product' },
  'col.stage': { zh: '业务阶段', en: 'Stage' },
  'col.date': { zh: '日期', en: 'Date' },
  'col.weekday': { zh: '星期', en: 'Weekday' },
  'col.location': { zh: '工作地点', en: 'Location' },
  'col.status': { zh: '状态', en: 'Status' },
  'col.activity': { zh: '工作项代码', en: 'Work item code' },
  'col.lineHours': { zh: '本行工时', en: 'Line hours' },
  'col.remark': { zh: '备注', en: 'Remark' },
  'col.savedAt': { zh: '保存时间', en: 'Saved at' },

  'banner.reminder': { zh: '提醒：', en: 'Reminder:' },
  'banner.text': {
    zh: 'xxxxxxx',
    en: 'xxxxxxx',
  },
  'banner.period': { zh: '{{month}} · 目标 {{hours}} 小时/天', en: '{{month}} · Target {{hours}} h / day' },

  'cal.week': { zh: '第 {{week}} 周 · {{days}} 个工作日', en: 'Week {{week}} · {{days}} working days' },
  'cal.today': { zh: '今天', en: 'Today' },
  'cal.prev': { zh: '上个月', en: 'Previous month' },
  'cal.next': { zh: '下个月', en: 'Next month' },
  'cal.filled': { zh: '已填', en: 'Filled' },
  'cal.hours': { zh: '工时', en: 'Hours' },
  'cal.cell': { zh: '{{date}} · {{hours}} 小时', en: '{{date}} · {{hours}} h' },
  'cal.cellEmpty': { zh: '{{date}} · 无记录', en: '{{date}} · no entry' },
  'cal.cellLocked': { zh: '{{date}} · 已锁定，需 OA 审批', en: '{{date}} · locked, OA approval required' },

  'legend.unfinished': { zh: '未填写', en: 'Not filled' },
  'legend.partial': { zh: '部分', en: 'Partial' },
  'legend.completed': { zh: '已完成', en: 'Completed' },
  'legend.today': { zh: '今天', en: 'Today' },
  'legend.selected': { zh: '选中', en: 'Selected' },
  'legend.locked': { zh: '已锁定', en: 'Locked' },

  'status.empty': { zh: '未填写', en: 'Not filled' },
  'status.partial': { zh: '部分填写', en: 'Partial' },
  'status.complete': { zh: '已完成', en: 'Completed' },
  'status.locked': { zh: '已锁定', en: 'Locked' },

  'editor.kicker': { zh: '每日填报', en: 'Daily entry' },
  'editor.clear': { zh: '清空当天', en: 'Clear day' },
  'th.activity': { zh: '工作项', en: 'Work item' },
  'th.pending': { zh: '待填报项', en: 'Pending entry' },
  'th.remark': { zh: '备注', en: 'Remark' },
  'th.operation': { zh: '操作', en: 'Operation' },
  'field.workLocation': { zh: '工作地点', en: 'Work Location' },
  'field.targetHours': { zh: '目标工时', en: 'Target Hours' },
  'field.totalHours': { zh: '实际工时合计', en: 'Total Actual Hours' },
  'field.remarkPlaceholder': { zh: '选填备注', en: 'Optional remark' },
  'field.hoursAria': { zh: '第 {{n}} 行工时', en: 'Line {{n}} hours' },
  'field.remarkAria': { zh: '第 {{n}} 行备注', en: 'Line {{n}} remark' },
  'btn.addLine': { zh: '添加工作项行', en: 'Add work item' },
  'btn.removeLine': { zh: '删除这一行', en: 'Remove line' },
  'btn.copyActivity': { zh: '复制工作项名称', en: 'Copy work item' },
  'btn.copied': { zh: '已复制', en: 'Copied' },
  'empty.lines': {
    zh: '还没有工作项行，点左下角 + 添加。',
    en: 'No work item lines yet — use + to add one.',
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
  'ws.filled': { zh: '{{workdays}} 个工作日中已填 {{filled}} 天', en: '{{filled}} of {{workdays}} weekdays filled' },
  'ws.remaining': { zh: '剩余 {{hours}} 小时', en: 'Remaining {{hours}} h' },

  'mix.kicker': { zh: '工时构成', en: 'Work item mix' },
  'mix.month': { zh: '本月', en: 'this month' },
  'mix.empty': {
    zh: '本月还没有记录，保存一天后就能看到构成。',
    en: 'No entries yet — save a day to see the breakdown.',
  },

  'foot.changeDay': { zh: '切换日期', en: 'change day' },
  'foot.save': { zh: '保存', en: 'save' },

  'discard.title': { zh: '保存修改？', en: 'Save changes?' },
  'discard.subtitle': { zh: '{{date}}', en: '{{date}}' },
  'discard.body': {
    zh: '即将{{action}}。',
    en: 'You are about to {{action}}.',
  },
  'action.switch': { zh: '切换到 {{date}}', en: 'switch to {{date}}' },
  'action.month': { zh: '切换月份', en: 'change month' },
  'action.today': { zh: '回到今天', en: 'jump to today' },
  'btn.saveAndSwitch': { zh: '保存并切换', en: 'Save & switch' },
  'btn.discard': { zh: '放弃修改', en: 'Discard changes' },

  'approval.title': { zh: '企业微信 OA 审批流', en: 'WeCom OA approval' },
  'approval.subtitle': { zh: '{{date}} 已超出可编辑范围', en: '{{date}} is outside the editable window' },
  'approval.body': {
    zh: '通过后即可修改该日工时。',
    en: 'Once approved, you can edit that day.',
  },
  'approval.confirm': { zh: '发起审批', en: 'Start approval' },
  'toast.approval': { zh: '已发起企业微信 OA 审批流。', en: 'WeCom OA approval started.' },
  'future.title': { zh: '不能填写下月工时', en: 'Next month is not editable' },
  'future.body': {
    zh: '{{date}} 属于下个月，请下月再填报。',
    en: '{{date}} is next month — please fill it then.',
  },
  'future.confirm': { zh: '知道了', en: 'Got it' },

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

  'about.title': { zh: 'Mindigital 服务工时填报系统', en: 'Mindigital Service Timesheet System' },
  'about.subtitle': { zh: '高保真原型 · React + Vite · GitHub Pages', en: 'High-fidelity prototype · React + Vite · GitHub Pages' },
  'about.body': {
    zh: 'Mindigital GDC 工时填报的可交互复刻。数据仅存当前页面，刷新即重置。',
    en: 'A working reproduction of the Mindigital GDC timesheet. Data lives in page memory only and resets on reload.',
  },
  'btn.close': { zh: '关闭', en: 'Close' },

  'detail.title': { zh: '工作项详情', en: 'Work item detail' },
  'detail.subtitle': { zh: '{{date}} · {{hours}} 小时', en: '{{date}} · {{hours}} h' },
  'detail.code': { zh: '工作项代码', en: 'Work item code' },
  'detail.name': { zh: '工作项名称', en: 'Work item name' },
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
  'toast.noCode': { zh: '请先选择工作项代码再预填一周。', en: 'Select a work item code before prefilling the week.' },
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
  'err.lineCode': { zh: '第 {{n}} 行：请选择工作项代码。', en: 'Line {{n}}: select a work item code.' },
  'err.lineHours': { zh: '第 {{n}} 行：已选工作项需填写工时。', en: 'Line {{n}}: enter hours for the selected work item.' },
  'err.totalOver': {
    zh: '当天实际工时合计不能超过 {{max}} 小时。',
    en: 'Total actual hours cannot exceed {{max}} hours per day.',
  },
};

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // 每次进入默认英文；右上角可切中文，但刷新后回到英文。
  const [lang, setLangState] = useState<Lang>('en');

  const setLang = (next: Lang) => {
    setLangState(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? 'Mindigital 服务工时填报系统 · ICS' : 'Mindigital Service Timesheet System · ICS';
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
