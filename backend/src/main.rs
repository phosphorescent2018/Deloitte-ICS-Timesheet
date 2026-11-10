mod auth;
mod config;
mod db;
mod error;
mod models;
mod routes;
mod state;

use std::sync::Arc;

use axum::{Json, Router, routing::get};
use serde_json::json;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ics_timesheet_api=debug,tower_http=info,sqlx=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;
    let pool = db::connect(&config).await?;
    let state = AppState {
        db: pool,
        config: Arc::new(config.clone()),
    };

    let api = routes::api_router().with_state(state);
    let app = Router::new()
        .route("/api/health", get(health))
        .nest("/api", api)
        .fallback_service(ServeDir::new("../dist").fallback(ServeFile::new("../dist/index.html")))
        .layer(CompressionLayer::new())
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!(addr = %config.bind_addr, "ics-timesheet-api listening");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "ics-timesheet-api",
        "version": env!("CARGO_PKG_VERSION")
    }))
}
