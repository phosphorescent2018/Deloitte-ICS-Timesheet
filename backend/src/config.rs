use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub jwt_secret: String,
    pub bootstrap_admin_password: String,
    pub backfill_days: i64,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();

        let backfill_days = env::var("BACKFILL_DAYS")
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(2)
            .clamp(0, 7);

        Ok(Self {
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_string()),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://timesheet@127.0.0.1:5433/timesheet".to_string()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-only-change-me-please-32-bytes".to_string()),
            bootstrap_admin_password: env::var("BOOTSTRAP_ADMIN_PASSWORD")
                .unwrap_or_else(|_| "ChangeMe123!".to_string()),
            backfill_days,
        })
    }
}
