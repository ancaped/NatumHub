use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::models::{AuditEvent, AuditListQuery, AuditRecord};
use crate::modules::geral::auth::models::AuthContext;

/// Garante schema 017 em bancos que já existiam antes do bootstrap embutido.
pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hub_audit_events (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            actor_id TEXT,
            actor_name TEXT,
            device_id TEXT,
            module_key TEXT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            summary TEXT NOT NULL DEFAULT '',
            before_json JSONB,
            after_json JSONB,
            request_method TEXT,
            request_path TEXT,
            provenance TEXT NOT NULL DEFAULT 'human'
                CHECK (provenance IN ('human', 'system', 'http'))
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for idx in [
        "CREATE INDEX IF NOT EXISTS idx_hub_audit_events_created ON hub_audit_events (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_hub_audit_events_module ON hub_audit_events (module_key)",
        "CREATE INDEX IF NOT EXISTS idx_hub_audit_events_actor ON hub_audit_events (actor_id)",
        "CREATE INDEX IF NOT EXISTS idx_hub_audit_events_entity ON hub_audit_events (entity_type, entity_id)",
    ] {
        let _ = sqlx::query(idx).execute(pool).await;
    }
    Ok(())
}

pub async fn record(
    pool: &PgPool,
    ctx: Option<&AuthContext>,
    device_id: Option<&str>,
    input: AuditRecord<'_>,
) -> Result<String, String> {
    ensure_tables(pool).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO hub_audit_events (
            id, actor_id, actor_name, device_id, module_key, action,
            entity_type, entity_id, summary, before_json, after_json,
            request_method, request_path, provenance
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    )
    .bind(&id)
    .bind(ctx.map(|c| c.operator_id.as_str()))
    .bind(ctx.map(|c| c.display_name.as_str()))
    .bind(device_id)
    .bind(input.module_key)
    .bind(input.action)
    .bind(input.entity_type)
    .bind(input.entity_id)
    .bind(input.summary)
    .bind(input.before)
    .bind(input.after)
    .bind(input.request_method)
    .bind(input.request_path)
    .bind(input.provenance)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub async fn record_http_write(
    pool: &PgPool,
    ctx: &AuthContext,
    method: &str,
    path: &str,
    device_id: Option<&str>,
) -> Result<(), String> {
    let module_key = infer_module_key(path);
    let _ = record(
        pool,
        Some(ctx),
        device_id,
        AuditRecord {
            module_key: Some(module_key),
            action: "http_write",
            entity_type: None,
            entity_id: None,
            summary: &format!("{method} {path}"),
            before: None,
            after: None,
            request_method: Some(method),
            request_path: Some(path),
            provenance: "http",
        },
    )
    .await?;
    Ok(())
}

pub fn infer_module_key(path: &str) -> &'static str {
    if path.starts_with("/api/qualidade") {
        "qualidade_documentacao"
    } else if path.starts_with("/api/almox") {
        "estoque_almoxarifado"
    } else if path.starts_with("/api/estoque") {
        "estoque_produtos"
    } else if path.starts_with("/api/compras") || path.starts_with("/api/hub/compras") {
        "compras"
    } else if path.starts_with("/api/expedicao") {
        "expedicao_ecommerce"
    } else if path.starts_with("/api/financeiro") {
        "financeiro"
    } else if path.starts_with("/api/vendas") {
        "vendas"
    } else if path.starts_with("/api/hub/microbio") {
        "microbiologia"
    } else if path.starts_with("/api/hub/fisco") {
        "fisco_quimica"
    } else if path.starts_with("/api/auth") {
        "hub_operadores"
    } else if path.starts_with("/api/admin") || path.starts_with("/api/import") {
        "hub_settings"
    } else if path.starts_with("/api/hub/feedbacks") {
        "hub_settings"
    } else if path.starts_with("/api/kits") || path.starts_with("/api/producao") || path.starts_with("/api/historico") {
        "producao"
    } else {
        "sistema"
    }
}

pub async fn list_events(pool: &PgPool, q: AuditListQuery) -> Result<Vec<AuditEvent>, String> {
    ensure_tables(pool).await?;
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let module = q
        .module_key
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let actor = q
        .actor_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let search = q
        .search
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{s}%"));

    let rows = sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>, Option<String>, Option<String>, String, Option<String>, Option<String>, String, Option<Value>, Option<Value>, Option<String>, Option<String>, String)>(
        "SELECT id, created_at, actor_id, actor_name, device_id, module_key, action,
                entity_type, entity_id, summary, before_json, after_json,
                request_method, request_path, provenance
         FROM hub_audit_events
         WHERE ($1::text IS NULL OR module_key = $1)
           AND ($2::text IS NULL OR actor_id = $2)
           AND ($3::text IS NULL OR summary ILIKE $3 OR request_path ILIKE $3 OR entity_id ILIKE $3)
         ORDER BY created_at DESC
         LIMIT $4",
    )
    .bind(module)
    .bind(actor)
    .bind(search)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                created_at,
                actor_id,
                actor_name,
                device_id,
                module_key,
                action,
                entity_type,
                entity_id,
                summary,
                before_json,
                after_json,
                request_method,
                request_path,
                provenance,
            )| AuditEvent {
                id,
                created_at: created_at.to_rfc3339(),
                actor_id,
                actor_name,
                device_id,
                module_key,
                action,
                entity_type,
                entity_id,
                summary,
                before_json,
                after_json,
                request_method,
                request_path,
                provenance,
            },
        )
        .collect())
}
