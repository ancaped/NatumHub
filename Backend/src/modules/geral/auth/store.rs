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

pub async fn init_auth_tables(pool: &PgPool) -> Result<(), String> {
    seed_default_operators(pool).await?;
    migrate_operator_modules(pool).await?;
    migrate_linha_produtos_module_key(pool).await?;
    migrate_estoque_submodules(pool).await?;
    migrate_channels_to_stable(pool).await?;
    migrate_supervisor_role(pool).await?;
    let _ = ensure_supervisor_password_ready(pool).await;
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

pub async fn set_operator_modules(
    pool: &PgPool,
    operator_id: &str,
    modules: &[String],
) -> Result<(), String> {
    let normalized = normalize_modules(modules);
    sqlx::query("DELETE FROM hub_operator_modules WHERE operator_id = $1")
        .bind(operator_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    for key in normalized {
        sqlx::query(
            "INSERT INTO hub_operator_modules (operator_id, module_key) VALUES ($1, $2)",
        )
        .bind(operator_id)
        .bind(&key)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn resolve_modules_for_operator(
    pool: &PgPool,
    operator_id: &str,
    role: &str,
) -> Result<Vec<String>, String> {
    let stored = get_operator_modules(pool, operator_id).await?;
    if !stored.is_empty() {
        return Ok(stored);
    }
    Ok(default_modules_for_role(role))
}

pub async fn list_active_operators(pool: &PgPool) -> Result<Vec<OperatorPublic>, String> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT display_name, role FROM hub_operators WHERE active = 1 ORDER BY LOWER(display_name)",
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
        let modules = resolve_modules_for_operator(pool, &id, &role).await?;
        let channel = normalize_update_channel(&role, Some(&update_channel))?;
        let has_password = password_hash.as_ref().is_some_and(|h| !h.is_empty());
        out.push(OperatorDetail {
            id,
            display_name,
            role,
            active,
            modules,
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
            let modules = resolve_modules_for_operator(pool, &id, &role).await?;
            let channel = normalize_update_channel(&role, Some(&update_channel))?;
            Ok(Some(OperatorDetail {
                id,
                display_name,
                role,
                active,
                modules,
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
        .ok_or_else(|| {
            format!(
                "Operador \"{}\" não cadastrado. Peça ao supervisor para criar seu acesso.",
                name
            )
        })?;

    let hash = operator_password_hash(pool, &operator.id).await?;
    match hash {
        Some(h) if !h.is_empty() => {
            if !verify_password(password, &h) {
                return Err("Senha incorreta.".to_string());
            }
        }
        _ => {
            return Err(
                "Senha não definida para este operador. Peça ao supervisor para configurar.".to_string(),
            );
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
    let modules = resolve_modules_for_operator(pool, &operator.id, &operator.role).await?;

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
            modules: modules.clone(),
        }
        .avatar_url(),
        modules,
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
    set_operator_modules(pool, &id, &mods).await?;

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
    update_channel: Option<&str>,
    password: Option<&str>,
    supervisor_id: Option<&str>,
    supervisor_password: Option<&str>,
) -> Result<OperatorDetail, String> {
    if role == "supervisor" || role == "admin" {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND id != $1",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        if count > 0 && active {
            return Err("Já existe um supervisor ativo.".to_string());
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
        validate_operator_password(pwd)?;
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
    set_operator_modules(pool, id, &mods).await?;

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

pub async fn revoke_session(pool: &PgPool, token: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM hub_sessions WHERE token = $1")
        .bind(token)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn resolve_session(pool: &PgPool, token: &str) -> Result<Option<AuthContext>, String> {
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
            let mut modules = resolve_modules_for_operator(pool, &id, &role_str).await?;
            if role.is_supervisor() {
                modules = all_module_keys_vec();
            }
            Ok(Some(AuthContext {
                operator_id: id,
                display_name,
                role,
                modules,
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
    matches!(
        path,
        "/api/health"
            | "/api/auth/login"
            | "/api/auth/operators"
            | "/api/auth/session"
            | "/api/auth/setup-status"
            | "/api/auth/setup-supervisor"
            | "/login"
    ) || path.starts_with("/api/hub/client-config")
        || path.starts_with("/api/hub/updater-manifest/")
        || path == "/api/hub/public-config"
        || path.starts_with("/api/google/callback")
}

pub fn requires_supervisor(path: &str, method: &str) -> bool {
    if path.starts_with("/api/admin/db-usage") {
        return matches!(method, "GET");
    }
    if path == "/api/admin/audit/stock/resync-insumos" {
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
    if path.starts_with("/api/auth/devices/manage") {
        return matches!(method, "GET" | "PUT");
    }
    if path.starts_with("/api/auth/releases/") {
        return matches!(method, "GET" | "POST" | "PUT");
    }
    if !matches!(method, "POST" | "PUT" | "DELETE") {
        return false;
    }
    path.starts_with("/api/import/sync")
        || path.starts_with("/api/import/dump")
        || path.starts_with("/api/import/erp-sync-schedule")
        || path.starts_with("/api/admin/db-reset")
        || path.contains("/hub/client-config")
}

pub fn requires_module(path: &str, method: &str) -> Option<&'static str> {
    if !matches!(method, "POST" | "PUT" | "DELETE") {
        return None;
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
    None
}

pub fn has_write_access(ctx: &AuthContext, path: &str, method: &str) -> bool {
    if ctx.role.is_supervisor() {
        return true;
    }
    if !matches!(method, "POST" | "PUT" | "DELETE") {
        return true;
    }
    if path.starts_with("/api/hub/compras") {
        return ctx.modules.iter().any(|m| m.starts_with("compras"));
    }
    if let Some(required) = requires_module(path, method) {
        return ctx.has_module(required);
    }
    true
}
