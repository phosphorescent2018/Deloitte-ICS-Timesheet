# Mindigital 服务工时表 · ICS 工时填报

Mindigital GDC 内部服务工时系统（原 Internal Client Service Timesheet）的完整可交互复刻：月历状态 + 每日工时明细 + Prefill / Copy / Save。
独立 Axhub Make 项目，push `main` 自动构建并发布到 GitHub Pages。界面默认英文，右上角可一键切换中英文。

**演示站：** https://phosphorescent2018.github.io/Deloitte-ICS-Timesheet/

![Timesheet 预览](docs/preview.png)

## 功能

### 月历

- 周日起排的 6×7 月历，工作日与周末区分，跨月日期淡显。
- 状态色：未填写（浅红底红框）、部分填写（浅绿）、已完成（深绿）、今天（日号下方红色小圆点）、选中（蓝色描边）、已锁定（灰底带锁）。可填写窗口内（今天及前 2 天）未填写的日子显示为红色，提醒补填。
- 月份切换、`Today` 快速回到本周，底部显示本月已填天数 / 工时。
- **3 天可编辑窗口**：只允许填写/修改今天及前 2 天（含当天共 3 天）的工时；更早日期在日历中置灰并带锁图标，点击会弹窗提示「企业微信 OA 审批流」，普通用户无法直接改动。

### 每日填报

- `Work Location` 下拉：重庆 / 北京 / 新加坡 / 远程。
- `Target Hours` 固定为 8.0（与 `Total Actual Hours` 同样式展示，不可编辑）。
- `Activity` 可搜索选择器：选项为「业务线-产品-业务阶段」组合，业务线 UG / CDI / GH，产品 OD / AirtimeLending / BL，阶段 运营 / 交付，共 18 个组合（如 `UG-OD-运营`、`CDI-AirtimeLending-交付`），按业务线分组、支持搜索；选中后 `Client Name` 自动带出业务线。
- 多行 Activity：工时、Remark、单据详情弹窗（可写备注）、添加 / 删除行。
- 校验：当天工时合计不得超过 8.0 小时、不允许负数；填了工时必须选活动代码。允许保存空内容（保存后当日会以红色提醒未填写）。
- `Save` 写入 `localStorage`，刷新不丢；保存后日历与周/月统计立即更新。

### 三个核心动作

| 按钮 | 行为 |
| --- | --- |
| **Prefill one week** | 用当前表单（若为空则回退到最近一条已保存记录）预填本周一至周五；已有记录的日期自动跳过，工时按目标值等比缩放并抹平取整误差。 |
| **Copy last day** | 向前回溯最多 90 天，复制最近一条有工时的记录到当前日期，标记为「未保存」，提示 review & save。 |
| **Save** | 保存当天记录并刷新日历状态；`⌘/Ctrl + S` 同样生效。 |

### 后台配置

- 顶栏右上角齿轮图标进入（悬停提示「后台配置」）：维护 **业务线 / 产品 / 业务阶段** 三类基础数据，支持添加、删除，至少保留一项。
- 组合数实时计算（业务线 × 产品 × 阶段），修改后填报页的活动下拉自动增加或移除对应组合，并持久化在 `localStorage`（key `deloitte-ics-config.v1`）。
- **用户管理**：新增 / 编辑 / 删除用户，字段含姓名、工号、部门、角色（员工 / 主管 / 管理员）与启用状态；保存在 `localStorage`（key `deloitte-ics-users.v1`），并保证至少保留一名管理员。本原型暂不做登录页。
- **导出当月数据（Excel）**：按 18 列导出当月全部填报明细（CSV，UTF-8 BOM，Excel 可直接打开）——序号、员工姓名、员工工号、部门、业务线、产品、业务阶段、日期、星期、工作地点、目标工时、实际工时合计、状态、活动代码、本行工时、备注、单据备注、保存时间。

### 其他

- **Day / Month 双视图**：月视图按天列出地点、Activity、工时、状态，点击任意行回到当日编辑。
- **Week at a glance**：本周 7 天卡片，含工时进度条，点击跳转。
- **Activity mix**：本月工时按 Activity 代码汇总 Top 5。
- 切换日期 / 月份时如有未保存改动，弹窗确认后再丢弃。
- 「后台配置」页提供「Reset demo data」按钮，可重置演示数据；数据导出见该页「数据导出」。
- 键盘：`←` `→` 切换日期，`⌘/Ctrl + S` 保存。
- **中英文切换**：每次进入默认英文，右上角「中文 / EN」可切换（仅当次会话，刷新后回到英文）。

## 技术栈

React 18 + TypeScript + Vite 5，无 UI 组件库，纯手写 CSS（企业灰 + 品牌绿 `#86BC25`），产物为纯静态站点。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5178
npm run build      # 产物在 dist/
npm run typecheck  # TypeScript 全量检查
```

## 目录结构

```
.
├── index.html                       # 静态站点入口
├── src/
│   ├── main.tsx                     # React 挂载
│   └── prototypes/timesheet/
│       ├── index.tsx                # Axhub Make 原型入口（default export）
│       ├── TimesheetApp.tsx         # 页面状态与业务流程
│       ├── AdminPage.tsx            # 后台配置（基础数据维护 + 数据导出）
│       ├── Calendar.tsx             # 月历
│       ├── DayEditor.tsx            # 每日工时明细表
│       ├── ActivityPicker.tsx       # Activity 代码搜索选择器
│       ├── MonthView.tsx            # 月视图
│       ├── WeekStrip.tsx            # 本周卡片
│       ├── ActivityMix.tsx          # 工时构成
│       ├── ui.tsx                   # 图标 / Toast / Modal / 状态胶囊
│       ├── timesheet.css            # 全部样式
│       └── lib/
│           ├── date.ts              # 日期与周计算
│           ├── config.ts            # 后台配置（业务线/产品/阶段）与组合生成
│           ├── users.ts             # 用户与角色（本地存储）
│           ├── catalog.ts           # 办公地点
│           ├── model.ts             # 数据模型、校验、统计
│           └── storage.ts           # localStorage 持久化与演示数据
├── .axhub/make/                     # Axhub Make 项目身份与资源清单
├── .github/workflows/deploy-pages.yml
└── docs/preview.png
```

## 数据与演示数据

- 存储位置：`localStorage`，key 为 `deloitte-ics-timesheet.v3`。
- 首次打开会自动生成「本周已填」的演示数据（周一至周五，每天 8h）。
- 顶栏 `••• → Reset demo data` 可清空并恢复演示数据；`Export JSON` 可导出当前全部记录。

## Axhub Make 独立项目

`.axhub/make/` 保存项目身份（`client.json`）、资源清单（`project.json`）与入口缓存（`entries.json`）。
原型入口为 `src/prototypes/timesheet/index.tsx`，默认导出的组件即整页应用；项目 id 为 `ics-timesheet`，与其它原型项目（如 `risk-control-platform`）完全独立，不共享项目 id 与目录。

## 部署

推送到 `main` 后，GitHub Actions（`.github/workflows/deploy-pages.yml`）执行 `npm ci` + `npm run build`，将 `dist/` 发布到 GitHub Pages。

## 说明

界面默认中文（右上角可切英文），代码注释与文档为中文。
本项目为原型演示，不含真实后端、审批流与权限体系，所有数据仅保存在浏览器本地。
