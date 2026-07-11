use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{AuthContext, Operator, OperatorDetail, OperatorPublic, OperatorRole};
use super::modules_registry::{all_module_keys_vec, default_modules_for_role, normalize_modules};

const SESSION_DAYS: i64 = 30;

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

        CREATE INDEX IF NOT EXISTS idx_hub_sessions_operator ON hub_sessions(operator_id);
        CREATE INDEX IF NOT EXISTS idx_hub_sessions_expires ON hub_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_hub_operator_modules_op ON hub_operator_modules(operator_id);
        ",
    )?;

    seed_default_operators(conn)?;
    migrate_operator_modules(conn)?;
    migrate_update_channel(conn)?;
    crate::modules::geral::notifications::store::init_notifications_tables(conn)?;
    Ok(())
}

fn seed_default_operators(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM hub_operators", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let defaults: &[(&str, &str)] = &[
        ("Edson", "admin"),
        ("Administrador", "admin"),
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
            "UPDATE hub_operators SET update_channel = 'alpha' WHERE role = 'admin'",
            [],
        )?;
    }
    Ok(())
}

pub fn normalize_update_channel(role: &str, channel: Option<&str>) -> Result<String, String> {
    let ch = channel.unwrap_or("stable").trim().to_lowercase();
    if !matches!(ch.as_str(), "alpha" | "beta" | "stable") {
        return Err("Canal de atualização deve ser: alpha, beta ou stable.".to_string());
    }
    if ch == "alpha" && role != "admin" {
        return Err(
            "Canal Alpha é exclusivo para administradores/desenvolvedores.".to_string(),
        );
    }
    Ok(ch)
}

pub fn default_update_channel_for_role(role: &str) -> &'static str {
    if role == "admin" {
        "alpha"
    } else {
        "stable"
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
            "SELECT id, display_name, role, active, update_channel FROM hub_operators ORDER BY display_name COLLATE NOCASE",
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
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let (id, display_name, role, active, update_channel) = row.map_err(|e| e.to_string())?;
        let modules = resolve_modules_for_operator(conn, &id, &role)?;
        let channel = normalize_update_channel(&role, Some(&update_channel))?;
        out.push(OperatorDetail {
            id,
            display_name,
            role,
            active,
            modules,
            update_channel: channel,
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
        .prepare("SELECT id, display_name, role, active, update_channel FROM hub_operators WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok(OperatorDetail {
                id: row.get(0)?,
                display_name: row.get(1)?,
                role: row.get(2)?,
                active: row.get::<_, i32>(3)? == 1,
                modules: vec![],
                update_channel: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(Ok(mut op)) => {
            op.modules = resolve_modules_for_operator(conn, &op.id, &op.role)?;
            op.update_channel =
                normalize_update_channel(&op.role, Some(&op.update_channel))?;
            Ok(Some(op))
        }
        Some(Err(e)) => Err(e.to_string()),
        None => Ok(None),
    }
}

pub fn create_session(
    conn: &Connection,
    display_name: &str,
) -> Result<(String, Operator, Vec<String>, String), String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome do operador é obrigatório.".to_string());
    }

    let operator = find_operator_by_name(conn, name)?.ok_or_else(|| {
        format!(
            "Operador \"{}\" não cadastrado. Peça ao administrador para criar seu acesso.",
            name
        )
    })?;

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

    Ok((token, operator, modules, expires_at))
}

pub fn create_operator(
    conn: &Connection,
    display_name: &str,
    role: &str,
    modules: &[String],
    update_channel: Option<&str>,
) -> Result<OperatorDetail, String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Nome é obrigatório.".to_string());
    }
    let channel = normalize_update_channel(
        role,
        Some(update_channel.unwrap_or(default_update_channel_for_role(role))),
    )?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO hub_operators (id, display_name, role, active, update_channel) VALUES (?1, ?2, ?3, 1, ?4)",
        params![id, name, role, channel],
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
) -> Result<OperatorDetail, String> {
    let channel = if let Some(ch) = update_channel {
        normalize_update_channel(role, Some(ch))?
    } else {
        get_operator_update_channel(conn, id, role)?
    };
    conn.execute(
        "UPDATE hub_operators SET display_name = ?2, role = ?3, active = ?4, update_channel = ?5 WHERE id = ?1",
        params![id, display_name.trim(), role, if active { 1 } else { 0 }, channel],
    )
    .map_err(|e| e.to_string())?;

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
            if role.is_admin() {
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
        "/api/health" | "/api/auth/login" | "/api/auth/operators" | "/api/auth/session" | "/login"
    ) || path.starts_with("/api/hub/client-config")
        || path.starts_with("/api/google/callback")
}

pub fn requires_admin(path: &str, method: &str) -> bool {
    if path.starts_with("/api/auth/operators/manage") {
        return matches!(method, "GET" | "POST" | "PUT" | "DELETE");
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
    if ctx.role.is_admin() {
        return true;
    }
    if !matches!(method, "POST" | "PUT" | "DELETE") {
        return true;
    }
    if path.starts_with("/api/hub/compras") {
        return ctx
            .modules
            .iter()
            .any(|m| m.starts_with("compras"));
    }
    if let Some(required) = requires_module(path, method) {
        return ctx.has_module(required);
    }
    true
}
