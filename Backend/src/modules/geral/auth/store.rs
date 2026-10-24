use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use rand_core::OsRng;
use sqlx::PgPool;
use uuid::Uuid;

use super::models::{AuthContext, HubDevice, Operator, OperatorDetail, OperatorPublic, OperatorRole};
use super::modules_registry::{all_module_keys_vec, default_modules_for_role, normalize_modules};

const SESSION_DAYS: i64 = 30;
const MIN_SUPERVISOR_PASSWORD_LEN: usize = 8;
const MIN_OPERATOR_PASSWORD_LEN: usize = 4;

static AUTH_INIT_DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Setting (tabela `settings`) que liga a restrição de leitura por módulo para operadores. Ausente = desligada.
pub const SETTING_RESTRINGIR_LEITURA: &str = "restringir_leitura_operadores";

static RESTRINGIR_LEITURA: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn restricao_leitura_ligada() -> bool {
    RESTRINGIR_LEITURA.load(std::sync::atomic::Ordering::Relaxed)
}

pub fn definir_restricao_leitura(ligada: bool) {
    RESTRINGIR_LEITURA.store(ligada, std::sync::atomic::Ordering::Relaxed);
}

/// Lê o setting no boot. Qualquer falha deixa a restrição desligada (como sempre foi).
async fn carregar_restricao_leitura(pool: &PgPool) {
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        .execute(pool)
        .await;
    let valor: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = $1")
        .bind(SETTING_RESTRINGIR_LEITURA)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    definir_restricao_leitura(valor.as_deref() == Some("true"));
}

pub async fn init_auth_tables(pool: &PgPool) -> Result<(), String> {
    if AUTH_INIT_DONE.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(());
    }
    seed_default_operators(pool).await?;
    migrate_operator_modules(pool).await?;
    migrate_operator_modules_access_level(pool).await?;
    migrate_linha_produtos_module_key(pool).await?;
    migrate_estoque_submodules(pool).await?;
    migrate_channels_to_stable(pool).await?;
    migrate_supervisor_role(pool).await?;
    migrate_kit_composicao_schema(pool).await?;
    migrate_overrides_programadas_schema(pool).await?;
    let _ = ensure_supervisor_password_ready(pool).await;
    carregar_restricao_leitura(pool).await;
    AUTH_INIT_DONE.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

async fn migrate_operator_modules_access_level(pool: &PgPool) -> Result<(), String> {
    sqlx::query("ALTER TABLE hub_operator_modules ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) NOT NULL DEFAULT 'edit'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn seed_default_operators(pool: &PgPool) -> Result<(), String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_operators")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let defaults: &[(&str, &str)] = &[
        ("Edson", "supervisor"),
        ("Estoque", "estoque"),
        ("Produção", "producao"),
        ("Microbiologia", "micro"),
        ("Físico-Química", "fisco"),
        ("Compras", "compras"),
        ("Financeiro", "financeiro"),
        ("Vendas", "vendas"),
    ];

    for (name, role) in defaults {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO hub_operators (id, display_name, role) VALUES ($1, $2, $3)
             ON CONFLICT (display_name) DO NOTHING",
        )
        .bind(&id)
        .bind(name)
        .bind(role)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        let modules = default_modules_for_role(role);
        let _ = set_operator_modules(pool, &id, &modules).await;
    }

    Ok(())
}

async fn migrate_supervisor_role(pool: &PgPool) -> Result<(), String> {
    let supervisor_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM hub_operators WHERE role = 'supervisor' AND active = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if supervisor_count == 0 {
        let first_admin: Option<String> = sqlx::query_scalar(
            "SELECT id FROM hub_operators WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(first_admin) = first_admin {
            sqlx::query(
                "UPDATE hub_operators SET role = 'supervisor', update_channel = 'stable' WHERE id = $1",
            )
            .bind(&first_admin)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            sqlx::query(
                "UPDATE hub_operators SET role = 'operador', update_channel = 'stable' WHERE role = 'admin' AND id != $1",
            )
            .bind(&first_admin)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Confere colunas de proporção em kit_composicao (DDL fica em Backend/supabase/005_kit_composicao.sql —
/// o role da app em geral não tem ALTER TABLE).
async fn migrate_kit_composicao_schema(pool: &PgPool) -> Result<(), String> {
    let _ = sqlx::query(
        "ALTER TABLE kit_composicao ALTER COLUMN quantidade TYPE NUMERIC(12,4) USING COALESCE(quantidade, 1)::numeric(12,4)",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "ALTER TABLE kit_composicao ADD COLUMN IF NOT EXISTS fator_proporcao_qtd NUMERIC(12,4) DEFAULT 1.0",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "ALTER TABLE kit_composicao ADD COLUMN IF NOT EXISTS fator_proporcao_kits INTEGER DEFAULT 1",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "ALTER TABLE kit_composicao ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual'",
    )
    .execute(pool)
    .await;

    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'kit_composicao' AND column_name = 'fator_proporcao_qtd'
         ) AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'kit_composicao' AND column_name = 'fator_proporcao_kits'
         ) AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'kit_composicao' AND column_name = 'origem'
         )",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if !ok {
        return Err(
            "Tabela kit_composicao sem fator_proporcao_qtd/fator_proporcao_kits/origem. \
             Aplique Backend/supabase/005_kit_composicao.sql e 027_kit_composicao_origem.sql no Postgres."
                .into(),
        );
    }
    Ok(())
}

/// Garante colunas de produções programadas em overrides_produtos.
async fn migrate_overrides_programadas_schema(pool: &PgPool) -> Result<(), String> {
    let _ = sqlx::query(
        "ALTER TABLE overrides_produtos
         ADD COLUMN IF NOT EXISTS is_producao_programada INTEGER DEFAULT 0,
         ADD COLUMN IF NOT EXISTS producao_programada_disparo BIGINT,
         ADD COLUMN IF NOT EXISTS producao_programada_objetivo BIGINT,
         ADD COLUMN IF NOT EXISTS lancamento_gatilho BIGINT,
         ADD COLUMN IF NOT EXISTS lancamento_estoque_maximo BIGINT,
         ADD COLUMN IF NOT EXISTS familia_produto TEXT",
    )
    .execute(pool)
    .await;
    Ok(())
}

/// Garante que operadores e dispositivos usem apenas o canal stable.
async fn migrate_channels_to_stable(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "UPDATE hub_operators SET update_channel = 'stable' WHERE update_channel != 'stable'",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE hub_devices SET update_channel = 'stable' WHERE update_channel != 'stable'",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let trimmed = password.trim();
    if trimmed.is_empty() {
        return Err("Senha não pode ser vazia.".to_string());
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(trimmed.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Erro ao gerar hash: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    if hash.is_empty() {
        return false;
    }
    PasswordHash::new(hash)
        .ok()
        .and_then(|parsed| Argon2::default().verify_password(password.trim().as_bytes(), &parsed).ok())
        .is_some()
}

pub fn validate_supervisor_password(password: &str) -> Result<(), String> {
    if password.trim().len() < MIN_SUPERVISOR_PASSWORD_LEN {
        return Err(format!(
            "Senha do supervisor deve ter no mínimo {MIN_SUPERVISOR_PASSWORD_LEN} caracteres."
        ));
    }
    Ok(())
}

pub fn validate_operator_password(password: &str) -> Result<(), String> {
    if password.trim().len() < MIN_OPERATOR_PASSWORD_LEN {
        return Err(format!(
            "Senha do operador deve ter no mínimo {MIN_OPERATOR_PASSWORD_LEN} caracteres."
        ));
    }
    Ok(())
}

pub async fn setup_status(pool: &PgPool) -> Result<(bool, bool), String> {
    let has_supervisor: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let supervisor_with_password: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND password_hash IS NOT NULL AND password_hash != ''",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok((has_supervisor > 0, supervisor_with_password > 0))
}

/// Encerra sessões antigas (login sem senha) enquanto supervisor não tiver senha definida.
async fn ensure_supervisor_password_ready(pool: &PgPool) -> Result<(), String> {
    if let Ok((_, has_password)) = setup_status(pool).await {
        if !has_password {
            sqlx::query("DELETE FROM hub_sessions")
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn setup_supervisor(
    pool: &PgPool,
    display_name: &str,
    password: &str,
    device_id: Option<&str>,
    device_label: Option<&str>,
    client_ip: Option<&str>,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let (_, has_password) = setup_status(pool).await?;
    if has_password {
        return Err("Supervisor já configurado. Faça login.".to_string());
    }

    validate_supervisor_password(password)?;

    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome do supervisor é obrigatório.".to_string());
    }

    let hash = hash_password(password)?;

    let existing = find_operator_by_name(pool, name).await?;
    let operator = if let Some(op) = existing {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND id != $1",
        )
        .bind(&op.id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        if count > 0 {
            sqlx::query(
                "UPDATE hub_operators SET role = 'operador', active = 0 WHERE role IN ('supervisor', 'admin') AND id != $1",
            )
            .bind(&op.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        sqlx::query(
            "UPDATE hub_operators SET role = 'supervisor', active = 1, update_channel = 'stable', password_hash = $2 WHERE id = $1",
        )
        .bind(&op.id)
        .bind(&hash)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        Operator {
            id: op.id,
            display_name: op.display_name,
            role: "supervisor".to_string(),
        }
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO hub_operators (id, display_name, role, active, update_channel, password_hash) VALUES ($1, $2, 'supervisor', 1, 'stable', $3)",
        )
        .bind(&id)
        .bind(name)
        .bind(&hash)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        let modules = all_module_keys_vec();
        set_operator_modules(pool, &id, &modules).await?;
        Operator {
            id,
            display_name: name.to_string(),
            role: "supervisor".to_string(),
        }
    };

    if let Some(did) = device_id.filter(|s| !s.trim().is_empty()) {
        register_or_update_device(
            pool,
            did,
            device_label.unwrap_or("Supervisor"),
            Some(&operator.id),
            client_ip,
            Some("stable"),
        )
        .await?;
    }

    create_session_for_operator(pool, &operator).await
}

pub fn normalize_update_channel(_role: &str, _channel: Option<&str>) -> Result<String, String> {
    Ok("stable".to_string())
}

pub fn default_update_channel_for_role(_role: &str) -> &'static str {
    "stable"
}

pub fn effective_update_channel(_user_channel: &str, _device_channel: &str) -> String {
    "stable".to_string()
}

pub async fn get_operator_update_channel(pool: &PgPool, id: &str, role: &str) -> Result<String, String> {
    let result: Result<String, sqlx::Error> = sqlx::query_scalar(
        "SELECT update_channel FROM hub_operators WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await;

    match result {
        Ok(ch) => normalize_update_channel(role, Some(&ch))
            .or_else(|_| Ok(default_update_channel_for_role(role).to_string())),
        Err(_) => Ok(default_update_channel_for_role(role).to_string()),
    }
}

pub async fn get_device_update_channel(pool: &PgPool, device_id: &str) -> Result<String, String> {
    let result: Result<String, sqlx::Error> = sqlx::query_scalar(
        "SELECT update_channel FROM hub_devices WHERE device_id = $1",
    )
    .bind(device_id)
    .fetch_one(pool)
    .await;

    match result {
        Ok(ch) => normalize_update_channel("operador", Some(&ch)),
        Err(_) => Ok("stable".to_string()),
    }
}

pub async fn register_or_update_device(
    pool: &PgPool,
    device_id: &str,
    label: &str,
    registered_by: Option<&str>,
    client_ip: Option<&str>,
    force_channel: Option<&str>,
) -> Result<HubDevice, String> {
    let did = device_id.trim();
    if did.is_empty() {
        return Err("deviceId é obrigatório.".to_string());
    }

    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_devices WHERE device_id = $1")
        .bind(did)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if exists == 0 {
        let channel = "stable";
        sqlx::query(
            "INSERT INTO hub_devices (device_id, label, update_channel, last_ip, last_seen, registered_by) VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(did)
        .bind(label.trim())
        .bind(channel)
        .bind(client_ip)
        .bind(&now)
        .bind(registered_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE hub_devices SET label = CASE WHEN $2 != '' THEN $2 ELSE label END, last_ip = COALESCE($3, last_ip), last_seen = $4, registered_by = COALESCE($5, registered_by) WHERE device_id = $1",
        )
        .bind(did)
        .bind(label.trim())
        .bind(client_ip)
        .bind(&now)
        .bind(registered_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        if force_channel.is_some() {
            update_device_channel_internal(pool, did, "stable").await?;
        }
    }

    get_device_by_id(pool, did)
        .await?
        .ok_or_else(|| "Falha ao registrar dispositivo.".to_string())
}

async fn update_device_channel_internal(
    pool: &PgPool,
    device_id: &str,
    channel: &str,
) -> Result<(), String> {
    let ch = normalize_update_channel("operador", Some(channel))?;
    sqlx::query("UPDATE hub_devices SET update_channel = $2 WHERE device_id = $1")
        .bind(device_id)
        .bind(&ch)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_devices(pool: &PgPool) -> Result<Vec<HubDevice>, String> {
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<String>)>(
        "SELECT device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at FROM hub_devices ORDER BY last_seen DESC NULLS LAST, LOWER(label)",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at)| {
            HubDevice {
                device_id,
                label,
                update_channel,
                last_ip,
                last_seen,
                registered_by,
                registered_at,
            }
        })
        .collect())
}

pub async fn get_device_by_id(pool: &PgPool, device_id: &str) -> Result<Option<HubDevice>, String> {
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<String>)>(
        "SELECT device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at FROM hub_devices WHERE device_id = $1",
    )
    .bind(device_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(
        |(device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at)| HubDevice {
            device_id,
            label,
            update_channel,
            last_ip,
            last_seen,
            registered_by,
            registered_at,
        },
    ))
}

pub async fn update_device(
    pool: &PgPool,
    device_id: &str,
    label: Option<&str>,
    update_channel: Option<&str>,
) -> Result<HubDevice, String> {
    if let Some(l) = label {
        sqlx::query("UPDATE hub_devices SET label = $2 WHERE device_id = $1")
            .bind(device_id)
            .bind(l.trim())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(ch) = update_channel {
        update_device_channel_internal(pool, device_id, ch).await?;
    }
    get_device_by_id(pool, device_id)
        .await?
        .ok_or_else(|| "Dispositivo não encontrado.".to_string())
}

pub async fn verify_supervisor_password(
    pool: &PgPool,
    operator_id: &str,
    password: &str,
) -> Result<bool, String> {
    let row: (String, Option<String>) = sqlx::query_as(
        "SELECT role, password_hash FROM hub_operators WHERE id = $1 AND active = 1",
    )
    .bind(operator_id)
    .fetch_one(pool)
    .await
    .map_err(|_| "Operador não encontrado.".to_string())?;

    let (role, hash) = row;

    if role != "supervisor" && role != "admin" {
        return Err("Apenas o supervisor pode executar esta ação.".to_string());
    }

    match hash {
        Some(h) if !h.is_empty() => Ok(verify_password(password, &h)),
        _ => Err("Supervisor sem senha configurada.".to_string()),
    }
}

async fn migrate_operator_modules(pool: &PgPool) -> Result<(), String> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, role FROM hub_operators")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    for (id, role) in rows {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_operator_modules WHERE operator_id = $1",
        )
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        if count == 0 {
            let modules = default_modules_for_role(&role);
            let _ = set_operator_modules(pool, &id, &modules).await;
        }
    }
    Ok(())
}

/// `estoque_ativos` → `admin_linha_produtos` (Linha de Produtos no Administrativo).
async fn migrate_linha_produtos_module_key(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO hub_operator_modules (operator_id, module_key)
         SELECT operator_id, 'admin_linha_produtos' FROM hub_operator_modules WHERE module_key = 'estoque_ativos'
         ON CONFLICT DO NOTHING",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM hub_operator_modules WHERE module_key = 'estoque_ativos'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// `estoque_insumos`/`estoque_produtos` → submódulos espelhando Compras.
async fn migrate_estoque_submodules(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO hub_operator_modules (operator_id, module_key)
         SELECT operator_id, 'estoque_materia_prima' FROM hub_operator_modules WHERE module_key = 'estoque_insumos'
         ON CONFLICT DO NOTHING",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO hub_operator_modules (operator_id, module_key)
         SELECT operator_id, 'estoque_embalagens' FROM hub_operator_modules WHERE module_key = 'estoque_insumos'
         ON CONFLICT DO NOTHING",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO hub_operator_modules (operator_id, module_key)
         SELECT operator_id, 'estoque_coloracao' FROM hub_operator_modules WHERE module_key = 'estoque_produtos'
         ON CONFLICT DO NOTHING",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO hub_operator_modules (operator_id, module_key)
         SELECT operator_id, 'estoque_apoio' FROM hub_operator_modules WHERE module_key = 'estoque_produtos'
         ON CONFLICT DO NOTHING",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "DELETE FROM hub_operator_modules WHERE module_key IN ('estoque_insumos', 'estoque_produtos')",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_operator_modules(pool: &PgPool, operator_id: &str) -> Result<Vec<String>, String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT module_key FROM hub_operator_modules WHERE operator_id = $1 ORDER BY module_key",
    )
    .bind(operator_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(k,)| k).collect())
}

pub async fn get_operator_modules_and_permissions(
    pool: &PgPool,
    operator_id: &str,
) -> Result<(Vec<String>, std::collections::HashMap<String, String>), String> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT module_key, access_level FROM hub_operator_modules WHERE operator_id = $1 ORDER BY module_key",
    )
    .bind(operator_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut modules = Vec::new();
    let mut perms = std::collections::HashMap::new();
    for (key, level) in rows {
        let lvl = level.unwrap_or_else(|| "edit".to_string());
        perms.insert(key.clone(), lvl);
        modules.push(key);
    }
    Ok((modules, perms))
}

pub async fn set_operator_modules(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
) -> Result<(), String> {
    set_operator_modules_with_permissions(pool, operator_id, modules, None).await
}

pub async fn set_operator_modules_with_permissions(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
    permissions: Option<&std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let normalized = normalize_modules(modules);
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    // Nível já gravado nunca muda sozinho: só `permissions` explícito o troca; módulo novo entra como "view".
    let atuais: std::collections::HashMap<String, String> =
        sqlx::query_as::<_, (String, String)>("SELECT module_key, access_level FROM hub_operator_modules WHERE operator_id = $1")
            .bind(operator_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .collect();
    sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = $1")
        .bind(operator_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for key in normalized {
        let level = permissions
            .and_then(|p| p.get(&key))
            .or_else(|| atuais.get(&key))
            .map(|s| s.as_str())
            .unwrap_or("view");
        let level = if level == "edit" { "edit" } else { "view" };
        sqlx::query(
            "INSERT INTO hub_operator_modules (operator_id, module_key, access_level) VALUES ($1, $2, $3)",
        )
        .bind(operator_id)
        .bind(&key)
        .bind(level)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn resolve_modules_for_operator(
    pool: &PgPool,
    operator_id: &str,
    role: &str,
) -> Result<(Vec<String>, std::collections::HashMap<String, String>), String> {
    let (stored, perms) = get_operator_modules_and_permissions(pool, operator_id).await?;
    if !stored.is_empty() {
        return Ok((stored, perms));
    }
    let default_mods = default_modules_for_role(role);
    let mut default_perms = std::collections::HashMap::new();
    for m in &default_mods {
        default_perms.insert(m.clone(), "edit".to_string());
    }
    Ok((default_mods, default_perms))
}

pub async fn list_active_operators(pool: &PgPool) -> Result<Vec<OperatorPublic>, String> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT display_name, role FROM hub_operators \
         WHERE active = 1 AND COALESCE(to_jsonb(hub_operators) ->> 'kind', 'humano') <> 'agente' \
         ORDER BY LOWER(display_name)",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(display_name, role)| OperatorPublic { display_name, role })
        .collect())
}

pub async fn list_all_operators(pool: &PgPool) -> Result<Vec<OperatorDetail>, String> {
    let rows: Vec<(String, String, String, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, display_name, role, active, update_channel, password_hash FROM hub_operators ORDER BY LOWER(display_name)",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for (id, display_name, role, active_raw, update_channel, password_hash) in rows {
        let active = active_raw == 1;
        let (modules, permissions) = resolve_modules_for_operator(pool, &id, &role).await?;
        let channel = normalize_update_channel(&role, Some(&update_channel))?;
        let has_password = password_hash.as_ref().is_some_and(|h| !h.is_empty());
        out.push(OperatorDetail {
            id,
            display_name,
            role,
            active,
            modules,
            permissions,
            update_channel: channel,
            has_password,
        });
    }
    Ok(out)
}

async fn find_operator_by_name(pool: &PgPool, display_name: &str) -> Result<Option<Operator>, String> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT id, display_name, role FROM hub_operators WHERE active = 1 AND LOWER(display_name) = LOWER($1)",
    )
    .bind(display_name.trim())
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(id, display_name, role)| Operator {
        id,
        display_name,
        role,
    }))
}

pub async fn find_operator_by_id(pool: &PgPool, id: &str) -> Result<Option<OperatorDetail>, String> {
    let row: Option<(String, String, String, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT id, display_name, role, active, update_channel, password_hash FROM hub_operators WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some((id, display_name, role, active_raw, update_channel, password_hash)) => {
            let active = active_raw == 1;
            let (modules, permissions) = resolve_modules_for_operator(pool, &id, &role).await?;
            let channel = normalize_update_channel(&role, Some(&update_channel))?;
            Ok(Some(OperatorDetail {
                id,
                display_name,
                role,
                active,
                modules,
                permissions,
                update_channel: channel,
                has_password: password_hash.as_ref().is_some_and(|h| !h.is_empty()),
            }))
        }
        None => Ok(None),
    }
}

async fn operator_password_hash(pool: &PgPool, operator_id: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar("SELECT password_hash FROM hub_operators WHERE id = $1")
        .bind(operator_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())
}

pub async fn create_session(
    pool: &PgPool,
    display_name: &str,
    password: &str,
    device_id: Option<&str>,
    device_label: Option<&str>,
    client_ip: Option<&str>,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome do operador é obrigatório.".to_string());
    }

    let operator = find_operator_by_name(pool, name)
        .await?
        .ok_or_else(|| "Nome ou senha inválidos.".to_string())?;

    // Agente de IA não entra por senha: só pelo token próprio (`nxa_...`).
    // Sem a coluna `kind` (migração 056 não aplicada) não há agentes: o login segue normal.
    let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM hub_operators WHERE id = $1")
        .bind(&operator.id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    if kind.as_deref() == Some("agente") {
        return Err("Nome ou senha inválidos.".to_string());
    }

    let hash = operator_password_hash(pool, &operator.id).await?;
    match hash {
        Some(h) if !h.is_empty() => {
            if !verify_password(password, &h) {
                return Err("Nome ou senha inválidos.".to_string());
            }
        }
        _ => {
            return Err("Nome ou senha inválidos.".to_string());
        }
    }

    if let Some(did) = device_id.filter(|s| !s.trim().is_empty()) {
        register_or_update_device(
            pool,
            did,
            device_label.unwrap_or("NatumHub"),
            Some(&operator.id),
            client_ip,
            Some("stable"),
        )
        .await?;
    }

    create_session_for_operator(pool, &operator).await
}

async fn create_session_for_operator(
    pool: &PgPool,
    operator: &Operator,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let (modules, _) = resolve_modules_for_operator(pool, &operator.id, &operator.role).await?;

    let token = Uuid::new_v4().to_string();
    let expires_at = (Utc::now() + Duration::days(SESSION_DAYS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    sqlx::query("INSERT INTO hub_sessions (token, operator_id, expires_at) VALUES ($1, $2, $3)")
        .bind(&token)
        .bind(&operator.id)
        .bind(&expires_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok((token, operator.clone(), modules, expires_at))
}

pub async fn build_auth_user(
    pool: &PgPool,
    operator: &Operator,
    modules: Vec<String>,
    device_id: Option<&str>,
) -> Result<super::models::AuthUser, String> {
    let role = OperatorRole::from_str(&operator.role);
    let (resolved_modules, mut permissions) = resolve_modules_for_operator(pool, &operator.id, &operator.role).await?;
    let mut final_modules = if modules.is_empty() { resolved_modules } else { modules };
    if role.is_supervisor() {
        final_modules = all_module_keys_vec();
        permissions.clear();
        for m in &final_modules {
            permissions.insert(m.clone(), "edit".to_string());
        }
    }
    let user_channel = get_operator_update_channel(pool, &operator.id, &operator.role).await?;
    let device_channel = match device_id.filter(|s| !s.trim().is_empty()) {
        Some(did) => get_device_update_channel(pool, did).await?,
        None => "stable".to_string(),
    };
    let effective = effective_update_channel(&user_channel, &device_channel);

    Ok(super::models::AuthUser {
        id: operator.id.clone(),
        display_name: operator.display_name.clone(),
        role: operator.role.clone(),
        photo_url: AuthContext {
            operator_id: operator.id.clone(),
            display_name: operator.display_name.clone(),
            role: role.clone(),
            modules: final_modules.clone(),
            permissions: permissions.clone(),
            origem: super::models::Origem::Tela,
        }
        .avatar_url(),
        modules: final_modules,
        permissions,
        update_channel: effective.clone(),
        user_update_channel: user_channel,
        device_update_channel: device_channel,
        effective_update_channel: effective,
        is_supervisor: role.is_supervisor(),
    })
}

pub async fn create_operator(
    pool: &PgPool,
    display_name: &str,
    role: &str,
    modules: &[String],
    permissions: Option<&std::collections::HashMap<String, String>>,
    update_channel: Option<&str>,
    password: Option<&str>,
) -> Result<OperatorDetail, String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome é obrigatório.".to_string());
    }

    if role == "supervisor" || role == "admin" {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1",
        )
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        if count > 0 {
            return Err("Já existe um supervisor ativo. Só é permitida uma conta master.".to_string());
        }
    }

    let pwd = password.ok_or_else(|| "Senha do operador é obrigatória.".to_string())?;
    validate_operator_password(pwd)?;
    let hash = hash_password(pwd)?;

    let channel = normalize_update_channel(
        role,
        Some(update_channel.unwrap_or(default_update_channel_for_role(role))),
    )?;
    let id = Uuid::new_v4().to_string();

    let result = sqlx::query(
        "INSERT INTO hub_operators (id, display_name, role, active, update_channel, password_hash) VALUES ($1, $2, $3, 1, $4, $5)",
    )
    .bind(&id)
    .bind(name)
    .bind(role)
    .bind(&channel)
    .bind(&hash)
    .execute(pool)
    .await;

    match result {
        Ok(_) => {}
        Err(sqlx::Error::Database(ref e)) if e.code().as_deref() == Some("23505") => {
            return Err("Já existe um operador com este nome.".to_string());
        }
        Err(e) => return Err(e.to_string()),
    }

    let mods = if modules.is_empty() {
        default_modules_for_role(role)
    } else {
        normalize_modules(modules)
    };
    set_operator_modules_with_permissions(pool, &id, &mods, permissions).await?;

    find_operator_by_id(pool, &id)
        .await?
        .ok_or_else(|| "Falha ao criar operador.".to_string())
}

pub async fn update_operator(
    pool: &PgPool,
    id: &str,
    display_name: &str,
    role: &str,
    active: bool,
    modules: &[String],
    permissions: Option<&std::collections::HashMap<String, String>>,
    update_channel: Option<&str>,
    password: Option<&str>,
    supervisor_id: Option<&str>,
    supervisor_password: Option<&str>,
) -> Result<OperatorDetail, String> {
    // Só bloqueia promoção a supervisor/admin se já existe outro ativo.
    // Atualizar um supervisor já existente (ex.: senha) deve ser permitido.
    if (role == "supervisor" || role == "admin") && active {
        let current_role: Option<String> =
            sqlx::query_scalar("SELECT role FROM hub_operators WHERE id = $1")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
        let already_supervisor = current_role
            .as_deref()
            .is_some_and(|r| r == "supervisor" || r == "admin");
        if !already_supervisor {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1",
            )
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;
            if count > 0 {
                return Err("Já existe um supervisor ativo.".to_string());
            }
        }
    }

    if let (Some(sup_id), Some(sup_pwd)) = (supervisor_id, supervisor_password) {
        if !verify_supervisor_password(pool, sup_id, sup_pwd).await? {
            return Err("Senha do supervisor incorreta.".to_string());
        }
    }

    let channel = if let Some(ch) = update_channel {
        normalize_update_channel(role, Some(ch))?
    } else {
        get_operator_update_channel(pool, id, role).await?
    };

    let active_val: i32 = if active { 1 } else { 0 };

    if let Some(pwd) = password.filter(|p| !p.trim().is_empty()) {
        if role == "supervisor" || role == "admin" {
            validate_supervisor_password(pwd)?;
        } else {
            validate_operator_password(pwd)?;
        }
        let hash = hash_password(pwd)?;
        sqlx::query(
            "UPDATE hub_operators SET display_name = $2, role = $3, active = $4, update_channel = $5, password_hash = $6 WHERE id = $1",
        )
        .bind(id)
        .bind(display_name.trim())
        .bind(role)
        .bind(active_val)
        .bind(&channel)
        .bind(&hash)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE hub_operators SET display_name = $2, role = $3, active = $4, update_channel = $5 WHERE id = $1",
        )
        .bind(id)
        .bind(display_name.trim())
        .bind(role)
        .bind(active_val)
        .bind(&channel)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let mods = if modules.is_empty() {
        default_modules_for_role(role)
    } else {
        normalize_modules(modules)
    };
    set_operator_modules_with_permissions(pool, id, &mods, permissions).await?;

    if !active {
        sqlx::query("DELETE FROM hub_sessions WHERE operator_id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    find_operator_by_id(pool, id)
        .await?
        .ok_or_else(|| "Operador não encontrado.".to_string())
}

/// Remove operador permanentemente (encerra sessões). Bloqueia autoexclusão e último supervisor.
pub async fn delete_operator(
    pool: &PgPool,
    id: &str,
    requester_id: &str,
) -> Result<(), String> {
    if id == requester_id {
        return Err("Você não pode excluir sua própria conta.".to_string());
    }

    let target = find_operator_by_id(pool, id)
        .await?
        .ok_or_else(|| "Operador não encontrado.".to_string())?;

    let is_supervisor_role = target.role == "supervisor" || target.role == "admin";
    if is_supervisor_role && target.active {
        let other_supervisors: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND id != $1",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        if other_supervisors == 0 {
            return Err("Não é possível excluir o último supervisor ativo.".to_string());
        }
    }

    sqlx::query("DELETE FROM hub_sessions WHERE operator_id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Limpa módulos vinculados se existir tabela
    let _ = sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = $1")
        .bind(id)
        .execute(pool)
        .await;

    let res = sqlx::query("DELETE FROM hub_operators WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if res.rows_affected() == 0 {
        return Err("Operador não encontrado.".to_string());
    }
    Ok(())
}

pub async fn revoke_session(pool: &PgPool, token: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM hub_sessions WHERE token = $1")
        .bind(token)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn resolve_session(pool: &PgPool, token: &str) -> Result<Option<AuthContext>, String> {
    if token.starts_with(crate::modules::geral::agentes::PREFIXO_TOKEN) {
        return crate::modules::geral::agentes::resolver_token(pool, token).await;
    }
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let row: Option<(String, String, String)> = sqlx::query_as(
        "
        SELECT o.id, o.display_name, o.role
        FROM hub_sessions s
        JOIN hub_operators o ON o.id = s.operator_id
        WHERE s.token = $1 AND s.expires_at > $2 AND o.active = 1
        ",
    )
    .bind(token)
    .bind(&now)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some((id, display_name, role_str)) => {
            let role = OperatorRole::from_str(&role_str);
            let (mut modules, mut permissions) = resolve_modules_for_operator(pool, &id, &role_str).await?;
            if role.is_supervisor() {
                modules = all_module_keys_vec();
                permissions.clear();
                for m in &modules {
                    permissions.insert(m.clone(), "edit".to_string());
                }
            }
            Ok(Some(AuthContext {
                operator_id: id,
                display_name,
                role,
                modules,
                permissions,
                origem: super::models::Origem::Tela,
            }))
        }
        None => Ok(None),
    }
}

pub async fn purge_expired_sessions(pool: &PgPool) -> Result<(), String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    sqlx::query("DELETE FROM hub_sessions WHERE expires_at <= $1")
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn log_audit(
    pool: &PgPool,
    ctx: &AuthContext,
    method: &str,
    path: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO hub_audit_log (operator_id, operator_name, method, path) VALUES ($1, $2, $3, $4)",
    )
    .bind(&ctx.operator_id)
    .bind(&ctx.display_name)
    .bind(method)
    .bind(path)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn is_public_path(path: &str) -> bool {
    // SPA / assets estáticos (servidos fora do middleware via fallback; defesa em profundidade)
    if !path.starts_with("/api") {
        return true;
    }
    matches!(
        path,
        "/api/health"
            | "/api/auth/login"
            | "/api/auth/operators"
            | "/api/auth/session"
            | "/api/auth/setup-status"
            | "/api/auth/setup-supervisor"
            | "/api/settings/report-logo"
            | "/api/qualidade/pops/settings/logo"
    ) || path.starts_with("/api/hub/client-config")
        || path == "/api/hub/public-config"
        || path.starts_with("/api/hub/feedbacks")
        || path.starts_with("/api/chat")
        || path == "/api/server-manager/status"
        || path == "/api/server-manager/links"
        || path.starts_with("/api/producao/ultimo-lote")
        || path.starts_with("/api/google/callback")
}

pub fn requires_supervisor(path: &str, method: &str) -> bool {
    if path.starts_with("/api/server-manager") {
        return matches!(method, "POST" | "PUT" | "DELETE");
    }
    if path.starts_with("/api/mapa") {
        return matches!(method, "GET" | "POST" | "PUT" | "PATCH" | "DELETE");
    }
    if path.starts_with("/api/admin/db-usage") {
        return matches!(method, "GET");
    }
    if path == "/api/admin/pg-backup" {
        return matches!(method, "GET");
    }
    if path.starts_with("/api/admin/pg-backup/") {
        return matches!(method, "POST");
    }
    if path == "/api/admin/audit/events" {
        return matches!(method, "GET");
    }
    if path == "/api/admin/audit/stock/resync-insumos"
        || path == "/api/admin/audit/stock/resync-produtos"
        || path == "/api/admin/audit/stock/verify-insumos"
        || path == "/api/admin/audit/stock/verify-all"
    {
        return matches!(method, "POST");
    }
    if path.starts_with("/api/admin/audit/stock/") {
        if path.ends_with("/refresh") {
            return matches!(method, "POST");
        }
        return matches!(method, "GET");
    }
    if path.starts_with("/api/auth/operators/manage") {
        return matches!(method, "GET" | "POST" | "PUT" | "DELETE");
    }
    if path.starts_with("/api/admin/agentes") || path.starts_with("/api/admin/permissoes") {
        return true;
    }
    if path.starts_with("/api/auth/devices/manage") {
        return matches!(method, "GET" | "PUT");
    }
    if path == "/api/settings/report-logo" || path == "/api/qualidade/pops/settings/logo" {
        return matches!(method, "POST" | "PUT" | "DELETE");
    }
    if !matches!(method, "POST" | "PUT" | "DELETE" | "PATCH") {
        return false;
    }
    // Configuração de Compras (Disp/Obj, categorias, regras, config app)
    if path.starts_with("/api/hub/compras/custom-configs")
        || path.starts_with("/api/hub/compras/categories")
        || path == "/api/hub/compras/config"
        || path == "/api/hub/compras/pinned-subcategories"
        || path == "/api/hub/compras/items/category"
    {
        return true;
    }
    path.starts_with("/api/import/sync")
        || path.starts_with("/api/import/dump")
        || path.starts_with("/api/import/erp-sync-schedule")
        || path.starts_with("/api/admin/db-reset")
        || path.contains("/hub/client-config")
}

pub fn requires_module(path: &str, method: &str) -> Option<&'static str> {
    if !matches!(method, "POST" | "PUT" | "DELETE" | "PATCH") {
        return None;
    }
    if path.starts_with("/api/qualidade/recebimento-mp") {
        return Some(super::modules_registry::MODULE_QUALIDADE_RECEBIMENTO_MP);
    }
    if path.starts_with("/api/qualidade/avarias") {
        return Some(super::modules_registry::MODULE_QUALIDADE_AVARIAS);
    }
    if path.starts_with("/api/hub/microbio") {
        return Some(super::modules_registry::MODULE_MICROBIOLOGIA);
    }
    if path.starts_with("/api/hub/fisco") {
        return Some(super::modules_registry::MODULE_FISCO_QUIMICA);
    }
    if path.starts_with("/api/financeiro") {
        return Some(super::modules_registry::MODULE_FINANCEIRO);
    }
    if path.starts_with("/api/almox/demands") {
        return Some(super::modules_registry::MODULE_ESTOQUE_ALMOX);
    }
    if path.starts_with("/api/almox/equipments") {
        return Some(super::modules_registry::MODULE_ESTOQUE_EQUIPAMENTOS);
    }
    if path.starts_with("/api/almox/maintenances") {
        return Some(super::modules_registry::MODULE_ESTOQUE_MANUTENCOES);
    }
    // Writes em /api/almox: liberados no middleware se tiver qualquer módulo ops;
    // handlers validam a section específica.
    if path.starts_with("/api/almox") {
        return None;
    }
    None
}

/// Módulos que dão acesso a uma rota da API (qualquer um deles basta). Usado para limitar agentes de IA:
/// sem módulo mapeado, o agente não lê nem grava. Operadores não passam por aqui.
pub fn modulos_da_rota(path: &str) -> Option<&'static [&'static str]> {
    use super::modules_registry::*;
    const COMPRAS: &[&str] = &[
        MODULE_COMPRAS_MP, MODULE_COMPRAS_EMB, MODULE_COMPRAS_COLOR, MODULE_COMPRAS_APOIO,
        MODULE_COMPRAS_COT, MODULE_COMPRAS_PEDIDOS, MODULE_COMPRAS_NOTAS, MODULE_COMPRAS_SIMULATION,
    ];
    const PRODUCAO: &[&str] = &[
        MODULE_PRODUCAO, MODULE_PLANEJAMENTO_PRODUCAO, MODULE_PRODUCAO_BASES, MODULE_PRODUCAO_LOTES, MODULE_PRODUCAO_PROC,
    ];
    const PLANEJAMENTO: &[&str] = &[MODULE_PLANEJAMENTO_PRODUCAO, MODULE_PRODUCAO];
    const ACOMPANHAMENTO: &[&str] = &[MODULE_ADMIN_ACOMPANHAMENTO_PRODUCAO, MODULE_PRODUCAO, MODULE_PLANEJAMENTO_PRODUCAO];
    const ALMOX: &[&str] = &[
        MODULE_ESTOQUE_ITENS, MODULE_ESTOQUE_ALMOX, MODULE_ESTOQUE_SUPERMERCADO, MODULE_ESTOQUE_PECAS,
        MODULE_ESTOQUE_EQUIPAMENTOS, MODULE_ESTOQUE_MANUTENCOES,
    ];
    const ESTOQUE: &[&str] = &[
        MODULE_ESTOQUE_INSUMOS, MODULE_ESTOQUE_PRODUTOS, MODULE_ESTOQUE_MP, MODULE_ESTOQUE_EMB, MODULE_ESTOQUE_COLOR,
        MODULE_ESTOQUE_APOIO, MODULE_ESTOQUE_ORDENS_MANUAIS, MODULE_ESTOQUE_ITENS, MODULE_ESTOQUE_ALMOX,
    ];
    const QUALIDADE: &[&str] = &[
        MODULE_CONTROLE_QUALIDADE, MODULE_QUALIDADE_POPS, MODULE_QUALIDADE_TREINAMENTOS, MODULE_QUALIDADE_TEMPERATURA,
        MODULE_QUALIDADE_LIMPEZA, MODULE_QUALIDADE_RECEBIMENTO_MP, MODULE_QUALIDADE_DOCUMENTACAO,
        MODULE_QUALIDADE_DEVOLUCOES, MODULE_QUALIDADE_AVARIAS,
    ];
    // Cadastro de produtos: consultado por produção, vendas, compras e estoque.
    const CADASTRO_PRODUTOS: &[&str] = &[
        MODULE_PRODUCAO, MODULE_PLANEJAMENTO_PRODUCAO, MODULE_VENDAS, MODULE_COMPRAS_MP, MODULE_COMPRAS_EMB,
        MODULE_COMPRAS_COLOR, MODULE_COMPRAS_APOIO, MODULE_ESTOQUE_PRODUTOS,
        MODULE_ESTOQUE_INSUMOS, MODULE_ADMIN_LINHA_PRODUTOS,
    ];
    // Do mais específico para o mais geral: o primeiro prefixo que casar decide.
    const MAPA: &[(&str, &[&str])] = &[
        ("/api/vendas", &[MODULE_VENDAS, MODULE_VENDAS_ONLINE]),
        ("/api/expedicao", &[MODULE_EXPEDICAO, MODULE_EXPEDICAO_ECOMMERCE, MODULE_EXPEDICAO_SEPARACAO]),
        ("/api/financeiro", &[MODULE_FINANCEIRO]),
        ("/api/hub/compras", COMPRAS),
        ("/api/compras", COMPRAS),
        ("/api/hub/microbio", &[MODULE_MICROBIOLOGIA]),
        ("/api/hub/fisco", &[MODULE_FISCO_QUIMICA]),
        ("/api/qualidade/recebimento-mp", &[MODULE_QUALIDADE_RECEBIMENTO_MP]),
        ("/api/qualidade/avarias", &[MODULE_QUALIDADE_AVARIAS]),
        ("/api/qualidade/devolucoes", &[MODULE_QUALIDADE_DEVOLUCOES]),
        ("/api/qualidade/documentacao", &[MODULE_QUALIDADE_DOCUMENTACAO]),
        ("/api/qualidade/pops", &[MODULE_QUALIDADE_POPS]),
        ("/api/qualidade", QUALIDADE),
        ("/api/almox/equipments", &[MODULE_ESTOQUE_EQUIPAMENTOS]),
        ("/api/almox/maintenances", &[MODULE_ESTOQUE_MANUTENCOES]),
        ("/api/almox", ALMOX),
        ("/api/estoque/ordens-manuais", &[MODULE_ESTOQUE_ORDENS_MANUAIS]),
        ("/api/estoque", ESTOQUE),
        ("/api/producao/proc", &[MODULE_PRODUCAO_PROC]),
        ("/api/producao/lotes", &[MODULE_PRODUCAO_LOTES, MODULE_PRODUCAO]),
        ("/api/producao/planejamento-semanal", PLANEJAMENTO),
        ("/api/producao/fila-demandas", PLANEJAMENTO),
        ("/api/producao/reatores", PLANEJAMENTO),
        ("/api/producao/cobertura", PLANEJAMENTO),
        ("/api/producao", PRODUCAO),
        ("/api/products", CADASTRO_PRODUTOS),
        ("/api/produtos", CADASTRO_PRODUTOS),
        ("/api/overrides", PRODUCAO),
        ("/api/configs", PRODUCAO),
        ("/api/historico", PRODUCAO),
        ("/api/lotes", PRODUCAO),
        ("/api/lancamento", PRODUCAO),
        ("/api/kits", &[MODULE_MONTAGEM_KITS]),
        ("/api/turnovers", &[MODULE_MONTAGEM_KITS]),
        ("/api/administrativo/funcionarios", &[MODULE_ADMIN_FUNCIONARIOS]),
        ("/api/administrativo", ACOMPANHAMENTO),
        ("/api/admin/produtos-ativos", &[MODULE_ADMIN_PRODUTOS_ATIVOS_RELATORIOS, MODULE_ADMIN_LINHA_PRODUTOS]),
        ("/api/ferramentas/etiquetas", &[MODULE_FERRAMENTAS_ETIQUETAS, MODULE_FERRAMENTAS_EDITOR]),
        ("/api/ferramentas/impressoras", &[MODULE_FERRAMENTAS_IMPRESSORAS]),
        ("/api/ferramentas/balanca", &[MODULE_FERRAMENTAS_BALANCA]),
        ("/api/settings", &[MODULE_CONFIGURACOES]),
        ("/api/import", &[MODULE_CONFIGURACOES]),
    ];
    MAPA.iter()
        .find(|(prefixo, _)| path == *prefixo || path.starts_with(&format!("{prefixo}/")))
        .map(|(_, modulos)| *modulos)
}

/// Leitura (GET/HEAD). Supervisor lê tudo. Agente só lê rotas dos módulos que tem. Operador comum lê tudo,
/// a não ser que a restrição de leitura esteja ligada (setting `restringir_leitura_operadores`): aí rota
/// mapeada exige algum dos módulos da rota; rota sem mapeamento segue liberada.
pub fn has_read_access(ctx: &AuthContext, path: &str, method: &str) -> bool {
    has_read_access_com(ctx, path, method, restricao_leitura_ligada())
}

pub fn has_read_access_com(ctx: &AuthContext, path: &str, method: &str, restringir: bool) -> bool {
    if ctx.role.is_supervisor() || !matches!(method, "GET" | "HEAD") {
        return true;
    }
    if path == "/api/health" || path.starts_with("/api/agentes/") {
        return true;
    }
    if ctx.is_agente() {
        return modulos_da_rota(path).is_some_and(|ms| ms.iter().any(|m| ctx.has_module(m)));
    }
    // Configurações gerais (`/api/settings/*`) são lidas por telas de qualquer módulo.
    if !restringir || path == "/api/settings" || path.starts_with("/api/settings/") {
        return true;
    }
    modulos_da_rota(path).is_none_or(|ms| ms.iter().any(|m| ctx.has_module(m)))
}

pub fn has_write_access(ctx: &AuthContext, path: &str, method: &str) -> bool {
    if ctx.role.is_supervisor() {
        return true;
    }
    if !matches!(method, "POST" | "PUT" | "DELETE" | "PATCH") {
        return true;
    }
    if path.starts_with("/api/hub/compras") {
        return ctx.modules.iter().any(|m| m.starts_with("compras") && ctx.can_edit_module(m));
    }
    if path.starts_with("/api/almox") && !path.starts_with("/api/almox/demands") {
        use super::modules_registry::*;
        return ctx.modules.iter().any(|m| {
            matches!(
                m.as_str(),
                MODULE_ESTOQUE_ITENS
                    | MODULE_ESTOQUE_ALMOX
                    | MODULE_ESTOQUE_SUPERMERCADO
                    | MODULE_ESTOQUE_PECAS
                    | MODULE_ESTOQUE_EQUIPAMENTOS
                    | MODULE_ESTOQUE_MANUTENCOES
            ) && ctx.can_edit_module(m)
        });
    }
    if let Some(required) = requires_module(path, method) {
        return ctx.can_edit_module(required);
    }
    if path.starts_with("/api/products") || path.starts_with("/api/overrides") || path.starts_with("/api/lotes") {
        return ctx.can_edit_module(super::modules_registry::MODULE_PRODUCAO);
    }
    if path.starts_with("/api/kits") {
        return ctx.can_edit_module(super::modules_registry::MODULE_MONTAGEM_KITS);
    }
    if path.starts_with("/api/qualidade") {
        return ctx.can_edit_module(super::modules_registry::MODULE_CONTROLE_QUALIDADE)
            || ctx.can_edit_module(super::modules_registry::MODULE_QUALIDADE_POPS)
            || ctx.can_edit_module(super::modules_registry::MODULE_QUALIDADE_DEVOLUCOES)
            || ctx.can_edit_module(super::modules_registry::MODULE_QUALIDADE_DOCUMENTACAO)
            || ctx.can_edit_module(super::modules_registry::MODULE_QUALIDADE_RECEBIMENTO_MP);
    }
    if path.starts_with("/api/vendas") {
        return ctx.can_edit_module(super::modules_registry::MODULE_VENDAS);
    }
    // Caminho sem regra acima: operador segue liberado (como sempre foi); agente precisa de "editar"
    // num módulo da rota (`modulos_da_rota`), e rota sem módulo mapeado é negada.
    if ctx.is_agente() {
        return modulos_da_rota(path).is_some_and(|ms| ms.iter().any(|m| ctx.can_edit_module(m)));
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::geral::auth::models::Origem;
    use std::collections::HashMap;

    fn ctx(role: OperatorRole, origem: Origem, modulos: &[&str]) -> AuthContext {
        AuthContext {
            operator_id: "o1".into(),
            display_name: "Teste".into(),
            role,
            modules: modulos.iter().map(|m| m.to_string()).collect(),
            permissions: modulos.iter().map(|m| (m.to_string(), "view".to_string())).collect(),
            origem,
        }
    }

    #[test]
    fn operador_le_tudo_com_restricao_desligada() {
        let op = ctx(OperatorRole::Operador, Origem::Tela, &["vendas"]);
        assert!(has_read_access_com(&op, "/api/producao/auditoria", "GET", false));
        assert!(has_read_access_com(&op, "/api/notifications", "GET", false));
    }

    #[test]
    fn operador_com_restricao_ligada_le_so_seus_modulos() {
        let op = ctx(OperatorRole::Operador, Origem::Tela, &["vendas"]);
        assert!(has_read_access_com(&op, "/api/vendas/pedidos", "GET", true));
        assert!(!has_read_access_com(&op, "/api/producao/auditoria", "GET", true));
        assert!(has_read_access_com(&op, "/api/notifications", "GET", true), "rota sem mapeamento segue liberada");
        assert!(has_read_access_com(&op, "/api/settings/qualquer", "GET", true), "settings gerais seguem liberadas");
        assert!(has_read_access_com(&op, "/api/health", "GET", true));
        assert!(has_read_access_com(&op, "/api/producao/lotes", "POST", true), "restrição é só de leitura");
    }

    #[test]
    fn supervisor_le_tudo_e_agente_segue_como_antes() {
        let sup = ctx(OperatorRole::Supervisor, Origem::Tela, &[]);
        assert!(has_read_access_com(&sup, "/api/producao/auditoria", "GET", true));
        let ag = ctx(OperatorRole::Operador, Origem::Agente, &["vendas"]);
        assert!(has_read_access_com(&ag, "/api/vendas/pedidos", "GET", false));
        assert!(!has_read_access_com(&ag, "/api/producao/auditoria", "GET", false));
        assert!(!has_read_access_com(&ag, "/api/notifications", "GET", false));
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn salvar_modulos_preserva_nivel_existente_e_novo_entra_como_view() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        init_auth_tables(&pool).await.unwrap();
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO hub_operators (id, display_name, role, active, update_channel) VALUES ($1, $2, 'operador', 1, 'stable')",
        )
        .bind(&id)
        .bind(format!("teste-permissoes-{id}"))
        .execute(&pool)
        .await
        .unwrap();
        let niveis = |pool: PgPool, id: String| async move {
            sqlx::query_as::<_, (String, String)>("SELECT module_key, access_level FROM hub_operator_modules WHERE operator_id = $1")
                .bind(id)
                .fetch_all(&pool)
                .await
                .unwrap()
                .into_iter()
                .collect::<HashMap<_, _>>()
        };

        let resultado = async {
            let inicial = HashMap::from([("producao".to_string(), "edit".to_string())]);
            set_operator_modules_with_permissions(&pool, &id, &["producao".to_string()], Some(&inicial)).await.unwrap();
            let mods = ["producao".to_string(), "vendas".to_string()];

            set_operator_modules_with_permissions(&pool, &id, &mods, None).await.unwrap();
            let n = niveis(pool.clone(), id.clone()).await;
            assert_eq!(n["producao"], "edit", "nível existente não muda");
            assert_eq!(n["vendas"], "view", "módulo novo entra como view");

            let explicito = HashMap::from([("vendas".to_string(), "edit".to_string())]);
            set_operator_modules_with_permissions(&pool, &id, &mods, Some(&explicito)).await.unwrap();
            let n = niveis(pool.clone(), id.clone()).await;
            assert_eq!(n["vendas"], "edit", "permissions explícito vale");
            assert_eq!(n["producao"], "edit");
        }
        .await;

        sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = $1").bind(&id).execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM hub_operators WHERE id = $1").bind(&id).execute(&pool).await.unwrap();
        resultado
    }
}
