use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{AuthContext, HubDevice, Operator, OperatorDetail, OperatorPublic, OperatorRole};
use super::modules_registry::{all_module_keys_vec, default_modules_for_role, normalize_modules};

const SESSION_DAYS: i64 = 30;
const MIN_SUPERVISOR_PASSWORD_LEN: usize = 8;
const MIN_OPERATOR_PASSWORD_LEN: usize = 4;

pub fn init_auth_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS hub_operators (
            id          TEXT PRIMARY KEY,
            display_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            role        TEXT NOT NULL DEFAULT 'operador',
            active      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS hub_operator_modules (
            operator_id TEXT NOT NULL,
            module_key  TEXT NOT NULL,
            PRIMARY KEY (operator_id, module_key),
            FOREIGN KEY (operator_id) REFERENCES hub_operators(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS hub_sessions (
            token       TEXT PRIMARY KEY,
            operator_id TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (operator_id) REFERENCES hub_operators(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS hub_audit_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            operator_id   TEXT,
            operator_name TEXT,
            method        TEXT,
            path          TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS hub_devices (
            device_id       TEXT PRIMARY KEY,
            label           TEXT NOT NULL DEFAULT '',
            update_channel  TEXT NOT NULL DEFAULT 'stable',
            last_ip         TEXT,
            last_seen       TEXT,
            registered_by   TEXT,
            registered_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (registered_by) REFERENCES hub_operators(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_hub_sessions_operator ON hub_sessions(operator_id);
        CREATE INDEX IF NOT EXISTS idx_hub_sessions_expires ON hub_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_hub_operator_modules_op ON hub_operator_modules(operator_id);
        ",
    )?;

    seed_default_operators(conn)?;
    migrate_operator_modules(conn)?;
    migrate_update_channel(conn)?;
    migrate_password_hash(conn)?;
    migrate_supervisor_role(conn)?;
    let _ = ensure_supervisor_password_ready(conn);
    crate::modules::geral::notifications::store::init_notifications_tables(conn)?;
    Ok(())
}

fn seed_default_operators(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM hub_operators", [], |r| r.get(0))?;
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
        conn.execute(
            "INSERT OR IGNORE INTO hub_operators (id, display_name, role) VALUES (?1, ?2, ?3)",
            params![id, name, role],
        )?;
        let modules = default_modules_for_role(role);
        let _ = set_operator_modules(conn, &id, &modules);
    }

    Ok(())
}

fn migrate_password_hash(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('hub_operators') WHERE name = 'password_hash'",
        [],
        |r| r.get(0),
    )?;
    if count == 0 {
        conn.execute(
            "ALTER TABLE hub_operators ADD COLUMN password_hash TEXT",
            [],
        )?;
    }
    Ok(())
}

fn migrate_supervisor_role(conn: &Connection) -> Result<(), rusqlite::Error> {
    let supervisor_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM hub_operators WHERE role = 'supervisor' AND active = 1",
        [],
        |r| r.get(0),
    )?;

    if supervisor_count == 0 {
        if let Ok(first_admin) = conn.query_row(
            "SELECT id FROM hub_operators WHERE role = 'admin' AND active = 1 ORDER BY rowid LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        ) {
            conn.execute(
                "UPDATE hub_operators SET role = 'supervisor', update_channel = 'alpha' WHERE id = ?1",
                params![first_admin],
            )?;
            conn.execute(
                "UPDATE hub_operators SET role = 'operador', update_channel = 'stable' WHERE role = 'admin' AND id != ?1",
                params![first_admin],
            )?;
        }
    }
    Ok(())
}

fn migrate_update_channel(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('hub_operators') WHERE name = 'update_channel'",
        [],
        |r| r.get(0),
    )?;
    if count == 0 {
        conn.execute(
            "ALTER TABLE hub_operators ADD COLUMN update_channel TEXT NOT NULL DEFAULT 'stable'",
            [],
        )?;
        conn.execute(
            "UPDATE hub_operators SET update_channel = 'alpha' WHERE role IN ('admin', 'supervisor')",
            [],
        )?;
    }
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

pub fn setup_status(conn: &Connection) -> Result<(bool, bool), String> {
    let has_supervisor: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let supervisor_with_password: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND password_hash IS NOT NULL AND password_hash != ''",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok((has_supervisor > 0, supervisor_with_password > 0))
}

/// Encerra sessões antigas (login sem senha) enquanto supervisor não tiver senha definida.
fn ensure_supervisor_password_ready(conn: &Connection) -> Result<(), rusqlite::Error> {
    if let Ok((_, has_password)) = setup_status(conn) {
        if !has_password {
            conn.execute("DELETE FROM hub_sessions", [])?;
        }
    }
    Ok(())
}

pub fn setup_supervisor(
    conn: &Connection,
    display_name: &str,
    password: &str,
    device_id: Option<&str>,
    device_label: Option<&str>,
    client_ip: Option<&str>,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let (_, has_password) = setup_status(conn)?;
    if has_password {
        return Err("Supervisor já configurado. Faça login.".to_string());
    }

    validate_supervisor_password(password)?;

    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome do supervisor é obrigatório.".to_string());
    }

    let hash = hash_password(password)?;

    let existing = find_operator_by_name(conn, name)?;
    let operator = if let Some(op) = existing {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND id != ?1",
                params![op.id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > 0 {
            conn.execute(
                "UPDATE hub_operators SET role = 'operador', active = 0 WHERE role IN ('supervisor', 'admin') AND id != ?1",
                params![op.id],
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute(
            "UPDATE hub_operators SET role = 'supervisor', active = 1, update_channel = 'alpha', password_hash = ?2 WHERE id = ?1",
            params![op.id, hash],
        )
        .map_err(|e| e.to_string())?;
        Operator {
            id: op.id,
            display_name: op.display_name,
            role: "supervisor".to_string(),
        }
    } else {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO hub_operators (id, display_name, role, active, update_channel, password_hash) VALUES (?1, ?2, 'supervisor', 1, 'alpha', ?3)",
            params![id, name, hash],
        )
        .map_err(|e| e.to_string())?;
        let modules = all_module_keys_vec();
        set_operator_modules(conn, &id, &modules)?;
        Operator {
            id,
            display_name: name.to_string(),
            role: "supervisor".to_string(),
        }
    };

    if let Some(did) = device_id.filter(|s| !s.trim().is_empty()) {
        register_or_update_device(
            conn,
            did,
            device_label.unwrap_or("Supervisor"),
            Some(&operator.id),
            client_ip,
            Some("alpha"),
        )?;
    }

    create_session_for_operator(conn, &operator)
}

pub fn normalize_update_channel(role: &str, channel: Option<&str>) -> Result<String, String> {
    let ch = channel.unwrap_or("stable").trim().to_lowercase();
    if !matches!(ch.as_str(), "alpha" | "beta" | "stable") {
        return Err("Canal de atualização deve ser: alpha, beta ou stable.".to_string());
    }
    if ch == "alpha" && role != "supervisor" && role != "admin" {
        return Err("Canal Alpha é exclusivo para o supervisor/desenvolvedor.".to_string());
    }
    Ok(ch)
}

pub fn default_update_channel_for_role(role: &str) -> &'static str {
    if role == "supervisor" || role == "admin" {
        "alpha"
    } else {
        "stable"
    }
}

fn channel_rank(channel: &str) -> u8 {
    match channel {
        "stable" => 0,
        "beta" => 1,
        "alpha" => 2,
        _ => 0,
    }
}

pub fn effective_update_channel(user_channel: &str, device_channel: &str) -> String {
    if channel_rank(user_channel) <= channel_rank(device_channel) {
        user_channel.to_string()
    } else {
        device_channel.to_string()
    }
}

pub fn get_operator_update_channel(conn: &Connection, id: &str, role: &str) -> Result<String, String> {
    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT update_channel FROM hub_operators WHERE id = ?1",
        params![id],
        |row| row.get(0),
    );
    match result {
        Ok(ch) => normalize_update_channel(role, Some(&ch))
            .or_else(|_| Ok(default_update_channel_for_role(role).to_string())),
        Err(_) => Ok(default_update_channel_for_role(role).to_string()),
    }
}

pub fn get_device_update_channel(conn: &Connection, device_id: &str) -> Result<String, String> {
    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT update_channel FROM hub_devices WHERE device_id = ?1",
        params![device_id],
        |row| row.get(0),
    );
    match result {
        Ok(ch) => normalize_update_channel("operador", Some(&ch)),
        Err(_) => Ok("stable".to_string()),
    }
}

pub fn register_or_update_device(
    conn: &Connection,
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
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM hub_devices WHERE device_id = ?1",
            params![did],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if exists == 0 {
        let channel = force_channel.unwrap_or("stable");
        conn.execute(
            "INSERT INTO hub_devices (device_id, label, update_channel, last_ip, last_seen, registered_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![did, label.trim(), channel, client_ip, now, registered_by],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE hub_devices SET label = CASE WHEN ?2 != '' THEN ?2 ELSE label END, last_ip = COALESCE(?3, last_ip), last_seen = ?4, registered_by = COALESCE(?5, registered_by) WHERE device_id = ?1",
            params![did, label.trim(), client_ip, now, registered_by],
        )
        .map_err(|e| e.to_string())?;
        if let Some(ch) = force_channel {
            update_device_channel_internal(conn, did, ch)?;
        }
    }

    get_device_by_id(conn, did)?.ok_or_else(|| "Falha ao registrar dispositivo.".to_string())
}

fn update_device_channel_internal(conn: &Connection, device_id: &str, channel: &str) -> Result<(), String> {
    let ch = normalize_update_channel("operador", Some(channel))?;
    conn.execute(
        "UPDATE hub_devices SET update_channel = ?2 WHERE device_id = ?1",
        params![device_id, ch],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_devices(conn: &Connection) -> Result<Vec<HubDevice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at FROM hub_devices ORDER BY last_seen DESC, label COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(HubDevice {
                device_id: row.get(0)?,
                label: row.get(1)?,
                update_channel: row.get(2)?,
                last_ip: row.get(3)?,
                last_seen: row.get(4)?,
                registered_by: row.get(5)?,
                registered_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_device_by_id(conn: &Connection, device_id: &str) -> Result<Option<HubDevice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT device_id, label, update_channel, last_ip, last_seen, registered_by, registered_at FROM hub_devices WHERE device_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![device_id], |row| {
            Ok(HubDevice {
                device_id: row.get(0)?,
                label: row.get(1)?,
                update_channel: row.get(2)?,
                last_ip: row.get(3)?,
                last_seen: row.get(4)?,
                registered_by: row.get(5)?,
                registered_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok(d)) => Ok(Some(d)),
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

pub fn update_device(
    conn: &Connection,
    device_id: &str,
    label: Option<&str>,
    update_channel: Option<&str>,
) -> Result<HubDevice, String> {
    if let Some(l) = label {
        conn.execute(
            "UPDATE hub_devices SET label = ?2 WHERE device_id = ?1",
            params![device_id, l.trim()],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ch) = update_channel {
        update_device_channel_internal(conn, device_id, ch)?;
    }
    get_device_by_id(conn, device_id)?.ok_or_else(|| "Dispositivo não encontrado.".to_string())
}

pub fn verify_supervisor_password(conn: &Connection, operator_id: &str, password: &str) -> Result<bool, String> {
    let (role, hash): (String, Option<String>) = conn
        .query_row(
            "SELECT role, password_hash FROM hub_operators WHERE id = ?1 AND active = 1",
            params![operator_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Operador não encontrado.".to_string())?;

    if role != "supervisor" && role != "admin" {
        return Err("Apenas o supervisor pode executar esta ação.".to_string());
    }

    match hash {
        Some(h) if !h.is_empty() => Ok(verify_password(password, &h)),
        _ => Err("Supervisor sem senha configurada.".to_string()),
    }
}

fn migrate_operator_modules(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT id, role FROM hub_operators")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;

    for row in rows {
        let (id, role) = row?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM hub_operator_modules WHERE operator_id = ?1",
            params![id],
            |r| r.get(0),
        )?;
        if count == 0 {
            let modules = default_modules_for_role(&role);
            let _ = set_operator_modules(conn, &id, &modules);
        }
    }
    Ok(())
}

pub fn get_operator_modules(conn: &Connection, operator_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT module_key FROM hub_operator_modules WHERE operator_id = ?1 ORDER BY module_key")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![operator_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn set_operator_modules(
    conn: &Connection,
    operator_id: &str,
    modules: &[String],
) -> Result<(), String> {
    let normalized = normalize_modules(modules);
    conn.execute(
        "DELETE FROM hub_operator_modules WHERE operator_id = ?1",
        params![operator_id],
    )
    .map_err(|e| e.to_string())?;
    for key in normalized {
        conn.execute(
            "INSERT INTO hub_operator_modules (operator_id, module_key) VALUES (?1, ?2)",
            params![operator_id, key],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn resolve_modules_for_operator(
    conn: &Connection,
    operator_id: &str,
    role: &str,
) -> Result<Vec<String>, String> {
    let stored = get_operator_modules(conn, operator_id)?;
    if !stored.is_empty() {
        return Ok(stored);
    }
    Ok(default_modules_for_role(role))
}

pub fn list_active_operators(conn: &Connection) -> Result<Vec<OperatorPublic>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT display_name, role FROM hub_operators WHERE active = 1 ORDER BY display_name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(OperatorPublic {
                display_name: row.get(0)?,
                role: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn list_all_operators(conn: &Connection) -> Result<Vec<OperatorDetail>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, role, active, update_channel, password_hash FROM hub_operators ORDER BY display_name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)? == 1,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let (id, display_name, role, active, update_channel, password_hash) =
            row.map_err(|e| e.to_string())?;
        let modules = resolve_modules_for_operator(conn, &id, &role)?;
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

fn find_operator_by_name(conn: &Connection, display_name: &str) -> Result<Option<Operator>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, role FROM hub_operators WHERE active = 1 AND display_name = ?1 COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![display_name.trim()], |row| {
            Ok(Operator {
                id: row.get(0)?,
                display_name: row.get(1)?,
                role: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok(op)) => Ok(Some(op)),
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

pub fn find_operator_by_id(conn: &Connection, id: &str) -> Result<Option<OperatorDetail>, String> {
    let mut stmt = conn
        .prepare("SELECT id, display_name, role, active, update_channel, password_hash FROM hub_operators WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)? == 1,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok((id, display_name, role, active, update_channel, password_hash))) => {
            let modules = resolve_modules_for_operator(conn, &id, &role)?;
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
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

fn operator_password_hash(conn: &Connection, operator_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT password_hash FROM hub_operators WHERE id = ?1",
        params![operator_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn create_session(
    conn: &Connection,
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

    let operator = find_operator_by_name(conn, name)?.ok_or_else(|| {
        format!(
            "Operador \"{}\" não cadastrado. Peça ao supervisor para criar seu acesso.",
            name
        )
    })?;

    let hash = operator_password_hash(conn, &operator.id)?;
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
        let force_alpha = if operator.role == "supervisor" || operator.role == "admin" {
            None
        } else {
            None
        };
        register_or_update_device(
            conn,
            did,
            device_label.unwrap_or("NatumHub"),
            Some(&operator.id),
            client_ip,
            force_alpha,
        )?;
    }

    create_session_for_operator(conn, &operator)
}

fn create_session_for_operator(
    conn: &Connection,
    operator: &Operator,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let modules = resolve_modules_for_operator(conn, &operator.id, &operator.role)?;

    let token = Uuid::new_v4().to_string();
    let expires_at = (Utc::now() + Duration::days(SESSION_DAYS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    conn.execute(
        "INSERT INTO hub_sessions (token, operator_id, expires_at) VALUES (?1, ?2, ?3)",
        params![token, operator.id, expires_at],
    )
    .map_err(|e| e.to_string())?;

    Ok((token, operator.clone(), modules, expires_at))
}

pub fn build_auth_user(
    conn: &Connection,
    operator: &Operator,
    modules: Vec<String>,
    device_id: Option<&str>,
) -> Result<super::models::AuthUser, String> {
    let role = OperatorRole::from_str(&operator.role);
    let user_channel = get_operator_update_channel(conn, &operator.id, &operator.role)?;
    let device_channel = device_id
        .filter(|s| !s.trim().is_empty())
        .map(|did| get_device_update_channel(conn, did))
        .transpose()?
        .unwrap_or_else(|| "stable".to_string());
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

pub fn create_operator(
    conn: &Connection,
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
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1",
                [],
                |r| r.get(0),
            )
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
    conn.execute(
        "INSERT INTO hub_operators (id, display_name, role, active, update_channel, password_hash) VALUES (?1, ?2, ?3, 1, ?4, ?5)",
        params![id, name, role, channel, hash],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "Já existe um operador com este nome.".to_string()
        } else {
            e.to_string()
        }
    })?;

    let mods = if modules.is_empty() {
        default_modules_for_role(role)
    } else {
        normalize_modules(modules)
    };
    set_operator_modules(conn, &id, &mods)?;

    find_operator_by_id(conn, &id)?.ok_or_else(|| "Falha ao criar operador.".to_string())
}

pub fn update_operator(
    conn: &Connection,
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
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM hub_operators WHERE role IN ('supervisor', 'admin') AND active = 1 AND id != ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > 0 && active {
            return Err("Já existe um supervisor ativo.".to_string());
        }
    }

    if let (Some(sup_id), Some(sup_pwd)) = (supervisor_id, supervisor_password) {
        if !verify_supervisor_password(conn, sup_id, sup_pwd)? {
            return Err("Senha do supervisor incorreta.".to_string());
        }
    }

    let channel = if let Some(ch) = update_channel {
        normalize_update_channel(role, Some(ch))?
    } else {
        get_operator_update_channel(conn, id, role)?
    };

    if let Some(pwd) = password.filter(|p| !p.trim().is_empty()) {
        validate_operator_password(pwd)?;
        let hash = hash_password(pwd)?;
        conn.execute(
            "UPDATE hub_operators SET display_name = ?2, role = ?3, active = ?4, update_channel = ?5, password_hash = ?6 WHERE id = ?1",
            params![id, display_name.trim(), role, if active { 1 } else { 0 }, channel, hash],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE hub_operators SET display_name = ?2, role = ?3, active = ?4, update_channel = ?5 WHERE id = ?1",
            params![id, display_name.trim(), role, if active { 1 } else { 0 }, channel],
        )
        .map_err(|e| e.to_string())?;
    }

    let mods = if modules.is_empty() {
        default_modules_for_role(role)
    } else {
        normalize_modules(modules)
    };
    set_operator_modules(conn, id, &mods)?;

    if !active {
        conn.execute("DELETE FROM hub_sessions WHERE operator_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    find_operator_by_id(conn, id)?.ok_or_else(|| "Operador não encontrado.".to_string())
}

pub fn revoke_session(conn: &Connection, token: &str) -> Result<(), String> {
    conn.execute("DELETE FROM hub_sessions WHERE token = ?1", params![token])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_session(conn: &Connection, token: &str) -> Result<Option<AuthContext>, String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut stmt = conn
        .prepare(
            "
            SELECT o.id, o.display_name, o.role
            FROM hub_sessions s
            JOIN hub_operators o ON o.id = s.operator_id
            WHERE s.token = ?1 AND s.expires_at > ?2 AND o.active = 1
            ",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![token, now], |row| {
            let id: String = row.get(0)?;
            let display_name: String = row.get(1)?;
            let role_str: String = row.get(2)?;
            Ok((id, display_name, role_str))
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok((id, display_name, role_str))) => {
            let role = OperatorRole::from_str(&role_str);
            let mut modules = resolve_modules_for_operator(conn, &id, &role_str)?;
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
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

pub fn purge_expired_sessions(conn: &Connection) -> Result<(), String> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute("DELETE FROM hub_sessions WHERE expires_at <= ?1", params![now])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn log_audit(
    conn: &Connection,
    ctx: &AuthContext,
    method: &str,
    path: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO hub_audit_log (operator_id, operator_name, method, path) VALUES (?1, ?2, ?3, ?4)",
        params![ctx.operator_id, ctx.display_name, method, path],
    )
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
        || path.starts_with("/api/hub/claim-principal")
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
