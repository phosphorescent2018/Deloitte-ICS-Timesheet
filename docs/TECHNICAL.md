# Mindigital 服务工时表 · 技术文档

> 项目：`ics-timesheet`（Mindigital GDC Internal Client Service Timesheet 高保真原型）
> 形态：独立 Axhub Make 项目 + 纯静态站点（GitHub Pages）
> 文档更新时间：2026-11

---

## 1. 项目概览

本项目复刻 Mindigital（原德勤）GDC 内部工时系统 `Internal Client Service Timesheet` 的核心填报流程：

- 月历查看本月填报状态，支持按天 / 按月两种视图
- 每日按「业务线-产品-业务阶段」录入多行工时
- `Prefill one week` / `Copy last day` / `Save` 三个高效录入动作
- 后台维护业务线、产品、业务阶段，并导出当月全部填报明细

**定位：纯前端交互原型。** 没有后端、没有真实登录、没有真实审批流；所有业务数据只存在当前页面的 React state 中，刷新即重置为演示数据。这一点是刻意设计，便于演示和评审时每次回到干净状态。

线上演示：<https://phosphorescent2018.github.io/Deloitte-ICS-Timesheet/>

---

## 2. 技术栈

| 层 | 选型 | 版本 |
| --- | --- | --- |
| UI | React | 18.2.0 |
| 语言 | TypeScript（strict） | 5.9.x |
| 构建 | Vite | 5.4.x |
| 样式 | 原生 CSS（CSS Variables + BEM 风格类名） | — |
| 图标 | 内联 SVG（`ui.tsx` 的 `Icon` 对象） | — |
| 部署 | GitHub Actions + GitHub Pages | — |
| 宿主 | Axhub Make Client | template 0.1.18 |

没有使用 UI 组件库、路由库、状态管理库。页面切换、弹窗、Toast、下拉选择器均为手写实现，目的是让原型视觉与交互完全可控。

---

## 3. 本地运行与构建

```bash
npm install         # 安装依赖
npm run dev         # 启动开发服务器 http://127.0.0.1:5178
npm run typecheck   # TypeScript 全量类型检查
npm run build       # 类型检查 + 生产构建，产物在 dist/
npm run preview     # 预览构建产物
```

`npm run dev` 实际执行：

```bash
node scripts/sync-project-metadata.mjs && vite
```

即先同步 Axhub Make 元数据，再启动 Vite。这是 Axhub Make 客户端识别项目的必要步骤，详见第 12 节。

---

## 4. 目录结构

```
ics-timesheet/
├── index.html                        # 静态站点 HTML 入口
├── package.json                      # 脚本与依赖
├── vite.config.ts                    # Vite 配置（base './'、端口 5178、Axhub 插件）
├── tsconfig.json                     # TypeScript 配置（strict）
├── src/
│   ├── main.tsx                      # React 挂载入口
│   └── prototypes/timesheet/
│       ├── index.tsx                 # Axhub Make 原型入口（default export）
│       ├── TimesheetApp.tsx          # 根组件：全局状态、页面切换、保存/预填/复制、弹窗
│       ├── Calendar.tsx              # 月历（6×7 网格、状态色、节假日标记）
│       ├── DayEditor.tsx             # 每日填报明细表（活动、工时、备注、增删行）
│       ├── ActivityPicker.tsx        # 可搜索的活动代码选择器
│       ├── MonthView.tsx             # 月视图（按天列表）
│       ├── AdminPage.tsx             # 后台配置：基础数据、用户、导出
│       ├── ui.tsx                    # Icon / Modal / Toast / StatusPill 等通用件
│       ├── i18n.tsx                  # 中英文词典与语言上下文
│       ├── timesheet.css             # 全部样式
│       ├── assets/mindigital-mark.svg
│       └── lib/
│           ├── date.ts               # 日期解析、格式化、周计算、可编辑范围判定
│           ├── holidays.ts           # 2026 年法定节假日、调休上班日、isWorkday
│           ├── model.ts              # 数据模型、状态判定、校验、月度统计
│           ├── config.ts             # 业务线/产品/阶段配置与组合生成
│           ├── users.ts              # 默认用户、角色、ID 生成
│           ├── catalog.ts            # 办公地点默认值与显示标签
│           └── storage.ts            # 演示数据生成（刷新即重置）
├── scripts/sync-project-metadata.mjs # 扫描原型入口，生成 Axhub 元数据
├── vite-plugins/axhub-dev-server-info.ts # 写入 .dev-server-info.json + /api/health
├── .axhub/make/                      # Axhub Make 项目身份与清单
├── .github/workflows/deploy-pages.yml
├── docs/preview.png
├── docs/TECHNICAL.md                 # 本文档
└── README.md                         # 产品与使用说明
```

---

## 5. 总体架构

```
main.tsx
  └── <I18nProvider>
        └── <TimesheetApp>                         ← 唯一状态容器
              ├── Topbar（品牌、Day/Month、语言、后台入口）
              ├── Calendar（月历）
              ├── DayEditor（当天明细，操作 draft）
              ├── MonthView（按月列表）
              └── AdminPage（config / users / export）
```

数据流：

```
seedState() ──► state（已保存数据）
                  │
                  ├─► Calendar / MonthView   （只读）
                  ├─► AdminPage（只读 days，读写 config / users）
                  └─► draft（当天编辑副本）
                          │  DayEditor 修改
                          ▼
                       Save ──► validateDay ──► setState + persist
```

关键设计：

1. **单一状态容器**：`TimesheetApp` 持有 `state`（已保存数据）与 `draft`（正在编辑的当天副本），子组件全部通过 props 接收数据与回调，不引入 Context 之外的全局状态。
2. **编辑副本**：切换日期或月份前若 `dirty === true`，会弹「未保存修改」确认框，避免误丢编辑内容。
3. **保存即快照**：`Save` 把 `draft` 写回 `state.days[date]` 并更新 `savedAt`，日历与统计同步刷新。

---

## 6. 数据模型

定义在 `lib/model.ts`：

```ts
interface ActivityLine {
  id: string;        // 行唯一 ID
  code: string;      // 活动代码：业务线-产品-业务阶段
  hours: number;     // 本行工时
  remark: string;    // 行备注
  note: string;      // 单据备注（历史字段，当前 UI 不再提供入口）
}

interface DayRecord {
  date: string;      // yyyy-mm-dd
  location: string;  // 办公地点 key
  target: number;    // 目标工时，固定 8
  lines: ActivityLine[];
  savedAt: string | null; // 最后保存时间（ISO）；null = 未保存
}

interface AppState {
  version: number;   // 1
  days: Record<string, DayRecord>; // key = yyyy-mm-dd
  defaultLocation: string;         // 默认 cq
  defaultTarget: number;           // 8
}
```

辅助类型：

```ts
type DayStatus = 'empty' | 'partial' | 'complete';

interface MonthStats {
  workdays: number;     // 当月工作日（含调休上班日，排除法定节假日）
  filledDays: number;   // 有工时的天数
  hours: number;        // 当月总工时
  overtime: number;     // 加班统计（历史字段，当前界面未展示）
  targetHours: number;  // workdays × 8
  completeDays: number; // 状态为 complete 的天数
}
```

### 默认演示数据

`seedState()` 生成本周（周一至周日）内所有**工作日**的记录，每天 8 小时：

| 星期 | 活动 | 工时 | 备注 |
| --- | --- | --- | --- |
| 周一 | `UG-OD-运营` + `UG-OD-交付` | 4 + 4 | — |
| 周二 | `CDI-OD-运营` | 8 | Billing batch #2410-03 |
| 周三 | `GH-OD-运营` | 8 | — |
| 周四 | `UG-AirtimeLending-运营` | 8 | — |
| 周五 | `CDI-BL-交付` | 8 | Evidence index hand-off |

若本周含法定节假日，该天会被跳过；若含调休上班日（周末），会补入一条 8 小时记录。

---

## 7. 核心业务规则

### 7.1 可编辑范围

日期分三类，判定函数为 `lib/date.ts` 的 `isLockedKey(key, todayKey)` 与 `isFutureMonthKey(key, todayKey)`：

| 日期范围 | 是否可编辑 | 点击行为 |
| --- | --- | --- |
| 今天及前 2 天（含当天，共 3 天） | ✅ | 正常打开编辑器 |
| 本月内晚于今天的日期 | ✅ | 正常打开编辑器（可提前填报） |
| 早于「今天 − 2 天」的日期 | ❌ | 弹窗「企业微信 OA 审批流」 |
| 下个月及以后的所有日期 | ❌ | 弹窗「不能填写下月工时」 |

实现要点：

- `editableFromKey(todayKey)` = 今天减 2 天，是历史窗口起点。
- `isFutureMonthKey` 用「当月最后一天」作为上界，因此跨年、跨月都成立。
- 日历、周视图、月视图、`Prefill one week` 全部复用同一套判定，避免边界不一致。
- 保存入口 `saveDay` 会再次调用 `isLockedKey` 兜底，防止通过非正常路径写入锁定日期。

### 7.2 校验规则

`validateDay(day)` 返回 `ValidationIssue[]`，由 `TimesheetApp` 转成 i18n 文案展示：

| 规则 | 错误文案（中文） | i18n key |
| --- | --- | --- |
| 单行工时 < 0 | 第 N 行：工时不能为负数。 | `err.lineNegative` |
| 填了工时但没选活动代码 | 第 N 行：请选择活动代码。 | `err.lineCode` |
| 选了活动代码但工时为 0 | 第 N 行：已选活动需填写工时。 | `err.lineHours` |
| 当天合计 > 24 小时（每日上限） | 当天实际工时合计不能超过 24 小时。 | `err.totalOver` |
| 目标工时 ≤ 0 | 目标工时必须大于 0。 | `err.targetMin` |

其他约定：

- **允许保存空内容**：所有行工时为 0 时也可以保存，保存后该天进入「未填写」红色提醒状态。
- **输入框允许输入负数**：负数是合法文本，只有点击保存时才触发校验并阻断，便于用户看到明确报错。
- **目标工时固定 8.0**：`Target Hours` 为只读展示，不提供输入控件；`Total Actual Hours` 只读汇总。

### 7.3 日状态判定与配色

```ts
statusOf(day):
  total = Σ line.hours
  total <= 0            → 'empty'
  total >= day.target   → 'complete'
  0 < total < target    → 'partial'
```

| 状态 | 含义 | 背景 | 边框 | 文字 |
| --- | --- | --- | --- | --- |
| `empty` + 可填窗口内 | 未填写（提醒） | `#fdecea` | `#e57373` | `#b3261e` |
| `partial` | 部分填写 | `#fdf1cf` | `#e8cf8a` | `#7a5a00` |
| `complete` | 已完成 | `#43a047` | `#3d9442` | `#ffffff` |
| `locked` | 已锁定 | `#eef1f4` | `#dde2e7` | `#a2acb5` |
| 今天 | 日号下方红点 | — | — | `#e53935` |
| 选中 | 蓝色描边 | — | `#1565c0` | — |
| 节假日 | 左上角「休」 | `#fff8f4` | `#f0d2c4` | `#b3261e` |
| 调休上班 | 左上角「班」 | `#f2f9fd` | `#cfe3f0` | `#1d5f8f` |

> 只有「今天 − 2 天 ～ 今天」这段窗口内未填写的日子才会标红；本月未来日期虽然可填，但不会提前显示红色提醒。

### 7.4 工作日与法定节假日

`lib/holidays.ts` 内置 2026 年国务院节假日安排：

- `HOLIDAYS_2026`：33 天法定节假日（含调休后的连续假期）
- `MAKEUP_WORKDAYS_2026`：6 天调休上班日（周末但需要上班）
- `isWorkday(date)`：调休上班日 → `true`；法定节假日 → `false`；否则按周一至周五判断

影响范围：

- 月历标签「休 / 班」
- `monthStats().workdays` 与 `targetHours`
- 「未填写」红色提醒只在工作日出现
- `Prefill one week` 只填工作日
- 周标题「第 N 周 · X 个工作日」动态计算

新增年份时，只需在 `holidays.ts` 追加对应的 `HOLIDAYS_2027` / `MAKEUP_WORKDAYS_2027`，并把 `holidayInfo`、`makeupWorkdayInfo`、`isWorkday` 改为按年份查表即可。

### 7.5 三个核心动作

**Prefill one week**

1. 模板来源：当前 `draft` 中带活动代码的行；若当前表单完全没有行，则向前最多 30 天查找最近一条有工时的记录，按目标工时 8 小时等比缩放并抹平 0.5 小时误差。
2. 目标日期：当前选中日期所在周的周一至周五，过滤掉锁定日期与节假日。
3. 已有工时（> 0）的日期自动跳过。
4. 直接写入 `state` 并标记 `savedAt = now`，Toast 汇总「已预填 N 天 / 跳过 M 天」。

**Copy last day**

1. 从选中日期向前最多回溯 90 天，找到最近一条工时 > 0 的记录。
2. 复制为当前日期的 `draft`，`savedAt = null`，`dirty = true`。
3. 仅修改编辑区，不写入 `state`；需要用户确认后手动 `Save`。

**Save**

1. `validateDay(draft)`，有错误则展示问题列表并中止。
2. `state.days[draft.date] = draft`，`savedAt = now`。
3. `dirty = false`，刷新日历 / 周 / 月统计，Toast「已保存」。
4. 支持 `⌘/Ctrl + S` 快捷键。

### 7.6 未保存改动保护

`guard(label, action)` 在 `dirty === true` 时弹出确认框：

- 「保存并切换」→ 先校验并保存当前天，保存成功后执行原动作；校验失败则关闭弹窗、在编辑区展示错误
- 「放弃修改」→ 执行原动作，丢弃 `draft`
- 点弹窗外、右上角关闭或按 Esc → 留在当前页（等同于继续编辑，因此不再单独放按钮）

会触发保护的入口：切换日期、切换月份、`Today`、切换到后台、切换 Day/Month 视图。

### 7.7 键盘快捷键

| 快捷键 | 行为 |
| --- | --- |
| `←` / `→` | 上一天 / 下一天（受可编辑范围与未保存保护约束） |
| `⌘ + S` / `Ctrl + S` | 保存当前天 |

---

## 8. 组件说明

| 组件 | 职责 | 关键 props / 行为 |
| --- | --- | --- |
| `TimesheetApp` | 全局状态、业务流程、弹窗编排 | `state`、`draft`、`config`、`page`、`mode`、`view` |
| `Calendar` | 6×7 月历 | `year/month`、`selectedKey`、`todayKey`、`editableFrom`、`days`、`onSelect/onPrev/onNext/onToday` |
| `DayEditor` | 当日明细表 | `draft`、`activities`、`issues`、`onLineChange`、`onAddLine`、`onRemoveLine`、`onSave`、`onPrefill`、`onCopyLast` |
| `ActivityPicker` | 可搜索下拉 | `activities`、`value`、`onChange`；按业务线分组，支持键盘与搜索 |
| `MonthView` | 按月表格 | `year/month`、`days`、`stats`、`onSelect` |
| `AdminPage` | 基础数据 / 用户 / 导出 | `config`、`activities`、`days`、`year/month`、`onChange`、`onBack` |
| `ui.tsx` | `Icon`、`Modal`、`Toast`、`StatusPill` | 纯展示组件 |

`DayEditor` 的列结构：Activity / 日期列（`MM/DD`）/ Remark / Operation。Operation 列只保留红色删除按钮；Activity 选择器右侧有复制图标（复制活动代码，成功后短暂变绿勾）；客户名称列与活动详情弹窗已在迭代中移除。

---

## 9. 国际化（i18n）

- 词典：`i18n.tsx` 的 `DICT`，key → `{ zh, en }`
- 默认语言：**英文**（每次加载都从 `en` 开始）
- 切换入口：顶栏「中文 / EN」
- 页面 `<title>` 与 `document.documentElement.lang` 随语言切换
- 变量插值：`t('key', { n: 1 })`，模板使用 `{{n}}`

新增文案时必须同时补齐 `zh` 与 `en`，否则会回退显示 key。

---

## 10. 后台配置

### 10.1 基础数据与工作地点

- 维护 `businessLines`、`products`、`stages` 三个字符串数组，以及 `locations` 工作地点数组
- 三元笛卡尔积实时生成活动代码：`业务线-产品-业务阶段`
- 默认：`UG / CDI / GH` × `OD / AirtimeLending / BL` × `运营 / 交付` = 18 个组合
- 默认工作地点：重庆 / 北京 / 新加坡 / 远程，结构为 `{ value, label, labelZh }`
- 每类至少保留 1 项；重复项会被拒绝
- 修改后填报页 `ActivityPicker` 与「工作地点」下拉立即增减选项
- 新增工作地点时填中文名与英文名，`value` 自动生成（`loc-<timestamp36>`）；删除当前正在编辑的地点时，编辑区自动回退到列表第一项

### 10.2 用户管理与权限

字段：姓名、工号、部门、角色、启用状态。

- 角色只有两种：`super_admin`（超级管理员）与 `employee`（填报用户）
- 默认 4 人：吕薇庆、胡雅洁（超级管理员）、曾悦婷、王红玮（填报用户）
- 至少保留 1 名超级管理员：删除最后一名，或把最后一名降级为填报用户，都会被阻止
- **后台入口门禁**：`TimesheetApp` 根据当前用户角色计算 `isSuperAdmin`，非超级管理员时后台按钮不渲染（不是仅置灰/隐藏样式）；若角色在后台被改为填报用户，页面会自动退回填报页
- 本原型不做登录页与真实鉴权，角色在前端 state 中判定；接后端时应改为服务端鉴权

### 10.3 导出当月数据

- 入口：后台「数据导出 → 导出当月数据（Excel）」
- 实际格式：**CSV（UTF-8 BOM，CRLF）**，Excel 可直接打开
- 文件名：`工时明细_YYYY-MM.csv`
- 每行 = 一条活动明细；只导出有工时的记录
- 18 列：

```
序号、员工姓名、员工工号、部门、业务线、产品、业务阶段、
日期、星期、工作地点、目标工时、实际工时合计、状态、
活动代码、本行工时、备注、单据备注、保存时间
```

> 目前导出的是「当前演示用户」的数据；因为原型只有一名填报用户的会话数据。接后端后应按员工维度聚合。

---

## 11. 样式体系

`timesheet.css` 使用 CSS Variables 管理主题：

```css
:root {
  --brand: #86bc25;        /* 品牌绿 */
  --brand-dark: #5d8b12;
  --done: #43a047;         /* 已完成 */
  --partial: #fdf1cf;      /* 部分填写（浅黄） */
  --ot: #ef8a00;           /* 加班橙 */
  --danger: #c62828;
  --blue: #00a3e0;         /* 主按钮蓝 */
}
```

布局：

- 顶栏固定高度，左侧品牌 + 中部视图切换 + 右侧语言 / 后台入口
- 主区两栏：左列日历 + 右侧编辑区；窄屏自动堆叠
- 月历 6×7 网格，格子最小高度 44px，圆角 10px
- 所有文字默认居中（表格单元格、日历、统计卡片）

状态类名统一为 `is-*`：`is-done` / `is-partial` / `is-unfilled` / `is-locked` / `is-today` / `is-selected` / `is-holiday` / `is-makeup`。

---

## 12. Axhub Make 集成

### 12.1 项目身份

`.axhub/make/client.json`：

```json
{
  "schemaVersion": 1,
  "kind": "axhub-make-client",
  "templateVersion": "0.1.18",
  "project": { "id": "ics-timesheet", "name": "Mindigital 服务工时表" }
}
```

项目 id `ics-timesheet` 全局唯一，与 `risk-control-platform` 等其它原型完全独立。

### 12.2 元数据同步

`scripts/sync-project-metadata.mjs` 扫描 `src/prototypes/*`，生成：

- `.axhub/make/project.json`
- `.axhub/make/entries.json`（`schemaVersion: 2`，含 `items` / `js` / `html`）

内容未变化时不重写文件，避免开发时无意义的文件抖动。

### 12.3 开发服务心跳

`vite-plugins/axhub-dev-server-info.ts` 在 dev 模式：

- 每 5 秒写入 `.axhub/make/.dev-server-info.json`（`pid`、`port`、`origin`、`projectRoot`、`startedAt`）
- 暴露 `GET /api/health` 供 Axhub 客户端探活

Axhub Make 客户端要求 15 秒内看到心跳，否则报 `MAKE_CLIENT_DEV_TIMEOUT`。

### 12.4 必需脚本

`package.json` 必须同时定义：

```json
{
  "scripts": {
    "dev": "node scripts/sync-project-metadata.mjs && vite",
    "metadata:sync": "node scripts/sync-project-metadata.mjs"
  }
}
```

缺少 `metadata:sync` 会报 `NOT_MAKE_CLIENT_PROJECT`（“Make client project must define dev and metadata:sync scripts”）。

### 12.5 访问方式

- 本地开发：`http://127.0.0.1:5178/`
- Axhub Make 客户端：`http://localhost:53817/?projectId=ics-timesheet&p=timesheet`

---

## 13. 构建与部署

### 13.1 Vite 配置

```ts
base: './'          // 相对路径，适配 GitHub Pages 子路径
server.port: 5178
server.host: '127.0.0.1'
build.outDir: 'dist'
build.sourcemap: false
```

### 13.2 GitHub Actions

`.github/workflows/deploy-pages.yml`：

- 触发：push `main` 或手动 `workflow_dispatch`
- 权限：`contents: read`、`pages: write`、`id-token: write`
- 并发组：`pages`，`cancel-in-progress: true`（新提交会取消旧构建）
- 步骤：`checkout@v4` → `setup-node@v4`（Node 22 + npm cache）→ `npm ci` → `npm run build` → `upload-pages-artifact@v3` → `deploy-pages@v4`

### 13.3 发布地址

<https://phosphorescent2018.github.io/Deloitte-ICS-Timesheet/>

---

## 14. 本地开发与排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Axhub 报 `NOT_MAKE_CLIENT_PROJECT` | `package.json` 缺 `metadata:sync`，或没有 `.axhub/make/client.json` | 补齐脚本与项目身份文件 |
| Axhub 报 `MAKE_CLIENT_DEV_TIMEOUT` | 15 秒内未写入 `.dev-server-info.json` | 确认 `axhubDevServerInfo()` 插件已启用、`npm run dev` 正常、端口未被占用 |
| 端口 5178 被占用 | 上一次 dev server 未退出 | `lsof -i :5178` 找到进程并结束，或改 `vite.config.ts` 端口 |
| 页面空白 | `base` 配成绝对路径导致子路径资源 404 | 保持 `base: './'` |
| 图标不显示 | SVG 资源未参与构建 | 确认 `assets/mindigital-mark.svg` 被 import，构建产物含 `mindigital-mark-*.svg` |
| 刷新后数据丢失 | 设计如此（会话级数据） | 需要持久化时改 `lib/storage.ts` 的 `loadState()` |

常用检查：

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
curl -s http://127.0.0.1:5178/api/health
```

---

## 15. 已知限制

1. **无后端**：没有数据库、接口、鉴权、审批流；「OA 审批」只是弹窗演示。
2. **刷新即重置**：`loadState()` 每次都调用 `seedState()`；`persist()` 仍会写 `localStorage`，但读取路径已禁用。`config` / `users` 同理，只写不读。
3. **单用户视图**：填报页固定展示吕薇庆；用户管理只是数据维护，不影响当前登录人。
4. **节假日仅 2026 年**：其它年份会按普通周末规则处理。
5. **导出为 CSV**：不是真正的 `.xlsx`，但 Excel 可直接打开；导出范围为当前演示用户。
6. **无路由**：页面切换靠 `page` state，刷新后回到填报页。
7. **浏览器要求**：现代 Chromium / Safari；不支持 IE。

---

## 16. 扩展指南

### 16.1 接入后端

替换 `lib/storage.ts` 的 `loadState` / `persist` 为 API 调用即可，组件层无需改动：

```ts
export async function loadState(): Promise<AppState> {
  const res = await fetch('/api/timesheets/current-month');
  return res.json();
}
```

同时把 `TimesheetApp` 的初始化改为异步（`useEffect` + loading 态），并为 `saveDay` / `prefillWeek` 增加失败重试与错误提示。

### 16.2 增加年份节假日

1. 在 `lib/holidays.ts` 增加 `HOLIDAYS_2027` / `MAKEUP_WORKDAYS_2027`
2. 把查表函数改为按 `key.slice(0, 4)` 选择年份表
3. 补充对应单元测试（建议使用 Vitest）

### 16.3 真实 Excel 导出

引入 `xlsx` 或 `exceljs`，把当前 CSV 行数据写入 workbook，保留同样 18 列，文件名改为 `.xlsx`。服务端导出时可加权限校验与审计日志。

### 16.4 权限与登录

- 增加登录页与用户会话（可对接企业微信 OAuth）
- 角色控制：员工仅本人、主管本部门、管理员全量
- 后台入口按角色隐藏
- 导出接口做服务端权限校验

### 16.5 多用户数据

当前 `state.days` 是单用户结构。多用户建议改为：

```ts
Record<employeeId, Record<dateKey, DayRecord>>
```

或直接由后端按 `employeeId + month` 查询。

---

## 17. 交付前检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过，`dist/` 资源路径为相对路径
- [ ] 月历：今天、选中、未填写、部分填写、已完成、锁定、节假日、调休 8 种状态显示正确
- [ ] 可编辑范围：今天 / 前 2 天 / 本月未来日期可填；更早日期与下月日期被拦截
- [ ] 校验：负数、超 24 小时、填工时未选活动均被阻断
- [ ] Prefill / Copy / Save 三个动作与 Toast 文案正确
- [ ] 中英文切换后所有文案、日期格式、页面标题正确
- [ ] 后台：基础数据增删、用户增删改、导出 CSV 18 列
- [ ] GitHub Actions 构建成功，线上地址可访问

---

## 18. 相关文档

- 产品与使用说明：[`README.md`](../README.md)
- 生产化设计与实施指南：[`PRODUCTION-DESIGN.md`](./PRODUCTION-DESIGN.md)
- 预览图：[`docs/preview.png`](./preview.png)
- 线上演示：<https://phosphorescent2018.github.io/Deloitte-ICS-Timesheet/>
