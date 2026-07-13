use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use super::models::HubNotification;

pub async fn create_notification(
    pool: &PgPool,
    module_key: &str,
    kind: &str,
    title: &str,
    message: &str,
    metadata: Option<&str>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO hub_notifications (id, module_key, kind, title, message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&id)
    .bind(module_key)
    .bind(kind)
    .bind(title)
    .bind(message)
    .bind(metadata)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub async fn list_for_modules(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
    limit: i64,
) -> Result<Vec<HubNotification>, String> {
    if !is_admin && modules.is_empty() {
        return Ok(Vec::new());
    }

    let rows = if is_admin {
        sqlx::query_as::<_, (String, String, String, String, String, String, Option<String>, bool)>(
            "SELECT n.id, n.module_key, n.kind, n.title, n.message, n.created_at, n.metadata,
                    (r.notification_id IS NOT NULL) AS is_read
             FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = $1
             ORDER BY n.created_at DESC
             LIMIT $2",
        )
        .bind(operator_id)
        .bind(limit)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, (String, String, String, String, String, String, Option<String>, bool)>(
            "SELECT n.id, n.module_key, n.kind, n.title, n.message, n.created_at, n.metadata,
                    (r.notification_id IS NOT NULL) AS is_read
             FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = $1
             WHERE n.module_key = ANY($3::text[])
             ORDER BY n.created_at DESC
             LIMIT $2",
        )
        .bind(operator_id)
        .bind(limit)
        .bind(modules)
        .fetch_all(pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(id, module_key, kind, title, message, created_at, metadata, read)| HubNotification {
                id,
                module_key,
                kind,
                title,
                message,
                created_at,
                metadata,
                read,
            },
        )
        .collect())
}

pub async fn unread_count(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
) -> Result<i64, String> {
    if !is_admin && modules.is_empty() {
        return Ok(0);
    }

    if is_admin {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = $1
             WHERE r.notification_id IS NULL",
        )
        .bind(operator_id)
        .fetch_one(pool)
        .await
    } else {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_notifications n
             LEFT JOIN hub_notification_reads r
               ON r.notification_id = n.id AND r.operator_id = $1
             WHERE r.notification_id IS NULL
               AND n.module_key = ANY($2::text[])",
        )
        .bind(operator_id)
        .bind(modules)
        .fetch_one(pool)
        .await
    }
    .map_err(|e| e.to_string())
}

pub async fn mark_read(
    pool: &PgPool,
    notification_id: &str,
    operator_id: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO hub_notification_reads (notification_id, operator_id, read_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(notification_id)
    .bind(operator_id)
    .bind(Utc::now().to_rfc3339())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn mark_all_read(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
    is_admin: bool,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    if is_admin {
        sqlx::query(
            "INSERT INTO hub_notification_reads (notification_id, operator_id, read_at)
             SELECT n.id, $1, $2 FROM hub_notifications n
             ON CONFLICT DO NOTHING",
        )
        .bind(operator_id)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else if !modules.is_empty() {
        sqlx::query(
            "INSERT INTO hub_notification_reads (notification_id, operator_id, read_at)
             SELECT n.id, $1, $2 FROM hub_notifications n
             WHERE n.module_key = ANY($3::text[])
             ON CONFLICT DO NOTHING",
        )
        .bind(operator_id)
        .bind(&now)
        .bind(modules)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
