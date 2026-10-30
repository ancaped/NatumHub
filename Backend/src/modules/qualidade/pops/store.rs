use chrono::{Duration, NaiveDate, Utc};
use sqlx::{PgConnection, PgPool, Row};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::models::{
    CheckAlertsResult, DocumentInput, DocumentUpdateInput, DocumentsQuery, PopContent,
    PopDocument, PopSector, PopSettings, PopVersion, PublishInput, RevalidateInput, SectorInput,
    SeedResult,
};
use super::eventos;
use crate::core::acao::ErroApi;
use crate::core::app_config::saves_dir;
use crate::modules::geral::notifications::store as notif_store;

const LOGO_SETTING: &str = "pops_logo_rel_path";
const WARN_DAYS: &[i64] = &[30, 15, 7];

static TABLES_READY: AtomicBool = AtomicBool::new(false);
static ENSURE_LOCK: Mutex<()> = Mutex::const_new(());

/// Inventário do acervo (POPs Rev 09-2025). Código padrão POP-<SETOR>-<NNN>; títulos já limpos.
/// POP-EXP-043 (duplicado de POP-PRD-043) é obsoleto e não entra no seed.
const SEED_POPS: &[(&str, &str, &str)] = &[
    ("adm", "POP-ADM-001", "Elaboração do POP"),
    ("adm", "POP-ADM-002", "Revalidação do POP"),
    ("adm", "POP-ADM-025", "Admissão de Funcionários"),
    ("adm", "POP-ADM-036", "Qualificação de fornecedor"),
    ("adm", "POP-ADM-041", "Produtos Terceirizados"),
    ("adm", "POP-ADM-049", "Utilização dos Extintores de Incêndio"),
    ("adm", "POP-ADM-051", "Saúde dos funcionários"),
    ("adm", "POP-ADM-079", "Visitas de Terceiros"),
    ("almox", "POP-ALM-003", "Armazenamento e Retirada de Materiais do Almoxarifado"),
    ("almox", "POP-ALM-006", "Recebimento de Matérias Primas e insumos"),
    ("almox", "POP-ALM-018", "DML"),
    ("almox", "POP-ALM-045", "recebimento de embalagens"),
    ("atd", "POP-ATD-011", "Atendimento ao Público"),
    ("atd", "POP-ATD-059", "Reclamação de clientes"),
    ("cql", "POP-CQL-002", "Qualidade Organolépticas"),
    ("cql", "POP-CQL-005", "Controle de contaminação"),
    ("cql", "POP-CQL-008", "Limpeza e sanitização da caixa d’água"),
    ("cql", "POP-CQL-010", "Auto Inspeção"),
    ("cql", "POP-CQL-012", "Controle de Qualidade – PH"),
    ("cql", "POP-CQL-013", "Controle de Pragas"),
    ("cql", "POP-CQL-014", "Amostragem de Produto acabado"),
    ("cql", "POP-CQL-015", "Limpeza nas áreas de produção e arredores"),
    ("cql", "POP-CQL-016", "Verificação de Equipamentos"),
    ("cql", "POP-CQL-017", "Calibração e manutenção de dispositivos de medição"),
    ("cql", "POP-CQL-019", "Amostragem de Matérias Primas"),
    ("cql", "POP-CQL-020", "Higienização pessoal"),
    ("cql", "POP-CQL-022", "Controle de matérias primas com prazo de validade expirado"),
    ("cql", "POP-CQL-023", "Qualidade da Água"),
    ("cql", "POP-CQL-024", "Avaliação dos Resultados das Análises de Qualidade das Matérias primas"),
    ("cql", "POP-CQL-029", "limpeza das caixas de água deionizada e tubulações"),
    ("cql", "POP-CQL-031", "Rendimento Teórico e Real"),
    ("cql", "POP-CQL-032", "Sistema Filtrante – Processador de Água Deionizada"),
    ("cql", "POP-CQL-033", "Treinamento individual e coletivo"),
    ("cql", "POP-CQL-035", "Limpeza de equipamentos e aparelhos de medição"),
    ("cql", "POP-CQL-037", "Controle de Qualidade Viscosidade de Semi- Sólidos e Líquidos"),
    ("cql", "POP-CQL-038", "Uso Controle e Descarte de EPI’s"),
    ("cql", "POP-CQL-042", "C.Q. Densidade Relativas"),
    ("cql", "POP-CQL-044", "Aprovação de Matérias Primas"),
    ("cql", "POP-CQL-046", "Devolução de Matéria Prima e embalagens"),
    ("cql", "POP-CQL-048", "Controle de umidade e temperatura"),
    ("cql", "POP-CQL-052", "Teste de Estabilidade"),
    ("cql", "POP-CQL-054", "Solubilidade"),
    ("cql", "POP-CQL-055", "Gerenciamento de tambores e recipientes"),
    ("cql", "POP-CQL-060", "Analise microbiólogicas"),
    ("cql", "POP-CQL-061", "Análise Microbiológica de bancadas e tanques"),
    ("cql", "POP-CQL-062", "análise Microbiologica de produto acabado"),
    ("cql", "POP-CQL-063", "Análise microbiologica de Agua"),
    ("cql", "POP-CQL-064", "Atest autoclave"),
    ("cql", "POP-CQL-066", "Manutenção de equipamentos"),
    ("cql", "POP-CQL-067", "Produção de Reagentes"),
    ("cql", "POP-CQL-068", "determinação de teor de carbonato de guanidina"),
    ("cql", "POP-CQL-069", "Determinação de teor de ácido tioglicólico"),
    ("cql", "POP-CQL-070", "Determinação de Teor de Peróxido de Hidrogênio"),
    ("cql", "POP-CQL-071", "Determinação de Teor de Hidróxido de Cálcio"),
    ("cql", "POP-CQL-073", "Autoclave"),
    ("cql", "POP-CQL-074", "Exaustores e bancada exaustora"),
    ("cql", "POP-CQL-075", "Placa Aquecedora"),
    ("cql", "POP-CQL-076", "Gerenciamento de Resíduos"),
    ("cql", "POP-CQL-077", "Biossegurança"),
    ("cql", "POP-CQL-080", "Ponto de fusão"),
    ("cql", "POP-CQL-081", "Não Conformidade"),
    ("cql", "POP-CQL-082", "Preparo de Álcool a 70"),
    ("exp", "POP-EXP-027", "Dispensação de produtos"),
    ("exp", "POP-EXP-040", "Recolhimento de Produtos"),
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
                    CHECK (status IN ('draft', 'in_review', 'published', 'obsolete')),
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
            ('prd', 'Produção', 60),
            ('cql', 'Controle de Qualidade', 70)
        ON CONFLICT DO NOTHING
        "#,
    )
    .await;

    eventos::garantir(pool).await?;

    TABLES_READY.store(true, Ordering::Relaxed);
    Ok(())
}

fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
        .map_err(|e| format!("Data inválida ({s}): {e}"))
}

pub(super) fn today() -> NaiveDate {
    Utc::now().date_naive()
}

/// Intervalo entre revisões periódicas dos POPs (decisão do Edson, 2026-10-29).
const ANOS_ENTRE_REVISOES: i64 = 2;

/// Data da próxima revisão: vigência + 2 anos.
pub(super) fn proxima_revisao(d: NaiveDate) -> NaiveDate {
    d.checked_add_signed(Duration::days(365 * ANOS_ENTRE_REVISOES))
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

async fn load_version(conn: &mut PgConnection, id: &str) -> Result<Option<PopVersion>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, document_id, revision, effective_date, next_review_date,
               change_kind, change_summary, content_json,
               elaborated_by, reviewed_by, approved_by, created_by, created_at
        FROM pop_versions WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.as_ref().map(map_version))
}

/// Lê o POP numa conexão (a da transação do 2 passos, quando for o caso).
pub async fn get_document_conn(conn: &mut PgConnection, id: &str) -> Result<PopDocument, ErroApi> {
    let row = sqlx::query(
        r#"
        SELECT d.*, s.name AS sector_name
        FROM pop_documents d
        JOIN pop_sectors s ON s.id = d.sector_id
        WHERE d.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| ErroApi::nao_encontrado("POP não encontrado"))?;

    let vid: Option<String> = row.get("current_version_id");
    let current = match vid {
        Some(ref v) => load_version(&mut *conn, v).await?,
        None => None,
    };
    Ok(map_document(&row, current))
}

pub async fn get_document(pool: &PgPool, id: &str) -> Result<PopDocument, String> {
    ensure_tables(pool).await?;
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    get_document_conn(&mut conn, id).await.map_err(|e| e.mensagem)
}

/// Código repetido vira conflito; setor inexistente vira pedido inválido.
fn erro_de_gravacao(e: sqlx::Error) -> ErroApi {
    match e.as_database_error().and_then(|d| d.code()).as_deref() {
        Some("23505") => ErroApi::conflito("Já existe um POP com esse código."),
        Some("23503") => ErroApi::invalido("Setor inexistente."),
        _ => ErroApi::from(e),
    }
}

/// Cria o POP em rascunho (versão 0). Chamado dentro da transação do 2 passos; o evento `criado` vai junto.
pub async fn create_document_tx(conn: &mut PgConnection, input: DocumentInput, created_by: &str) -> Result<PopDocument, ErroApi> {
    let code = input.code.trim().to_uppercase();
    let title = input.title.trim().to_string();
    if code.is_empty() || title.is_empty() {
        return Err(ErroApi::invalido("Código e título obrigatórios"));
    }
    let id = Uuid::new_v4().to_string();
    let content = input.content.unwrap_or_default();
    let content_json = content.to_value();

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
    .execute(&mut *conn)
    .await
    .map_err(erro_de_gravacao)?;

    // Draft version 0 (não publicada)
    let vid = Uuid::new_v4().to_string();
    let eff = today();
    let next = proxima_revisao(eff);
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
    .execute(&mut *conn)
    .await?;

    sqlx::query(
        "UPDATE pop_documents SET current_version_id = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(&id)
    .bind(&vid)
    .execute(&mut *conn)
    .await?;

    eventos::registrar(&mut *conn, "pop", &id, "criado", None, Some("draft"), None, created_by).await?;
    get_document_conn(conn, &id).await
}

/// Segura a linha do POP até o fim da transação (duas mudanças de status ao mesmo tempo).
async fn travar_documento(conn: &mut PgConnection, id: &str) -> Result<(), ErroApi> {
    let existe: Option<i32> = sqlx::query_scalar("SELECT 1 FROM pop_documents WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    existe.map(|_| ()).ok_or_else(|| ErroApi::nao_encontrado("POP não encontrado"))
}

/// Edita título, setor, responsáveis e (só em rascunho) o corpo. Evento `editado`.
pub async fn update_document_tx(
    conn: &mut PgConnection,
    id: &str,
    input: DocumentUpdateInput,
    usuario: &str,
) -> Result<PopDocument, ErroApi> {
    travar_documento(&mut *conn, id).await?;
    let doc = get_document_conn(&mut *conn, id).await?;
    let vid = doc
        .current_version_id
        .clone()
        .ok_or_else(|| ErroApi::regra("POP sem versão atual"))?;

    if let Some(ref title) = input.title {
        sqlx::query("UPDATE pop_documents SET title = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(title.trim())
            .execute(&mut *conn)
            .await?;
    }
    if let Some(ref sector) = input.sector_id {
        sqlx::query("UPDATE pop_documents SET sector_id = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(sector)
            .execute(&mut *conn)
            .await
            .map_err(erro_de_gravacao)?;
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
        .execute(&mut *conn)
        .await?;
    }
    if let Some(ref content) = input.content {
        if doc.status != "draft" {
            return Err(ErroApi::regra(
                "Conteúdo de POP publicado só muda via «Publicar revisão» (preserva histórico)",
            ));
        }
        sqlx::query("UPDATE pop_versions SET content_json = $2 WHERE id = $1")
            .bind(&vid)
            .bind(content.to_value())
            .execute(&mut *conn)
            .await?;
    }
    eventos::registrar(&mut *conn, "pop", id, "editado", Some(&doc.status), Some(&doc.status), None, usuario).await?;
    get_document_conn(conn, id).await
}

fn motivo_obrigatorio(texto: Option<&str>) -> Result<String, ErroApi> {
    let m = texto.unwrap_or("").trim().to_string();
    if m.is_empty() {
        Err(ErroApi::invalido("Informe o motivo."))
    } else {
        Ok(m)
    }
}

/// Transições permitidas do POP: rascunho ↔ em aprovação, e vigente/em aprovação → obsoleto.
pub fn transicao_permitida(de: &str, para: &str) -> bool {
    matches!(
        (de, para),
        ("draft", "in_review") | ("in_review", "draft") | ("published", "obsolete") | ("in_review", "obsolete")
    )
}

/// Nome do evento na trilha para o status de destino.
pub fn evento_do_destino(destino: &str) -> &'static str {
    match destino {
        "in_review" => "enviado_aprovacao",
        "draft" => "devolvido",
        "obsolete" => "obsoleto",
        _ => "editado",
    }
}

/// Rascunho → em aprovação, devolve para rascunho, ou vigente → obsoleto. Não apaga; o motivo vai para a trilha
/// (`pop_eventos`) e não sobrescreve mais o resumo da versão.
pub async fn mover_status_tx(
    conn: &mut PgConnection,
    id: &str,
    destino: &str,
    motivo: Option<&str>,
    usuario: &str,
) -> Result<PopDocument, ErroApi> {
    travar_documento(&mut *conn, id).await?;
    let doc = get_document_conn(&mut *conn, id).await?;
    if !transicao_permitida(&doc.status, destino) {
        return Err(ErroApi::regra(format!("Não dá para ir de {} para {destino}.", doc.status)));
    }
    let motivo = motivo_obrigatorio(motivo)?;
    sqlx::query("UPDATE pop_documents SET status = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(destino)
        .execute(&mut *conn)
        .await?;
    eventos::registrar(
        &mut *conn,
        "pop",
        id,
        evento_do_destino(destino),
        Some(&doc.status),
        Some(destino),
        Some(&motivo),
        usuario,
    )
    .await?;
    get_document_conn(conn, id).await
}

/// O que uma aprovação grava: revisão, vigência e próxima revisão.
#[derive(Debug, PartialEq, Eq)]
pub struct DecisaoPublicacao {
    pub revisao: i32,
    pub vigencia: NaiveDate,
    pub proxima: NaiveDate,
    /// Primeira emissão do POP (nunca foi publicado).
    pub inicial: bool,
}

/// Emissão inicial mantém a revisão (a do Word; mínimo 1) e a vigência já gravada (hoje se vazia);
/// revisão nova soma 1 e usa a vigência informada (hoje por padrão). A próxima revisão é vigência + 2 anos,
/// mesmo que já tenha passado (o alerta mostra como vencida).
pub fn decidir_publicacao(
    ja_publicado: bool,
    revisao_atual: i32,
    vigencia_gravada: Option<NaiveDate>,
    vigencia_informada: Option<NaiveDate>,
    hoje: NaiveDate,
) -> DecisaoPublicacao {
    let (revisao, vigencia) = if ja_publicado {
        (revisao_atual + 1, vigencia_informada.unwrap_or(hoje))
    } else {
        (revisao_atual.max(1), vigencia_informada.or(vigencia_gravada).unwrap_or(hoje))
    };
    DecisaoPublicacao { revisao, vigencia, proxima: proxima_revisao(vigencia), inicial: !ja_publicado }
}

/// O POP já teve alguma publicação: há evento de publicação/revalidação ou outra versão além da corrente.
async fn ja_foi_publicado(conn: &mut PgConnection, id: &str, versao_corrente: Option<&str>) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT EXISTS (SELECT 1 FROM pop_eventos WHERE tipo = 'pop' AND ref = $1 AND acao IN ('publicado', 'revalidado'))
            OR EXISTS (SELECT 1 FROM pop_versions WHERE document_id = $1 AND id <> COALESCE($2, ''))
        "#,
    )
    .bind(id)
    .bind(versao_corrente)
    .fetch_one(&mut *conn)
    .await
}

/// Aprova/publica uma revisão (de «em aprovação» ou de vigente). Evento `publicado` com o motivo.
pub async fn publish_document_tx(
    conn: &mut PgConnection,
    id: &str,
    input: PublishInput,
    created_by: &str,
) -> Result<PopDocument, ErroApi> {
    travar_documento(&mut *conn, id).await?;
    let doc = get_document_conn(&mut *conn, id).await?;
    if doc.status == "draft" {
        return Err(ErroApi::regra("Envie para aprovação antes de publicar."));
    }
    if doc.status == "obsolete" {
        return Err(ErroApi::regra("POP obsoleto não volta a vigente por esta ação."));
    }
    let motivo = motivo_obrigatorio(input.change_summary.as_deref())?;
    let base_content = input
        .content
        .or_else(|| doc.current_version.as_ref().map(|v| v.content.clone()))
        .unwrap_or_default();
    let informada = match input.effective_date.as_deref() {
        Some(s) if !s.trim().is_empty() => Some(parse_date(s).map_err(ErroApi::invalido)?),
        _ => None,
    };
    let gravada = doc.effective_date.as_deref().and_then(|s| parse_date(s).ok());
    let ja_publicado = doc.status == "published" || ja_foi_publicado(&mut *conn, id, doc.current_version_id.as_deref()).await?;
    let d = decidir_publicacao(ja_publicado, doc.current_revision, gravada, informada, today());
    let (eff, next, new_rev) = (d.vigencia, d.proxima, d.revisao);
    let kind = if d.inicial { "initial" } else { "content" };
    let elab = input
        .elaborated_by
        .or(doc.elaborated_by.clone());
    let rev = input.reviewed_by.or(doc.reviewed_by.clone());
    let appr = input.approved_by.or(doc.approved_by.clone());

    // Emissão inicial que mantém a revisão da versão corrente (veio do Word): atualiza essa versão no lugar;
    // nos demais casos acrescenta uma versão nova.
    let versao_corrente_mesma_revisao = d.inicial
        && doc.current_version.as_ref().is_some_and(|v| v.revision == new_rev)
        && doc.current_version_id.is_some();
    let vid = if versao_corrente_mesma_revisao {
        let vid = doc.current_version_id.clone().unwrap_or_default();
        sqlx::query(
            r#"
            UPDATE pop_versions SET
                effective_date = $2, next_review_date = $3, change_kind = $4, change_summary = $5, content_json = $6,
                elaborated_by = $7, reviewed_by = $8, approved_by = $9
            WHERE id = $1
            "#,
        )
        .bind(&vid)
        .bind(eff)
        .bind(next)
        .bind(kind)
        .bind(&motivo)
        .bind(base_content.to_value())
        .bind(&elab)
        .bind(&rev)
        .bind(&appr)
        .execute(&mut *conn)
        .await?;
        vid
    } else {
        let vid = Uuid::new_v4().to_string();
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
        .bind(&motivo)
        .bind(base_content.to_value())
        .bind(&elab)
        .bind(&rev)
        .bind(&appr)
        .bind(created_by)
        .execute(&mut *conn)
        .await?;
        vid
    };

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
    .execute(&mut *conn)
    .await?;

    eventos::registrar(&mut *conn, "pop", id, "publicado", Some(&doc.status), Some("published"), Some(&motivo), created_by).await?;
    get_document_conn(conn, id).await
}

/// Revalida um POP vigente (nova vigência e próxima revisão, mesmo texto). Evento `revalidado`.
pub async fn revalidate_document_tx(
    conn: &mut PgConnection,
    id: &str,
    input: RevalidateInput,
    created_by: &str,
) -> Result<PopDocument, ErroApi> {
    travar_documento(&mut *conn, id).await?;
    let doc = get_document_conn(&mut *conn, id).await?;
    if doc.status != "published" {
        return Err(ErroApi::regra("Só é possível revalidar POPs vigentes"));
    }
    let summary = motivo_obrigatorio(input.change_summary.as_deref())?;
    let content = doc
        .current_version
        .as_ref()
        .map(|v| v.content.clone())
        .unwrap_or_default();
    let eff = match input.effective_date.as_deref() {
        Some(s) if !s.trim().is_empty() => parse_date(s).map_err(ErroApi::invalido)?,
        _ => today(),
    };
    let next = proxima_revisao(eff);
    let new_rev = doc.current_revision + 1;
    let vid = Uuid::new_v4().to_string();

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
    .execute(&mut *conn)
    .await?;

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
    .execute(&mut *conn)
    .await?;

    eventos::registrar(&mut *conn, "pop", id, "revalidado", Some("published"), Some("published"), Some(&summary), created_by).await?;
    get_document_conn(conn, id).await
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

    // Salva também no banco em base64 para persistência total em pg_dump
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
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
    let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ('report_logo_base64', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(&b64)
        .execute(pool)
        .await;
    let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ('report_logo_mime', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(mime)
        .execute(pool)
        .await;

    get_settings(pool).await
}

pub async fn logo_bytes(pool: &PgPool) -> Result<(Vec<u8>, String), String> {
    // 1. Tenta servir direto do PostgreSQL (persistência atômica no banco)
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT s1.value, COALESCE(s2.value, 'image/png') FROM settings s1 LEFT JOIN settings s2 ON s2.key = 'report_logo_mime' WHERE s1.key = 'report_logo_base64'"
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if let Some((b64, mime)) = row {
        let trimmed = b64.trim();
        if !trimmed.is_empty() {
            if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, trimmed) {
                return Ok((bytes, mime));
            }
        }
    }

    // 2. Fallback para arquivo em disco (Saves/)
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

    // Backfill no banco
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ('report_logo_base64', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(&b64)
        .execute(pool)
        .await;
    let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ('report_logo_mime', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(mime)
        .execute(pool)
        .await;

    Ok((bytes, mime.into()))
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedBodyEntry {
    pub body: String,
    #[serde(default)]
    pub revision: Option<i32>,
    #[serde(default)]
    pub effective_date: Option<String>,
    #[serde(default)]
    pub elaborated_by: Option<String>,
    #[serde(default)]
    pub reviewed_by: Option<String>,
    #[serde(default)]
    pub approved_by: Option<String>,
}

/// Setores que o seed usa (id, nome). Em produção um setor pode já existir com o mesmo nome e outro id (criado pela tela):
/// o nome é único, então inserir pelo id falharia. Acha pelo id ou pelo nome; cria só se não houver nenhum dos dois.
const SETORES_DO_SEED: &[(&str, &str, i32)] = &[
    ("adm", "Administração", 10),
    ("almox", "Almoxarifado", 20),
    ("atd", "Atendimento", 30),
    ("exp", "Expedição", 50),
    ("prd", "Produção", 60),
    ("cql", "Controle de Qualidade", 70),
];

async fn resolver_setores_do_seed(pool: &PgPool) -> Result<std::collections::HashMap<String, String>, String> {
    let mut mapa = std::collections::HashMap::new();
    for (id, nome, ordem) in SETORES_DO_SEED {
        let achado: Option<String> = sqlx::query_scalar(
            "SELECT id FROM pop_sectors WHERE id = $1 OR lower(trim(name)) = lower($2) ORDER BY (id = $1) DESC LIMIT 1",
        )
        .bind(id)
        .bind(nome)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        let real = match achado {
            Some(r) => r,
            None => {
                sqlx::query("INSERT INTO pop_sectors (id, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
                    .bind(id)
                    .bind(nome)
                    .bind(ordem)
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string())?;
                id.to_string()
            }
        };
        mapa.insert(id.to_string(), real);
    }
    Ok(mapa)
}

pub async fn seed_inventory(
    pool: &PgPool,
    created_by: Option<&str>,
    force: bool,
) -> Result<SeedResult, String> {
    ensure_tables(pool).await?;
    let setor_real = resolver_setores_do_seed(pool).await?;
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

        let entry = bodies.get(*code);
        let body = entry.map(|e| e.body.as_str()).unwrap_or("");
        let rev = entry.and_then(|e| e.revision).unwrap_or(1);
        let elab = entry
            .and_then(|e| e.elaborated_by.clone())
            .or_else(|| Some("Responsável Técnico".into()));
        let rev_by = entry
            .and_then(|e| e.reviewed_by.clone())
            .or_else(|| Some("Equipe de Controle de Qualidade".into()));
        let app_by = entry.and_then(|e| e.approved_by.clone());
        let eff_date = entry.and_then(|e| e.effective_date.clone());

        if !exists {
            let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
            let doc = create_document_tx(
                &mut tx,
                DocumentInput {
                    code: code.to_string(),
                    title: title.to_string(),
                    sector_id: setor_real.get(*sector).cloned().unwrap_or_else(|| sector.to_string()),
                    content: Some(PopContent {
                        body: body.to_string(),
                        elaborated_at: eff_date.clone(),
                        reviewed_at: eff_date.clone(),
                        approved_at: eff_date.clone(),
                    }),
                    elaborated_by: elab.clone(),
                    reviewed_by: rev_by.clone(),
                    approved_by: app_by.clone(),
                },
                created_by.unwrap_or("Importação"),
            )
            .await
            .map_err(|e| e.mensagem)?;
            tx.commit().await.map_err(|e| e.to_string())?;

            if let Some(ref vid) = doc.current_version_id {
                let eff = eff_date
                    .as_deref()
                    .and_then(|s| parse_date(s).ok())
                    .unwrap_or_else(today);
                let next = proxima_revisao(eff);
                let _ = sqlx::query(
                    r#"
                    UPDATE pop_versions
                    SET revision = $2, effective_date = $3, next_review_date = $4
                    WHERE id = $1
                    "#,
                )
                .bind(vid)
                .bind(rev)
                .bind(eff)
                .bind(next)
                .execute(pool)
                .await;

                let _ = sqlx::query(
                    r#"
                    UPDATE pop_documents
                    SET current_revision = $2, effective_date = $3, next_review_date = $4
                    WHERE id = $1
                    "#,
                )
                .bind(&doc.id)
                .bind(rev)
                .bind(eff)
                .bind(next)
                .execute(pool)
                .await;
            }

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
        if let Some(ref d) = eff_date {
            next.elaborated_at = Some(d.clone());
            next.reviewed_at = Some(d.clone());
        }
        sqlx::query(
            r#"
            UPDATE pop_versions
            SET content_json = $2,
                elaborated_by = COALESCE($3, elaborated_by),
                reviewed_by = COALESCE($4, reviewed_by),
                approved_by = COALESCE($5, approved_by)
            WHERE id = $1
            "#,
        )
        .bind(&vid)
        .bind(next.to_value())
        .bind(&elab)
        .bind(&rev_by)
        .bind(&app_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        let eff = eff_date
            .as_deref()
            .and_then(|s| parse_date(s).ok())
            .unwrap_or_else(today);
        let next_dt = proxima_revisao(eff);

        sqlx::query(
            r#"
            UPDATE pop_versions
            SET revision = $2, effective_date = $3, next_review_date = $4
            WHERE id = $1
            "#,
        )
        .bind(&vid)
        .bind(rev)
        .bind(eff)
        .bind(next_dt)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            r#"
            UPDATE pop_documents
            SET current_revision = $2,
                effective_date = $3,
                next_review_date = $4,
                elaborated_by = COALESCE($5, elaborated_by),
                reviewed_by = COALESCE($6, reviewed_by),
                approved_by = COALESCE($7, approved_by),
                updated_at = NOW()
            WHERE code = $1
            "#,
        )
        .bind(code)
        .bind(rev)
        .bind(eff)
        .bind(next_dt)
        .bind(&elab)
        .bind(&rev_by)
        .bind(&app_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Ok(mut c) = pool.acquire().await {
            let id: String = row.get("id");
            let _ = eventos::registrar(
                &mut c,
                "pop",
                &id,
                "editado",
                Some(&status),
                Some(&status),
                Some("Corpo preenchido pela importação do inventário"),
                created_by.unwrap_or("Importação"),
            )
            .await;
        }
        bodies_filled += 1;
    }

    Ok(SeedResult {
        sectors,
        created,
        skipped,
        bodies_filled,
    })
}

fn load_seed_bodies() -> std::collections::HashMap<String, SeedBodyEntry> {
    let raw = include_str!("seed_bodies.json");
    let parsed: serde_json::Value = serde_json::from_str(raw).unwrap_or(serde_json::json!({}));
    let mut map = std::collections::HashMap::new();
    if let Some(obj) = parsed.as_object() {
        for (code, v) in obj {
            if let Ok(entry) = serde_json::from_value::<SeedBodyEntry>(v.clone()) {
                if !entry.body.is_empty() {
                    map.insert(code.clone(), entry);
                }
            }
        }
    }
    map
}

pub async fn check_alerts(pool: &PgPool) -> Result<CheckAlertsResult, String> {
    ensure_tables(pool).await?;
    // POPs e formulários vigentes com próxima revisão marcada: (tipo da mensagem, código, título, próxima revisão).
    let mut itens: Vec<(&str, String, String, NaiveDate)> = Vec::new();
    let rows = sqlx::query(
        r#"
        SELECT code, title, next_review_date
        FROM pop_documents
        WHERE status = 'published' AND next_review_date IS NOT NULL
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for row in rows {
        itens.push(("pop", row.get("code"), row.get("title"), row.get("next_review_date")));
    }
    let rows = sqlx::query(
        r#"
        SELECT code, title, next_review_date
        FROM pop_formularios
        WHERE status = 'published' AND next_review_date IS NOT NULL
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for row in rows {
        itens.push(("form", row.get("code"), row.get("title"), row.get("next_review_date")));
    }

    let mut notified = 0usize;
    let today = today();
    for (tipo, code, title, next) in itens {
        let (rotulo, chave) = if tipo == "pop" { ("POP", "pop") } else { ("Formulário", "form") };
        let days = (next - today).num_days();
        if days < 0 {
            let _ = notif_store::create_notification(
                pool,
                "qualidade_pops",
                "warning",
                &format!("{rotulo} vencido: {code}"),
                &format!("{title} — revisão vencida em {}", next.format("%d/%m/%Y")),
                Some(&format!("{chave}:{code}:overdue")),
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
                    &format!("{rotulo} vence em {th}d: {code}"),
                    &format!("{title} — próxima revisão {}", next.format("%d/%m/%Y")),
                    Some(&format!("{chave}:{code}:warn:{th}")),
                )
                .await;
                notified += 1;
                break;
            }
        }
    }
    Ok(CheckAlertsResult { notified })
}

#[cfg(test)]
mod testes_revisao {
    use super::*;

    /// Produção tinha "Controle de Qualidade" com outro id: o seed tem de usar esse id, sem tentar inserir 'cql' (nome é único).
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn setor_do_seed_reaproveita_setor_de_mesmo_nome() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        ensure_tables(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("DELETE FROM pop_sectors WHERE id = 'cql' AND NOT EXISTS (SELECT 1 FROM pop_documents WHERE sector_id = 'cql')")
            .execute(&mut *tx).await.unwrap();
        tx.commit().await.unwrap();
        let ja_tem_cql: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pop_sectors WHERE id = 'cql')").fetch_one(&pool).await.unwrap();
        if ja_tem_cql { return; } // banco com POPs CQL reais: o caso não se reproduz aqui
        sqlx::query("INSERT INTO pop_sectors (id, name, sort_order) VALUES ('zz_cq', 'Controle de Qualidade', 99)")
            .execute(&pool).await.unwrap();
        let mapa = resolver_setores_do_seed(&pool).await.unwrap();
        assert_eq!(mapa.get("cql").map(String::as_str), Some("zz_cq"));
        sqlx::query("DELETE FROM pop_sectors WHERE id = 'zz_cq'").execute(&pool).await.unwrap();
    }

    #[test]
    fn proxima_revisao_soma_dois_anos() {
        let d = NaiveDate::from_ymd_opt(2025, 9, 2).unwrap();
        assert_eq!(proxima_revisao(d), NaiveDate::from_ymd_opt(2027, 9, 2).unwrap());
    }

    #[test]
    fn seed_sem_duplicados_e_no_padrao() {
        let mut vistos = std::collections::HashSet::new();
        for (setor, codigo, _) in SEED_POPS {
            assert!(vistos.insert(*codigo), "duplicado: {codigo}");
            let sigla = codigo.split('-').nth(1).unwrap();
            let num = codigo.split('-').nth(2).unwrap();
            assert_eq!(num.len(), 3, "{codigo}");
            let esperado = if *setor == "almox" { "ALM".to_string() } else { setor.to_uppercase() };
            assert_eq!(sigla, esperado, "{codigo}");
        }
        assert!(!SEED_POPS.iter().any(|(_, c, _)| *c == "POP-EXP-043"));
    }
}
