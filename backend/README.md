# ICS Timesheet Rust API

本地可运行的 Rust 后端，目标是与 `../src/prototypes/timesheet` 前端对接。

## 技术栈

- Axum 0.8
- Tokio
- SQLx 0.9 + SQLite（本地）
- Argon2 密码哈希
- JWT Bearer 登录
- rust_xlsxwriter 导出 Excel

## 本地运行

```bash
cp .env.example .env
# 修改 JWT_SECRET 和 BOOTSTRAP_ADMIN_PASSWORD
cargo run
```

默认监听 `http://127.0.0.1:8080`，同时把 `../dist` 作为静态站点兜底。

初始化账号（仅首次空库时创建）：

- 超级管理员：`MG-0001` / 环境变量 `BOOTSTRAP_ADMIN_PASSWORD`
- 填报用户：`MG-0002` / 同上

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 工号/邮箱 + 密码登录 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/config` | 业务线/产品/阶段/地点 |
| GET | `/api/timesheets?year=2026&month=11` | 当前用户月度工时 |
| GET | `/api/timesheets/{date}` | 某天工时 |
| PUT | `/api/timesheets/{date}` | 保存某天工时 |
| GET/POST | `/api/admin/users` | 用户列表/新增 |
| PUT/DELETE | `/api/admin/users/{id}` | 修改/删除用户 |
| GET | `/api/admin/audit` | 审计日志 |
| GET | `/api/admin/export?year=2026&month=11` | 全员月度 Excel |

## 已实现规则

- 服务端 JWT 鉴权，角色从 token 读取，不信任前端 role
- 普通用户只能编辑今天及前 `BACKFILL_DAYS` 个自然日（0–7，默认 2），跨月日期一律拒绝
- 超级管理员可编辑历史日期（写入审计）
- 单日合计 ≤ 24 小时、负数拒绝、填工时必须选有效工作项
- 空内容允许保存
- 用户管理保护最后一名启用的超级管理员
- 审计日志记录工时保存、配置修改、用户变更

## 下一阶段

- 企业微信可信域名 / 可信 IP / 审批轮询
- 请假同步与 Leave 自动写入
- 反馈接口与后台列表
- 前端从内存态切到 API
