use chrono::{NaiveDate, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::models::{
    CheckAlertsResult, DocFamily, DocType, Document, DocumentFile, DocumentInput, DocumentsQuery,
    FamilyInput, TypeInput,
};
use crate::core::app_config::saves_dir;
use crate::modules::geral::notifications::store as notif_store;

fn date_opt(s: &Option<String>) -> Result<Option<NaiveDate>, String> {
    match s {
        None => Ok(None),
        Some(v) if v.trim().is_empty() => Ok(None),
        Some(v) => NaiveDate::parse_from_str(v.trim(), "%Y-%m-%d")
            .map(Some)
            .map_err(|e| format!("Data inválida ({v}): {e}")),
    }
}

fn map_family(row: &sqlx::postgres::PgRow) -> DocFamily {
    DocFamily {
        id: row.get("id"),
        name: row.get("name"),
        code: row.get("code"),
        warn_days: row.get("warn_days"),
        requires_payment: row.get("requires_payment"),
        active: row.get("active"),
        created_at: row.get::<chrono::DateTime<Utc>, _>("created_at").to_rfc3339(),
        updated_at: row.get::<chrono::DateTime<Utc>, _>("updated_at").to_rfc3339(),
    }
}

fn map_type(row: &sqlx::postgres::PgRow) -> DocType {
    DocType {
        id: row.get("id"),
        family_id: row.get("family_id"),
        name: row.get("name"),
        active: row.get("active"),
        created_at: row.get::<chrono::DateTime<Utc>, _>("created_at").to_rfc3339(),
    }
}

fn map_file(row: &sqlx::postgres::PgRow) -> DocumentFile {
    DocumentFile {
        id: row.get("id"),
        document_id: row.get("document_id"),
        kind: row.get("kind"),
        original_name: row.get("original_name"),
        rel_path: row.get("rel_path"),
        size_bytes: row.get("size_bytes"),
        uploaded_at: row.get::<chrono::DateTime<Utc>, _>("uploaded_at").to_rfc3339(),
    }
}

async fn load_files(pool: &PgPool, document_id: &str) -> Result<Vec<DocumentFile>, String> {
    let rows = sqlx::query(
        "SELECT id, document_id, kind, original_name, rel_path, size_bytes, uploaded_at
         FROM document_files WHERE document_id = $1 ORDER BY uploaded_at ASC",
    )
    .bind(document_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_file).collect())
}

fn map_document(row: &sqlx::postgres::PgRow, files: Vec<DocumentFile>) -> Document {
    Document {
        id: row.get("id"),
        family_id: row.get("family_id"),
        type_id: row.get("type_id"),
        title: row.get("title"),
        physical_location: row.get("physical_location"),
        physical_tag: row.get("physical_tag"),
        issued_at: row
            .get::<Option<NaiveDate>, _>("issued_at")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        valid_until: row
            .get::<Option<NaiveDate>, _>("valid_until")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        payment_status: row.get("payment_status"),
        payment_amount: row.get("payment_amount"),
        payment_due_at: row
            .get::<Option<NaiveDate>, _>("payment_due_at")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        payment_method: row.get("payment_method"),
        payment_paid_at: row
            .get::<Option<NaiveDate>, _>("payment_paid_at")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        notes: row.get("notes"),
        created_by: row.get("created_by"),
        created_at: row.get::<chrono::DateTime<Utc>, _>("created_at").to_rfc3339(),
        updated_at: row.get::<chrono::DateTime<Utc>, _>("updated_at").to_rfc3339(),
        family_name: row.try_get("family_name").ok(),
        type_name: row.try_get("type_name").ok(),
        files,
    }
}

pub async fn list_families(pool: &PgPool, active_only: bool) -> Result<Vec<DocFamily>, String> {
    let sql = if active_only {
        "SELECT * FROM doc_families WHERE active = TRUE ORDER BY name"
    } else {
        "SELECT * FROM doc_families ORDER BY name"
    };
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_family).collect())
}

pub async fn create_family(pool: &PgPool, input: FamilyInput) -> Result<DocFamily, String> {
    let id = Uuid::new_v4().to_string();
    let warn = input.warn_days.unwrap_or_else(|| vec![30, 15, 7]);
    let requires = input.requires_payment.unwrap_or(false);
    let code = input
        .code
        .as_ref()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty());
    sqlx::query(
        "INSERT INTO doc_families (id, name, code, warn_days, requires_payment)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(&code)
    .bind(&warn)
    .bind(requires)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get_family(pool, &id).await
}

pub async fn get_family(pool: &PgPool, id: &str) -> Result<DocFamily, String> {
    let row = sqlx::query("SELECT * FROM doc_families WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Família não encontrada".to_string())?;
    Ok(map_family(&row))
}

pub async fn update_family(
    pool: &PgPool,
    id: &str,
    input: FamilyInput,
) -> Result<DocFamily, String> {
    let warn = input.warn_days.unwrap_or_else(|| vec![30, 15, 7]);
    let requires = input.requires_payment.unwrap_or(false);
    let active = input.active.unwrap_or(true);
    let code = input
        .code
        .as_ref()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty());
    let res = sqlx::query(
        "UPDATE doc_families SET name = $2, code = $3, warn_days = $4,
         requires_payment = $5, active = $6, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(input.name.trim())
    .bind(&code)
    .bind(&warn)
    .bind(requires)
    .bind(active)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Família não encontrada".into());
    }
    get_family(pool, id).await
}

pub async fn delete_family(pool: &PgPool, id: &str) -> Result<(), String> {
    let used: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM documents WHERE family_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    if used.0 > 0 {
        return Err("Há documentos vinculados a esta família".into());
    }
    let res = sqlx::query("DELETE FROM doc_families WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Família não encontrada".into());
    }
    Ok(())
}

pub async fn list_types(pool: &PgPool, family_id: Option<&str>) -> Result<Vec<DocType>, String> {
    let rows = if let Some(fid) = family_id {
        sqlx::query("SELECT * FROM doc_types WHERE family_id = $1 ORDER BY name")
            .bind(fid)
            .fetch_all(pool)
            .await
    } else {
        sqlx::query("SELECT * FROM doc_types ORDER BY name")
            .fetch_all(pool)
            .await
    }
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_type).collect())
}

pub async fn create_type(pool: &PgPool, input: TypeInput) -> Result<DocType, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO doc_types (id, family_id, name) VALUES ($1, $2, $3)")
        .bind(&id)
        .bind(input.family_id.trim())
        .bind(input.name.trim())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let row = sqlx::query("SELECT * FROM doc_types WHERE id = $1")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_type(&row))
}

pub async fn update_type(pool: &PgPool, id: &str, input: TypeInput) -> Result<DocType, String> {
    let active = input.active.unwrap_or(true);
    let res = sqlx::query(
        "UPDATE doc_types SET family_id = $2, name = $3, active = $4 WHERE id = $1",
    )
    .bind(id)
    .bind(input.family_id.trim())
    .bind(input.name.trim())
    .bind(active)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Tipo não encontrado".into());
    }
    let row = sqlx::query("SELECT * FROM doc_types WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_type(&row))
}

pub async fn delete_type(pool: &PgPool, id: &str) -> Result<(), String> {
    let res = sqlx::query("DELETE FROM doc_types WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Tipo não encontrado".into());
    }
    Ok(())
}

pub async fn list_documents(pool: &PgPool, q: DocumentsQuery) -> Result<Vec<Document>, String> {
    let mut sql = String::from(
        "SELECT d.*, f.name AS family_name, t.name AS type_name
         FROM documents d
         JOIN doc_families f ON f.id = d.family_id
         LEFT JOIN doc_types t ON t.id = d.type_id
         WHERE 1=1",
    );
    let mut binds: Vec<String> = Vec::new();
    let mut idx = 1u32;

    if let Some(ref search) = q.search {
        let clean = search.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(
                " AND (d.title ILIKE ${0} OR d.physical_location ILIKE ${0} OR d.physical_tag ILIKE ${0} OR d.notes ILIKE ${0})",
                idx
            ));
            binds.push(format!("%{clean}%"));
            idx += 1;
        }
    }
    if let Some(ref fid) = q.family_id {
        let clean = fid.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(" AND d.family_id = ${idx}"));
            binds.push(clean.to_string());
            idx += 1;
        }
    }
    if let Some(ref ps) = q.payment_status {
        let clean = ps.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(" AND d.payment_status = ${idx}"));
            binds.push(clean.to_string());
            idx += 1;
        }
    }
    if q.pending_only.unwrap_or(false) {
        sql.push_str(
            " AND (d.payment_status = 'pendente' OR d.valid_until IS NULL OR d.valid_until <= CURRENT_DATE + INTERVAL '30 days')",
        );
    }
    let _ = idx;
    sql.push_str(" ORDER BY d.valid_until NULLS LAST, d.title");

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        let id: String = row.get("id");
        let files = load_files(pool, &id).await?;
        out.push(map_document(row, files));
    }
    Ok(out)
}

pub async fn get_document(pool: &PgPool, id: &str) -> Result<Document, String> {
    let row = sqlx::query(
        "SELECT d.*, f.name AS family_name, t.name AS type_name
         FROM documents d
         JOIN doc_families f ON f.id = d.family_id
         LEFT JOIN doc_types t ON t.id = d.type_id
         WHERE d.id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Documento não encontrado".to_string())?;
    let files = load_files(pool, id).await?;
    Ok(map_document(&row, files))
}

fn normalize_payment_status(s: Option<&str>, requires: bool) -> String {
    let v = s.unwrap_or(if requires { "pendente" } else { "nao_aplica" });
    match v {
        "pendente" | "pago" | "nao_aplica" => v.to_string(),
        _ => {
            if requires {
                "pendente".into()
            } else {
                "nao_aplica".into()
            }
        }
    }
}

pub async fn create_document(
    pool: &PgPool,
    input: DocumentInput,
    created_by: Option<&str>,
) -> Result<Document, String> {
    let family = get_family(pool, input.family_id.trim()).await?;
    let id = Uuid::new_v4().to_string();
    let payment_status =
        normalize_payment_status(input.payment_status.as_deref(), family.requires_payment);
    let issued = date_opt(&input.issued_at)?;
    let valid = date_opt(&input.valid_until)?;
    let pay_due = date_opt(&input.payment_due_at)?;
    let pay_paid = date_opt(&input.payment_paid_at)?;
    let type_id = input
        .type_id
        .as_ref()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    sqlx::query(
        "INSERT INTO documents (
            id, family_id, type_id, title, physical_location, physical_tag,
            issued_at, valid_until, payment_status, payment_amount, payment_due_at,
            payment_method, payment_paid_at, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    )
    .bind(&id)
    .bind(input.family_id.trim())
    .bind(&type_id)
    .bind(input.title.trim())
    .bind(input.physical_location.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.physical_tag.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(issued)
    .bind(valid)
    .bind(&payment_status)
    .bind(input.payment_amount)
    .bind(pay_due)
    .bind(input.payment_method.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(pay_paid)
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(created_by)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = std::fs::create_dir_all(saves_dir().join("documentacao").join(&id));
    get_document(pool, &id).await
}

pub async fn update_document(
    pool: &PgPool,
    id: &str,
    input: DocumentInput,
) -> Result<Document, String> {
    let family = get_family(pool, input.family_id.trim()).await?;
    let payment_status =
        normalize_payment_status(input.payment_status.as_deref(), family.requires_payment);
    let issued = date_opt(&input.issued_at)?;
    let valid = date_opt(&input.valid_until)?;
    let pay_due = date_opt(&input.payment_due_at)?;
    let pay_paid = date_opt(&input.payment_paid_at)?;
    let type_id = input
        .type_id
        .as_ref()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    let res = sqlx::query(
        "UPDATE documents SET
            family_id = $2, type_id = $3, title = $4, physical_location = $5, physical_tag = $6,
            issued_at = $7, valid_until = $8, payment_status = $9, payment_amount = $10,
            payment_due_at = $11, payment_method = $12, payment_paid_at = $13, notes = $14,
            updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(input.family_id.trim())
    .bind(&type_id)
    .bind(input.title.trim())
    .bind(input.physical_location.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.physical_tag.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(issued)
    .bind(valid)
    .bind(&payment_status)
    .bind(input.payment_amount)
    .bind(pay_due)
    .bind(input.payment_method.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(pay_paid)
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Documento não encontrado".into());
    }
    get_document(pool, id).await
}

pub async fn delete_document(pool: &PgPool, id: &str) -> Result<(), String> {
    let files = load_files(pool, id).await?;
    let res = sqlx::query("DELETE FROM documents WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Documento não encontrado".into());
    }
    for f in files {
        let path = saves_dir().join(&f.rel_path);
        let _ = std::fs::remove_file(path);
    }
    let dir = saves_dir().join("documentacao").join(id);
    let _ = std::fs::remove_dir_all(dir);
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

pub async fn add_file(
    pool: &PgPool,
    document_id: &str,
    kind: &str,
    original_name: &str,
    bytes: &[u8],
) -> Result<DocumentFile, String> {
    let kind = match kind {
        "comprovante" => "comprovante",
        _ => "documento",
    };
    let _ = get_document(pool, document_id).await?;
    let id = Uuid::new_v4().to_string();
    let safe = sanitize_filename(original_name);
    let safe = if safe.is_empty() {
        format!("{id}.pdf")
    } else {
        safe
    };
    let rel = format!("documentacao/{document_id}/{id}_{safe}");
    let abs = saves_dir().join(&rel);
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&abs, bytes).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO document_files (id, document_id, kind, original_name, rel_path, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&id)
    .bind(document_id)
    .bind(kind)
    .bind(original_name)
    .bind(&rel)
    .bind(bytes.len() as i64)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query("SELECT * FROM document_files WHERE id = $1")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(map_file(&row))
}

pub async fn get_file(pool: &PgPool, file_id: &str) -> Result<(DocumentFile, Vec<u8>), String> {
    let row = sqlx::query("SELECT * FROM document_files WHERE id = $1")
        .bind(file_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Arquivo não encontrado".to_string())?;
    let meta = map_file(&row);
    let path = saves_dir().join(&meta.rel_path);
    let bytes = std::fs::read(&path).map_err(|e| format!("Falha ao ler arquivo: {e}"))?;
    Ok((meta, bytes))
}

pub async fn delete_file(pool: &PgPool, file_id: &str) -> Result<(), String> {
    let row = sqlx::query("SELECT * FROM document_files WHERE id = $1")
        .bind(file_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Arquivo não encontrado".to_string())?;
    let meta = map_file(&row);
    sqlx::query("DELETE FROM document_files WHERE id = $1")
        .bind(file_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(saves_dir().join(&meta.rel_path));
    Ok(())
}

async fn already_notified_today(pool: &PgPool, metadata: &str) -> Result<bool, String> {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM hub_notifications
         WHERE metadata = $1 AND created_at::date = CURRENT_DATE",
    )
    .bind(metadata)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

pub async fn check_alerts(pool: &PgPool) -> Result<CheckAlertsResult, String> {
    let docs = list_documents(
        pool,
        DocumentsQuery {
            search: None,
            family_id: None,
            payment_status: None,
            pending_only: None,
        },
    )
    .await?;
    let families = list_families(pool, false).await?;
    let today = Utc::now().date_naive();
    let mut created = 0i32;

    for doc in &docs {
        if doc.payment_status == "pendente" {
            let meta = format!("doc:{}:payment", doc.id);
            if !already_notified_today(pool, &meta).await? {
                notif_store::create_notification(
                    pool,
                    "qualidade_documentacao",
                    "warning",
                    "Pagamento pendente",
                    &format!("Documento «{}» aguarda pagamento.", doc.title),
                    Some(&meta),
                )
                .await?;
                created += 1;
            }
        }

        let Some(ref until_s) = doc.valid_until else {
            continue;
        };
        let Ok(until) = NaiveDate::parse_from_str(until_s, "%Y-%m-%d") else {
            continue;
        };
        let days_left = (until - today).num_days();
        let family = families.iter().find(|f| f.id == doc.family_id);
        let warn_days = family
            .map(|f| f.warn_days.clone())
            .unwrap_or_else(|| vec![30, 15, 7]);

        if days_left < 0 {
            let meta = format!("doc:{}:expired", doc.id);
            if !already_notified_today(pool, &meta).await? {
                notif_store::create_notification(
                    pool,
                    "qualidade_documentacao",
                    "error",
                    "Documento vencido",
                    &format!("«{}» venceu em {}.", doc.title, until_s),
                    Some(&meta),
                )
                .await?;
                created += 1;
            }
            continue;
        }

        for &threshold in &warn_days {
            if days_left <= threshold as i64 {
                let meta = format!("doc:{}:warn:{}", doc.id, threshold);
                if !already_notified_today(pool, &meta).await? {
                    notif_store::create_notification(
                        pool,
                        "qualidade_documentacao",
                        "warning",
                        "Documento a vencer",
                        &format!(
                            "«{}» vence em {} dia(s) ({}).",
                            doc.title, days_left, until_s
                        ),
                        Some(&meta),
                    )
                    .await?;
                    created += 1;
                }
                break;
            }
        }
    }

    Ok(CheckAlertsResult { created })
}
