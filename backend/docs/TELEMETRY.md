# 后端埋点与匿名反馈技术设计

> 适用代码：`backend/`（Axum 0.8 + SQLx 0.9 + PostgreSQL）
> 文档性质：设计稿，本次不修改代码。评审通过后按第 6 节顺序实施。
> 非目标：不做全量行为回放、不引入第三方分析 SDK、不做设备指纹、不记录任何请求体。

---

## 0. 结论与现状

### 0.1 一句话决策

| 议题 | 决策 |
| --- | --- |
| 请求日志 | `TraceLayer` 提供 span 与失败分类；自建 `request_context` 中间件生成 `request_id`、输出单行扁平 JSON、异步写库 |
| 落盘 | `tracing-subscriber` JSON + `tracing-appender` 按天切割，保留 14 天 |
| 可查询日志 | `request_log` 表，异步批量写，按月分区，保留约 90 天 |
| 业务审计 | `audit_log` 保持与业务事务同事务，新增 `request_id/ip/user_agent`，保留 3 年 |
| 前端埋点 | 最小事件集 + `POST /api/events`，批量、`keepalive`/`sendBeacon`、失败不阻塞 |
| 匿名反馈 | 默认「真匿名」；可配置「匿名展示 + 安全审计」，两种模式的 UI 文案必须不同 |
| 隐私底线 | 不记录 body、query、Authorization、Cookie、反馈正文；IP 在文件日志保留 14 天全量，在数据库只存掩码 |

### 0.2 现状核查（代码级）

| 位置 | 现状 | 影响 |
| --- | --- | --- |
| `src/main.rs:26-32` | `tracing_subscriber::fmt::layer()` 纯文本输出到 stdout | 无法按字段检索，进程重启/容器重建即丢 |
| `src/main.rs:54` | 已有 `TraceLayer::new_for_http()`，但用默认 span（DEBUG 级） | `RUST_LOG=info` 时基本不产出访问日志；无 `request_id`、无 `user_id` |
| `src/error.rs:41-48` | `ApiError::Internal` 把 `self.to_string()` 原样返回客户端 | 可能泄露 SQL/内部错误细节；上日志后更容易被放大 |
| `src/main.rs:48-53` | `CorsLayer` 允许任意 Origin、任意 Header | 公开的 `/api/events`、`/api/feedback` 可被任意站点刷 |
| `migrations/0001_init.sql:68-85` | `audit_log`、`feedback` 的时间字段是 `TEXT`（`now()::text`） | 新表用 `TIMESTAMPTZ` 后跨表比较要显式 cast，排序语义也不一致 |
| `src/routes/admin.rs:166-193` | 已改为软删除：`DELETE` 只把 `active` 置 `FALSE`，不删用户行 | 不会再触发 `timesheet_day` / `audit_log` 外键；历史工时与审计保留 |
| `src/routes/feedback.rs:12-34` | 反馈接口公开、无身份字段，表里也确实没有身份列 | 表层面成立；但一旦接入请求日志，HTTP 层就会留下 IP/UA，「完全匿名」不再成立 |
| 前端 `src/prototypes/timesheet/lib/feedback.ts` | 反馈只写内存，刷新即丢；没有调用 `/api/feedback` | 当前「匿名反馈」是演示。接 API 时必须同步改 `i18n.tsx` 文案 |

**核心矛盾**：`feedback.rs` 的注释写着 “intentionally does not accept or store any identity fields”，但访问日志天然会记录 IP、UA、时间。匿名承诺必须在**整个链路**上成立，不能只看 `feedback` 表。

---

## 1. 服务端请求日志

### 1.1 字段契约

每处理完一个请求，输出一行 JSON；字段固定，不随业务变化。

| 字段 | 类型 | 来源 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `request_id` | string | 服务端 `Uuid::new_v4()` | `0f3a...` | 同时写入响应头 `x-request-id`，前端报错时带上 |
| `user_id` | string | JWT `sub` | `8c2e...` | 未登录/匿名路径为 `-`，绝不写工号 |
| `method` | string | 请求行 | `PUT` | |
| `path` | string | `uri().path()` | `/api/timesheets/2026-11-11` | 原始路径，截断 200 字符，不含 query |
| `route` | string | 路径归一化 | `/api/timesheets/:id` | 低基数，写 `request_log.path` 用这个 |
| `status` | number | 响应 | `200` | |
| `latency_ms` | number | `Instant::elapsed` | `37` | 毫秒，整数 |
| `ip` | string | `ConnectInfo` 或可信代理头 | `10.12.3.4` | 匿名反馈路径为 `-` |
| `user_agent` | string | `User-Agent` | `Mozilla/5.0 ...` | 截断 256 字符，去控制字符 |

不记录的字段：query string、请求体、响应体、`Authorization`、`Cookie`、`Set-Cookie`、员工姓名/邮箱、反馈正文、工时备注。

### 1.2 依赖调整

```toml
# Cargo.toml
[dependencies]
tracing-subscriber = { version = "0.3", features = ["env-filter", "json", "chrono"] }
tracing-appender = "0.2"
sqlx = { version = "0.9", features = [
    "runtime-tokio", "postgres", "chrono", "uuid", "migrate", "macros", "ipnet",
] }
hmac = "0.12"   # 仅 audited 反馈模式需要：HMAC-SHA256(ip)
sha2 = "0.10"
```

`tracing-subscriber` 用 `chrono` 特性复用已有依赖，不额外引入 `time` crate。`sqlx` 的 `ipnet` 特性用于把 `std::net::IpAddr` 直接绑定到 `INET` 列。

### 1.3 初始化：JSON + 按天切割

```rust
// src/telemetry.rs
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

pub fn init_tracing(
    log_dir: &str,
    max_files: usize,
) -> anyhow::Result<tracing_appender::non_blocking::WorkerGuard> {
    let appender = tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("api")
        .filename_suffix("jsonl")
        .max_log_files(max_files)          // 到轮转点时顺带清理旧文件
        .build(log_dir)?;
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "ics_timesheet_api=info,tower_http=info,sqlx=warn".into());

    let json_layer = fmt::layer()
        .json()
        .flatten_event(true)               // 事件字段放在根对象
        .with_current_span(true)           // span 字段放在 "span" 对象
        .with_span_list(false)
        .with_ansi(false)
        .with_timer(fmt::time::UtcTime::rfc_3339())
        .with_writer(writer);

    // LOG_CONSOLE=1 时额外输出人类可读日志，便于本地开发
    if std::env::var("LOG_CONSOLE").as_deref() == Ok("1") {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt::layer().compact())
            .with(json_layer)
            .init();
    } else {
        tracing_subscriber::registry().with(filter).with(json_layer).init();
    }

    Ok(guard)
}
```

`main` 里必须把 guard 绑定到变量，直到进程结束：

```rust
let _log_guard = telemetry::init_tracing(&config.log_dir, config.log_max_files)?;
```

落盘位置与权限：

- 目录 `LOG_DIR`（默认 `./logs`），启动时 `std::fs::create_dir_all`；权限 `0700`，文件 `0600`。
- 文件名形如 `api.2026-11-11.jsonl`。
- `logs/` 加入 `.gitignore`，且不在静态站点目录（当前 `ServeDir("../dist")` 之外，天然安全）。
- `max_log_files` 不是可靠保留策略，另加一条 cron：`find "$LOG_DIR" -name 'api.*.jsonl' -mtime +14 -delete`。

**退出刷盘**：`WorkerGuard` 在 drop 时 flush。当前 `main` 没有优雅停机，SIGTERM 可能丢最后一批日志。建议补 `axum::serve(...).with_graceful_shutdown(shutdown_signal())`，收到 SIGTERM 后先停接收再退出。

### 1.4 请求上下文中间件

生成 `request_id`、解析身份、计算 IP/UA、输出访问日志、投递数据库。**不要用 `SetRequestIdLayer`**：它会把客户端传入的 `x-request-id` 原样保留，攻击者可以伪造日志关联。这里始终服务端生成。

```rust
// src/telemetry.rs
use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    str::FromStr,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::Next,
    response::Response,
};
use chrono::{DateTime, Utc};
use uuid::Uuid;

pub const REQUEST_ID_HEADER: &str = "x-request-id";

#[derive(Clone, Debug)]
pub struct RequestCtx {
    pub request_id: String,
    pub started_at: DateTime<Utc>,
    pub method: String,
    pub path: String,       // 原始路径，仅文件日志
    pub route: String,      // 归一化模板，写库
    pub user_id: Option<String>,
    pub role: Option<String>,
    pub ip: Option<IpAddr>,
    pub user_agent: String,
    pub anonymous: bool,    // 匿名反馈请求：全链路不落身份
}

pub async fn request_context(
    State(state): State<crate::state::AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();

    // 匿名反馈：不解析 token、不取 IP/UA，从入口就断开身份关联
    let anonymous = state.config.feedback_mode.is_anonymous()
        && method == Method::POST.as_str()
        && path == "/api/feedback";

    let claims = if anonymous {
        None
    } else {
        crate::auth::claims_from_headers(req.headers(), &state.config.jwt_secret)
    };
    let ip = if anonymous { None } else { client_ip(&req, state.config.trust_proxy) };
    let user_agent = if anonymous {
        "redacted".to_string()
    } else {
        truncated(req.headers().get(header::USER_AGENT).and_then(|v| v.to_str().ok()), 256)
    };

    let ctx = RequestCtx {
        request_id: Uuid::new_v4().to_string(),
        started_at: Utc::now(),
        method,
        path: truncated(Some(&path), 200),
        route: normalize_path(&path),
        user_id: claims.as_ref().map(|c| c.sub.clone()),
        role: claims.as_ref().map(|c| c.role.clone()),
        ip,
        user_agent,
        anonymous,
    };

    if let Ok(value) = HeaderValue::from_str(&ctx.request_id) {
        req.headers_mut().insert(REQUEST_ID_HEADER, value);
    }
    req.extensions_mut().insert(ctx.clone());

    let started = Instant::now();
    let mut response = next.run(req).await;
    let latency = started.elapsed();

    if let Ok(value) = HeaderValue::from_str(&ctx.request_id) {
        response.headers_mut().insert(REQUEST_ID_HEADER, value);
    }

    log_access(&ctx, response.status(), latency);
    state.telemetry.record(&ctx, response.status(), latency);

    response
}

fn client_ip(req: &Request, trust_proxy: bool) -> Option<IpAddr> {
    // 只有当反向代理会"覆盖"而不是"追加" XFF 时才可信
    if trust_proxy {
        if let Some(ip) = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .and_then(|v| IpAddr::from_str(v.trim()).ok())
        {
            return Some(ip);
        }
    }
    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip())
}

fn log_access(ctx: &RequestCtx, status: StatusCode, latency: Duration) {
    if ctx.route == "/api/health" {
        return;
    }
    let ip = ctx.ip.map(|ip| ip.to_string()).unwrap_or_else(|| "-".to_string());
    tracing::info!(
        target: "ics_timesheet_api::access",
        request_id = %ctx.request_id,
        user_id = ctx.user_id.as_deref().unwrap_or("-"),
        method = %ctx.method,
        path = %ctx.path,
        route = %ctx.route,
        status = status.as_u16(),
        latency_ms = latency.as_millis() as u64,
        ip = %ip,
        user_agent = %ctx.user_agent,
        "request"
    );
}

fn truncated(value: Option<&str>, max: usize) -> String {
    value
        .unwrap_or("")
        .chars()
        .take(max)
        .collect::<String>()
        .replace(['\n', '\r', '\t'], " ")
}

/// 只做低基数化，不追求完整路由模板：
/// /api/timesheets/2026-11-11 -> /api/timesheets/:id
/// /api/admin/users/<uuid>    -> /api/admin/users/:id
pub fn normalize_path(path: &str) -> String {
    path.split('/')
        .map(|seg| {
            if seg.is_empty() {
                return String::new();
            }
            let bytes = seg.as_bytes();
            let is_date = bytes.len() == 10 && bytes[4] == b'-' && bytes[7] == b'-';
            let is_uuid = bytes.len() == 36 && seg.matches('-').count() == 4;
            let is_number = seg.chars().all(|c| c.is_ascii_digit());
            if is_date || is_uuid || is_number {
                ":id".to_string()
            } else {
                seg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}
```

注意：

- `ConnectInfo` 只有在 `main` 改用 `into_make_service_with_connect_info::<SocketAddr>()` 后才存在；否则 `ip` 为 `None`。
- `TRUST_PROXY=true` 仅在 nginx/网关会覆盖 `X-Forwarded-For` 时打开；否则客户端可以伪造首段 IP。
- `path` 不包含 query，`/api/timesheets?year=2026&month=11` 的查询参数不会进日志。

### 1.5 `TraceLayer` 接线

`TraceLayer` 负责 span 生命周期、5xx 失败分类和错误日志；访问日志由上面的中间件负责，避免在 `on_response` 里拿不到请求信息。

```rust
// src/telemetry.rs
use axum::http::Request as HttpRequest;
use tower_http::trace::MakeSpan;
use tracing::Span;

pub struct HttpSpan;

impl<B> MakeSpan<B> for HttpSpan {
    fn make_span(&mut self, req: &HttpRequest<B>) -> Span {
        match req.extensions().get::<RequestCtx>() {
            Some(ctx) => tracing::info_span!(
                "http.request",
                request_id = %ctx.request_id,
                user_id = ctx.user_id.as_deref().unwrap_or("-"),
                method = %ctx.method,
                path = %ctx.path,
            ),
            None => tracing::info_span!("http.request"),
        }
    }
}
```

```rust
// src/main.rs
use axum::{middleware, routing::get, Router};
use tower_http::trace::TraceLayer;

let api_state = state.clone();
let api = routes::api_router()
    .with_state(state)
    .layer(TraceLayer::new_for_http().make_span_with(telemetry::HttpSpan))
    .layer(middleware::from_fn_with_state(
        api_state,
        telemetry::request_context,
    ));

let app = Router::new()
    .route("/api/health", get(health))
    .nest("/api", api)
    .fallback_service(/* 原样 */)
    .layer(CompressionLayer::new())
    .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
    .layer(
        CorsLayer::new()
            .allow_origin(/* 见 5.3，改成白名单 */)
            .allow_methods(Any)
            .allow_headers(Any)
            .expose_headers([axum::http::HeaderName::from_static("x-request-id")]),
    );

let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
axum::serve(
    listener,
    app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
)
.await?;
```

层顺序（从外到内）：`CORS → body limit → compression → request_context → TraceLayer → routes`。`TraceLayer` 的默认 `on_response` 是 DEBUG 级，`RUST_LOG=info` 时不会重复输出；如果有人把级别调到 `debug`，会多一行 “finished processing request”，属于预期。

### 1.6 一行日志长什么样

```json
{
  "timestamp": "2026-11-11T09:15:22.481Z",
  "level": "INFO",
  "fields": {
    "message": "request",
    "request_id": "6b0f2f0e-5f0e-4a6e-9f3f-2f4a1c8d9e01",
    "user_id": "a1b2c3d4-...",
    "method": "PUT",
    "path": "/api/timesheets/2026-11-10",
    "route": "/api/timesheets/:id",
    "status": 200,
    "latency_ms": 37,
    "ip": "10.12.3.4",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
  },
  "target": "ics_timesheet_api::access",
  "span": {
    "name": "http.request",
    "request_id": "6b0f2f0e-...",
    "user_id": "a1b2c3d4-...",
    "method": "PUT",
    "path": "/api/timesheets/2026-11-10"
  }
}
```

字段在文件里是 `fields.*` 与 `span.*` 两层。若需要送 Doris/ES 的扁平表，用 Vector/Fluent Bit 做一次 `merge(., .span) | del(.span)` 即可；日常排障用 `jq` 足够。

### 1.7 轮转、容量与估算

假设 200 人、人均 15 次 API 请求/天，加上监控探针约 5,000 行/天：

| 项 | 估算 |
| --- | --- |
| 单行大小 | 0.6–1.0 KB |
| 每天 | 3–5 MB |
| 保留 14 天 | 40–70 MB |
| 峰值写入 | 每秒个位数，`non_blocking` 完全够用 |

健康检查 `/api/health` 不记访问日志（避免探针刷量）；静态资源也不经过 API 路由，不记录。

### 1.8 验收

```bash
# 1. 响应头必须有 request_id
curl -si http://127.0.0.1:8080/api/health | grep -i x-request-id

# 2. 客户端伪造的 request_id 必须被覆盖
curl -si http://127.0.0.1:8080/api/health \
  -H 'x-request-id: attacker-chosen' | grep -i x-request-id

# 3. 登录后 user_id 必须出现在日志里
TOKEN=$(curl -s http://127.0.0.1:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"employeeNo":"MG-0001","password":"..."}' | jq -r .token)
curl -s http://127.0.0.1:8080/api/auth/me -H "authorization: Bearer $TOKEN" > /dev/null
tail -n 1 logs/api.$(date +%F).jsonl | jq '.fields | {request_id,user_id,method,path,status,latency_ms,ip}'

# 4. 匿名反馈路径不得出现 IP/UA/user_id
curl -s -X POST http://127.0.0.1:8080/api/feedback \
  -H 'content-type: application/json' -d '{"content":"test"}' > /dev/null
tail -n 1 logs/api.$(date +%F).jsonl | jq '.fields | {ip,user_agent,user_id}'
# 期望：ip="-"、user_agent="redacted"、user_id="-"
```

---

## 2. 业务审计与 `request_log`

### 2.1 三者分工

| | `audit_log` | `request_log` | JSONL 文件日志 |
| --- | --- | --- | --- |
| 目的 | 业务动作追责：谁改了哪条数据 | 技术可观测：请求量、错误率、延迟 | 排障原始记录 |
| 写入方式 | 与业务事务同一事务 | 异步旁路，允许丢 | 同步非阻塞写 |
| 失败影响 | 业务回滚 | 业务不受影响 | 业务不受影响 |
| 内容 | `actor/action/entity/detail` | `method/path/status/latency/ip/ua` | 全部访问字段 |
| 保留 | 3 年 | 约 90 天 | 14 天 |
| 访问 | 管理后台 + DBA | 运维/只读报表 | 运维登录服务器 |
| 可变性 | append-only | 可清空/分区删除 | 按天删除 |

结论：**审计不是日志，日志也不是审计**。不能用 `request_log` 回答“谁把 11 月 10 日的工时从 8h 改成 6h”，也不能用 `audit_log` 算 P95 延迟。

### 2.2 `audit_log` 增强

```sql
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip INET;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
```

`AuthUser` 携带请求上下文，`audit()` 不再只接收 `actor_id`：

```rust
// src/auth.rs
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub role: String,
    pub request_id: String,
    pub ip: Option<std::net::IpAddr>,
    pub user_agent: String,
}
```

```rust
// src/routes/config.rs
pub(crate) async fn audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: &crate::auth::AuthUser,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
    detail: Option<&str>,
) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO audit_log
           (id, actor_id, action, entity_type, entity_id, detail, request_id, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&actor.id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(detail)
    .bind(&actor.request_id)
    .bind(actor.ip.map(mask_ip))
    .bind(&actor.user_agent)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
```

调用点从 `audit(&mut tx, &auth.id, ...)` 改为 `audit(&mut tx, &auth, ...)`，共 7 处（`timesheets.rs`、`config.rs`、`admin.rs` ×3、`feedback.rs` ×2）。`AuthUser::from_request_parts` 从 `RequestCtx` 扩展读取 `id/role/request_id/ip/user_agent`；若扩展不存在（单测直接调 handler），回落到原来的 JWT 解析逻辑，错误文案保持不变。

`audit_log.ip` 存**掩码 IP**（IPv4 `/24`、IPv6 `/48`）。追责主要靠 `actor_id`，IP 只是辅助；3 年保留全量 IP 没有必要。

### 2.3 `request_log` DDL

```sql
CREATE TABLE IF NOT EXISTS request_log (
    request_id  TEXT        NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    user_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
    method      TEXT        NOT NULL,
    path        TEXT        NOT NULL,   -- 归一化模板，如 /api/timesheets/:id
    status      SMALLINT    NOT NULL,
    latency_ms  INTEGER     NOT NULL,
    ip          INET,                   -- 写入时即掩码
    user_agent  TEXT,
    PRIMARY KEY (occurred_at, request_id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_request_log_user
    ON request_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_log_errors
    ON request_log(status, occurred_at DESC) WHERE status >= 400;
CREATE INDEX IF NOT EXISTS idx_request_log_brin
    ON request_log USING BRIN (occurred_at);
```

设计说明：

- 分区键是 `occurred_at`，主键必须包含它；`request_id` 只在单天内唯一，跨分区不去重（重试导致的重复插入由 `ON CONFLICT (occurred_at, request_id) DO NOTHING` 兜底）。
- `user_id` 外键 `ON DELETE SET NULL`：删除用户后历史统计仍保留，但不再关联到人。
- `ip` 写库前掩码：IPv4 末段置 0，IPv6 后 5 段置 0。需要全量 IP 时看 14 天内的文件日志。
- `path` 存归一化模板，避免 `/api/timesheets/<date>` 这种高基数把索引打爆。原始路径只在文件日志里。

### 2.4 写入路径：异步、批量、可丢

```rust
// src/telemetry.rs
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use tokio::sync::mpsc;

pub struct RequestLogEntry {
    pub request_id: String,
    pub occurred_at: DateTime<Utc>,
    pub user_id: Option<String>,
    pub method: String,
    pub path: String,
    pub status: i16,
    pub latency_ms: i32,
    pub ip: Option<IpAddr>,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct TelemetryHandle {
    tx: Option<mpsc::Sender<RequestLogEntry>>,
    sample_pct: u8,
    dropped: Arc<AtomicU64>,
}

impl TelemetryHandle {
    pub fn record(&self, ctx: &RequestCtx, status: StatusCode, latency: Duration) {
        if !should_persist(ctx, status, self.sample_pct) {
            return;
        }
        let Some(tx) = &self.tx else { return };
        let entry = RequestLogEntry {
            request_id: ctx.request_id.clone(),
            occurred_at: ctx.started_at,
            user_id: ctx.user_id.clone(),
            method: ctx.method.clone(),
            path: ctx.route.clone(),
            status: status.as_u16() as i16,
            latency_ms: latency.as_millis().min(i32::MAX as u128) as i32,
            ip: ctx.ip.map(mask_ip),
            user_agent: Some(ctx.user_agent.clone()).filter(|s| !s.is_empty()),
        };
        if tx.try_send(entry).is_err() {
            let total = self.dropped.fetch_add(1, Ordering::Relaxed) + 1;
            if total % 1000 == 1 {
                tracing::warn!(dropped_total = total, "request_log queue full, entry dropped");
            }
        }
    }
}

fn should_persist(ctx: &RequestCtx, status: StatusCode, sample_pct: u8) -> bool {
    if ctx.anonymous || ctx.route == "/api/health" || ctx.route.starts_with("/api/events") {
        return false;
    }
    // 客户端错误与服务端错误全量保留
    if status.is_client_error() || status.is_server_error() {
        return true;
    }
    // 写操作全量保留
    if !matches!(ctx.method.as_str(), "GET" | "HEAD" | "OPTIONS") {
        return true;
    }
    sampled(&ctx.request_id, sample_pct)
}

fn sampled(request_id: &str, pct: u8) -> bool {
    if pct >= 100 {
        return true;
    }
    if pct == 0 {
        return false;
    }
    request_id
        .get(..8)
        .and_then(|head| u32::from_str_radix(head, 16).ok())
        .map(|value| value % 100 < pct as u32)
        .unwrap_or(true)
}
```

```rust
// src/telemetry.rs（续）
pub fn spawn_writer(pool: sqlx::PgPool, mut rx: mpsc::Receiver<RequestLogEntry>) {
    tokio::spawn(async move {
        let mut batch = Vec::with_capacity(256);
        let mut ticker = tokio::time::interval(Duration::from_secs(2));
        loop {
            tokio::select! {
                maybe = rx.recv() => match maybe {
                    Some(entry) => {
                        batch.push(entry);
                        if batch.len() >= 200 {
                            flush(&pool, &mut batch).await;
                        }
                    }
                    None => break,
                },
                _ = ticker.tick() => {
                    if !batch.is_empty() {
                        flush(&pool, &mut batch).await;
                    }
                }
            }
        }
        if !batch.is_empty() {
            flush(&pool, &mut batch).await;
        }
    });
}

async fn flush(pool: &sqlx::PgPool, batch: &mut Vec<RequestLogEntry>) {
    use sqlx::QueryBuilder;
    let mut qb = QueryBuilder::new(
        "INSERT INTO request_log
           (request_id, occurred_at, user_id, method, path, status, latency_ms, ip, user_agent) ",
    );
    qb.push_values(batch.drain(..), |mut row, entry| {
        row.push_bind(entry.request_id)
            .push_bind(entry.occurred_at)
            .push_bind(entry.user_id)
            .push_bind(entry.method)
            .push_bind(entry.path)
            .push_bind(entry.status)
            .push_bind(entry.latency_ms)
            .push_bind(entry.ip)
            .push_bind(entry.user_agent);
    });
    qb.push(" ON CONFLICT (occurred_at, request_id) DO NOTHING");

    if let Err(error) = qb.build().execute(pool).await {
        // 数据库不可用时丢弃这一批，绝不反压业务请求
        tracing::warn!(rows = batch.len(), %error, "request_log insert failed, batch dropped");
    }
}
```

容量与失败策略：

| 参数 | 值 | 理由 |
| --- | --- | --- |
| channel 容量 | 2048 | 约 1–2 秒的峰值缓冲 |
| 批量大小 | 200 | 单条 SQL 参数 1800 个，远低于 PostgreSQL 上限 |
| flush 间隔 | 2 s | 延迟可接受，写入合并率高 |
| 队列满 | 丢弃 + 计数告警 | 可观测性不能影响业务 |
| DB 故障 | 丢弃当前批 | 不重试，不积压内存 |

`REQUEST_LOG_SAMPLE_PCT` 默认 100；量级上来后降到 10 即可，4xx/5xx 与写操作仍然全量。

### 2.5 分区维护与保留

迁移里只建表，不写死月份；启动时调用 SQL 函数补齐当前及未来两个月：

```sql
CREATE OR REPLACE FUNCTION ensure_telemetry_partitions() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    m date;
    i int;
BEGIN
    FOR i IN 0..2 LOOP
        m := (date_trunc('month', now()) + (i || ' month')::interval)::date;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS request_log_%s PARTITION OF request_log
             FOR VALUES FROM (%L) TO (%L)',
            to_char(m, 'YYYY_MM'), m, m + interval '1 month');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS frontend_event_%s PARTITION OF frontend_event
             FOR VALUES FROM (%L) TO (%L)',
            to_char(m, 'YYYY_MM'), m, m + interval '1 month');
    END LOOP;
END $$;
```

```rust
// src/db.rs，migrate 之后
sqlx::query("SELECT ensure_telemetry_partitions()").execute(&pool).await?;
```

保留策略：

| 数据 | 保留 | 实际范围 | 清理 |
| --- | --- | --- | --- |
| `request_log` 原始行 | 约 90 天 | 90–120 天（按月分区） | 每月 `DROP TABLE request_log_YYYY_MM` |
| `request_metrics_daily` | 13 个月 | 精确按天 | `DELETE WHERE day < current_date - 395` |
| `frontend_event` | 约 30 天 | 30–60 天（按月分区） | 每月 `DROP TABLE frontend_event_YYYY_MM` |
| JSONL 文件 | 14 天 | 精确 | `max_log_files` + cron `find -mtime +14 -delete` |

```sql
-- scripts/telemetry-retention.sql，每月 1 日执行
DO $$
BEGIN
    EXECUTE format('DROP TABLE IF EXISTS request_log_%s',
        to_char(now() - interval '4 months', 'YYYY_MM'));
    EXECUTE format('DROP TABLE IF EXISTS frontend_event_%s',
        to_char(now() - interval '2 months', 'YYYY_MM'));
    DELETE FROM request_metrics_daily WHERE day < current_date - 395;
END $$;
```

日聚合（每天 02:10 跑前一天，幂等）：

```sql
INSERT INTO request_metrics_daily (day, path, method, status_class, requests, errors, p95_ms)
SELECT occurred_at::date,
       path,
       method,
       (status / 100) * 100,
       count(*),
       count(*) FILTER (WHERE status >= 500),
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int
FROM request_log
WHERE occurred_at >= current_date - 1
  AND occurred_at <  current_date
GROUP BY 1, 2, 3, 4
ON CONFLICT (day, path, method, status_class) DO UPDATE
SET requests = excluded.requests,
    errors = excluded.errors,
    p95_ms = excluded.p95_ms;
```

### 2.6 这套表能回答什么

```sql
-- 1. 昨天错误率最高的接口
SELECT path, count(*) AS total,
       count(*) FILTER (WHERE status >= 400) AS failed,
       round(100.0 * count(*) FILTER (WHERE status >= 400) / count(*), 1) AS fail_pct
FROM request_log
WHERE occurred_at >= current_date - 1 AND occurred_at < current_date
GROUP BY path ORDER BY failed DESC LIMIT 10;

-- 2. P95 最慢的接口
SELECT path,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms,
       count(*) AS requests
FROM request_log
WHERE occurred_at >= now() - interval '24 hours'
GROUP BY path ORDER BY p95_ms DESC LIMIT 10;

-- 3. 登录失败来源（IP 已掩码到 /24，只看网段）
SELECT ip, count(*) AS failures
FROM request_log
WHERE path = '/api/auth/login' AND status = 401
  AND occurred_at >= now() - interval '1 hour'
GROUP BY ip ORDER BY failures DESC LIMIT 10;

-- 4. 某个业务动作对应的 HTTP 请求
SELECT a.created_at, a.action, a.entity_type, a.entity_id, a.detail,
       r.method, r.path, r.status, r.latency_ms, r.ip
FROM audit_log a
LEFT JOIN request_log r ON r.request_id = a.request_id
WHERE a.actor_id = $1
ORDER BY a.created_at DESC
LIMIT 50;
```

第 4 条查询要求 `audit_log.request_id` 已回填；旧数据为 `NULL`，join 不出来是正常的。

---

## 3. 前端盲区与 `/api/events`

### 3.1 没有前端埋点时看不到什么

| 现象 | 服务端能看到 | 结论 | 最小事件 |
| --- | --- | --- | --- |
| 用户点「保存」，前端校验不通过 | 0 个请求 | 看起来像“没填”，实际是被规则拦住 | `form.validation_fail{rule,field}` |
| 用户反复点保存/切换日期 | 只有 1 个请求或看不出来 | 不知道有重复点击、误操作 | `ui.click{target}`（只埋关键按钮） |
| SPA 路由切换、返回、退出 | 0 个请求 | 漏斗断在哪个页面完全不可见 | `route.change{from,to}` |
| JS 异常、白屏、组件崩溃 | 0 个请求 | 只能等用户投诉 | `js.error{message,source,line,kind}` |
| 导出、复制昨天、预填一周 | 纯前端动作 | 功能使用率不可见 | `ui.click{target}` |
| 离线/网络失败 | 请求根本没到服务端 | 误判为“用户没用” | `api.error{endpoint,status:0}` |
| 填了一半切走 | 无请求 | 流失点未知 | `save.abandon{date,dirtyFields}` |
| 打开反馈弹窗但没提交 | 无请求 | 反馈入口转化率未知 | `feedback.open` / `feedback.submit` |
| 前端版本不一致导致旧缓存行为 | 只能看到 UA | 无法区分版本 | `app.boot{appVersion}` |

结论：请求日志只能回答“服务端收到了什么”，回答不了“用户想做什么但没做成”。前端事件的作用是补**意图**，不是复制一份请求日志。

### 3.2 事件契约

请求体：

```json
{
  "sessionId": "8f0c2a5e-...",
  "anonId": "c1d2e3f4-...",
  "appVersion": "2026.11.1",
  "events": [
    {
      "id": "5b1e...",
      "name": "form.validation_fail",
      "ts": 1762842922000,
      "route": "/timesheet",
      "props": { "rule": "hours_sum", "field": "entries" }
    }
  ]
}
```

约束：

| 项 | 规则 |
| --- | --- |
| 批量 | 1–50 条/请求 |
| 请求体 | ≤ 32 KB（`DefaultBodyLimit`） |
| `sessionId` / `anonId` | 8–64 字符，`[A-Za-z0-9_-]` |
| `id` | 客户端 `crypto.randomUUID()`，用于服务端去重 |
| `name` | 必须命中白名单，未知事件整条丢弃 |
| `route` | 以 `/` 开头，≤ 120 字符，不含 `?` |
| `props` | 只允许标量（string/number/bool）；按事件白名单过滤 key；字符串 ≤ 200 字符 |
| `ts` | 客户端毫秒时间戳；与服务端时间偏差 > 7 天则丢弃该字段，以服务端时间为准 |
| 身份 | 服务端从 `Authorization` 解析；**不接受**客户端传 `userId`/`employeeNo` |

事件白名单（与 3.4 的 `allowed_prop` 保持同一份）：

| `name` | 允许的 `props` | 触发点 | 备注 |
| --- | --- | --- | --- |
| `app.boot` | `online` | 应用启动 | 100% |
| `route.change` | `from`, `to` | pushState/replaceState/popstate | 只记路径 |
| `ui.click` | `target` | 保存、复制昨天、预填一周、导出、后台保存用户、打开反馈 | `target` 是枚举，不是任意字符串 |
| `form.validation_fail` | `rule`, `field` | 前端校验失败 | **不传输入值** |
| `api.error` | `endpoint`, `status`, `code` | fetch 失败/非 2xx | `endpoint` 用归一化路径 |
| `js.error` | `message`, `source`, `line`, `kind` | `error` / `unhandledrejection` | `message` 截断 200，不传 stack |
| `save.success` | `date`, `entries`, `totalHours` | 保存成功 | 与后端审计可对齐 |
| `save.abandon` | `date`, `dirtyFields` | 有未保存修改时离开 | 只传字段个数 |
| `feedback.open` | `source` | 打开反馈弹窗 | |
| `feedback.submit` | `mode` | 提交成功 | `mode` 由服务端配置决定，前端只回显 |
| `export.click` | `scope` | 点击导出 | `month` / `all` |

明确禁止：`remark` 内容、反馈正文、姓名、工号、邮箱、密码、token、任意表单输入值、URL query。

### 3.3 客户端 SDK（约 40 行）

```ts
// src/lib/telemetry.ts
type Props = Record<string, string | number | boolean>;
type Ev = { id: string; name: string; ts: number; route: string; props?: Props };

const ENDPOINT = '/api/events';
const MAX_QUEUE = 200;
const queue: Ev[] = [];
let timer: number | undefined;

const uuid = () =>
  crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const route = () =>
  location.pathname.replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, '/:date');

export function track(name: string, props?: Props) {
  try {
    queue.push({ id: uuid(), name, ts: Date.now(), route: route(), props });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (queue.length >= 10) void flush(false);
    else timer ??= window.setTimeout(() => { timer = undefined; void flush(false); }, 5000);
  } catch {
    /* 埋点异常绝不影响业务 */
  }
}

async function flush(beacon: boolean) {
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({
    sessionId: sessionId(),
    anonId: anonId(),
    appVersion: APP_VERSION,
    events,
  });

  try {
    const token = getToken(); // 从现有登录态读取，不在 SDK 里写死 key
    // sendBeacon 不能带 Authorization；有 token 时优先 keepalive fetch
    if (beacon && !token && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    });
  } catch {
    // 放回队首，下次再试；服务端按 event.id 去重
    queue.unshift(...events);
    if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
  }
}

addEventListener('pagehide', () => void flush(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush(true);
});
addEventListener('error', (e) =>
  track('js.error', {
    message: String(e.message ?? '').slice(0, 200),
    source: (e.filename ?? '').split('?')[0].slice(0, 120),
    line: e.lineno ?? 0,
  }),
);
addEventListener('unhandledrejection', (e) =>
  track('js.error', { kind: 'promise', message: String(e.reason ?? '').slice(0, 200) }),
);

// SPA 路由
for (const fn of ['pushState', 'replaceState'] as const) {
  const original = history[fn];
  history[fn] = function (...args: Parameters<History['pushState']>) {
    const result = original.apply(this, args);
    queueMicrotask(() => track('route.change', { to: route() }));
    return result;
  } as History[typeof fn];
}
addEventListener('popstate', () => track('route.change', { to: route() }));
```

失败语义：

- 业务代码调用 `track()` 永远不 `await`、不抛错。
- 队列上限 200，超出丢最旧。
- 失败放回队首，下一次 flush 重试；服务端按 `(occurred_at, id)` 去重，重试不会产生重复行。
- `pagehide` 时如果没有 token，用 `sendBeacon`；有 token 用 `fetch(..., keepalive: true)`，避免丢失身份。
- `sendBeacon` 受浏览器 64 KB 限制，批量 50 条 + props 截断后远低于上限。

### 3.4 服务端接收

```rust
// src/routes/events.rs
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventBatch {
    pub session_id: String,
    pub anon_id: Option<String>,
    pub app_version: Option<String>,
    pub events: Vec<EventIn>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventIn {
    pub id: uuid::Uuid,
    pub name: String,
    pub ts: i64,
    pub route: String,
    #[serde(default)]
    pub props: serde_json::Map<String, serde_json::Value>,
}
```

校验顺序：

1. `events.len()` 在 `1..=50`，否则 400。
2. `session_id`/`anon_id` 字符集与长度合法，否则 400。
3. 逐条检查 `name` 白名单、`route` 形状、`props` key/值；不合法的**单条丢弃**，不整批失败。
4. `auth: Option<AuthUser>` 存在时 `user_id` 取服务端解析结果；不存在时置 `NULL`，只保留 `anon_id`。
5. 投递到与 `request_log` 相同的后台 writer（枚举消息），成功即返回：

```json
{ "accepted": 12, "dropped": 1 }
```

HTTP 状态用 `202 Accepted`。`sendBeacon` 不读响应，返回体只用于调试和前端自测。

路由注册：

```rust
use axum::extract::DefaultBodyLimit;

.route(
    "/events",
    post(events::ingest).layer(DefaultBodyLimit::max(32 * 1024)),
)
```

表结构：

```sql
CREATE TABLE IF NOT EXISTS frontend_event (
    id          UUID        NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 服务端接收时间
    client_ts   TIMESTAMPTZ,                          -- 客户端时间，可能为 NULL
    session_id  TEXT        NOT NULL,
    anon_id     TEXT,
    user_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    route       TEXT        NOT NULL,
    props       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    app_version TEXT,
    ip          INET,                                 -- 掩码
    user_agent  TEXT,
    PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_frontend_event_name
    ON frontend_event(name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_frontend_event_session
    ON frontend_event(session_id, occurred_at DESC);
```

### 3.5 滥用与容量

`/api/events` 是公开端点（登录页也要上报），必须有独立限流。应用前放 nginx：

```nginx
limit_req_zone $binary_remote_addr zone=events:10m rate=2r/s;
limit_req_zone $binary_remote_addr zone=feedback:10m rate=0.2r/s;

location = /api/events {
    limit_req zone=events burst=20 nodelay;
    client_max_body_size 32k;
    access_log off;              # 应用侧已有结构化日志
    proxy_pass http://127.0.0.1:8080;
}

location = /api/feedback {
    limit_req zone=feedback burst=5 nodelay;
    client_max_body_size 8k;
    access_log off;              # 匿名模式必须关闭；audited 模式按 5.1 配置脱敏
    proxy_pass http://127.0.0.1:8080;
}
```

应用层再加硬限制：批量 ≤ 50、body ≤ 32 KB、事件名白名单、props 白名单、字符串截断。即使被刷，最坏结果是磁盘增长，不会写业务表。

容量估算（200 人 × 80 事件/天 = 16,000 条/天）：

| 项 | 估算 |
| --- | --- |
| 单行（含 JSONB/索引） | 0.5–1 KB |
| 每天 | 8–16 MB |
| 保留 30–60 天 | 0.25–1 GB |

若超过 1 GB/月，优先降低 `ui.click` 粒度或开启服务端 10% 采样，不要删错误事件。

### 3.6 验收

```bash
curl -si -X POST http://127.0.0.1:8080/api/events \
  -H 'content-type: application/json' \
  -d '{"sessionId":"s-12345678","events":[{"id":"'$(uuidgen)'","name":"app.boot","ts":'$(date +%s000)',"route":"/","props":{"online":true}}]}'
# 期望 202 + {"accepted":1,"dropped":0}

# 未知事件必须被丢弃
curl -s -X POST http://127.0.0.1:8080/api/events \
  -H 'content-type: application/json' \
  -d '{"sessionId":"s-12345678","events":[{"id":"'$(uuidgen)'","name":"user.password","ts":0,"route":"/","props":{}}]}'
# 期望 accepted=0, dropped=1
```

---

## 4. 匿名反馈：两种模式

### 4.1 当前事实

- 后端 `feedback` 表只有 `id/content/status/created_at`，没有身份列，`create_feedback` 也不接收身份字段。
- 前端原型 `lib/feedback.ts` 只写内存，没有调用后端；`i18n.tsx` 已经承诺「完全匿名」「不记录姓名、工号、账号或联系方式」。
- 一旦按第 1 节接入请求日志，`POST /api/feedback` 会带上 IP、UA、`user_id`（如果浏览器恰好带着 token），「完全匿名」立即变成虚假陈述。

所以必须先选模式，再同步文案，最后才上线日志。**顺序反了就是隐私事故。**

### 4.2 两种模式

| | Mode A：真匿名（默认） | Mode B：匿名展示 + 安全审计 |
| --- | --- | --- |
| 谁能看到身份 | 没有人（应用层） | 管理员看不到；指定安全角色可按需查看 |
| `feedback_meta` | 不写行 | 每次提交写一行 |
| 访问日志 | 该路径 IP/UA/user_id 全部不记录 | 正常记录，`request_log` 保留 |
| 限流 | 内存令牌桶，IP 不落盘 | 可用持久化限流 |
| UI 承诺 | 「不记录账号、IP、设备信息」 | 「对管理员匿名；安全审计会记录账号与网络信息」 |
| 适用 | 员工信任优先、内容敏感 | 需要治理滥用/辱骂/泄密 |
| 代价 | 无法追查恶意提交 | 必须做访问控制与告知同意 |

模式由服务端环境变量 `FEEDBACK_MODE` 决定，**不能让客户端选**；否则用户可以挑一个对自己有利的模式，而文案与实际行为可能不一致。

### 4.3 Mode A：真匿名的完整清单

只把 `feedback_meta` 留空是不够的，必须逐项确认：

| # | 要求 | 落点 |
| --- | --- | --- |
| 1 | 不解析该请求的 `Authorization` | `request_context` 中 `anonymous=true` 时跳过 `claims_from_headers` |
| 2 | 文件日志 `ip="-"`、`user_agent="redacted"`、`user_id="-"` | `RequestCtx` 构造时清空 |
| 3 | 不写 `request_log` | `should_persist` 直接返回 false |
| 4 | 不写 `feedback_meta` | handler 只插 `feedback` |
| 5 | 反向代理不记该路径 | nginx `location = /api/feedback { access_log off; }` |
| 6 | 限流不持久化 IP | 进程内 `HashMap<IpAddr, Bucket>`，10 分钟过期；重启即清 |
| 7 | 响应不种 cookie | 不返回 `Set-Cookie` |
| 8 | 错误日志不打印请求体 | 全局约束，见 5.2 |
| 9 | 前端不发身份字段 | `feedback.ts` 只发 `{content}`；服务端 `deny_unknown_fields` |
| 10 | 反馈正文不进日志 | 任何层都不 `tracing::info!(body = ...)` |

必须写进文档的事实：**应用层可以做到不落身份，但网络层（交换机、运营商、终端管理软件）仍可能留痕。** UI 不要写「绝对无法追踪」，只写「应用不记录」；这是能兑现的承诺。

验收：

```sql
-- 必须为 0
SELECT count(*) FROM feedback_meta;
```

```bash
grep '/api/feedback' logs/api.$(date +%F).jsonl | tail -n 1 | jq '.fields | {ip,user_agent,user_id}'
# 期望 "-" / "redacted" / "-"
```

### 4.4 Mode B：`feedback_meta` 与访问控制

```sql
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ANONYMOUS'
    CHECK (mode IN ('ANONYMOUS', 'AUDITED'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS notice_version TEXT;

CREATE TABLE IF NOT EXISTS feedback_meta (
    feedback_id    TEXT PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
    submitter_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    ip             INET,          -- 全量，90 天后置 NULL
    ip_hash        BYTEA,         -- HMAC-SHA256(ip, IP_HASH_PEPPER)，用于关联滥用
    user_agent     TEXT,
    request_id     TEXT,
    app_version    TEXT,
    risk_score     SMALLINT NOT NULL DEFAULT 0,
    risk_reasons   TEXT[] NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_meta_ip_hash ON feedback_meta(ip_hash);
CREATE INDEX IF NOT EXISTS idx_feedback_meta_created ON feedback_meta(created_at);
```

写入（与 `feedback` 同一事务）：

```rust
let mut tx = state.db.begin().await?;
sqlx::query(
    "INSERT INTO feedback (id, content, status, mode, notice_version)
     VALUES ($1, $2, 'open', $3, $4)",
)
.bind(&id).bind(content).bind(mode.as_str()).bind(&state.config.notice_version)
.execute(&mut *tx).await?;

if mode == FeedbackMode::Audited {
    sqlx::query(
        "INSERT INTO feedback_meta
           (feedback_id, submitter_id, ip, ip_hash, user_agent, request_id, app_version,
            risk_score, risk_reasons)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&id)
    .bind(auth.as_ref().map(|a| a.id.as_str()))
    .bind(ctx.ip)
    .bind(ctx.ip.map(|ip| hash_ip(ip, &state.config.ip_hash_pepper)))
    .bind(&ctx.user_agent)
    .bind(&ctx.request_id)
    .bind(env!("CARGO_PKG_VERSION"))
    .bind(risk_score)
    .bind(&risk_reasons)
    .execute(&mut *tx).await?;
}
tx.commit().await?;
```

`hash_ip` 用 HMAC-SHA256，pepper 放环境变量 `IP_HASH_PEPPER`（≥32 字节），每季度轮换；轮换后旧 hash 无法与新数据关联，这是有意的。

风险评分只做规则，不做 ML：

| 信号 | 分值 | 目的 |
| --- | --- | --- |
| 未登录提交 | +20 | 无账号可追时提高关注 |
| 正文 < 5 字 | +10 | 垃圾/误触 |
| 含 URL | +15 | 广告/钓鱼 |
| 同 `ip_hash` 10 分钟内 > 3 条 | +30 | 刷屏 |

`risk_score >= 50` 的记录由安全角色在库里筛，**不在管理后台展示**，避免管理员通过风险标签反推身份。

访问控制（核心：管理 API 永远不 join `feedback_meta`）：

| 角色 | `feedback` | `feedback_meta` | 说明 |
| --- | --- | --- | --- |
| 应用账号 `timesheet_app` | SELECT/UPDATE/DELETE | 仅 INSERT | 用于写入，不能读回 |
| 管理后台（`SUPER_ADMIN`） | 通过 `/api/admin/feedback` 读写 | 无接口 | `FeedbackRow` 不含任何 meta 字段 |
| `feedback_auditor`（NOLOGIN） | 无 | 只能执行脱敏查询函数 | 需填 reason，自动留痕 |
| `security_admin`（NOLOGIN） | 无 | 仅全量 IP 查询 | 双人审批后使用 |

脱敏查询函数：

```sql
CREATE TABLE IF NOT EXISTS security_access_log (
    id        BIGSERIAL PRIMARY KEY,
    db_role   TEXT NOT NULL,
    action    TEXT NOT NULL,
    entity_id TEXT,
    reason    TEXT NOT NULL,
    at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION feedback_meta_lookup(p_id TEXT, p_reason TEXT)
RETURNS TABLE (
    feedback_id TEXT, submitter_id TEXT, ip_masked TEXT,
    user_agent TEXT, request_id TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
        RAISE EXCEPTION 'reason must be at least 8 characters';
    END IF;

    INSERT INTO security_access_log (db_role, action, entity_id, reason)
    VALUES (current_user, 'FEEDBACK_META_VIEW', p_id, p_reason);

    RETURN QUERY
    SELECT m.feedback_id,
           m.submitter_id,
           CASE
               WHEN m.ip IS NULL THEN NULL
               WHEN family(m.ip) = 4 THEN set_masklen(m.ip, 24)::text
               ELSE set_masklen(m.ip, 48)::text
           END,
           m.user_agent,
           m.request_id,
           m.created_at
    FROM feedback_meta m
    WHERE m.feedback_id = p_id;
END $$;

REVOKE ALL ON FUNCTION feedback_meta_lookup(TEXT, TEXT) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION feedback_meta_lookup(TEXT, TEXT) TO feedback_auditor;
```

关键前提：**应用账号不能是表 owner**。如果 `timesheet_app` 是 `feedback_meta` 的 owner，所有 `REVOKE` 都无效。生产环境用独立迁移角色建表，应用角色只授 `INSERT`：

```sql
-- 由迁移角色执行
REVOKE ALL ON feedback_meta FROM PUBLIC;
GRANT INSERT ON feedback_meta TO timesheet_app;
```

本地单用户开发无法验证这一点，必须在预发环境用两个角色跑一次 `SELECT` 被拒绝的测试。

### 4.5 UI 文案必须同步改

当前文案（`src/prototypes/timesheet/i18n.tsx:26-42`、`97-107`；弹窗在 `LoginPage.tsx:124-151`；后台说明在 `AdminPage.tsx:567-573`）是按「完全匿名」写的。模式切换时必须整组替换，不能只改标题。

**Mode A（真匿名）**：

| key | 现在 | 改为 |
| --- | --- | --- |
| `feedback.privacyTitle` | 完全匿名 / Fully anonymous | 匿名提交 / Anonymous submission |
| `feedback.privacyBody` | 不记录姓名、工号、账号或联系方式；后台只看到反馈内容、提交时间和处理状态。 | 不记录姓名、工号、账号、IP 或设备信息；后台只看到反馈内容、提交时间和处理状态。 |
| `admin.feedbackDesc` | 来自登录页的匿名反馈，不含提交人信息。 | 保持不变（Mode A 下这句话成立） |

**Mode B（匿名展示 + 安全审计）**：

| key | 现在 | 改为 |
| --- | --- | --- |
| `feedback.entry` | 匿名反馈 | 反馈（匿名展示） |
| `feedback.title` | 匿名反馈 | 匿名展示的反馈 |
| `feedback.subtitle` | 不需要登录，任何人可提交。 | 不需要登录。管理员只看到内容，不显示你的姓名或工号。 |
| `feedback.privacyTitle` | 完全匿名 | 匿名展示，安全留痕 |
| `feedback.privacyBody` | 不记录姓名、工号、账号或联系方式…… | 为处理滥用与安全事件，系统会记录提交账号、IP 和设备信息，仅在安全审计时由指定人员查看，IP 保留 90 天。姓名和工号不会展示给管理员。 |
| `feedback.submit` | 提交反馈 | 我已知悉，提交 |
| `admin.feedbackDesc` | 来自登录页的匿名反馈，不含提交人信息。 | 对管理员匿名展示；身份与网络信息仅安全审计可见。 |

Mode B 还必须在提交按钮上方加一个必选勾选框（`feedback.consent`：「我已阅读并同意上述说明」），未勾选不能提交。这是告知同意的痕迹，`notice_version` 随反馈一起存。

发布门禁：**`FEEDBACK_MODE` 与 i18n 文案必须在同一次发布**。如果先上 audited 模式、文案还是「完全匿名」，就是误导用户；如果先改文案、后端还是 anonymous，则是过度承诺。前端取不到 `/api/public-config` 时，直接禁用反馈入口并显示「反馈暂不可用」，不要猜测模式。

### 4.6 配置下发

新增公开端点（登录页可用，无需 token）：

```rust
// GET /api/public-config
{
  "feedbackMode": "anonymous",       // anonymous | audited
  "noticeVersion": "2026-11-01",
  "appVersion": "0.1.0"
}
```

前端在渲染反馈入口前请求一次；`feedbackMode` 决定文案组，`noticeVersion` 随提交带上（服务端仍以自己配置为准，不信任客户端）。响应加 `Cache-Control: no-store`，避免模式切换后仍拿旧文案。

### 4.7 验收

```bash
# Mode A
curl -s http://127.0.0.1:8080/api/public-config | jq .feedbackMode   # "anonymous"
curl -s -X POST http://127.0.0.1:8080/api/feedback -H 'content-type: application/json' \
  -d '{"content":"匿名测试","userId":"should-be-rejected"}'           # 400（deny_unknown_fields）
psql "$DATABASE_URL" -c 'SELECT count(*) FROM feedback_meta;'          # 0

# Mode B
FEEDBACK_MODE=audited cargo run
curl -s -X POST http://127.0.0.1:8080/api/feedback -H 'content-type: application/json' \
  -d '{"content":"审计测试"}' > /dev/null
psql "$DATABASE_URL" -c 'SELECT feedback_id, submitter_id, ip, risk_score FROM feedback_meta;'
# 管理 API 不得返回 meta
curl -s http://127.0.0.1:8080/api/admin/feedback -H "authorization: Bearer $TOKEN" | jq '.[0] | keys'
# 期望只有 id/content/status/createdAt
```

---

## 5. 隐私、保留期与脱敏

### 5.1 数据清单

| 数据 | 位置 | 内容 | 保留 | 访问 | 清理 |
| --- | --- | --- | --- | --- | --- |
| 访问日志 | `logs/api.*.jsonl` | 全量 IP、UA、request_id | 14 天 | 运维登录服务器 | `max_log_files` + cron |
| 请求日志 | `request_log` | 掩码 IP、UA、user_id、延迟 | 90–120 天 | 运维/只读报表 | 按月 drop 分区 |
| 日聚合 | `request_metrics_daily` | 无个人标识 | 13 个月 | 所有人 | 按天 delete |
| 前端事件 | `frontend_event` | session/anon id、掩码 IP、UA | 30–60 天 | 产品/前端 | 按月 drop 分区 |
| 业务审计 | `audit_log` | actor、动作、实体、掩码 IP | 3 年 | 管理后台 + DBA | 不自动删，按法务保留 |
| 反馈正文 | `feedback` | 用户输入 | 24 个月 | `SUPER_ADMIN` | 定期 purge |
| 反馈元数据 | `feedback_meta` | 账号、全量 IP、UA、risk | IP 90 天，其余随反馈 | 安全角色 | IP 置 NULL；随 feedback 级联删 |
| 安全访问记录 | `security_access_log` | 谁在什么时候看了 meta | 3 年 | 安全负责人 | 不自动删 |
| JWT | 内存/浏览器 | 8 小时有效 | 不落库 | — | 过期即失效 |

保留期是策略，不是代码常量；上表写进内部隐私说明，改之前先过法务/HR。

### 5.2 脱敏规则

| 数据 | 规则 | 实现点 |
| --- | --- | --- |
| `Authorization` / `Cookie` / `Set-Cookie` | 永不记录 | 只读 `User-Agent`，其余 header 不碰 |
| 请求体 / 响应体 | 永不记录 | 中间件不读 body；`TraceLayer` 默认也不读 |
| Query string | 永不记录 | 只用 `uri().path()` |
| 密码 / token | 永不记录 | 登录接口只记 status，不记工号 |
| 员工姓名 / 邮箱 / 工号 | 不进日志 | 日志只用内部 `user_id` |
| 工时备注 / 反馈正文 | 不进日志 | 审计 `detail` 只放计数/状态，不放文本 |
| IP | 文件 14 天全量；DB 掩码 `/24`、`/48`；匿名反馈不记 | `mask_ip` |
| UA | 截断 256，去换行/制表符 | `truncated` |
| path | 截断 200，去控制字符，不含 query | `truncated` |
| 内部错误 | 客户端只收通用文案 + `x-request-id` | 改 `ApiError::Internal` 的响应体 |
| SQL 参数 | 不进错误日志 | `sqlx` 默认不打印绑定值；不要 `?query` 打印整条 SQL |

`ApiError::Internal` 建议改为：

```rust
Self::Internal(error) => {
    tracing::error!(error = ?error, "internal server error");
    (StatusCode::INTERNAL_SERVER_ERROR,
     Json(json!({ "code": "INTERNAL_ERROR", "message": "服务器内部错误，请提供请求编号" })))
}
```

请求编号就是响应头 `x-request-id`；前端错误提示里带上它，用户报障时可直接定位到那一行日志。

### 5.3 访问控制与网络安全

| 项 | 要求 |
| --- | --- |
| 日志目录 | `0700`，文件 `0600`，只有部署用户可读 |
| 数据库账号 | 应用账号无 `audit_log`/`feedback_meta` 的 UPDATE/DELETE 权限；审计表 append-only |
| 管理后台 | `/api/admin/*` 继续 `require_admin()`；`/api/admin/feedback` 不返回 meta |
| CORS | 从 `allow_origin(Any)` 改为 `ALLOWED_ORIGINS` 白名单；至少限制为内部域名 |
| 反向代理 | 匿名反馈路径 `access_log off`；其他路径如保留访问日志，需同样脱敏 |
| 传输 | 生产必须 HTTPS；`x-request-id` 不敏感，但 token 必须走 TLS |
| 备份 | 数据库备份加密；备份中的 `feedback_meta.ip` 同样受保留期约束 |

CORS 改法：

```rust
let origins: Vec<HeaderValue> = config.allowed_origins.iter()
    .filter_map(|o| o.parse().ok())
    .collect();

CorsLayer::new()
    .allow_origin(origins)
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
    .expose_headers([HeaderName::from_static("x-request-id")])
```

### 5.4 数据主体请求

| 请求 | 做法 |
| --- | --- |
| 查阅 | 按 `user_id` 导出 `request_log`、`frontend_event`、`audit_log`、`feedback_meta`；`feedback` 按 `submitter_id` 关联 |
| 更正 | 只改 `users` 表；日志是事实记录，不改写 |
| 删除 | 删除/匿名化 `users` 后，`request_log.user_id`、`frontend_event.user_id`、`feedback_meta.submitter_id` 自动置 NULL；`audit_log` 因法务保留不删，但可把 `detail` 中的个人信息清掉 |
| 拒绝追踪 | 前端提供「关闭体验改进」开关，关闭后不加载 `telemetry.ts`；服务端仍记录必要的安全日志 |

注意：`ON DELETE SET NULL` 只断开关联，不删除历史行；如果监管要求“删除所有个人数据”，还需要按 `ip_hash`/`anon_id` 清理，这属于额外流程，不在本期范围。

### 5.5 上线检查清单

- [ ] 日志文件权限 `0600`，目录不在静态站点下
- [ ] `x-request-id` 由服务端生成，客户端传值被覆盖
- [ ] `POST /api/feedback` 在匿名模式下 `ip/user_agent/user_id` 全部为空
- [ ] `feedback_meta` 在匿名模式下为 0 行
- [ ] `/api/admin/feedback` 响应不含任何 meta 字段
- [ ] `FEEDBACK_MODE` 与 i18n 文案同版本发布
- [ ] CORS 白名单已配置，`/api/events` 有限流
- [ ] `request_log`/`frontend_event` 分区已建到未来 2 个月
- [ ] 保留期任务已挂 cron，且有失败告警
- [ ] `ApiError::Internal` 不再把内部错误返回客户端
- [ ] 隐私说明已更新，包含收集字段、用途、保留期、查看入口

---

## 6. 实施顺序

| 阶段 | 内容 | 主要文件 | 估时 | 依赖 |
| --- | --- | --- | --- | --- |
| P0 | JSON 日志 + 按天切割 + `request_id` + 访问日志 | `Cargo.toml`、`main.rs`、新增 `telemetry.rs`、`config.rs` | 0.5 天 | 无 |
| P1 | `request_log` 表、异步 writer、分区与保留任务 | `migrations/0002_telemetry.sql`、`db.rs`、`telemetry.rs` | 1 天 | P0 |
| P2 | `audit_log` 增强 + `AuthUser` 携带上下文 | `auth.rs`、`routes/*.rs`、迁移 | 0.5 天 | P0 |
| P3 | `/api/events` + 事件表 + 前端 SDK + nginx 限流 | `routes/events.rs`、`routes/mod.rs`、前端 `lib/telemetry.ts` | 1.5 天 | P0 |
| P4 | 反馈双模式 + `feedback_meta` + 文案 + 公开配置 | `routes/feedback.rs`、`routes/config.rs`、`i18n.tsx`、`LoginPage.tsx`、`AdminPage.tsx` | 1 天 | P2 |
| P5 | 隐私评审、仪表盘、保留期演练 | 运维脚本、Grafana | 0.5 天 | P1–P4 |

总计约 5 人天。P0/P1 可以先上，P4 必须等文案评审通过；P3 与 P4 可以并行，但都要在 P0 之后。

风险与缓解：

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 日志误记 body/token | 隐私事故 | code review 检查所有 `tracing::` 调用；禁止打印 header/body |
| 队列满导致日志缺失 | 排障缺口 | `dropped_total` 指标告警；必要时调大 channel |
| 分区未建 | 插入失败，日志丢失 | 启动时 `ensure_telemetry_partitions`；失败即启动失败，别静默 |
| `sendBeacon` 无 Authorization | 事件缺 user_id | 有 token 时优先 `fetch(keepalive)`；beacon 只作兜底 |
| 采样导致指标偏差 | 误判 | 4xx/5xx 与写操作全量；采样率写进报表口径 |
| 应用账号是表 owner | 访问控制失效 | 独立迁移角色；预发做一次越权 SELECT 测试 |
| 文案与模式不同步 | 误导用户 | 同版本发布；取不到配置就禁用入口 |
| 时钟偏差 | 事件顺序错乱 | 服务端 `occurred_at` 为准；客户端 `ts` 仅参考 |

---

## 附录 A：环境变量

```bash
# .env.example 追加
LOG_DIR=logs
LOG_MAX_FILES=14
LOG_CONSOLE=0
TRUST_PROXY=false
REQUEST_LOG_DB=true
REQUEST_LOG_SAMPLE_PCT=100
FEEDBACK_MODE=anonymous          # anonymous | audited
NOTICE_VERSION=2026-11-01
IP_HASH_PEPPER=replace-with-32-bytes-random
ALLOWED_ORIGINS=http://127.0.0.1:8080
```

`Config` 新增字段：`log_dir`、`log_max_files`、`trust_proxy`、`request_log_db`、`request_log_sample_pct`、`feedback_mode`、`notice_version`、`ip_hash_pepper`、`allowed_origins`。`FEEDBACK_MODE` 解析失败时**启动失败**，不要静默回落到 anonymous——配置错误导致承诺错位比启动失败更糟。

## 附录 B：迁移脚本骨架

```sql
-- migrations/0002_telemetry.sql
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip INET;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ANONYMOUS'
    CHECK (mode IN ('ANONYMOUS', 'AUDITED'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS notice_version TEXT;
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS request_log (
    request_id  TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    method      TEXT NOT NULL,
    path        TEXT NOT NULL,
    status      SMALLINT NOT NULL,
    latency_ms  INTEGER NOT NULL,
    ip          INET,
    user_agent  TEXT,
    PRIMARY KEY (occurred_at, request_id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_request_log_user
    ON request_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_log_errors
    ON request_log(status, occurred_at DESC) WHERE status >= 400;

CREATE TABLE IF NOT EXISTS request_metrics_daily (
    day DATE NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    status_class SMALLINT NOT NULL,
    requests BIGINT NOT NULL,
    errors BIGINT NOT NULL,
    p95_ms INTEGER,
    PRIMARY KEY (day, path, method, status_class)
);

CREATE TABLE IF NOT EXISTS frontend_event (
    id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_ts TIMESTAMPTZ,
    session_id TEXT NOT NULL,
    anon_id TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    route TEXT NOT NULL,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    app_version TEXT,
    ip INET,
    user_agent TEXT,
    PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_frontend_event_name
    ON frontend_event(name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_frontend_event_session
    ON frontend_event(session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS feedback_meta (
    feedback_id TEXT PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
    submitter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    ip INET,
    ip_hash BYTEA,
    user_agent TEXT,
    request_id TEXT,
    app_version TEXT,
    risk_score SMALLINT NOT NULL DEFAULT 0,
    risk_reasons TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_meta_ip_hash ON feedback_meta(ip_hash);
CREATE INDEX IF NOT EXISTS idx_feedback_meta_created ON feedback_meta(created_at);

CREATE TABLE IF NOT EXISTS security_access_log (
    id BIGSERIAL PRIMARY KEY,
    db_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_id TEXT,
    reason TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ensure_telemetry_partitions() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    m date;
    i int;
BEGIN
    FOR i IN 0..2 LOOP
        m := (date_trunc('month', now()) + (i || ' month')::interval)::date;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS request_log_%s PARTITION OF request_log
             FOR VALUES FROM (%L) TO (%L)',
            to_char(m, 'YYYY_MM'), m, m + interval '1 month');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS frontend_event_%s PARTITION OF frontend_event
             FOR VALUES FROM (%L) TO (%L)',
            to_char(m, 'YYYY_MM'), m, m + interval '1 month');
    END LOOP;
END $$;
```

迁移执行后，`db::connect` 里补一行 `SELECT ensure_telemetry_partitions()`；分区创建失败应让启动失败，而不是让运行期插入报错。
