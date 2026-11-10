use std::str::FromStr;

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use uuid::Uuid;

use crate::{auth::hash_password, config::Config};

pub async fn connect(config: &Config) -> anyhow::Result<SqlitePool> {
    if let Some(path) = config.database_url.strip_prefix("sqlite://") {
        if let Some((dir, _)) = path.rsplit_once('/') {
            if !dir.is_empty() {
                std::fs::create_dir_all(dir)?;
            }
        }
    }

    let options = SqliteConnectOptions::from_str(&config.database_url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    seed(&pool, config).await?;

    Ok(pool)
}

async fn seed(pool: &SqlitePool, config: &Config) -> anyhow::Result<()> {
    seed_dims(pool).await?;
    seed_locations(pool).await?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let password_hash = hash_password(&config.bootstrap_admin_password)?;

    insert_user(
        pool,
        "MG-0001",
        "吕薇庆",
        Some("lvweiqing@mindigitalgroup.com"),
        Some("Mindigital 全球交付中心"),
        "SUPER_ADMIN",
        &password_hash,
        None,
    )
    .await?;

    insert_user(
        pool,
        "MG-0002",
        "胡雅洁",
        Some("huyajie@mindigitalgroup.com"),
        Some("Mindigital 全球交付中心"),
        "TIMESHEET_USER",
        &password_hash,
        None,
    )
    .await?;

    tracing::warn!(
        employee_no = "MG-0001",
        "seeded bootstrap admin; change BOOTSTRAP_ADMIN_PASSWORD and rotate the password"
    );

    Ok(())
}

async fn insert_user(
    pool: &SqlitePool,
    employee_no: &str,
    name: &str,
    email: Option<&str>,
    department: Option<&str>,
    role: &str,
    password_hash: &str,
    wecom_userid: Option<&str>,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"INSERT INTO users
           (id, employee_no, name, email, department, role, active, password_hash, wecom_userid)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(employee_no)
    .bind(name)
    .bind(email)
    .bind(department)
    .bind(role)
    .bind(password_hash)
    .bind(wecom_userid)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_dims(pool: &SqlitePool) -> anyhow::Result<()> {
    let dims = [
        ("BUSINESS_LINE", "UG"),
        ("BUSINESS_LINE", "CDI"),
        ("BUSINESS_LINE", "GH"),
        ("PRODUCT", "OD"),
        ("PRODUCT", "AirtimeLending"),
        ("PRODUCT", "BL"),
        ("STAGE", "运营"),
        ("STAGE", "交付"),
    ];

    for (sort_no, (dim_type, value)) in dims.iter().enumerate() {
        sqlx::query(
            "INSERT OR IGNORE INTO activity_dims (dim_type, value, sort_no, active) VALUES (?, ?, ?, 1)",
        )
        .bind(dim_type)
        .bind(value)
        .bind(sort_no as i64)
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn seed_locations(pool: &SqlitePool) -> anyhow::Result<()> {
    let locations = [
        ("cq", "重庆", "Chongqing"),
        ("bj", "北京", "Beijing"),
        ("sg", "新加坡", "Singapore"),
        ("remote", "远程", "Remote"),
    ];

    for (sort_no, (code, zh, en)) in locations.iter().enumerate() {
        sqlx::query(
            "INSERT OR IGNORE INTO locations (code, name_zh, name_en, sort_no, active) VALUES (?, ?, ?, ?, 1)",
        )
        .bind(code)
        .bind(zh)
        .bind(en)
        .bind(sort_no as i64)
        .execute(pool)
        .await?;
    }
    Ok(())
}
