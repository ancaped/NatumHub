use chrono::{Duration, NaiveDate, Utc};
use sqlx::{PgPool, Row};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::models::{
    CheckAlertsResult, DocumentInput, DocumentUpdateInput, DocumentsQuery, PopContent,
    PopDocument, PopSector, PopSettings, PopVersion, PublishInput, RevalidateInput, SectorInput,
    SeedResult,
};
use crate::core::app_config::saves_dir;
use crate::modules::geral::notifications::store as notif_store;

const LOGO_SETTING: &str = "pops_logo_rel_path";
const WARN_DAYS: &[i64] = &[30, 15, 7];

static TABLES_READY: AtomicBool = AtomicBool::new(false);
static ENSURE_LOCK: Mutex<()> = Mutex::const_new(());

/// Inventário inicial (estudo pasta POP'S).
const SEED_POPS: &[(&str, &str, &str)] = &[
    ("adm", "POP-ADM-025", "Admissão de Funcionários"),
    ("adm", "POP-ADM-036", "Qualificação de fornecedor"),
    ("adm", "POP-ADM-041", "Produtos Terceirizados"),
    ("adm", "POP-ADM-049", "Utilização dos Extintores de Incêndio"),
    ("adm", "POP-ADM-051", "Saúde dos funcionários"),
    ("adm", "POP-ADM-079", "Visitas de Terceiros"),
    ("atd", "POP-ATD-011", "Atendimento ao Público"),
    ("atd", "POP-ATD-059", "Reclamação de clientes"),
    ("elab", "POP-001", "Elaboração do POP"),
    ("elab", "POP-002", "Revalidação do POP"),
    ("exp", "POP-EXP-027", "Dispensação de produtos"),
    ("exp", "POP-EXP-040", "Recolhimento de Produtos"),
    ("exp", "POP-EXP-043", "Rastreabilidade da Produção"),
    ("exp", "POP-EXP-050", "Rastreabilidade de Lote"),
    ("exp", "POP-EXP-056", "Liberação de pedidos pronto"),
    ("prd", "POP-PRD-004", "Laboratório de Pesagens e Medidas"),
    ("prd", "POP-PRD-007", "Lavagem e sanitização de pisos e paredes"),
    ("prd", "POP-PRD-009", "Paramentação para acesso às áreas de produção"),
    ("prd", "POP-PRD-021", "Lavagem e sanitização de material de uso nos processos"),
    ("prd", "POP-PRD-026", "Conferência das embalagens para envase"),
    ("prd", "POP-PRD-028", "Limpeza da Máquina Envasadora"),
    ("prd", "POP-PRD-030", "Produção"),
    ("prd", "POP-PRD-034", "Envase"),
    ("prd", "POP-PRD-039", "Impressão de dados"),
    ("prd", "POP-PRD-043", "Rastreabilidade da Produção"),
    ("prd", "POP-PRD-047", "Utilização do Tanque"),
    ("prd", "POP-PRD-053", "Planejamento de Produção"),
    ("prd", "POP-PRD-057", "Sala de Máquinas"),
    ("prd", "POP-PRD-058", "Processo de transferência de produtos"),
    ("prd", "POP-PRD-065", "Procedimento de codificação"),
    ("prd", "POP-PRD-072", "Quarentena de produtos acabados"),
];

fn is_benign_ddl_race(err: &str) -> bool {
    let e = err.to_lowercase();
    e.contains("pg_type_typname_nsp_index")
        || e.contains("already exists")
        || e.contains("já existe")
        || e.contains("duplicate key")
        || e.contains("duplicar valor")
}

async fn exec_ddl(pool: &PgPool, sql: &str) -> Result<(), String> {
    match sqlx::query(sql).execute(pool).await {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if is_benign_ddl_race(&msg) {
                Ok(())
            } else {
                Err(msg)
            }
        }
    }
}

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    if TABLES_READY.load(Ordering::Relaxed) {
        return Ok(());
    }
    let _guard = ENSURE_LOCK.lock().await;
    if TABLES_READY.load(Ordering::Relaxed) {
        return Ok(());
    }

    // Migration 023 já cria as tabelas; se existirem, só garante seed e sai (sem DDL).
    let exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'pop_documents'
        )
        "#,
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);

    if !exists {
        exec_ddl(
            pool,
            r#"
            CREATE TABLE IF NOT EXISTS pop_sectors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#,
        )
        .await?;

        exec_ddl(
            pool,
            r#"
            CREATE TABLE IF NOT EXISTS pop_documents (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                sector_id TEXT NOT NULL REFERENCES pop_sectors(id),
                current_revision INTEGER NOT NULL DEFAULT 0,
                effective_date DATE,
                next_review_date DATE,
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'obsolete')),
                elaborated_by TEXT,
                reviewed_by TEXT,
                approved_by TEXT,
                current_version_id TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            "#,
        )
        .await?;

        exec_ddl(
            pool,
            r#"
            CREATE TABLE IF NOT EXISTS pop_versions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES pop_documents(id) ON DELETE CASCADE,
                revision INTEGER NOT NULL,
                effective_date DATE NOT NULL,
                next_review_date DATE NOT NULL,
                change_kind TEXT NOT NULL
                    CHECK (change_kind IN ('initial', 'revalidate', 'content')),
                change_summary TEXT,
                content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                elaborated_by TEXT,
                reviewed_by TEXT,
                approved_by TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (document_id, revision)
            )
            "#,
        )
        .await?;

        let _ = exec_ddl(
            pool,
            "CREATE INDEX IF NOT EXISTS idx_pop_documents_sector ON pop_documents (sector_id)",
        )
        .await;
        let _ = exec_ddl(
            pool,
            "CREATE INDEX IF NOT EXISTS idx_pop_documents_next_review ON pop_documents (next_review_date)",
        )
        .await;
    }

    let _ = exec_ddl(
        pool,
        r#"
        INSERT INTO pop_sectors (id, name, sort_order) VALUES
            ('adm', 'Administração', 10),
            ('almox', 'Almoxarifado', 20),
            ('atd', 'Atendimento', 30),
            ('elab', 'Elaboração de POPs', 40),
            ('exp', 'Expedição', 50),
            ('prd', 'Produção', 60)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .await;

    TABLES_READY.store(true, Ordering::Relaxed);
    Ok(())
}

fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
        .map_err(|e| format!("Data inválida ({s}): {e}"))
}

fn today() -> NaiveDate {
    Utc::now().date_naive()
}

fn plus_year(d: NaiveDate) -> NaiveDate {
    d.checked_add_signed(Duration::days(365))
        .unwrap_or(d)
}

fn days_to(d: Option<NaiveDate>) -> Option<i64> {
    d.map(|nd| (nd - today()).num_days())
}

fn map_sector(row: &sqlx::postgres::PgRow) -> PopSector {
    PopSector {
        id: row.get("id"),
        name: row.get("name"),
        sort_order: row.get("sort_order"),
        active: row.get("active"),
    }
}

fn map_version(row: &sqlx::postgres::PgRow) -> PopVersion {
    let content_json: serde_json::Value = row.get("content_json");
    PopVersion {
        id: row.get("id"),
        document_id: row.get("document_id"),
        revision: row.get("revision"),
        effective_date: row
            .get::<NaiveDate, _>("effective_date")
            .format("%Y-%m-%d")
            .to_string(),
        next_review_date: row
            .get::<NaiveDate, _>("next_review_date")
            .format("%Y-%m-%d")
            .to_string(),
        change_kind: row.get("change_kind"),
        change_summary: row.get("change_summary"),
        content: PopContent::from_value(&content_json),
        elaborated_by: row.get("elaborated_by"),
        reviewed_by: row.get("reviewed_by"),
        approved_by: row.get("approved_by"),
        created_by: row.get("created_by"),
        created_at: row
            .get::<chrono::DateTime<Utc>, _>("created_at")
            .to_rfc3339(),
    }
}

fn map_document(row: &sqlx::postgres::PgRow, current: Option<PopVersion>) -> PopDocument {
    let next: Option<NaiveDate> = row.get("next_review_date");
    PopDocument {
        id: row.get("id"),
        code: row.get("code"),
        title: row.get("title"),
        sector_id: row.get("sector_id"),
        sector_name: row.try_get("sector_name").ok(),
        current_revision: row.get("current_revision"),
        effective_date: row
            .get::<Option<NaiveDate>, _>("effective_date")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        next_review_date: next.map(|d| d.format("%Y-%m-%d").to_string()),
        status: row.get("status"),
        elaborated_by: row.get("elaborated_by"),
        reviewed_by: row.get("reviewed_by"),
        approved_by: row.get("approved_by"),
        current_version_id: row.get("current_version_id"),
        created_by: row.get("created_by"),
        created_at: row
            .get::<chrono::DateTime<Utc>, _>("created_at")
            .to_rfc3339(),
        updated_at: row
            .get::<chrono::DateTime<Utc>, _>("updated_at")
            .to_rfc3339(),
        current_version: current,
        days_to_review: days_to(next),
    }
}

pub async fn list_sectors(pool: &PgPool) -> Result<Vec<PopSector>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        "SELECT id, name, sort_order, active FROM pop_sectors ORDER BY sort_order, name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_sector).collect())
}

pub async fn create_sector(pool: &PgPool, input: SectorInput) -> Result<PopSector, String> {
    ensure_tables(pool).await?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Nome do setor obrigatório".into());
    }
    let id = format!(
        "sec_{}",
        Uuid::new_v4().to_string().replace('-', "").chars().take(10).collect::<String>()
    );
    let sort = input.sort_order.unwrap_or(100);
    let active = input.active.unwrap_or(true);
    sqlx::query(
        "INSERT INTO pop_sectors (id, name, sort_order, active) VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(name)
    .bind(sort)
    .bind(active)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(PopSector {
        id,
        name: name.to_string(),
        sort_order: sort,
        active,
    })
}

pub async fn list_documents(
    pool: &PgPool,
    q: DocumentsQuery,
) -> Result<Vec<PopDocument>, String> {
    ensure_tables(pool).await?;
    let mut sql = String::from(
        r#"
        SELECT d.*, s.name AS sector_name
        FROM pop_documents d
        JOIN pop_sectors s ON s.id = d.sector_id
        WHERE 1=1
        "#,
    );
    let mut i = 1;
    let mut sector: Option<String> = None;
    let mut status: Option<String> = None;
    let mut search: Option<String> = None;

    if let Some(ref s) = q.sector_id {
        if !s.trim().is_empty() {
            sql.push_str(&format!(" AND d.sector_id = ${i}"));
            sector = Some(s.trim().to_string());
            i += 1;
        }
    }
    if let Some(ref st) = q.status {
        if !st.trim().is_empty() {
            sql.push_str(&format!(" AND d.status = ${i}"));
            status = Some(st.trim().to_string());
            i += 1;
        }
    }
    if let Some(ref qq) = q.q {
        if !qq.trim().is_empty() {
            sql.push_str(&format!(
                " AND (d.code ILIKE ${i} OR d.title ILIKE ${i})"
            ));
            search = Some(format!("%{}%", qq.trim()));
        }
    }
    sql.push_str(" ORDER BY s.sort_order, d.code");

    let mut qb = sqlx::query(&sql);
    if let Some(s) = &sector {
        qb = qb.bind(s);
    }
    if let Some(s) = &status {
        qb = qb.bind(s);
    }
    if let Some(s) = &search {
        qb = qb.bind(s);
    }

    let rows = qb.fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| map_document(r, None)).collect())
}

async fn load_version(pool: &PgPool, id: &str) -> Result<Option<PopVersion>, String> {
    let row = sqlx::query(
        r#"
        SELECT id, document_id, revision, effective_date, next_review_date,
               change_kind, change_summary, content_json,
               elaborated_by, reviewed_by, approved_by, created_by, created_at
        FROM pop_versions WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(row.as_ref().map(map_version))
}

pub async fn get_document(pool: &PgPool, id: &str) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let row = sqlx::query(
        r#"
        SELECT d.*, s.name AS sector_name
        FROM pop_documents d
        JOIN pop_sectors s ON s.id = d.sector_id
        WHERE d.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "POP não encontrado".to_string())?;

    let vid: Option<String> = row.get("current_version_id");
    let current = match vid {
        Some(ref v) => load_version(pool, v).await?,
        None => None,
    };
    Ok(map_document(&row, current))
}

pub async fn create_document(
    pool: &PgPool,
    input: DocumentInput,
    created_by: Option<&str>,
) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let code = input.code.trim().to_uppercase();
    let title = input.title.trim().to_string();
    if code.is_empty() || title.is_empty() {
        return Err("Código e título obrigatórios".into());
    }
    let id = Uuid::new_v4().to_string();
    let content = input.content.unwrap_or_default();
    let content_json = content.to_value();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        r#"
        INSERT INTO pop_documents
            (id, code, title, sector_id, current_revision, status,
             elaborated_by, reviewed_by, approved_by, created_by)
        VALUES ($1, $2, $3, $4, 0, 'draft', $5, $6, $7, $8)
        "#,
    )
    .bind(&id)
    .bind(&code)
    .bind(&title)
    .bind(&input.sector_id)
    .bind(&input.elaborated_by)
    .bind(&input.reviewed_by)
    .bind(&input.approved_by)
    .bind(created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Draft version 0 (não publicada)
    let vid = Uuid::new_v4().to_string();
    let eff = today();
    let next = plus_year(eff);
    sqlx::query(
        r#"
        INSERT INTO pop_versions
            (id, document_id, revision, effective_date, next_review_date,
             change_kind, change_summary, content_json,
             elaborated_by, reviewed_by, approved_by, created_by)
        VALUES ($1, $2, 0, $3, $4, 'initial', 'Rascunho inicial', $5, $6, $7, $8, $9)
        "#,
    )
    .bind(&vid)
    .bind(&id)
    .bind(eff)
    .bind(next)
    .bind(&content_json)
    .bind(&input.elaborated_by)
    .bind(&input.reviewed_by)
    .bind(&input.approved_by)
    .bind(created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE pop_documents SET current_version_id = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(&id)
    .bind(&vid)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    get_document(pool, &id).await
}

pub async fn update_document(
    pool: &PgPool,
    id: &str,
    input: DocumentUpdateInput,
) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let doc = get_document(pool, id).await?;
    let vid = doc
        .current_version_id
        .clone()
        .ok_or_else(|| "POP sem versão atual".to_string())?;

    if let Some(ref title) = input.title {
        sqlx::query("UPDATE pop_documents SET title = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(title.trim())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref sector) = input.sector_id {
        sqlx::query("UPDATE pop_documents SET sector_id = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(sector)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    if input.elaborated_by.is_some() || input.reviewed_by.is_some() || input.approved_by.is_some() {
        sqlx::query(
            r#"
            UPDATE pop_documents SET
                elaborated_by = COALESCE($2, elaborated_by),
                reviewed_by = COALESCE($3, reviewed_by),
                approved_by = COALESCE($4, approved_by),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(&input.elaborated_by)
        .bind(&input.reviewed_by)
        .bind(&input.approved_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref content) = input.content {
        if doc.status != "draft" {
            return Err(
                "Conteúdo de POP publicado só muda via «Publicar revisão» (preserva histórico)"
                    .into(),
            );
        }
        sqlx::query("UPDATE pop_versions SET content_json = $2 WHERE id = $1")
            .bind(&vid)
            .bind(content.to_value())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    get_document(pool, id).await
}

pub async fn publish_document(
    pool: &PgPool,
    id: &str,
    input: PublishInput,
    created_by: Option<&str>,
) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let doc = get_document(pool, id).await?;
    let base_content = input
        .content
        .or_else(|| doc.current_version.as_ref().map(|v| v.content.clone()))
        .unwrap_or_default();
    let eff = match input.effective_date.as_deref() {
        Some(s) if !s.trim().is_empty() => parse_date(s)?,
        _ => today(),
    };
    let next = plus_year(eff);
    let new_rev = if doc.status == "draft" && doc.current_revision == 0 {
        1
    } else {
        doc.current_revision + 1
    };
    let kind = if doc.status == "draft" && doc.current_revision == 0 {
        "initial"
    } else {
        "content"
    };
    let vid = Uuid::new_v4().to_string();
    let elab = input
        .elaborated_by
        .or(doc.elaborated_by.clone());
    let rev = input.reviewed_by.or(doc.reviewed_by.clone());
    let appr = input.approved_by.or(doc.approved_by.clone());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        r#"
        INSERT INTO pop_versions
            (id, document_id, revision, effective_date, next_review_date,
             change_kind, change_summary, content_json,
             elaborated_by, reviewed_by, approved_by, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        "#,
    )
    .bind(&vid)
    .bind(id)
    .bind(new_rev)
    .bind(eff)
    .bind(next)
    .bind(kind)
    .bind(&input.change_summary)
    .bind(base_content.to_value())
    .bind(&elab)
    .bind(&rev)
    .bind(&appr)
    .bind(created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        UPDATE pop_documents SET
            current_revision = $2,
            effective_date = $3,
            next_review_date = $4,
            status = 'published',
            current_version_id = $5,
            elaborated_by = COALESCE($6, elaborated_by),
            reviewed_by = COALESCE($7, reviewed_by),
            approved_by = COALESCE($8, approved_by),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(new_rev)
    .bind(eff)
    .bind(next)
    .bind(&vid)
    .bind(&elab)
    .bind(&rev)
    .bind(&appr)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    get_document(pool, id).await
}

pub async fn revalidate_document(
    pool: &PgPool,
    id: &str,
    input: RevalidateInput,
    created_by: Option<&str>,
) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let doc = get_document(pool, id).await?;
    if doc.status != "published" {
        return Err("Só é possível revalidar POPs publicados".into());
    }
    let content = doc
        .current_version
        .as_ref()
        .map(|v| v.content.clone())
        .unwrap_or_default();
    let eff = match input.effective_date.as_deref() {
        Some(s) if !s.trim().is_empty() => parse_date(s)?,
        _ => today(),
    };
    let next = plus_year(eff);
    let new_rev = doc.current_revision + 1;
    let vid = Uuid::new_v4().to_string();
    let summary = input
        .change_summary
        .unwrap_or_else(|| "Revalidação anual".into());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        r#"
        INSERT INTO pop_versions
            (id, document_id, revision, effective_date, next_review_date,
             change_kind, change_summary, content_json,
             elaborated_by, reviewed_by, approved_by, created_by)
        VALUES ($1, $2, $3, $4, $5, 'revalidate', $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(&vid)
    .bind(id)
    .bind(new_rev)
    .bind(eff)
    .bind(next)
    .bind(&summary)
    .bind(content.to_value())
    .bind(&doc.elaborated_by)
    .bind(&doc.reviewed_by)
    .bind(&doc.approved_by)
    .bind(created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        UPDATE pop_documents SET
            current_revision = $2,
            effective_date = $3,
            next_review_date = $4,
            current_version_id = $5,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(new_rev)
    .bind(eff)
    .bind(next)
    .bind(&vid)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    get_document(pool, id).await
}

pub async fn list_versions(pool: &PgPool, document_id: &str) -> Result<Vec<PopVersion>, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, document_id, revision, effective_date, next_review_date,
               change_kind, change_summary, content_json,
               elaborated_by, reviewed_by, approved_by, created_by, created_at
        FROM pop_versions WHERE document_id = $1
        ORDER BY revision DESC
        "#,
    )
    .bind(document_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(map_version).collect())
}

pub async fn get_version(pool: &PgPool, document_id: &str, vid: &str) -> Result<PopVersion, String> {
    ensure_tables(pool).await?;
    let row = sqlx::query(
        r#"
        SELECT id, document_id, revision, effective_date, next_review_date,
               change_kind, change_summary, content_json,
               elaborated_by, reviewed_by, approved_by, created_by, created_at
        FROM pop_versions WHERE id = $1 AND document_id = $2
        "#,
    )
    .bind(vid)
    .bind(document_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Versão não encontrada".to_string())?;
    Ok(map_version(&row))
}

pub async fn get_settings(pool: &PgPool) -> Result<PopSettings, String> {
    ensure_tables(pool).await?;
    let rel: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = $1")
        .bind(LOGO_SETTING)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(PopSettings {
        logo_url: rel
            .as_ref()
            .map(|_| format!("/api/qualidade/pops/settings/logo")),
        logo_rel_path: rel,
    })
}

pub async fn save_logo(
    pool: &PgPool,
    original_name: &str,
    bytes: &[u8],
) -> Result<PopSettings, String> {
    ensure_tables(pool).await?;
    let ext = std::path::Path::new(original_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
    if !allowed.contains(&ext.as_str()) {
        return Err("Logo deve ser imagem (png/jpg/webp/gif/svg)".into());
    }
    let dir = saves_dir().join("pops");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let rel = format!("pops/logo.{ext}");
    let abs = saves_dir().join(&rel);
    std::fs::write(&abs, bytes).map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        "#,
    )
    .bind(LOGO_SETTING)
    .bind(&rel)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_settings(pool).await
}

pub async fn logo_bytes(pool: &PgPool) -> Result<(Vec<u8>, String), String> {
    let settings = get_settings(pool).await?;
    let rel = settings
        .logo_rel_path
        .ok_or_else(|| "Logo não configurado".to_string())?;
    let abs = saves_dir().join(&rel);
    let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
    let mime = if rel.ends_with(".svg") {
        "image/svg+xml"
    } else if rel.ends_with(".png") {
        "image/png"
    } else if rel.ends_with(".webp") {
        "image/webp"
    } else if rel.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    };
    Ok((bytes, mime.into()))
}

pub async fn seed_inventory(
    pool: &PgPool,
    created_by: Option<&str>,
    force: bool,
) -> Result<SeedResult, String> {
    ensure_tables(pool).await?;
    let sectors = list_sectors(pool).await?.len();
    let bodies = load_seed_bodies();
    let mut created = 0usize;
    let mut skipped = 0usize;
    let mut bodies_filled = 0usize;

    for (sector, code, title) in SEED_POPS {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pop_documents WHERE code = $1)")
            .bind(code)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

        let body = bodies
            .get(*code)
            .map(|s| s.as_str())
            .unwrap_or("");

        if !exists {
            create_document(
                pool,
                DocumentInput {
                    code: code.to_string(),
                    title: title.to_string(),
                    sector_id: sector.to_string(),
                    content: Some(PopContent {
                        body: body.to_string(),
                        ..Default::default()
                    }),
                    elaborated_by: Some("Responsável Técnico".into()),
                    reviewed_by: Some("Equipe de Controle de Qualidade".into()),
                    approved_by: None,
                },
                created_by,
            )
            .await?;
            created += 1;
            if !body.is_empty() {
                bodies_filled += 1;
            }
            continue;
        }

        skipped += 1;
        if body.is_empty() {
            continue;
        }

        // Preenche body em draft vazio (ou force)
        let row = sqlx::query(
            r#"
            SELECT d.id, d.status, d.current_version_id, v.content_json
            FROM pop_documents d
            LEFT JOIN pop_versions v ON v.id = d.current_version_id
            WHERE d.code = $1
            "#,
        )
        .bind(code)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        let Some(row) = row else { continue };
        let status: String = row.get("status");
        let vid: Option<String> = row.get("current_version_id");
        let content_json: Option<serde_json::Value> = row.try_get("content_json").ok();
        let current = content_json
            .as_ref()
            .map(PopContent::from_value)
            .unwrap_or_default();

        let should_fill = force || (status == "draft" && current.is_body_empty());
        if !should_fill {
            continue;
        }
        let Some(vid) = vid else { continue };

        let mut next = current;
        next.body = body.to_string();
        sqlx::query("UPDATE pop_versions SET content_json = $2 WHERE id = $1")
            .bind(&vid)
            .bind(next.to_value())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("UPDATE pop_documents SET updated_at = NOW() WHERE code = $1")
            .bind(code)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        bodies_filled += 1;
    }

    Ok(SeedResult {
        sectors,
        created,
        skipped,
        bodies_filled,
    })
}

fn load_seed_bodies() -> std::collections::HashMap<String, String> {
    let raw = include_str!("seed_bodies.json");
    let parsed: serde_json::Value = serde_json::from_str(raw).unwrap_or(serde_json::json!({}));
    let mut map = std::collections::HashMap::new();
    if let Some(obj) = parsed.as_object() {
        for (code, v) in obj {
            let body = v
                .get("body")
                .and_then(|b| b.as_str())
                .or_else(|| v.as_str())
                .unwrap_or("")
                .to_string();
            if !body.is_empty() {
                map.insert(code.clone(), body);
            }
        }
    }
    map
}

pub async fn check_alerts(pool: &PgPool) -> Result<CheckAlertsResult, String> {
    ensure_tables(pool).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, code, title, next_review_date
        FROM pop_documents
        WHERE status = 'published' AND next_review_date IS NOT NULL
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut notified = 0usize;
    let today = today();
    for row in rows {
        let code: String = row.get("code");
        let title: String = row.get("title");
        let next: NaiveDate = row.get("next_review_date");
        let days = (next - today).num_days();
        if days < 0 {
            let _ = notif_store::create_notification(
                pool,
                "qualidade_pops",
                "warning",
                &format!("POP vencido: {code}"),
                &format!("{title} — revisão vencida em {}", next.format("%d/%m/%Y")),
                Some(&format!("pop:{code}:overdue")),
            )
            .await;
            notified += 1;
            continue;
        }
        for &th in WARN_DAYS {
            if days == th {
                let _ = notif_store::create_notification(
                    pool,
                    "qualidade_pops",
                    "info",
                    &format!("POP vence em {th}d: {code}"),
                    &format!("{title} — próxima revisão {}", next.format("%d/%m/%Y")),
                    Some(&format!("pop:{code}:warn:{th}")),
                )
                .await;
                notified += 1;
                break;
            }
        }
    }
    Ok(CheckAlertsResult { notified })
}
