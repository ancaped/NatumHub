use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::HubNotification;

pub fn init_notifications_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS hub_notifications (
            id          TEXT PRIMARY KEY,
            module_key  TEXT NOT NULL,
            kind        TEXT NOT NULL DEFAULT 'info',
            title       TEXT NOT NULL,
            message     TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            metadata    TEXT
        );

        CREATE TABLE IF NOT EXISTS hub_notification_reads (
            notification_id TEXT NOT NULL,
            operator_id     TEXT NOT NULL,
            read_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (notification_id, operator_id),
            FOREIGN KEY (notification_id) REFERENCES hub_notifications(id) ON DELETE CASCADE,
            FOREIGN KEY (operator_id) REFERENCES hub_operators(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_hub_notifications_created ON hub_notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hub_notifications_module ON hub_notifications(module_key);
        ",
    )?;
    Ok(())
}

pub fn create_notification(
    conn: &Connection,
    module_key: &str,
    kind: &str,
    title: &str,
    message: &str,
    metadata: Option<&str>,
) -> Result<String, rusqlite::Error> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO hub_notifications (id, module_key, kind, title, message, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, module_key, kind, title, message, metadata],
    )?;
    Ok(id)
}

pub fn list_for_modules(
    conn: &Connection,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
    limit: i64,
) -> Result<Vec<HubNotification>, rusqlite::Error> {
    let mut out = Vec::new();
    if !is_admin && modules.is_empty() {
        return Ok(out);
    }

    let sql = if is_admin {
        "SELECT n.id, n.module_key, n.kind, n.title, n.message, n.created_at, n.metadata,
                CASE WHEN r.notification_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
         FROM hub_notifications n
         LEFT JOIN hub_notification_reads r
           ON r.notification_id = n.id AND r.operator_id = ?1
         ORDER BY n.created_at DESC
         LIMIT ?2"
    } else {
        "SELECT n.id, n.module_key, n.kind, n.title, n.message, n.created_at, n.metadata,
                CASE WHEN r.notification_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
         FROM hub_notifications n
         LEFT JOIN hub_notification_reads r
           ON r.notification_id = n.id AND r.operator_id = ?1
         WHERE n.module_key IN (
           SELECT value FROM json_each(?3)
         )
         ORDER BY n.created_at DESC
         LIMIT ?2"
    };

    if is_admin {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![operator_id, limit], map_row)?;
        for row in rows {
            out.push(row?);
        }
    } else {
        let modules_json = serde_json::to_string(modules).unwrap_or_else(|_| "[]".to_string());
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![operator_id, limit, modules_json], map_row)?;
        for row in rows {
            out.push(row?);
        }
    }

    Ok(out)
}

fn map_row(row: &rusqlite::Row<'_>) -> Result<HubNotification, rusqlite::Error> {
    Ok(HubNotification {
        id: row.get(0)?,
        module_key: row.get(1)?,
        kind: row.get(2)?,
        title: row.get(3)?,
        message: row.get(4)?,
        created_at: row.get(5)?,
        metadata: row.get(6)?,
        read: row.get::<_, i64>(7)? == 1,
    })
}

pub fn unread_count(
    conn: &Connection,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
) -> Result<i64, rusqlite::Error> {
    if !is_admin && modules.is_empty() {
        return Ok(0);
    }

    if is_admin {
        conn.query_row(
            "SELECT COUNT(*) FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = ?1
             WHERE r.notification_id IS NULL",
            params![operator_id],
            |r| r.get(0),
        )
    } else {
        let modules_json = serde_json::to_string(modules).unwrap_or_else(|_| "[]".to_string());
        conn.query_row(
            "SELECT COUNT(*) FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = ?1
             WHERE r.notification_id IS NULL
               AND n.module_key IN (SELECT value FROM json_each(?2))",
            params![operator_id, modules_json],
            |r| r.get(0),
        )
    }
}

pub fn mark_read(
    conn: &Connection,
    notification_id: &str,
    operator_id: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR IGNORE INTO hub_notification_reads (notification_id, operator_id, read_at)
         VALUES (?1, ?2, ?3)",
        params![notification_id, operator_id, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn mark_all_read(
    conn: &Connection,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
) -> Result<(), rusqlite::Error> {
    let now = Utc::now().to_rfc3339();
    if is_admin {
        conn.execute(
            "INSERT OR IGNORE INTO hub_notification_reads (notification_id, operator_id, read_at)
             SELECT n.id, ?1, ?2 FROM hub_notifications n",
            params![operator_id, now],
        )?;
    } else if !modules.is_empty() {
        let modules_json = serde_json::to_string(modules).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR IGNORE INTO hub_notification_reads (notification_id, operator_id, read_at)
             SELECT n.id, ?1, ?2 FROM hub_notifications n
             WHERE n.module_key IN (SELECT value FROM json_each(?3))",
            params![operator_id, now, modules_json],
        )?;
    }
    Ok(())
}
