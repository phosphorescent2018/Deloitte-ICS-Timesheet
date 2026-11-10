# ICS Timesheet Rust API

本地可运行的 Rust 后端，目标是与 `../src/prototypes/timesheet` 前端对接。

## 技术栈

- Axum 0.8
- Tokio
- SQLx 0.9 + PostgreSQL（本地 5433，生产 PostgreSQL 17）
- Argon2 密码哈希
- JWT Bearer 登录
- rust_xlsxwriter 导出 Excel

## 数据库

统一使用 PostgreSQL：本地 5433，生产 PostgreSQL 17。启动时 `sqlx::migrate!("./migrations")` 自动建表，无需手工执行 SQL。

### 方式一：本机实例（默认，端口 5433）

```bash
cd backend
./scripts/pg-start.sh      # 首次 initdb + 启动 + 建库；幂等
./scripts/pg-stop.sh       # 停止服务，保留数据目录
```

- 数据目录 `backend/.pgdata`，日志 `backend/.pg.log`
- 二进制默认 `~/.pg0/installation/18.1.0/bin`，可用 `PG_BIN` 覆盖；端口用 `PGPORT` 覆盖
- 脚本只操作本项目实例，不触碰 5432（Hindsight）或其它 PostgreSQL

### 方式二：docker compose（宿主端口 5434）

```bash
cd backend
POSTGRES_PASSWORD=timesheet docker compose up -d
# 对应 DATABASE_URL：
# postgres://timesheet:timesheet@127.0.0.1:5434/timesheet
```

- 镜像 `postgres:17-alpine`，库名/用户均为 `timesheet`，数据落在命名卷 `pgdata`
- `POSTGRES_PASSWORD` 必填（compose 用 `:?` 强制校验），需与 `DATABASE_URL` 里的密码一致
- 宿主端口由 `POSTGRES_PORT` 控制，默认 `5434`，避开本机 5433；例如 `POSTGRES_PORT=5435 docker compose up -d`
- `POSTGRES_PASSWORD` 也可写进 `backend/.env`，compose 与 `cargo run` 共用同一份
- 停止：`docker compose down`（保留数据卷）；`docker compose down -v` 会连数据一起删除

## 环境变量

| 变量 | 默认值 / 示例 | 说明 |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1:8080` | 监听地址 |
| `DATABASE_URL` | `postgres://timesheet@127.0.0.1:5433/timesheet` | 本机实例 trust 认证，无密码；compose 方式需带密码、端口 5434 |
| `JWT_SECRET` | 开发占位值 | 至少 32 字节随机串，上线必须替换 |
| `BOOTSTRAP_ADMIN_PASSWORD` | `ChangeMe123!` | 首次空库创建 `MG-0001` / `MG-0002` 的密码 |
| `BACKFILL_DAYS` | `2` | 可补填自然日数，0–7 |
| `RUST_LOG` | `ics_timesheet_api=debug,tower_http=info,sqlx=warn` | 日志级别 |

## 本地运行

```bash
cd backend
cp .env.example .env
# 修改 JWT_SECRET 和 BOOTSTRAP_ADMIN_PASSWORD；DATABASE_URL 按上面两种方式二选一
cargo run
```

默认监听 `http://127.0.0.1:8080`，同时把 `../dist` 作为静态站点兜底。

首次空库会创建：

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
- 前端从内存态切到 API
- 请求日志 / 前端事件上报 / 匿名反馈审计，见 [`docs/TELEMETRY.md`](docs/TELEMETRY.md)
