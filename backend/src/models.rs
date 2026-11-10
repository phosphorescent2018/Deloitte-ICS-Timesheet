use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: String,
    pub employee_no: String,
    pub name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub role: String,
    pub active: i64,
    pub wecom_userid: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDimRow {
    pub dim_type: String,
    pub value: String,
    pub sort_no: i64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LocationRow {
    pub code: String,
    pub name_zh: String,
    pub name_en: String,
    pub sort_no: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub business_lines: Vec<String>,
    pub products: Vec<String>,
    pub stages: Vec<String>,
    pub locations: Vec<LocationRow>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub employee_no: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: UserRow,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TimesheetEntryRow {
    pub id: String,
    pub activity_code: String,
    pub hours: f64,
    pub remark: String,
    pub sort_no: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimesheetDayResponse {
    pub date: String,
    pub location: String,
    pub target_hours: f64,
    pub saved_at: Option<String>,
    pub total_hours: f64,
    pub status: String,
    pub entries: Vec<TimesheetEntryRow>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub activity_code: String,
    pub hours: f64,
    #[serde(default)]
    pub remark: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDayRequest {
    pub location: String,
    #[serde(default = "default_target")]
    pub target_hours: f64,
    #[serde(default)]
    pub entries: Vec<EntryInput>,
}

fn default_target() -> f64 {
    8.0
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthResponse {
    pub year: i32,
    pub month: u32,
    pub days: Vec<TimesheetDayResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub year: i32,
    pub month: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserRequest {
    pub employee_no: String,
    pub name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub role: String,
    pub password: String,
    pub active: Option<bool>,
    pub wecom_userid: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub department: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
    pub active: Option<bool>,
    pub wecom_userid: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConfigRequest {
    pub business_lines: Vec<String>,
    pub products: Vec<String>,
    pub stages: Vec<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    pub id: String,
    pub actor_id: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub detail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct FeedbackCreateRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct FeedbackStatusRequest {
    pub status: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackRow {
    pub id: String,
    pub content: String,
    pub status: String,
    pub created_at: String,
}
