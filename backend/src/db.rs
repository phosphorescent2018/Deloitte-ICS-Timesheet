use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

use crate::{auth::hash_password, config::Config};

pub async fn connect(config: &Config) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    seed(&pool, config).await?;

    Ok(pool)
}

async fn seed(pool: &PgPool, config: &Config) -> anyhow::Result<()> {
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
    pool: &PgPool,
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
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)"#,
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

async fn seed_dims(pool: &PgPool) -> anyhow::Result<()> {
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
            "INSERT INTO activity_dims (dim_type, value, sort_no, active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (dim_type, value) DO NOTHING",
        )
        .bind(dim_type)
        .bind(value)
        .bind(sort_no as i32)
        .execute(pool)
        .await?;
    }
    Ok(())
}

async fn seed_locations(pool: &PgPool) -> anyhow::Result<()> {
    let locations = [
        ("cq", "重庆", "Chongqing"),
        ("bj", "北京", "Beijing"),
        ("sg", "新加坡", "Singapore"),
        ("remote", "远程", "Remote"),
    ];

    for (sort_no, (code, zh, en)) in locations.iter().enumerate() {
        sqlx::query(
            "INSERT INTO locations (code, name_zh, name_en, sort_no, active)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (code) DO NOTHING",
        )
        .bind(code)
        .bind(zh)
        .bind(en)
        .bind(sort_no as i32)
        .execute(pool)
        .await?;
    }
    Ok(())
}
