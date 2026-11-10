use axum::{Json, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{FeedbackCreateRequest, FeedbackRow, FeedbackStatusRequest},
    routes::config::audit,
    state::AppState,
};

/// Public endpoint: intentionally does not accept or store any identity fields.
pub async fn create_feedback(
    State(state): State<AppState>,
    Json(body): Json<FeedbackCreateRequest>,
) -> ApiResult<(StatusCode, Json<FeedbackRow>)> {
    let content = body.content.trim();
    if content.is_empty() {
        return Err(ApiError::BadRequest("反馈内容不能为空".to_string()));
    }
    if content.chars().count() > 1000 {
        return Err(ApiError::BadRequest("反馈内容不能超过 1000 字".to_string()));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO feedback (id, content, status) VALUES ($1, $2, 'open')")
        .bind(&id)
        .bind(content)
        .execute(&state.db)
        .await?;

    let row = fetch_feedback(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn list_feedback(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<FeedbackRow>>> {
    auth.require_admin()?;
    let rows = sqlx::query_as::<_, FeedbackRow>(
        "SELECT id, content, status, created_at FROM feedback ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn update_feedback(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<FeedbackStatusRequest>,
) -> ApiResult<Json<FeedbackRow>> {
    auth.require_admin()?;
    if !matches!(body.status.as_str(), "open" | "done") {
        return Err(ApiError::BadRequest("反馈状态不合法".to_string()));
    }

    let mut tx = state.db.begin().await?;
    let affected = sqlx::query("UPDATE feedback SET status = $1 WHERE id = $2")
        .bind(&body.status)
        .bind(&id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(ApiError::NotFound("反馈不存在".to_string()));
    }
    audit(
        &mut tx,
        &auth.id,
        "FEEDBACK_STATUS",
        "feedback",
        Some(&id),
        Some(&body.status),
    )
    .await?;
    tx.commit().await?;

    Ok(Json(fetch_feedback(&state, &id).await?))
}

pub async fn delete_feedback(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> ApiResult<StatusCode> {
    auth.require_admin()?;
    let mut tx = state.db.begin().await?;
    let affected = sqlx::query("DELETE FROM feedback WHERE id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(ApiError::NotFound("反馈不存在".to_string()));
    }
    audit(
        &mut tx,
        &auth.id,
        "FEEDBACK_DELETE",
        "feedback",
        Some(&id),
        None,
    )
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn fetch_feedback(state: &AppState, id: &str) -> ApiResult<FeedbackRow> {
    sqlx::query_as::<_, FeedbackRow>(
        "SELECT id, content, status, created_at FROM feedback WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("反馈不存在".to_string()))
}
