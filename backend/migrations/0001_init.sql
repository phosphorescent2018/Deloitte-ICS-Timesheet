PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY NOT NULL,
    employee_no     TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    email           TEXT,
    department      TEXT,
    role            TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TIMESHEET_USER')),
    active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    password_hash   TEXT NOT NULL,
    wecom_userid    TEXT UNIQUE,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS activity_dims (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dim_type    TEXT NOT NULL CHECK (dim_type IN ('BUSINESS_LINE', 'PRODUCT', 'STAGE')),
    value       TEXT NOT NULL,
    sort_no     INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    UNIQUE (dim_type, value)
);

CREATE TABLE IF NOT EXISTS locations (
    code        TEXT PRIMARY KEY NOT NULL,
    name_zh     TEXT NOT NULL,
    name_en     TEXT NOT NULL,
    sort_no     INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS holidays (
    holiday_date TEXT PRIMARY KEY NOT NULL,
    year         INTEGER NOT NULL,
    day_type     TEXT NOT NULL CHECK (day_type IN ('HOLIDAY', 'WORKDAY')),
    name_zh      TEXT NOT NULL,
    name_en      TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'STATE_COUNCIL'
);

CREATE TABLE IF NOT EXISTS timesheet_day (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id),
    work_date       TEXT NOT NULL,
    location_code   TEXT NOT NULL,
    target_hours    REAL NOT NULL DEFAULT 8.0,
    version         INTEGER NOT NULL DEFAULT 0,
    saved_at        TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_day_date ON timesheet_day(work_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_day_user ON timesheet_day(user_id, work_date);

CREATE TABLE IF NOT EXISTS timesheet_entry (
    id              TEXT PRIMARY KEY NOT NULL,
    day_id          TEXT NOT NULL REFERENCES timesheet_day(id) ON DELETE CASCADE,
    activity_code   TEXT NOT NULL,
    hours           REAL NOT NULL CHECK (hours >= 0),
    remark          TEXT NOT NULL DEFAULT '',
    sort_no         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_timesheet_entry_day ON timesheet_entry(day_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY NOT NULL,
    actor_id    TEXT NOT NULL REFERENCES users(id),
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    detail      TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at);

CREATE TABLE IF NOT EXISTS feedback (
    id          TEXT PRIMARY KEY NOT NULL,
    content     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
