use std::collections::BTreeSet;

use axum::{Json, extract::State};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{ActivityDimRow, ConfigResponse, LocationRow, UpdateConfigRequest},
    state::AppState,
};

pub async fn get_config(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> ApiResult<Json<ConfigResponse>> {
    Ok(Json(load_config(&state).await?))
}

pub async fn update_config(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateConfigRequest>,
) -> ApiResult<Json<ConfigResponse>> {
    auth.require_admin()?;

    let business_lines = clean_values(body.business_lines, "业务线")?;
    let products = clean_values(body.products, "产品")?;
    let stages = clean_values(body.stages, "业务阶段")?;

    let mut tx = state.db.begin().await?;
    for (dim_type, values) in [
        ("BUSINESS_LINE", &business_lines),
        ("PRODUCT", &products),
        ("STAGE", &stages),
    ] {
        sqlx::query("DELETE FROM activity_dims WHERE dim_type = ?")
            .bind(dim_type)
            .execute(&mut *tx)
            .await?;
        for (sort_no, value) in values.iter().enumerate() {
            sqlx::query(
                "INSERT INTO activity_dims (dim_type, value, sort_no, active) VALUES (?, ?, ?, 1)",
            )
            .bind(dim_type)
            .bind(value)
            .bind(sort_no as i64)
            .execute(&mut *tx)
            .await?;
        }
    }

    audit(
        &mut tx,
        &auth.id,
        "CONFIG_UPDATE",
        "activity_dims",
        None,
        Some("updated business line / product / stage config"),
    )
    .await?;

    tx.commit().await?;

    Ok(Json(load_config(&state).await?))
}

async fn load_config(state: &AppState) -> ApiResult<ConfigResponse> {
    let dims = sqlx::query_as::<_, ActivityDimRow>(
        "SELECT dim_type, value, sort_no FROM activity_dims WHERE active = 1 ORDER BY dim_type, sort_no, value",
    )
    .fetch_all(&state.db)
    .await?;
    let locations = sqlx::query_as::<_, LocationRow>(
        "SELECT code, name_zh, name_en, sort_no FROM locations WHERE active = 1 ORDER BY sort_no, code",
    )
    .fetch_all(&state.db)
    .await?;

    let pick = |kind: &str| {
        dims.iter()
            .filter(|item| item.dim_type == kind)
            .map(|item| item.value.clone())
            .collect::<Vec<_>>()
    };

    Ok(ConfigResponse {
        business_lines: pick("BUSINESS_LINE"),
        products: pick("PRODUCT"),
        stages: pick("STAGE"),
        locations,
    })
}

fn clean_values(values: Vec<String>, label: &str) -> ApiResult<Vec<String>> {
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for value in values {
        let value = value.trim().to_string();
        if value.is_empty() {
            return Err(ApiError::BadRequest(format!("{label}不能为空")));
        }
        if value.len() > 64 {
            return Err(ApiError::BadRequest(format!("{label}名称过长")));
        }
        if !seen.insert(value.clone()) {
            return Err(ApiError::BadRequest(format!("{label}存在重复项")));
        }
        result.push(value);
    }
    if result.is_empty() {
        return Err(ApiError::BadRequest(format!("{label}至少保留一项")));
    }
    Ok(result)
}

pub(crate) async fn audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    actor_id: &str,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
    detail: Option<&str>,
) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, detail)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(actor_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(detail)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
