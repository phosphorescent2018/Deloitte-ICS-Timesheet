use axum::{Json, extract::State};
use sqlx::Row;

use crate::{
    auth::{AuthUser, create_token, verify_password},
    error::{ApiError, ApiResult},
    models::{LoginRequest, LoginResponse, UserRow},
    state::AppState,
};

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> ApiResult<Json<LoginResponse>> {
    let employee_no = body.employee_no.trim();
    if employee_no.is_empty() || body.password.is_empty() {
        return Err(ApiError::BadRequest("工号和密码不能为空".to_string()));
    }

    let row = sqlx::query(
        "SELECT id, employee_no, name, email, department, role, active, wecom_userid, password_hash
         FROM users WHERE employee_no = $1 OR email = $2 LIMIT 1",
    )
    .bind(employee_no)
    .bind(employee_no)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("工号或密码错误".to_string()))?;

    let active: bool = row.get("active");
    if !active {
        return Err(ApiError::Forbidden("账号已停用".to_string()));
    }

    let password_hash: String = row.get("password_hash");
    if !verify_password(&body.password, &password_hash) {
        return Err(ApiError::Unauthorized("工号或密码错误".to_string()));
    }

    let user = UserRow {
        id: row.get("id"),
        employee_no: row.get("employee_no"),
        name: row.get("name"),
        email: row.get("email"),
        department: row.get("department"),
        role: row.get("role"),
        active,
        wecom_userid: row.get("wecom_userid"),
    };
    let token =
        create_token(&user.id, &user.role, &state.config.jwt_secret).map_err(ApiError::Internal)?;

    Ok(Json(LoginResponse { token, user }))
}

pub async fn me(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<UserRow>> {
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, employee_no, name, email, department, role, active, wecom_userid
         FROM users WHERE id = $1",
    )
    .bind(&auth.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("用户不存在".to_string()))?;

    Ok(Json(user))
}
