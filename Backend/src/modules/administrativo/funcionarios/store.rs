use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use super::models::{ActivityEvent, OperatorProfile, ProfileInput};

pub async fn ensure_schema(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hub_operator_profiles (
            operator_id TEXT PRIMARY KEY REFERENCES hub_operators(id) ON DELETE CASCADE,
            full_name TEXT NOT NULL DEFAULT '',
            cpf TEXT,
            phone TEXT,
            email TEXT,
            birth_date DATE,
            hire_date DATE,
            address_street TEXT,
            address_number TEXT,
            address_complement TEXT,
            address_neighborhood TEXT,
            address_city TEXT,
            address_state TEXT,
            address_zip TEXT,
            notes TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_hub_operator_profiles_cpf
         ON hub_operator_profiles (cpf)
         WHERE cpf IS NOT NULL AND cpf <> ''",
    )
    .execute(pool)
    .await;

    Ok(())
}

fn parse_date(raw: Option<&str>) -> Result<Option<NaiveDate>, String> {
    let Some(s) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| format!("Data inválida: {s} (use AAAA-MM-DD)"))
}

fn opt_trim(v: Option<&String>) -> Option<String> {
    v.map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

async fn modules_for(pool: &PgPool, operator_id: &str) -> Result<Vec<String>, String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT module_key FROM hub_operator_modules WHERE operator_id = $1 ORDER BY module_key",
    )
    .bind(operator_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(k,)| k).collect())
}

fn map_row(row: &sqlx::postgres::PgRow, modules: Vec<String>) -> Result<OperatorProfile, String> {
    let birth: Option<NaiveDate> = row.try_get("birth_date").map_err(|e| e.to_string())?;
    let hire: Option<NaiveDate> = row.try_get("hire_date").map_err(|e| e.to_string())?;
    let updated: Option<chrono::DateTime<chrono::Utc>> =
        row.try_get("updated_at").map_err(|e| e.to_string())?;
    let active: i32 = row.try_get("active").map_err(|e| e.to_string())?;
    let full_name: Option<String> = row.try_get("full_name").map_err(|e| e.to_string())?;

    Ok(OperatorProfile {
        operator_id: row.try_get("id").map_err(|e| e.to_string())?,
        display_name: row.try_get("display_name").map_err(|e| e.to_string())?,
        role: row.try_get("role").map_err(|e| e.to_string())?,
        active: active != 0,
        full_name: full_name.unwrap_or_default(),
        cpf: row.try_get("cpf").map_err(|e| e.to_string())?,
        phone: row.try_get("phone").map_err(|e| e.to_string())?,
        email: row.try_get("email").map_err(|e| e.to_string())?,
        birth_date: birth.map(|d| d.format("%Y-%m-%d").to_string()),
        hire_date: hire.map(|d| d.format("%Y-%m-%d").to_string()),
        address_street: row.try_get("address_street").map_err(|e| e.to_string())?,
        address_number: row.try_get("address_number").map_err(|e| e.to_string())?,
        address_complement: row.try_get("address_complement").map_err(|e| e.to_string())?,
        address_neighborhood: row.try_get("address_neighborhood").map_err(|e| e.to_string())?,
        address_city: row.try_get("address_city").map_err(|e| e.to_string())?,
        address_state: row.try_get("address_state").map_err(|e| e.to_string())?,
        address_zip: row.try_get("address_zip").map_err(|e| e.to_string())?,
        notes: row.try_get("notes").map_err(|e| e.to_string())?,
        updated_at: updated.map(|t| t.to_rfc3339()),
        last_session_at: row.try_get("last_session_at").map_err(|e| e.to_string())?,
        session_active: row.try_get("session_active").map_err(|e| e.to_string())?,
        modules,
    })
}

const SELECT_SQL: &str = r#"
SELECT
    o.id,
    o.display_name,
    o.role,
    o.active,
    p.full_name,
    p.cpf,
    p.phone,
    p.email,
    p.birth_date,
    p.hire_date,
    p.address_street,
    p.address_number,
    p.address_complement,
    p.address_neighborhood,
    p.address_city,
    p.address_state,
    p.address_zip,
    p.notes,
    p.updated_at,
    COALESCE(
        (SELECT MAX(a.created_at::text) FROM hub_audit_events a WHERE a.actor_id = o.id),
        (SELECT MAX(s.created_at::text) FROM hub_sessions s WHERE s.operator_id = o.id)
    ) AS last_session_at,
    EXISTS (
        SELECT 1 FROM hub_sessions s
        WHERE s.operator_id = o.id
          AND s.expires_at > to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          AND (
              s.created_at::timestamptz > NOW() - INTERVAL '15 minutes'
              OR EXISTS (
                  SELECT 1 FROM hub_audit_events a
                  WHERE a.actor_id = o.id
                    AND a.created_at > NOW() - INTERVAL '15 minutes'
              )
          )
    ) AS session_active
FROM hub_operators o
LEFT JOIN hub_operator_profiles p ON p.operator_id = o.id
"#;

pub async fn list_all(pool: &PgPool) -> Result<Vec<OperatorProfile>, String> {
    ensure_schema(pool).await?;
    let rows = sqlx::query(&format!("{SELECT_SQL} ORDER BY LOWER(o.display_name)"))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let modules = modules_for(pool, &id).await?;
        out.push(map_row(&row, modules)?);
    }
    Ok(out)
}

pub async fn get_by_id(pool: &PgPool, operator_id: &str) -> Result<Option<OperatorProfile>, String> {
    ensure_schema(pool).await?;
    let row = sqlx::query(&format!("{SELECT_SQL} WHERE o.id = $1"))
        .bind(operator_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(None);
    };
    let modules = modules_for(pool, operator_id).await?;
    Ok(Some(map_row(&row, modules)?))
}

pub async fn upsert_profile(
    pool: &PgPool,
    operator_id: &str,
    input: ProfileInput,
) -> Result<OperatorProfile, String> {
    ensure_schema(pool).await?;

    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM hub_operators WHERE id = $1")
            .bind(operator_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Operador não encontrado.".into());
    }

    let birth = parse_date(input.birth_date.as_deref())?;
    let hire = parse_date(input.hire_date.as_deref())?;
    let full_name = input
        .full_name
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();

    sqlx::query(
        "INSERT INTO hub_operator_profiles (
            operator_id, full_name, cpf, phone, email, birth_date, hire_date,
            address_street, address_number, address_complement, address_neighborhood,
            address_city, address_state, address_zip, notes, updated_at
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW()
         )
         ON CONFLICT (operator_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            cpf = EXCLUDED.cpf,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            birth_date = EXCLUDED.birth_date,
            hire_date = EXCLUDED.hire_date,
            address_street = EXCLUDED.address_street,
            address_number = EXCLUDED.address_number,
            address_complement = EXCLUDED.address_complement,
            address_neighborhood = EXCLUDED.address_neighborhood,
            address_city = EXCLUDED.address_city,
            address_state = EXCLUDED.address_state,
            address_zip = EXCLUDED.address_zip,
            notes = EXCLUDED.notes,
            updated_at = NOW()",
    )
    .bind(operator_id)
    .bind(&full_name)
    .bind(opt_trim(input.cpf.as_ref()))
    .bind(opt_trim(input.phone.as_ref()))
    .bind(opt_trim(input.email.as_ref()))
    .bind(birth)
    .bind(hire)
    .bind(opt_trim(input.address_street.as_ref()))
    .bind(opt_trim(input.address_number.as_ref()))
    .bind(opt_trim(input.address_complement.as_ref()))
    .bind(opt_trim(input.address_neighborhood.as_ref()))
    .bind(opt_trim(input.address_city.as_ref()))
    .bind(opt_trim(input.address_state.as_ref()))
    .bind(opt_trim(input.address_zip.as_ref()))
    .bind(opt_trim(input.notes.as_ref()))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_by_id(pool, operator_id)
        .await?
        .ok_or_else(|| "Falha ao ler perfil após salvar.".into())
}

pub async fn list_activity(
    pool: &PgPool,
    operator_id: &str,
    limit: i64,
) -> Result<Vec<ActivityEvent>, String> {
    let _ = crate::modules::geral::audit::store::ensure_tables(pool).await;
    let limit = limit.clamp(1, 100);
    let rows: Vec<(
        String,
        chrono::DateTime<chrono::Utc>,
        String,
        String,
        Option<String>,
        Option<String>,
    )> = sqlx::query_as(
        "SELECT id, created_at, action, summary, module_key, request_path
         FROM hub_audit_events
         WHERE actor_id = $1
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(operator_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(id, created_at, action, summary, module_key, request_path)| ActivityEvent {
            id,
            created_at: created_at.to_rfc3339(),
            action,
            summary,
            module_key,
            request_path,
        })
        .collect())
}
