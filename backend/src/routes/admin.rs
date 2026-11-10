use std::collections::HashMap;

use axum::{
    Json,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderValue, StatusCode, header},
    response::Response,
};
use chrono::{Datelike, Duration, NaiveDate};
use rust_xlsxwriter::Workbook;
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::{AuthUser, hash_password},
    error::{ApiError, ApiResult},
    models::{AuditRow, CreateUserRequest, ExportQuery, UpdateUserRequest, UserRow},
    routes::config::audit,
    state::AppState,
};

pub async fn list_users(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<UserRow>>> {
    auth.require_admin()?;
    let users = sqlx::query_as::<_, UserRow>(
        "SELECT id, employee_no, name, email, department, role, active, wecom_userid
         FROM users ORDER BY active DESC, role, employee_no",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(users))
}

pub async fn create_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateUserRequest>,
) -> ApiResult<Json<UserRow>> {
    auth.require_admin()?;
    validate_role(&body.role)?;
    if body.employee_no.trim().is_empty() || body.name.trim().is_empty() {
        return Err(ApiError::BadRequest("工号和姓名不能为空".to_string()));
    }
    if body.password.len() < 8 {
        return Err(ApiError::BadRequest("密码至少 8 位".to_string()));
    }

    let password_hash = hash_password(&body.password).map_err(ApiError::Internal)?;
    let id = Uuid::new_v4().to_string();
    let active = body.active.unwrap_or(true);

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO users
         (id, employee_no, name, email, department, role, active, password_hash, wecom_userid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(&id)
    .bind(body.employee_no.trim())
    .bind(body.name.trim())
    .bind(body.email.as_deref())
    .bind(body.department.as_deref())
    .bind(&body.role)
    .bind(active)
    .bind(&password_hash)
    .bind(body.wecom_userid.as_deref())
    .execute(&mut *tx)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            ApiError::Conflict("工号或企业微信 userid 已存在".to_string())
        }
        other => ApiError::from(other),
    })?;

    audit(
        &mut tx,
        &auth.id,
        "USER_CREATE",
        "user",
        Some(&id),
        Some(&body.employee_no),
    )
    .await?;
    tx.commit().await?;

    let user = fetch_user(&state, &id).await?;
    Ok(Json(user))
}

pub async fn update_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserRequest>,
) -> ApiResult<Json<UserRow>> {
    auth.require_admin()?;
    let current = fetch_user(&state, &id).await?;

    if let Some(role) = &body.role {
        validate_role(role)?;
    }
    let next_role = body.role.clone().unwrap_or_else(|| current.role.clone());
    let next_active = body.active.unwrap_or(current.active);
    if current.role == "SUPER_ADMIN"
        && current.active
        && (next_role != "SUPER_ADMIN" || !next_active)
    {
        ensure_not_last_admin(&state, &id).await?;
    }

    let password_hash = match body.password.as_deref() {
        Some(password) if !password.is_empty() => {
            if password.len() < 8 {
                return Err(ApiError::BadRequest("密码至少 8 位".to_string()));
            }
            Some(hash_password(password).map_err(ApiError::Internal)?)
        }
        _ => None,
    };

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE users SET
           name = $1,
           email = $2,
           department = $3,
           role = $4,
           active = $5,
           password_hash = COALESCE($6, password_hash),
           wecom_userid = $7,
           updated_at = now()::text
         WHERE id = $8",
    )
    .bind(body.name.as_deref().unwrap_or(&current.name))
    .bind(body.email.as_deref().or(current.email.as_deref()))
    .bind(body.department.as_deref().or(current.department.as_deref()))
    .bind(&next_role)
    .bind(next_active)
    .bind(password_hash)
    .bind(
        body.wecom_userid
            .as_deref()
            .or(current.wecom_userid.as_deref()),
    )
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            ApiError::Conflict("企业微信 userid 已存在".to_string())
        }
        other => ApiError::from(other),
    })?;

    audit(&mut tx, &auth.id, "USER_UPDATE", "user", Some(&id), None).await?;
    tx.commit().await?;

    Ok(Json(fetch_user(&state, &id).await?))
}

pub async fn delete_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    auth.require_admin()?;
    let current = fetch_user(&state, &id).await?;
    if current.role == "SUPER_ADMIN" && current.active {
        ensure_not_last_admin(&state, &id).await?;
    }

    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        &auth.id,
        "USER_DELETE",
        "user",
        Some(&id),
        Some(&current.employee_no),
    )
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn audit_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<AuditQuery>,
) -> ApiResult<Json<Vec<AuditRow>>> {
    auth.require_admin()?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let rows = sqlx::query_as::<_, AuditRow>(
        "SELECT id, actor_id, action, entity_type, entity_id, detail, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub limit: Option<i64>,
}

pub async fn export_month(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<ExportQuery>,
) -> ApiResult<Response> {
    auth.require_admin()?;
    if !(1..=12).contains(&query.month) {
        return Err(ApiError::BadRequest("月份必须在 1-12 之间".to_string()));
    }
    let first = NaiveDate::from_ymd_opt(query.year, query.month, 1)
        .ok_or_else(|| ApiError::BadRequest("日期无效".to_string()))?;
    let next = if query.month == 12 {
        NaiveDate::from_ymd_opt(query.year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(query.year, query.month + 1, 1)
    }
    .ok_or_else(|| ApiError::BadRequest("日期无效".to_string()))?;
    let last = next - Duration::days(1);

    let rows = sqlx::query(
        r#"SELECT u.employee_no, u.name, u.department, d.work_date, d.location_code,
                  d.target_hours, e.activity_code, e.hours, e.remark, d.saved_at
           FROM timesheet_day d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN timesheet_entry e ON e.day_id = d.id
           WHERE d.work_date >= $1 AND d.work_date <= $2
           ORDER BY d.work_date, u.employee_no, e.sort_no"#,
    )
    .bind(first.format("%Y-%m-%d").to_string())
    .bind(last.format("%Y-%m-%d").to_string())
    .fetch_all(&state.db)
    .await?;

    let mut daily_totals: HashMap<(String, String), f64> = HashMap::new();
    for row in &rows {
        let user: String = row.get("employee_no");
        let date: String = row.get("work_date");
        let hours: Option<f64> = row.get("hours");
        *daily_totals.entry((user, date)).or_default() += hours.unwrap_or(0.0);
    }

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet
        .set_name("工时明细")
        .map_err(|error| ApiError::Internal(error.into()))?;

    let headers = [
        "序号",
        "员工姓名",
        "员工工号",
        "部门",
        "业务线",
        "产品",
        "业务阶段",
        "日期",
        "星期",
        "工作地点",
        "状态",
        "工作项代码",
        "本行工时",
        "备注",
        "保存时间",
    ];
    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_string(0, col as u16, *header)
            .map_err(|error| ApiError::Internal(error.into()))?;
    }

    for (index, row) in rows.iter().enumerate() {
        let employee_no: String = row.get("employee_no");
        let date: String = row.get("work_date");
        let total = daily_totals
            .get(&(employee_no.clone(), date.clone()))
            .copied()
            .unwrap_or(0.0);
        let target: f64 = row.get("target_hours");
        let status = if total <= 0.0 {
            "未填写"
        } else if total < target {
            "部分填写"
        } else {
            "已完成"
        };

        let activity_code: Option<String> = row.get("activity_code");
        let (business_line, product, stage) = activity_code
            .as_deref()
            .and_then(split_activity)
            .unwrap_or_default();
        let date_value: String = date.clone();
        let weekday = weekday_zh(&date);
        let location: String = row.get("location_code");
        let remark: Option<String> = row.get("remark");
        let saved_at: Option<String> = row.get("saved_at");
        let hours: Option<f64> = row.get("hours");

        let values: [(u16, String); 15] = [
            (0, (index + 1).to_string()),
            (1, row.get::<String, _>("name")),
            (2, employee_no),
            (
                3,
                row.get::<Option<String>, _>("department")
                    .unwrap_or_default(),
            ),
            (4, business_line),
            (5, product),
            (6, stage),
            (7, date_value),
            (8, weekday),
            (9, location),
            (10, status.to_string()),
            (11, activity_code.unwrap_or_default()),
            (
                12,
                hours.map(|value| format!("{value:.1}")).unwrap_or_default(),
            ),
            (13, remark.unwrap_or_default()),
            (14, saved_at.unwrap_or_default()),
        ];
        for (col, value) in values {
            worksheet
                .write_string((index + 1) as u32, col, value)
                .map_err(|error| ApiError::Internal(error.into()))?;
        }
    }

    worksheet
        .set_column_width(0, 6)
        .map_err(|error| ApiError::Internal(error.into()))?;
    worksheet
        .set_column_width(1, 12)
        .map_err(|error| ApiError::Internal(error.into()))?;
    worksheet
        .set_column_width(7, 12)
        .map_err(|error| ApiError::Internal(error.into()))?;
    worksheet
        .set_column_width(12, 10)
        .map_err(|error| ApiError::Internal(error.into()))?;

    let bytes = workbook
        .save_to_buffer()
        .map_err(|error| ApiError::Internal(error.into()))?;

    let filename = format!("工时明细_{}-{:02}.xlsx", query.year, query.month);
    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "attachment; filename*=UTF-8''{}",
            urlencoding(&filename)
        ))
        .map_err(|error| ApiError::Internal(error.into()))?,
    );
    Ok(response)
}

async fn fetch_user(state: &AppState, id: &str) -> ApiResult<UserRow> {
    sqlx::query_as::<_, UserRow>(
        "SELECT id, employee_no, name, email, department, role, active, wecom_userid
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("用户不存在".to_string()))
}

async fn ensure_not_last_admin(state: &AppState, id: &str) -> ApiResult<()> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND active = TRUE AND id <> $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if count == 0 {
        return Err(ApiError::Conflict(
            "至少保留一名启用的超级管理员".to_string(),
        ));
    }
    Ok(())
}

fn validate_role(role: &str) -> ApiResult<()> {
    if matches!(role, "SUPER_ADMIN" | "TIMESHEET_USER") {
        Ok(())
    } else {
        Err(ApiError::BadRequest("角色不合法".to_string()))
    }
}

fn split_activity(code: &str) -> Option<(String, String, String)> {
    let mut parts = code.splitn(3, '-');
    Some((
        parts.next()?.to_string(),
        parts.next()?.to_string(),
        parts.next()?.to_string(),
    ))
}

fn weekday_zh(date: &str) -> String {
    let Ok(date) = NaiveDate::parse_from_str(date, "%Y-%m-%d") else {
        return String::new();
    };
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        [date.weekday().num_days_from_monday() as usize]
        .to_string()
}

fn urlencoding(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}
