use std::collections::HashSet;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use chrono::{Datelike, Duration, FixedOffset, NaiveDate, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{MonthResponse, SaveDayRequest, TimesheetDayResponse, TimesheetEntryRow},
    routes::config::audit,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct MonthQuery {
    pub year: i32,
    pub month: u32,
}

pub async fn get_day(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(date): Path<String>,
) -> ApiResult<Json<TimesheetDayResponse>> {
    let work_date = parse_date(&date)?;
    Ok(Json(load_day(&state, &auth.id, work_date).await?))
}

pub async fn save_day(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(date): Path<String>,
    Json(body): Json<SaveDayRequest>,
) -> ApiResult<Json<TimesheetDayResponse>> {
    let work_date = parse_date(&date)?;
    ensure_editable_at(
        work_date,
        today_shanghai(),
        auth.is_admin(),
        state.config.backfill_days,
    )?;

    if !body.target_hours.is_finite() || body.target_hours <= 0.0 {
        return Err(ApiError::BadRequest("目标工时必须大于 0".to_string()));
    }

    let location_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM locations WHERE code = ? AND active = 1")
            .bind(&body.location)
            .fetch_one(&state.db)
            .await?;
    if location_exists == 0 {
        return Err(ApiError::BadRequest("工作地点不存在或已停用".to_string()));
    }

    let activity_codes = load_activity_codes(&state).await?;
    let mut total = 0.0;
    for (index, entry) in body.entries.iter().enumerate() {
        if !entry.hours.is_finite() || entry.hours < 0.0 {
            return Err(ApiError::BadRequest(format!(
                "第 {} 行工时不能为负数",
                index + 1
            )));
        }
        if entry.hours > 24.0 {
            return Err(ApiError::BadRequest(format!(
                "第 {} 行工时不能超过 24 小时",
                index + 1
            )));
        }
        if entry.hours > 0.0 {
            if entry.activity_code.trim().is_empty() {
                return Err(ApiError::BadRequest(format!(
                    "第 {} 行已填工时，必须选择工作项",
                    index + 1
                )));
            }
            if !activity_codes.contains(entry.activity_code.trim()) {
                return Err(ApiError::BadRequest(format!(
                    "第 {} 行工作项不存在：{}",
                    index + 1,
                    entry.activity_code
                )));
            }
        }
        total += entry.hours;
    }

    if total > 24.0 {
        return Err(ApiError::BadRequest(
            "当天实际工时合计不能超过 24 小时".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let mut tx = state.db.begin().await?;

    let day_id: String = sqlx::query_scalar(
        r#"INSERT INTO timesheet_day
           (id, user_id, work_date, location_code, target_hours, version, saved_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
           ON CONFLICT(user_id, work_date) DO UPDATE SET
             location_code = excluded.location_code,
             target_hours = excluded.target_hours,
             version = timesheet_day.version + 1,
             saved_at = excluded.saved_at,
             updated_at = excluded.updated_at
           RETURNING id"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&auth.id)
    .bind(work_date.format("%Y-%m-%d").to_string())
    .bind(&body.location)
    .bind(8.0_f64)
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM timesheet_entry WHERE day_id = ?")
        .bind(&day_id)
        .execute(&mut *tx)
        .await?;

    for (sort_no, entry) in body.entries.iter().enumerate() {
        if entry.hours == 0.0 && entry.activity_code.trim().is_empty() {
            continue;
        }
        sqlx::query(
            "INSERT INTO timesheet_entry (id, day_id, activity_code, hours, remark, sort_no)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&day_id)
        .bind(entry.activity_code.trim())
        .bind(entry.hours)
        .bind(entry.remark.trim())
        .bind(sort_no as i64)
        .execute(&mut *tx)
        .await?;
    }

    audit(
        &mut tx,
        &auth.id,
        "TIMESHEET_SAVE",
        "timesheet_day",
        Some(&day_id),
        Some(&format!(
            "date={}, entries={}, total={:.1}",
            work_date,
            body.entries.len(),
            total
        )),
    )
    .await?;

    tx.commit().await?;

    Ok(Json(load_day(&state, &auth.id, work_date).await?))
}

pub async fn list_month(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Json<MonthResponse>> {
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

    let dates = sqlx::query_scalar::<_, String>(
        "SELECT work_date FROM timesheet_day
         WHERE user_id = ? AND work_date >= ? AND work_date <= ?
         ORDER BY work_date",
    )
    .bind(&auth.id)
    .bind(first.format("%Y-%m-%d").to_string())
    .bind(last.format("%Y-%m-%d").to_string())
    .fetch_all(&state.db)
    .await?;

    let mut days = Vec::with_capacity(dates.len());
    for date in dates {
        let work_date = parse_date(&date)?;
        days.push(load_day(&state, &auth.id, work_date).await?);
    }

    Ok(Json(MonthResponse {
        year: query.year,
        month: query.month,
        days,
    }))
}

async fn load_day(
    state: &AppState,
    user_id: &str,
    work_date: NaiveDate,
) -> ApiResult<TimesheetDayResponse> {
    let date_key = work_date.format("%Y-%m-%d").to_string();
    let day = sqlx::query(
        "SELECT id, location_code, target_hours, saved_at
         FROM timesheet_day WHERE user_id = ? AND work_date = ?",
    )
    .bind(user_id)
    .bind(&date_key)
    .fetch_optional(&state.db)
    .await?;

    let Some(day) = day else {
        let location: String = sqlx::query_scalar(
            "SELECT code FROM locations WHERE active = 1 ORDER BY sort_no LIMIT 1",
        )
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_else(|| "cq".to_string());
        return Ok(TimesheetDayResponse {
            date: date_key,
            location,
            target_hours: 8.0,
            saved_at: None,
            total_hours: 0.0,
            status: "empty".to_string(),
            entries: vec![],
        });
    };

    use sqlx::Row;
    let day_id: String = day.get("id");
    let location: String = day.get("location_code");
    let target_hours: f64 = day.get("target_hours");
    let saved_at: Option<String> = day.get("saved_at");

    let entries = sqlx::query_as::<_, TimesheetEntryRow>(
        "SELECT id, activity_code, hours, remark, sort_no
         FROM timesheet_entry WHERE day_id = ? ORDER BY sort_no, id",
    )
    .bind(&day_id)
    .fetch_all(&state.db)
    .await?;

    let total_hours: f64 = entries.iter().map(|entry| entry.hours).sum();
    let status = if total_hours <= 0.0 {
        "empty"
    } else if total_hours < target_hours {
        "partial"
    } else {
        "complete"
    };

    Ok(TimesheetDayResponse {
        date: date_key,
        location,
        target_hours,
        saved_at,
        total_hours,
        status: status.to_string(),
        entries,
    })
}

async fn load_activity_codes(state: &AppState) -> ApiResult<HashSet<String>> {
    let dims = sqlx::query_as::<_, crate::models::ActivityDimRow>(
        "SELECT dim_type, value, sort_no FROM activity_dims WHERE active = 1",
    )
    .fetch_all(&state.db)
    .await?;

    let values = |kind: &str| {
        dims.iter()
            .filter(|item| item.dim_type == kind)
            .map(|item| item.value.clone())
            .collect::<Vec<_>>()
    };
    let business_lines = values("BUSINESS_LINE");
    let products = values("PRODUCT");
    let stages = values("STAGE");

    let mut codes = HashSet::new();
    for business_line in &business_lines {
        for product in &products {
            for stage in &stages {
                codes.insert(format!("{business_line}-{product}-{stage}"));
            }
        }
    }
    Ok(codes)
}

fn parse_date(value: &str) -> ApiResult<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| ApiError::BadRequest(format!("日期格式错误：{value}")))
}

fn today_shanghai() -> NaiveDate {
    let offset = FixedOffset::east_opt(8 * 3600).expect("valid timezone offset");
    Utc::now().with_timezone(&offset).date_naive()
}

fn ensure_editable_at(
    work_date: NaiveDate,
    today: NaiveDate,
    is_admin: bool,
    backfill_days: i64,
) -> ApiResult<()> {
    if is_admin {
        return Ok(());
    }
    if work_date.year() != today.year() || work_date.month() != today.month() {
        return Err(ApiError::Forbidden(
            "跨月日期不允许填写，请发起补填审批".to_string(),
        ));
    }
    let earliest = today - Duration::days(backfill_days);

    if work_date < earliest {
        return Err(ApiError::Forbidden(
            "该日期已超出可编辑窗口，请发起补填审批".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn allows_today_and_previous_two_days() {
        let today = date("2026-11-10");
        assert!(ensure_editable_at(today, today, false, 2).is_ok());
        assert!(ensure_editable_at(date("2026-11-09"), today, false, 2).is_ok());
        assert!(ensure_editable_at(date("2026-11-08"), today, false, 2).is_ok());
    }

    #[test]
    fn rejects_older_dates_for_employee() {
        let today = date("2026-11-10");
        let error = ensure_editable_at(date("2026-11-07"), today, false, 2).unwrap_err();
        assert!(matches!(error, ApiError::Forbidden(_)));
    }

    #[test]
    fn allows_current_month_future_dates() {
        let today = date("2026-11-10");
        assert!(ensure_editable_at(date("2026-11-30"), today, false, 2).is_ok());
    }

    #[test]
    fn rejects_next_month_future_dates() {
        let today = date("2026-11-10");
        let error = ensure_editable_at(date("2026-12-01"), today, false, 2).unwrap_err();
        assert!(matches!(error, ApiError::Forbidden(_)));
    }

    #[test]
    fn rejects_previous_month_even_if_within_window() {
        let today = date("2026-12-01");
        let error = ensure_editable_at(date("2026-11-30"), today, false, 2).unwrap_err();
        assert!(matches!(error, ApiError::Forbidden(_)));
    }

    #[test]
    fn zero_backfill_only_allows_today() {
        let today = date("2026-11-10");
        assert!(ensure_editable_at(today, today, false, 0).is_ok());
        assert!(ensure_editable_at(date("2026-11-09"), today, false, 0).is_err());
    }

    #[test]
    fn seven_backfill_allows_seven_days_back() {
        let today = date("2026-11-10");
        assert!(ensure_editable_at(date("2026-11-03"), today, false, 7).is_ok());
        assert!(ensure_editable_at(date("2026-11-02"), today, false, 7).is_err());
    }

    #[test]
    fn admin_can_edit_historical_dates() {
        let today = date("2026-11-10");
        assert!(ensure_editable_at(date("2026-01-01"), today, true, 2).is_ok());
    }
}
