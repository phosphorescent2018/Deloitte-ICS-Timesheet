# Mindigital 服务工时表 · 生产化设计与实施指南

> 面向后续真正写程序、部署上线时参考。
> 配套文档：原型技术文档 [`TECHNICAL.md`](./TECHNICAL.md)、产品说明 [`../README.md`](../README.md)。
> 本文档描述“从当前前端原型走到可上线系统”需要补什么、怎么补，以及哪些规则必须保持一致。

---

## 1. 先说明：原型与生产系统的边界

当前 `ics-timesheet` 是**纯前端高保真原型**：

- 数据只存在浏览器内存，刷新即重置
- 角色权限只在前端判断
- OA 审批只是弹窗演示
- 导出是前端生成的当前用户 CSV
- 没有登录、数据库、接口、审计

生产系统必须补齐：**登录/SSO、服务端权限、数据库持久化、审批流、导出服务、审计日志、部署运维**。

原型可复用的部分：页面结构、视觉样式、交互流程、校验规则、日期窗口规则、节假日规则、角色显隐逻辑。**不能直接复用**：`lib/storage.ts` 的本地演示数据、前端角色判断、假审批弹窗、CSV 导出。

---

## 2. 目标系统范围

### 2.1 本期范围

- 工时填报：按天录入工作项、工时、备注、工作地点
- 月历查看：本月状态、节假日/调休标记
- 历史编辑审批：超出可编辑窗口的日期发起 OA 审批，通过后放行
- 后台配置：业务线 / 产品 / 业务阶段 / 工作地点
- 用户与角色：超级管理员、填报用户
- 数据导出：按月导出全部员工明细（Excel）
- 审计：谁在什么时候改了哪条工时

### 2.2 不在本期范围

- 薪资核算、项目计费、发票、报销
- 请假/加班申请（如需要，另立模块）
- 与 Deloitte 原系统做数据对接（除非拿到接口）
- 移动端 App（先用响应式 Web）

---

## 3. 目标架构

```
Browser (React)
   │  HTTPS
   ▼
Nginx / Ingress
   ├── /            → 静态前端（dist）
   └── /api/*       → 应用服务（Spring Boot / Node / Go 均可）
                         ├── MySQL 8（业务数据）
                         ├── Redis（会话/幂等，可选）
                         ├── 企业微信 SSO
                         ├── 企业微信 OA 审批
                         └── 对象存储 / 文件服务（导出 Excel）
```

建议：

- 前端继续用 React + TypeScript + Vite，直接复用现有组件
- 后端建议 Spring Boot（与公司现有 Java 体系一致）或 Node/NestJS
- 数据库 MySQL 8，字符集 `utf8mb4`，时区统一 `Asia/Shanghai`
- 部署 Docker + Docker Compose（小规模）或 Kubernetes（公司平台）
- 所有环境变量管理密钥，不写进代码与镜像

---

## 4. 角色与权限

### 4.1 角色定义

| 角色 | 代码 | 权限 |
| --- | --- | --- |
| 超级管理员 | `SUPER_ADMIN` | 填报自己的工时；进入后台；维护基础数据/工作地点；管理用户与角色；导出全员数据；查看审计 |
| 填报用户 | `TIMESHEET_USER` | 只能填报/查看自己的工时；看不到后台入口；不能导出全员数据 |

### 4.2 权限矩阵

| 能力 | 超级管理员 | 填报用户 |
| --- | --- | --- |
| 查看自己的工时 | ✅ | ✅ |
| 编辑可编辑窗口内的工时 | ✅ | ✅ |
| 编辑历史工时 | 需审批（或管理员直接改，需审计） | 需审批 |
| 查看他人工时 | ✅（按需） | ❌ |
| 后台基础数据配置 | ✅ | ❌ |
| 用户与角色管理 | ✅ | ❌ |
| 导出全员数据 | ✅ | ❌ |
| 查看审计日志 | ✅ | ❌ |

### 4.3 服务端强制

- 前端隐藏按钮只是体验，**所有 `/api/admin/**` 必须服务端校验角色**
- 角色从会话/SSO 中读取，绝不接受前端传入的 `role`
- 填报用户访问后台接口返回 `403 FORBIDDEN`
- 任何跨用户读写都按 `user_id` 过滤

---

## 5. 数据模型

### 5.1 用户

```sql
CREATE TABLE ts_user (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_no   VARCHAR(32)  NOT NULL UNIQUE,
  name          VARCHAR(64)  NOT NULL,
  email         VARCHAR(128),
  department    VARCHAR(128),
  role          VARCHAR(20)  NOT NULL COMMENT 'SUPER_ADMIN / TIMESHEET_USER',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

约束：

- 至少保留 1 个启用的 `SUPER_ADMIN`
- 不能删除/停用最后一个超级管理员
- 工号唯一

### 5.2 基础数据

```sql
CREATE TABLE ts_activity_dim (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  dim_type   VARCHAR(20) NOT NULL COMMENT 'BUSINESS_LINE / PRODUCT / STAGE',
  value      VARCHAR(64) NOT NULL,
  sort_no    INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_dim_value (dim_type, value)
);

CREATE TABLE ts_location (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  code       VARCHAR(32)  NOT NULL UNIQUE,
  name_zh    VARCHAR(64)  NOT NULL,
  name_en    VARCHAR(64)  NOT NULL,
  sort_no    INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
);
```

工作项代码由三类维度笛卡尔积生成：`业务线-产品-业务阶段`，例如 `UG-OD-运营`。

### 5.3 工时主表 / 明细

```sql
CREATE TABLE ts_timesheet_day (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  work_date     DATE   NOT NULL,
  location_code VARCHAR(32) NOT NULL,
  target_hours  DECIMAL(4,1) NOT NULL DEFAULT 8.0,
  version       INT NOT NULL DEFAULT 0,
  saved_at      DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, work_date),
  KEY idx_date (work_date)
);

CREATE TABLE ts_timesheet_entry (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  day_id        BIGINT NOT NULL,
  activity_code VARCHAR(128) NOT NULL,
  hours         DECIMAL(4,1) NOT NULL,
  remark        VARCHAR(255) NOT NULL DEFAULT '',
  sort_no       INT NOT NULL DEFAULT 0,
  KEY idx_day (day_id)
);
```

服务层校验：

- `hours >= 0`
- 同一天所有 `hours` 合计 `<= 24.0`
- 填了工时必须选择工作项代码
- `target_hours` 固定 8.0，只用于状态判定（≥8 为 complete）

> 数据库层可加 `CHECK (hours >= 0)`；合计 24 小时建议服务层事务内校验，必要时加触发器兜底。

### 5.4 节假日 / 调休

```sql
CREATE TABLE ts_holiday (
  holiday_date DATE PRIMARY KEY,
  year         SMALLINT NOT NULL,
  day_type     VARCHAR(16) NOT NULL COMMENT 'HOLIDAY / WORKDAY',
  name_zh      VARCHAR(64) NOT NULL,
  name_en      VARCHAR(64) NOT NULL,
  source       VARCHAR(64) NOT NULL DEFAULT 'STATE_COUNCIL'
);
```

- `HOLIDAY` = 法定节假日
- `WORKDAY` = 调休上班日（周末上班）
- 每年由管理员导入/维护，服务端按年份查询
- 原型只内置 2026 年，生产不能写死

### 5.5 历史编辑审批

```sql
CREATE TABLE ts_approval_request (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id        BIGINT NOT NULL,
  work_date      DATE   NOT NULL,
  reason         VARCHAR(500) NOT NULL,
  oa_request_no  VARCHAR(64),
  status         VARCHAR(16) NOT NULL COMMENT 'PENDING / APPROVED / REJECTED / CANCELLED / EXPIRED',
  approved_at    DATETIME,
  expires_at     DATETIME,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_date (user_id, work_date)
);
```

规则：

- 超出「今天及前 2 天」的日期，必须存在 `APPROVED` 且未过期的申请，才允许保存
- 审批通过后建议只放行该用户该日期，有效期 24 小时
- 审批回调要验签、幂等

### 5.6 审计

```sql
CREATE TABLE ts_audit_log (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_id    BIGINT NOT NULL,
  action      VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id   VARCHAR(64),
  before_json JSON,
  after_json  JSON,
  ip          VARCHAR(64),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_actor_time (actor_id, created_at)
);
```

记录：保存工时、删除行、修改配置、用户角色变更、导出、审批操作。

---

## 6. 业务规则（必须与原型一致）

### 6.1 可编辑范围

| 日期 | 规则 |
| --- | --- |
| 今天及前 2 天（含当天，共 3 天） | 可直接编辑 |
| 本月内晚于今天的日期 | 可直接编辑 |
| 早于「今天 − 2 天」 | 需历史编辑审批 |
| 下个月及以后 | 一律禁止，前端提示、服务端拒绝 |

判定基准是**服务器业务时区**（建议 `Asia/Shanghai`），不能用浏览器本地时间，否则跨时区会错。

### 6.2 校验

| 规则 | 提示 |
| --- | --- |
| 单行工时 < 0 | 第 N 行：工时不能为负数。 |
| 填工时未选工作项 | 第 N 行：请选择工作项代码。 |
| 选了工作项但工时为 0 | 第 N 行：已选工作项需填写工时。 |
| 当天合计 > 24 | 当天实际工时合计不能超过 24 小时。 |
| 目标工时 ≤ 0 | 目标工时必须大于 0。 |

允许保存空内容（全部工时为 0），保存后该天进入「未填写」状态。

### 6.3 状态与工作日

- `empty`：合计 = 0
- `complete`：合计 ≥ target（8）
- `partial`：0 < 合计 < target
- 工作日 = 周一至周五，排除 `HOLIDAY`，包含 `WORKDAY`
- 月度目标工时 = 工作日数 × 8
- 「未填写」红色提醒只在「今天及前 2 天」的工作日出现，未来日期不提前标红

### 6.4 工作日历

- 节假日/调休数据由后台维护，按年生效
- 新增年份时导入国务院安排
- 前端只读展示「休 / 班」标签，不自行计算

### 6.5 保存与并发

- 每次保存带 `version`，服务端乐观锁；版本冲突返回 `409`
- 同一天一个用户只有一条 `ts_timesheet_day`，明细行整体替换
- 保存接口建议支持 `Idempotency-Key`，防止重复提交

---

## 7. API 设计（建议）

统一前缀 `/api`，返回：

```json
{ "code": 0, "message": "ok", "data": {} }
```

错误码：

- `400` 参数/业务校验失败
- `401` 未登录
- `403` 无权限
- `409` 版本冲突
- `422` 业务规则不满足（如超出可编辑范围）

### 7.1 当前用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/me` | 返回当前用户、角色、部门 |

```json
{
  "id": 1,
  "employeeNo": "MG-0001",
  "name": "吕薇庆",
  "role": "SUPER_ADMIN",
  "department": "Mindigital 全球交付中心"
}
```

### 7.2 工时

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/timesheets?month=2026-11` | 当月所有已保存日期（当前用户） |
| GET | `/api/timesheets/2026-11-10` | 某天详情 |
| PUT | `/api/timesheets/2026-11-10` | 保存某天（整体替换明细） |
| DELETE | `/api/timesheets/2026-11-10` | 清空某天 |

保存请求：

```json
{
  "locationCode": "cq",
  "targetHours": 8.0,
  "version": 3,
  "entries": [
    { "activityCode": "UG-OD-运营", "hours": 4.0, "remark": "" },
    { "activityCode": "UG-OD-交付", "hours": 4.0, "remark": "" }
  ]
}
```

### 7.3 审批

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/approvals/historical-edit` | 发起历史日期编辑申请 |
| GET | `/api/approvals?status=PENDING` | 查询申请 |
| POST | `/api/approvals/oa-callback` | 企业微信 OA 回调（验签） |

### 7.4 后台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/config` | 业务线/产品/阶段/地点 |
| PUT | `/api/admin/config` | 保存基础数据 |
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 新建用户 |
| PUT | `/api/admin/users/{id}` | 编辑用户/角色 |
| DELETE | `/api/admin/users/{id}` | 删除用户 |
| GET | `/api/admin/holidays?year=2026` | 节假日 |
| PUT | `/api/admin/holidays` | 导入/更新 |
| POST | `/api/admin/export` | 导出当月 Excel（异步任务） |
| GET | `/api/admin/audit-logs` | 审计查询 |

所有 `/api/admin/**` 必须拦截 `TIMESHEET_USER`。

---

## 8. 登录与权限

### 8.1 登录方式

优先企业微信网页授权 / 公司 SSO：

1. 前端跳转企业微信 OAuth
2. 回调后服务端换取 `userid`
3. 按 `employee_no` 或 `userid` 查 `ts_user`
4. 写入 HttpOnly + Secure + SameSite 会话 Cookie
5. 返回 `/api/me`

禁止：

- 前端传角色
- 把角色放 localStorage 后信任
- 用姓名匹配用户

### 8.2 服务端权限

- `@PreAuthorize("hasRole('SUPER_ADMIN')")` 或等价中间件
- 数据级过滤：`WHERE user_id = :currentUserId`
- 导出接口单独鉴权 + 审计

---

## 9. 历史编辑审批

### 9.1 流程

1. 用户点击超窗口日期
2. 前端提示「超出可编辑范围，需发起企业微信 OA 审批」
3. 调用 `POST /api/approvals/historical-edit`（日期 + 原因）
4. 服务端创建 `PENDING` 记录，调 OA 发起审批
5. OA 回调 `APPROVED` → 写 `approved_at`、`expires_at`
6. 用户再次打开该日期，服务端校验通过后允许保存
7. 保存动作写审计日志

### 9.2 注意

- 回调验签、幂等（`oa_request_no` 唯一）
- 审批通过不等于永久放开：建议 24 小时有效
- 管理员直接修改历史数据也要走审计；是否允许由业务决定

---

## 10. 导出

- 服务端生成 `.xlsx`（建议 `exceljs` 或 Apache POI）
- 文件名：`工时明细_YYYY-MM.xlsx`
- 列与原型保持一致（15 列）：

```
序号、员工姓名、员工工号、部门、业务线、产品、业务阶段、
日期、星期、工作地点、状态、工作项代码、本行工时、备注、保存时间
```

- 只导出有工时的记录
- 大数据量用异步任务 + 下载链接，避免请求超时
- 导出动作记录审计（谁、什么时间、哪个范围）

---

## 11. 前端改造点

| 原型文件 | 生产改造 |
| --- | --- |
| `lib/storage.ts` | 删除 `seedState`/`persist`，改为 API 客户端 + React Query/SWR |
| `lib/users.ts` | 删除默认用户；`/api/me` 返回当前用户；用户管理走 `/api/admin/users` |
| `lib/config.ts` | `loadConfig` 改为 `GET /api/admin/config`；保存走 `PUT` |
| `TimesheetApp.tsx` | 角色从 `/api/me` 读取；权限判断保留但只作 UI；增加 loading/error |
| `AdminPage.tsx` | 保留页面；数据源换 API；导出调后端 |
| `Calendar/MonthView` | 节假日从 API 获取，不写死 2026 |
| `DayEditor.tsx` | 保存失败处理 409/422；支持错误提示 |
| `i18n.tsx` | 保留中英文；后端错误码映射文案 |

保留：

- 现有 CSS 与组件结构
- 月历状态色、24 小时校验、3 天窗口、未来月份锁定
- 后台四个配置区（业务线/产品/阶段/地点）
- 用户角色选择（只保留两个角色）

---

## 12. 非功能要求

| 项 | 建议 |
| --- | --- |
| 时区 | 服务端统一 `Asia/Shanghai`；数据库存 DATE/DATETIME |
| 性能 | 单用户月查询 < 200ms；导出 1 万人月数据 < 30s（异步） |
| 可用性 | 工作时间 99.5%；保存失败可重试 |
| 安全 | HTTPS、CSRF、XSS、SQL 注入防护、接口限流 |
| 审计 | 保存/审批/配置/导出/角色变更全部留痕，至少 1 年 |
| 备份 | MySQL 每日全量 + binlog；保留 30 天 |
| 日志 | JSON 日志 + traceId；Prometheus 指标 + 告警 |

---

## 13. 部署建议

### 13.1 容器

```yaml
services:
  web:
    image: registry/ics-timesheet-web:${TAG}
    ports: ["80:80"]
  api:
    image: registry/ics-timesheet-api:${TAG}
    environment:
      - TZ=Asia/Shanghai
      - DB_URL=jdbc:mysql://mysql:3306/ics_timesheet
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - WECOM_CORP_ID=${WECOM_CORP_ID}
      - WECOM_SECRET=${WECOM_SECRET}
  mysql:
    image: mysql:8.0
    volumes: ["mysql-data:/var/lib/mysql"]
```

### 13.2 环境

- 开发 / 测试 / 生产三套
- 生产数据库独立账号，最小权限
- 密钥放 K8s Secret / 公司配置中心，不进 Git
- 数据库迁移用 Flyway/Liquibase，版本化执行

### 13.3 发布

- CI：`npm ci && npm run build` + 后端单测 + 镜像构建
- CD：测试环境自动，生产手动审批
- 回滚：保留上一版镜像与数据库迁移回滚脚本

---

## 14. 实施阶段建议

| 阶段 | 内容 | 产出 |
| --- | --- | --- |
| P0 | 确认业务口径（见第 15 节） | 签字版规则 |
| P1 | 数据库 + 登录 + `/api/me` | 可登录空壳 |
| P2 | 工时查询/保存 + 前端接 API | 可真实填报 |
| P3 | 后台配置 + 用户管理 + 导出 | 管理员可用 |
| P4 | 历史编辑审批 + 审计 | 完整闭环 |
| P5 | UAT + 小范围试点 | 上线 |

前端页面已具备，P2 之后主要是接口联调与状态处理。

---

## 15. 需要业务拍板的问题

1. **24 小时上限**：确认是“单日合计上限”，而不是“单条工作项上限”；8 小时仅作为“完成”阈值。
2. **未来日期**：本月未来日期允许提前填报，是否保留？
3. **历史编辑审批**：审批通过后放行单日还是整月？有效期多久？
4. **超级管理员权限**：是否可以查看/修改他人工时？原型目前只导出，不直接改。
5. **导出范围**：超级管理员导出全员，还是只能导出本部门？
6. **节假日数据**：由谁维护、是否走审批、是否支持公司自定义日历？
7. **多 OPCO / 多时区**：当前按重庆单一时区设计，若扩展到 CDI/GH 需要按时区与日历拆分。
8. **角色数量**：确认永远只有两个角色，不引入主管/HR 等中间角色。

---

## 16. 验收清单（生产）

- [ ] 填报用户访问 `/api/admin/**` 返回 403，页面无后台按钮
- [ ] 超级管理员可进入后台，填报用户不可
- [ ] 今天、前 2 天、本月未来日期可保存
- [ ] 早于前 2 天被拒绝，走审批后放行
- [ ] 下月日期被前端与服务端双重拒绝
- [ ] 单日合计 24 可保存，25 被拒绝
- [ ] 负数、填工时未选工作项被拒绝
- [ ] 节假日显示「休」、调休显示「班」，工作日统计正确
- [ ] 刷新后数据仍在（数据库持久化）
- [ ] 两个标签页同时保存，后提交返回 409
- [ ] 导出 Excel 15 列、权限正确、有审计
- [ ] 审批回调验签、重复回调幂等
- [ ] 最后一个超级管理员不能被删除/降级
- [ ] 所有配置/角色/导出/审批操作有审计日志

---

## 17. 一句话总结

原型负责“长什么样、怎么用、规则对不对”；生产系统负责“谁在用、数据在哪、出了事怎么查”。

把本文档第 5～7 节的数据模型与接口先落地，前端这套页面可以基本原样复用；第 8～9 节的登录与审批是必须新建的部分，不能靠前端模拟。
