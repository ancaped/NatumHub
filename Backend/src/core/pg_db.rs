use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::postgres::PgPool;
use sqlx::{Error, Row};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration as StdDuration;

use chrono::Local;

/// Erro retornado quando outra instância já iniciou o sync do dia.
pub const SYNC_ALREADY_RUNNING: &str = "__SYNC_ALREADY_RUNNING__";

/// Arquivo canônico de conexão (preferido).
pub fn postgres_env_path() -> PathBuf {
    crate::core::app_config::saves_dir().join("postgres.env")
}

/// Arquivo legado (ainda aceito se `postgres.env` não existir).
pub fn supabase_env_path() -> PathBuf {
    crate::core::app_config::saves_dir().join("supabase.env")
}

/// Caminho efetivo do arquivo de env usado (se houver).
pub fn database_env_path() -> Option<PathBuf> {
    let postgres = postgres_env_path();
    if Path::new(&postgres).exists() {
        return Some(postgres);
    }
    let supabase = supabase_env_path();
    if Path::new(&supabase).exists() {
        return Some(supabase);
    }
    None
}

fn read_database_url_from_file(env_path: &Path) -> Result<Option<String>, String> {
    let content = std::fs::read_to_string(env_path)
        .map_err(|e| format!("Erro ao ler {}: {e}", env_path.display()))?;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("DATABASE_URL=") {
            let url = value.trim().trim_matches('"');
            if !url.is_empty() {
                return Ok(Some(url.to_string()));
            }
        }
    }
    Ok(None)
}

/// Lê `DATABASE_URL`: variável de ambiente → `Saves/postgres.env` → `Saves/supabase.env`.
pub fn database_url() -> Result<String, String> {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        if !url.trim().is_empty() {
            return Ok(url);
        }
    }

    let postgres = postgres_env_path();
    if Path::new(&postgres).exists() {
        if let Some(url) = read_database_url_from_file(&postgres)? {
            return Ok(url);
        }
        return Err(format!("DATABASE_URL ausente em {}", postgres.display()));
    }

    let supabase = supabase_env_path();
    if Path::new(&supabase).exists() {
        if let Some(url) = read_database_url_from_file(&supabase)? {
            return Ok(url);
        }
        return Err(format!("DATABASE_URL ausente em {}", supabase.display()));
    }

    Err(format!(
        "DATABASE_URL não configurada. Defina a variável ou crie {} (ou legado {})",
        postgres.display(),
        supabase.display()
    ))
}

/// Extrai host da URL postgres (sem senha).
pub fn database_host_masked(url: &str) -> String {
    // postgresql://user:pass@host:port/db → host
    let after_scheme = url
        .split("://")
        .nth(1)
        .unwrap_or(url);
    let host_port = after_scheme
        .rsplit('@')
        .next()
        .unwrap_or(after_scheme)
        .split('/')
        .next()
        .unwrap_or("");
    let host = host_port.split(':').next().unwrap_or(host_port);
    if host.is_empty() {
        "(desconhecido)".to_string()
    } else {
        host.to_string()
    }
}

/// Classifica o provedor a partir do host da URL.
pub fn db_provider_hint(url: &str) -> &'static str {
    let host = database_host_masked(url).to_lowercase();
    if host.contains("supabase.com") || host.contains("supabase.co") {
        return "supabase";
    }
    if is_local_or_lan_host(&host) {
        return "local";
    }
    "other"
}

fn is_local_or_lan_host(host: &str) -> bool {
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        return true;
    }
    if host.starts_with("192.168.") || host.starts_with("10.") {
        return true;
    }
    // 172.16.0.0 – 172.31.255.255
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second) = rest.split('.').next() {
            if let Ok(n) = second.parse::<u16>() {
                return (16..=31).contains(&n);
            }
        }
    }
    false
}

/// Metadados seguros do banco (sem senha) para health / painéis.
pub fn database_connection_meta() -> Result<(String, String), String> {
    let url = database_url()?;
    Ok((
        db_provider_hint(&url).to_string(),
        database_host_masked(&url),
    ))
}

pub async fn create_pool() -> Result<PgPool, String> {
    let url = database_url()?;

    // Transaction pooler (6543) derruba sessões longas — sync ERP precisa de Session (5432).
    if url.contains(":6543") {
        eprintln!(
            "[PostgreSQL] AVISO: DATABASE_URL usa porta 6543 (Transaction pooler). \
             Prefira :5432 (Session) em Saves/postgres.env para estabilidade."
        );
    }

    let options = PgConnectOptions::from_str(&url)
        .map_err(|e| format!("DATABASE_URL inválida: {e}"))?
        .statement_cache_capacity(0);

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(StdDuration::from_secs(30))
        .idle_timeout(StdDuration::from_secs(300))
        .max_lifetime(StdDuration::from_secs(1800))
        .test_before_acquire(true)
        .connect_with(options)
        .await
        .map_err(|e| format!("Falha ao conectar PostgreSQL: {e}"))
}

/// Libera locks `em_andamento` velhos (crash / kill mid-sync).
async fn reclaim_stale_sync_locks(pool: &PgPool) -> Result<(), String> {
    let today = Local::now().date_naive();
    sqlx::query(
        "DELETE FROM sync_status
         WHERE status = 'em_andamento'
           AND (
             data_sync < $1
             OR COALESCE(inicio, NOW() - INTERVAL '3 hours') < NOW() - INTERVAL '90 minutes'
           )",
    )
    .bind(today)
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao limpar sync antigo: {e}"))?;
    Ok(())
}

/// Tenta reservar o sync do dia. Retorna `Ok(true)` se esta instância pode prosseguir.
pub async fn try_acquire_daily_sync(pool: &PgPool) -> Result<bool, String> {
    reclaim_stale_sync_locks(pool).await?;
    let today = Local::now().date_naive();

    match sqlx::query(
        "INSERT INTO sync_status (data_sync, status, inicio) VALUES ($1, 'em_andamento', NOW())",
    )
    .bind(today)
    .execute(pool)
    .await
    {
        Ok(_) => Ok(true),
        Err(Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => {
            let status: Option<String> = sqlx::query_scalar(
                "SELECT status FROM sync_status WHERE data_sync = $1",
            )
            .bind(today)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Erro ao ler sync_status: {e}"))?;

            match status.as_deref() {
                Some("concluido") => {
                    let updated = sqlx::query(
                        "UPDATE sync_status
                         SET status = 'em_andamento', inicio = NOW()
                         WHERE data_sync = $1 AND status = 'concluido'",
                    )
                    .bind(today)
                    .execute(pool)
                    .await
                    .map_err(|e| format!("Erro ao reiniciar sync: {e}"))?;
                    Ok(updated.rows_affected() > 0)
                }
                _ => Ok(false),
            }
        }
        Err(e) => Err(format!("Erro ao reservar sync diário: {e}")),
    }
}

pub async fn mark_daily_sync_complete(pool: &PgPool) -> Result<(), String> {
    let today = Local::now().date_naive();
    sqlx::query("UPDATE sync_status SET status = 'concluido' WHERE data_sync = $1")
        .bind(today)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao marcar sync concluído: {e}"))?;
    Ok(())
}

/// Libera o slot do dia após falha, permitindo nova tentativa.
pub async fn release_daily_sync(pool: &PgPool) -> Result<(), String> {
    let today = Local::now().date_naive();
    sqlx::query("DELETE FROM sync_status WHERE data_sync = $1 AND status = 'em_andamento'")
        .bind(today)
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao liberar sync diário: {e}"))?;
    Ok(())
}

/// Uso aproximado do banco (tabelas public) — painel supervisor.
pub async fn db_usage_stats(pool: &PgPool) -> Result<serde_json::Value, String> {
    let db_size: i64 = sqlx::query_scalar("SELECT pg_database_size(current_database())")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Erro ao medir tamanho do banco: {e}"))?;

    let rows = sqlx::query(
        r#"
        SELECT
            relname::text AS table_name,
            COALESCE(n_live_tup, 0)::bigint AS row_estimate,
            pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)::bigint AS total_bytes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC
        LIMIT 40
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao listar tabelas: {e}"))?;

    let tables: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            let bytes: i64 = r.get("total_bytes");
            serde_json::json!({
                "table": r.get::<String, _>("table_name"),
                "rows": r.get::<i64, _>("row_estimate"),
                "bytes": bytes,
                "sizePretty": bytes_pretty(bytes),
            })
        })
        .collect();

    let (provider, host_masked) = match database_connection_meta() {
        Ok(m) => m,
        Err(_) => ("other".to_string(), "(desconhecido)".to_string()),
    };

    let mut out = serde_json::json!({
        "databaseBytes": db_size,
        "databaseSizePretty": bytes_pretty(db_size),
        "tables": tables,
        "provider": provider,
        "hostMasked": host_masked,
        "note": "Estimativas via pg_stat / pg_total_relation_size.",
    });

    if provider == "supabase" {
        let free_tier_bytes: i64 = 500 * 1024 * 1024;
        let pct = (db_size as f64 / free_tier_bytes as f64) * 100.0;
        out["freeTierReferenceBytes"] = serde_json::json!(free_tier_bytes);
        out["freeTierReferencePretty"] = serde_json::json!("500 MB");
        out["percentOfFreeTier"] = serde_json::json!((pct * 10.0).round() / 10.0);
        out["note"] = serde_json::json!(
            "Estimativas via pg_stat. Plano e limites reais no Dashboard Supabase (Billing)."
        );
    }

    Ok(out)
}

fn bytes_pretty(bytes: i64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1024.0 && i < UNITS.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 {
        format!("{bytes} {}", UNITS[i])
    } else {
        format!("{v:.1} {}", UNITS[i])
    }
}
