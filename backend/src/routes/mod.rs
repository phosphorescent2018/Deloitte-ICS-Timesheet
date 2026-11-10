pub mod admin;
pub mod auth;
pub mod config;
pub mod feedback;
pub mod timesheets;

use axum::{
    Router,
    routing::{get, post, put},
};

use crate::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me))
        .route("/feedback", post(feedback::create_feedback))
        .route(
            "/config",
            get(config::get_config).put(config::update_config),
        )
        .route("/timesheets", get(timesheets::list_month))
        .route(
            "/timesheets/{date}",
            get(timesheets::get_day).put(timesheets::save_day),
        )
        .route(
            "/admin/users",
            get(admin::list_users).post(admin::create_user),
        )
        .route(
            "/admin/users/{id}",
            put(admin::update_user).delete(admin::delete_user),
        )
        .route("/admin/audit", get(admin::audit_list))
        .route("/admin/feedback", get(feedback::list_feedback))
        .route(
            "/admin/feedback/{id}",
            put(feedback::update_feedback).delete(feedback::delete_feedback),
        )
        .route("/admin/export", get(admin::export_month))
}
