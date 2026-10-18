use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{
    AnaliseFqRequest, ConferirItemRequest, CreateDevolucaoRequest, DevolucaoItemIn,
    DevolucaoItemOut, DevolucaoOut, DividirItemRequest, ErpItemRequest, ItemLookupOut, LoteSpecsOut,
    UpdateDevolucaoRequest,
};

const DISPOSICOES: &[&str] = &[
    "retornar_estoque",
    "trocar_embalagem",
    "trocar_rotulo",
    "descartar",
    "quarentena",
    "analise_fq",
    "outro",
];

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucoes (
            id BIGSERIAL PRIMARY KEY,
            register_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN (
                    'rascunho', 'recebido', 'em_conferencia', 'disposto',
                    'parcialmente_lancado', 'finalizado'
                )),
            client_code TEXT NOT NULL DEFAULT '',
            client_name TEXT NOT NULL DEFAULT '',
            return_date DATE NOT NULL DEFAULT CURRENT_DATE,
            nf_number TEXT NOT NULL DEFAULT '',
            receiver_name TEXT NOT NULL DEFAULT '',
            carrier_name TEXT NOT NULL DEFAULT '',
            notes TEXT,
            received_by TEXT,
            received_at TIMESTAMPTZ,
            cq_by TEXT,
            cq_at TIMESTAMPTZ,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucao_itens (
            id BIGSERIAL PRIMARY KEY,
            devolucao_id BIGINT NOT NULL REFERENCES qualidade_devolucoes(id) ON DELETE CASCADE,
            item_code TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
            lotes TEXT NOT NULL DEFAULT '',
            qty_conferida DOUBLE PRECISION,
            analise_obs TEXT,
            disposicao TEXT
                CHECK (disposicao IS NULL OR disposicao IN (
                    'retornar_estoque', 'trocar_embalagem', 'trocar_rotulo',
                    'descartar', 'quarentena', 'analise_fq', 'outro'
                )),
            disposicao_obs TEXT,
            erp_status TEXT NOT NULL DEFAULT 'em_processo'
                CHECK (erp_status IN ('em_processo', 'lancado')),
            erp_by TEXT,
            erp_at TIMESTAMPTZ,
            sort_order INT NOT NULL DEFAULT 0
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        ALTER TABLE qualidade_devolucao_itens
            ADD COLUMN IF NOT EXISTS fq_ph_original DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_viscosidade_original DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_densidade_original DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_ph_medido DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_viscosidade_medido DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_densidade_medido DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS fq_resultado TEXT,
            ADD COLUMN IF NOT EXISTS fq_responsavel TEXT,
            ADD COLUMN IF NOT EXISTS fq_observacao TEXT,
            ADD COLUMN IF NOT EXISTS fq_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS foto_path TEXT,
            ADD COLUMN IF NOT EXISTS caixa_fechada BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS unidades_por_caixa INTEGER
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        DO $$
        DECLARE r record;
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'qualidade_devolucao_itens'::regclass
                  AND contype = 'c'
                  AND pg_get_constraintdef(oid) ILIKE '%analise_fq%'
            ) THEN
                FOR r IN
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'qualidade_devolucao_itens'::regclass
                      AND contype = 'c'
                      AND pg_get_constraintdef(oid) ILIKE '%disposicao%'
                LOOP
                    EXECUTE format('ALTER TABLE qualidade_devolucao_itens DROP CONSTRAINT %I', r.conname);
                END LOOP;
                ALTER TABLE qualidade_devolucao_itens
                    ADD CONSTRAINT qualidade_devolucao_itens_disposicao_check
                    CHECK (disposicao IS NULL OR disposicao IN (
                        'retornar_estoque', 'trocar_embalagem', 'trocar_rotulo',
                        'descartar', 'quarentena', 'analise_fq', 'outro'
                    ));
            END IF;
        END $$;
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_qualidade_devolucoes_status ON qualidade_devolucoes (status)",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_itens_dev ON qualidade_devolucao_itens (devolucao_id)",
    )
    .execute(pool)
    .await;

    sqlx::query(
        "ALTER TABLE qualidade_devolucoes ADD COLUMN IF NOT EXISTS volume_count INT NOT NULL DEFAULT 1",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucao_controles (
            id BIGSERIAL PRIMARY KEY,
            sheet_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'aberta'
                CHECK (status IN ('aberta', 'devolvida', 'cancelada')),
            volume_count INT NOT NULL DEFAULT 1,
            created_by TEXT,
            returned_by TEXT,
            returned_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucao_controle_itens (
            controle_id BIGINT NOT NULL REFERENCES qualidade_devolucao_controles(id) ON DELETE CASCADE,
            devolucao_id BIGINT NOT NULL REFERENCES qualidade_devolucoes(id),
            PRIMARY KEY (controle_id, devolucao_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_controle_itens_dev ON qualidade_devolucao_controle_itens (devolucao_id)",
    )
    .execute(pool)
    .await;

    Ok(())
}

fn normalize_disposicao(raw: &str) -> Result<Option<&'static str>, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Ok(None);
    }
    DISPOSICOES
        .iter()
        .find(|d| **d == t)
        .copied()
        .map(Some)
        .ok_or_else(|| format!("disposicao inválida: {t}"))
}

async fn next_register_number(pool: &PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("DV-{year}-");
    let row = sqlx::query(
        r#"
        SELECT register_number FROM qualidade_devolucoes
        WHERE register_number LIKE $1
        ORDER BY register_number DESC
        LIMIT 1
        "#,
    )
    .bind(format!("{prefix}%"))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let next = match row {
        Some(r) => {
            let last: String = r.get(0);
            last.rsplit('-')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
                + 1
        }
        None => 1,
    };
    Ok(format!("{prefix}{next:04}"))
}

async fn load_items(pool: &PgPool, devolucao_id: i64) -> Result<Vec<DevolucaoItemOut>, String> {
    let rows = sqlx::query(
        r#"
        SELECT i.id, i.item_code, i.description, i.qty, i.lotes, i.qty_conferida, i.analise_obs,
               i.disposicao, i.disposicao_obs, i.erp_status, i.erp_by, i.erp_at, i.sort_order,
               i.fq_ph_original, i.fq_viscosidade_original, i.fq_densidade_original,
               i.fq_ph_medido, i.fq_viscosidade_medido, i.fq_densidade_medido,
               i.fq_resultado, i.fq_responsavel, i.fq_observacao, i.fq_at, i.foto_path,
               i.caixa_fechada, COALESCE(i.unidades_por_caixa, p.qtde_cx) AS unidades_por_caixa
        FROM qualidade_devolucao_itens i
        LEFT JOIN produtos p ON TRIM(p.codigo) = TRIM(i.item_code)
        WHERE i.devolucao_id = $1
        ORDER BY i.sort_order ASC, i.id ASC
        "#,
    )
    .bind(devolucao_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let erp_at: Option<chrono::DateTime<chrono::Utc>> = r.get(11);
            let fq_at: Option<chrono::DateTime<chrono::Utc>> = r.get(22);
            DevolucaoItemOut {
                id: crate::core::pg_row::pg_i64(&r, 0),
                item_code: r.get(1),
                description: r.get(2),
                qty: r.get(3),
                lotes: r.get(4),
                caixa_fechada: r.get(24),
                unidades_por_caixa: r.get(25),
                qty_conferida: r.get(5),
                analise_obs: r.get(6),
                disposicao: r.get(7),
                disposicao_obs: r.get(8),
                erp_status: r.get(9),
                erp_by: r.get(10),
                erp_at: erp_at.map(|t| t.to_rfc3339()),
                sort_order: r.get(12),
                fq_ph_original: r.get(13),
                fq_viscosidade_original: r.get(14),
                fq_densidade_original: r.get(15),
                fq_ph_medido: r.get(16),
                fq_viscosidade_medido: r.get(17),
                fq_densidade_medido: r.get(18),
                fq_resultado: r.get(19),
                fq_responsavel: r.get(20),
                fq_observacao: r.get(21),
                fq_at: fq_at.map(|t| t.to_rfc3339()),
                foto_path: r.get(23),
            }
        })
        .collect())
}

const DEV_SELECT: &str = r#"
    SELECT id, register_number, status, client_code, client_name, return_date,
           nf_number, receiver_name, carrier_name, notes,
           received_by, received_at, cq_by, cq_at,
           created_by, created_at, updated_at, volume_count
    FROM qualidade_devolucoes
"#;

fn row_to_dev(r: &sqlx::postgres::PgRow, items: Vec<DevolucaoItemOut>) -> DevolucaoOut {
    let return_date: chrono::NaiveDate = r.get(5);
    let received_at: Option<chrono::DateTime<chrono::Utc>> = r.get(11);
    let cq_at: Option<chrono::DateTime<chrono::Utc>> = r.get(13);
    let created_at: chrono::DateTime<chrono::Utc> = r.get(15);
    let updated_at: chrono::DateTime<chrono::Utc> = r.get(16);
    let volume_count: i32 = r.get(17);
    DevolucaoOut {
        id: crate::core::pg_row::pg_i64(r, 0),
        register_number: r.get(1),
        status: r.get(2),
        client_code: r.get(3),
        client_name: r.get(4),
        return_date: return_date.format("%Y-%m-%d").to_string(),
        nf_number: r.get(6),
        receiver_name: r.get(7),
        carrier_name: r.get(8),
        notes: r.get(9),
        received_by: r.get(10),
        received_at: received_at.map(|t| t.to_rfc3339()),
        cq_by: r.get(12),
        cq_at: cq_at.map(|t| t.to_rfc3339()),
        created_by: r.get(14),
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
        volume_count,
        items,
    }
}

async fn load_full(pool: &PgPool, id: i64) -> Result<DevolucaoOut, String> {
    let row = sqlx::query(&format!("{DEV_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let items = load_items(pool, id).await?;
    Ok(row_to_dev(&row, items))
}

async fn refresh_status_from_items(pool: &PgPool, id: i64) -> Result<(), String> {
    let status: String =
        sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    if !matches!(
        status.as_str(),
        "disposto" | "parcialmente_lancado" | "finalizado"
    ) {
        return Ok(());
    }

    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE disposicao = 'retornar_estoque')::int AS retorno,
            COUNT(*) FILTER (WHERE disposicao = 'retornar_estoque' AND erp_status = 'lancado')::int AS feitos
        FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let retorno: i32 = row.get(0);
    let feitos: i32 = row.get(1);
    let new_status = if retorno == 0 || feitos >= retorno {
        "finalizado"
    } else if feitos > 0 {
        "parcialmente_lancado"
    } else {
        "disposto"
    };

    sqlx::query(
        "UPDATE qualidade_devolucoes SET status = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(new_status)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn refresh_closed_statuses(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        UPDATE qualidade_devolucoes d
        SET status = sub.new_status, updated_at = NOW()
        FROM (
            SELECT d2.id,
                CASE
                    WHEN COALESCE(r.retorno, 0) = 0 OR COALESCE(r.feitos, 0) >= COALESCE(r.retorno, 0) THEN 'finalizado'
                    WHEN COALESCE(r.feitos, 0) > 0 THEN 'parcialmente_lancado'
                    ELSE 'disposto'
                END AS new_status
            FROM qualidade_devolucoes d2
            LEFT JOIN (
                SELECT devolucao_id,
                    COUNT(*) FILTER (WHERE disposicao = 'retornar_estoque') AS retorno,
                    COUNT(*) FILTER (WHERE disposicao = 'retornar_estoque' AND erp_status = 'lancado') AS feitos
                FROM qualidade_devolucao_itens
                GROUP BY devolucao_id
            ) r ON r.devolucao_id = d2.id
            WHERE d2.status IN ('disposto', 'parcialmente_lancado', 'finalizado')
        ) sub
        WHERE d.id = sub.id AND d.status <> sub.new_status
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_items(items: &[DevolucaoItemIn]) -> Result<(), String> {
    if items.is_empty() {
        return Err("Informe ao menos um item".into());
    }
    for it in items {
        if it.item_code.trim().is_empty() || !(it.qty > 0.0) {
            return Err("Cada item precisa de código e qty > 0".into());
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub q: Option<String>,
    /// abertas | finalizadas | all
    pub filtro: Option<String>,
}

pub async fn list_devolucoes(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    if let Err(e) = refresh_closed_statuses(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let mut sql = String::from(DEV_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref f) = query.filtro {
        match f.trim().to_lowercase().as_str() {
            "abertas" => {
                sql.push_str(" AND status <> 'finalizado'");
            }
            "em_conferencia" => {
                sql.push_str(" AND status IN ('recebido', 'em_conferencia')");
            }
            "finalizadas" => {
                sql.push_str(" AND status = 'finalizado'");
            }
            _ => {}
        }
    }
    if let Some(ref st) = query.status {
        let st = st.trim();
        if !st.is_empty() {
            binds.push(st.to_string());
            sql.push_str(&format!(" AND status = ${}", binds.len()));
        }
    }
    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            binds.push(format!("%{q}%"));
            let i = binds.len();
            sql.push_str(&format!(
                " AND (register_number ILIKE ${i} OR client_name ILIKE ${i} OR client_code ILIKE ${i} OR nf_number ILIKE ${i} OR receiver_name ILIKE ${i})"
            ));
        }
    }
    sql.push_str(" ORDER BY return_date DESC, id DESC LIMIT 500");

    let mut qb = sqlx::query(&sql);
    for b in &binds {
        qb = qb.bind(b);
    }

    let rows = match qb.fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let id = crate::core::pg_row::pg_i64(&r, 0);
        let items = match load_items(pool, id).await {
            Ok(i) => i,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
        };
        out.push(row_to_dev(&r, items));
    }

    (StatusCode::OK, Json(out)).into_response()
}

pub async fn get_devolucao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Devolução não encontrada" })),
        )
            .into_response(),
    }
}

pub async fn create_devolucao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateDevolucaoRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    if let Err(e) = validate_items(&payload.items) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
    }

    let register_number = match next_register_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };

    let return_date = payload
        .return_date
        .as_deref()
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let row = match sqlx::query(
        r#"
        INSERT INTO qualidade_devolucoes
            (register_number, status, client_code, client_name, return_date,
             nf_number, receiver_name, carrier_name, notes, created_by, volume_count)
        VALUES ($1, 'rascunho', $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        "#,
    )
    .bind(&register_number)
    .bind(payload.client_code.as_deref().unwrap_or("").trim())
    .bind(payload.client_name.trim())
    .bind(return_date)
    .bind(payload.nf_number.as_deref().unwrap_or("").trim())
    .bind(payload.receiver_name.as_deref().unwrap_or("").trim())
    .bind(payload.carrier_name.as_deref().unwrap_or("").trim())
    .bind(&payload.notes)
    .bind(&ctx.display_name)
    .bind(payload.volume_count.unwrap_or(1).clamp(1, 99))
    .fetch_one(&mut *tx)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let id = crate::core::pg_row::pg_i64(&row, 0);

    for (idx, it) in payload.items.iter().enumerate() {
        let disp = it.disposicao.as_deref().and_then(|d| normalize_disposicao(d).ok().flatten());
        let disp_obs = it.disposicao_obs.as_deref().map(str::trim);
        let qty_conf = it.qty_conferida.or(if disp.is_some() { Some(it.qty) } else { None });
        let upc = match it.unidades_por_caixa {
            Some(u) if u > 0 => Some(u),
            _ => sqlx::query_scalar("SELECT qtde_cx FROM produtos WHERE TRIM(codigo) = TRIM($1) AND qtde_cx > 0")
                .bind(it.item_code.trim())
                .fetch_optional(&mut *tx)
                .await
                .ok()
                .flatten(),
        };
        let is_cx = it.caixa_fechada.unwrap_or(upc.is_some());
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO qualidade_devolucao_itens
                (devolucao_id, item_code, description, qty, lotes, sort_order, caixa_fechada, unidades_por_caixa,
                 disposicao, disposicao_obs, qty_conferida)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
        )
        .bind(id)
        .bind(it.item_code.trim())
        .bind(it.description.as_deref().unwrap_or("").trim())
        .bind(it.qty)
        .bind(it.lotes.as_deref().unwrap_or("").trim())
        .bind((idx as i32) * 10)
        .bind(is_cx)
        .bind(upc)
        .bind(disp)
        .bind(disp_obs)
        .bind(qty_conf)
        .execute(&mut *tx)
        .await
        {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match load_full(pool, id).await {
        Ok(o) => (StatusCode::CREATED, Json(o)).into_response(),
        Err(e) => (
            StatusCode::CREATED,
            Json(json!({ "id": id, "registerNumber": register_number, "warning": e })),
        )
            .into_response(),
    }
}

pub async fn update_devolucao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateDevolucaoRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if let Some(ref name) = payload.client_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET client_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(name.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref code) = payload.client_code {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET client_code = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(code.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref d) = payload.return_date {
        if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let _ = sqlx::query(
                "UPDATE qualidade_devolucoes SET return_date = $1, updated_at = NOW() WHERE id = $2",
            )
            .bind(nd)
            .bind(id)
            .execute(&mut *tx)
            .await;
        }
    }
    if let Some(ref nf) = payload.nf_number {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET nf_number = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(nf.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref r) = payload.receiver_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET receiver_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(r.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref c) = payload.carrier_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET carrier_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(c.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if payload.notes.is_some() {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET notes = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&payload.notes)
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(volume) = payload.volume_count {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET volume_count = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(volume.clamp(1, 99))
        .bind(id)
        .execute(&mut *tx)
        .await;
    }

    if status == "rascunho" {
    if let Some(ref items) = payload.items {
        if let Err(e) = validate_items(items) {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
        }
        if let Err(e) = sqlx::query("DELETE FROM qualidade_devolucao_itens WHERE devolucao_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
        for (idx, it) in items.iter().enumerate() {
            let disp = it.disposicao.as_deref().and_then(|d| normalize_disposicao(d).ok().flatten());
            let disp_obs = it.disposicao_obs.as_deref().map(str::trim);
            let qty_conf = it.qty_conferida.or(if disp.is_some() { Some(it.qty) } else { None });
            let upc = match it.unidades_por_caixa {
                Some(u) if u > 0 => Some(u),
                _ => sqlx::query_scalar("SELECT qtde_cx FROM produtos WHERE TRIM(codigo) = TRIM($1) AND qtde_cx > 0")
                    .bind(it.item_code.trim())
                    .fetch_optional(&mut *tx)
                    .await
                    .ok()
                    .flatten(),
            };
            let is_cx = it.caixa_fechada.unwrap_or(upc.is_some());
            if let Err(e) = sqlx::query(
                r#"
                INSERT INTO qualidade_devolucao_itens
                    (devolucao_id, item_code, description, qty, lotes, sort_order, caixa_fechada, unidades_por_caixa,
                     disposicao, disposicao_obs, qty_conferida)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                "#,
            )
            .bind(id)
            .bind(it.item_code.trim())
            .bind(it.description.as_deref().unwrap_or("").trim())
            .bind(it.qty)
            .bind(it.lotes.as_deref().unwrap_or("").trim())
            .bind((idx as i32) * 10)
            .bind(is_cx)
            .bind(upc)
            .bind(disp)
            .bind(disp_obs)
            .bind(qty_conf)
            .execute(&mut *tx)
            .await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    }
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn receber_devolucao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let count: i64 =
        match sqlx::query_scalar("SELECT COUNT(*) FROM qualidade_devolucao_itens WHERE devolucao_id = $1")
            .bind(id)
            .fetch_one(pool)
            .await
        {
            Ok(c) => c,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        };
    if count == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Inclua itens antes de receber" })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucoes
        SET status = 'recebido',
            received_by = $2,
            received_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND status = 'rascunho'
        "#,
    )
    .bind(id)
    .bind(&ctx.display_name)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução não encontrada ou não está em rascunho" })),
        )
            .into_response(),
        Ok(_) => match load_full(pool, id).await {
            Ok(o) => (StatusCode::OK, Json(o)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn iniciar_conferencia(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucoes
        SET status = 'em_conferencia', updated_at = NOW()
        WHERE id = $1 AND status IN ('recebido', 'em_conferencia')
        "#,
    )
    .bind(id)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução precisa estar recebida" })),
        )
            .into_response(),
        Ok(_) => match load_full(pool, id).await {
            Ok(o) => (StatusCode::OK, Json(o)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn conferir_item(
    State(state): State<Arc<AppState>>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<ConferirItemRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if !matches!(status.as_str(), "recebido" | "em_conferencia") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Conferência só em status recebido/em_conferencia" })),
        )
            .into_response();
    }

    if status == "recebido" {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET status = 'em_conferencia', updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await;
    }

    let disposicao = match payload.disposicao.as_deref() {
        Some(d) => match normalize_disposicao(d) {
            Ok(v) => v,
            Err(e) => {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
            }
        },
        None => None,
    };

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucao_itens
        SET qty_conferida = COALESCE($3, qty_conferida),
            analise_obs = COALESCE($4, analise_obs),
            disposicao = COALESCE($5, disposicao),
            disposicao_obs = COALESCE($6, disposicao_obs),
            lotes = COALESCE(NULLIF($7, ''), lotes),
            caixa_fechada = COALESCE($8, caixa_fechada),
            unidades_por_caixa = COALESCE($9, unidades_por_caixa)
        WHERE id = $1 AND devolucao_id = $2
        "#,
    )
    .bind(item_id)
    .bind(id)
    .bind(payload.qty_conferida)
    .bind(&payload.analise_obs)
    .bind(disposicao)
    .bind(&payload.disposicao_obs)
    .bind(payload.lotes.as_deref().map(str::trim))
    .bind(payload.caixa_fechada)
    .bind(payload.unidades_por_caixa)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado" })),
        )
            .into_response(),
        Ok(_) => {
            let _ = sqlx::query(
                "UPDATE qualidade_devolucoes SET updated_at = NOW() WHERE id = $1",
            )
            .bind(id)
            .execute(pool)
            .await;
            match load_full(pool, id).await {
                Ok(o) => (StatusCode::OK, Json(o)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn dividir_item(
    State(state): State<Arc<AppState>>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<DividirItemRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    };
    if !matches!(status.as_str(), "recebido" | "em_conferencia") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só é possível separar a quantidade durante a conferência." })),
        )
            .into_response();
    }
    let row = match sqlx::query(
        "SELECT qty, item_code, description, lotes, caixa_fechada, unidades_por_caixa FROM qualidade_devolucao_itens WHERE id = $1 AND devolucao_id = $2",
    )
    .bind(item_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(row)) => row,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "Item não encontrado" }))).into_response();
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    };
    let qty: f64 = row.get(0);
    let code: String = row.get(1);
    let description: String = row.get(2);
    let lotes: String = row.get(3);
    let caixa_fechada: bool = row.get(4);
    let unidades_por_caixa: Option<i32> = row.get(5);
    if !(payload.qty > 0.0) || payload.qty >= qty {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A quantidade separada precisa ser menor que a do item." })),
        )
            .into_response();
    }
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    };

    let all_items = match sqlx::query(
        "SELECT id FROM qualidade_devolucao_itens WHERE devolucao_id = $1 ORDER BY sort_order ASC, id ASC"
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    {
        Ok(items) => items,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    };

    let mut target_order = 0i32;
    for (idx, r) in all_items.iter().enumerate() {
        let current_id = crate::core::pg_row::pg_i64(r, 0);
        let new_order = (idx as i32) * 10;
        if current_id == item_id {
            target_order = new_order;
        }
        if let Err(e) = sqlx::query("UPDATE qualidade_devolucao_itens SET sort_order = $1 WHERE id = $2")
            .bind(new_order)
            .bind(current_id)
            .execute(&mut *tx)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }

    if let Err(e) = sqlx::query(
        r#"
        UPDATE qualidade_devolucao_itens
        SET qty = qty - $3,
            qty_conferida = CASE
                WHEN qty_conferida IS NULL THEN NULL
                WHEN qty_conferida > qty - $3 THEN qty - $3
                ELSE qty_conferida
            END
        WHERE id = $1 AND devolucao_id = $2
        "#,
    )
    .bind(item_id)
    .bind(id)
    .bind(payload.qty)
    .execute(&mut *tx)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    if let Err(e) = sqlx::query(
        r#"
        INSERT INTO qualidade_devolucao_itens
            (devolucao_id, item_code, description, qty, lotes, sort_order, caixa_fechada, unidades_por_caixa)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(id)
    .bind(code)
    .bind(description)
    .bind(payload.qty)
    .bind(lotes)
    .bind(target_order + 1)
    .bind(caixa_fechada)
    .bind(unidades_por_caixa)
    .execute(&mut *tx)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    if status == "recebido" {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET status = 'em_conferencia', updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn fechar_cq(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let pending: i64 = match sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1 AND (disposicao IS NULL OR disposicao = '')
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if pending > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Todos os itens precisam de um destino" })),
        )
            .into_response();
    }

    let sem_qtde: i64 = match sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1 AND (qty_conferida IS NULL OR qty_conferida <= 0)
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if sem_qtde > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Todos os itens precisam de quantidade conferida" })),
        )
            .into_response();
    }

    let fq_pendente: i64 = match sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1
          AND disposicao = 'analise_fq'
          AND (fq_resultado IS NULL OR fq_resultado NOT IN ('AP', 'RP'))
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if fq_pendente > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Itens em análise FQ precisam de parecer AP ou RP" })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucoes
        SET status = 'disposto', cq_by = $2, cq_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status IN ('em_conferencia', 'recebido')
        "#,
    )
    .bind(id)
    .bind(&ctx.display_name)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução não está em conferência" })),
        )
            .into_response(),
        Ok(_) => {
            if let Err(e) = refresh_status_from_items(pool, id).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
            match load_full(pool, id).await {
                Ok(o) => (StatusCode::OK, Json(o)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn marcar_erp_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<ErpItemRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let disposicao: Option<String> = match sqlx::query_scalar(
        "SELECT disposicao FROM qualidade_devolucao_itens WHERE id = $1 AND devolucao_id = $2",
    )
    .bind(item_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(value) => value,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let retorno_estoque = disposicao.as_deref() == Some("retornar_estoque");
    if !retorno_estoque
        && !matches!(
            status.as_str(),
            "disposto" | "parcialmente_lancado" | "finalizado"
        )
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só dá para marcar o retorno em itens que voltam para o estoque" })),
        )
            .into_response();
    }

    let erp = payload.status.trim().to_lowercase();
    if erp != "em_processo" && erp != "lancado" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "status deve ser em_processo ou lancado" })),
        )
            .into_response();
    }

    let res = if erp == "lancado" {
        sqlx::query(
            r#"
            UPDATE qualidade_devolucao_itens
            SET erp_status = 'lancado', erp_by = $3, erp_at = NOW()
            WHERE id = $1 AND devolucao_id = $2
            "#,
        )
        .bind(item_id)
        .bind(id)
        .bind(&ctx.display_name)
        .execute(pool)
        .await
    } else {
        sqlx::query(
            r#"
            UPDATE qualidade_devolucao_itens
            SET erp_status = 'em_processo', erp_by = NULL, erp_at = NULL
            WHERE id = $1 AND devolucao_id = $2
            "#,
        )
        .bind(item_id)
        .bind(id)
        .execute(pool)
        .await
    };

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado" })),
        )
            .into_response(),
        Ok(_) => {
            if let Err(e) = refresh_status_from_items(pool, id).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
            match load_full(pool, id).await {
                Ok(o) => (StatusCode::OK, Json(o)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct LookupQuery {
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoteSpecsQuery {
    pub lote: Option<String>,
    pub code: Option<String>,
}

pub async fn lookup_item(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LookupQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let q = query.q.unwrap_or_default();
    let q = q.trim();
    if q.len() < 2 {
        return Json(Vec::<ItemLookupOut>::new()).into_response();
    }
    let pattern = format!("%{q}%");
    let prefix = format!("{q}%");

    let rows = match sqlx::query(
        r#"
        SELECT
            l.lote,
            TRIM(l.product_code) AS product_code,
            COALESCE(p.descricao, l.product_code) AS description,
            l.ph,
            l.viscosidade,
            l.densidade,
            p.qtde_cx
        FROM erp_lotes_laudos l
        LEFT JOIN produtos p ON TRIM(p.codigo) = TRIM(l.product_code)
        WHERE l.lote ILIKE $1 OR l.product_code ILIKE $1 OR p.descricao ILIKE $1
        ORDER BY
            CASE WHEN l.lote ILIKE $2 THEN 0
                 WHEN l.product_code ILIKE $2 THEN 1
                 ELSE 2 END,
            l.data_lote DESC NULLS LAST
        LIMIT 15
        "#,
    )
    .bind(&pattern)
    .bind(&prefix)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut out: Vec<ItemLookupOut> = rows
        .into_iter()
        .map(|r| ItemLookupOut {
            lote: r.get(0),
            product_code: r.get(1),
            description: r.get(2),
            ph: r.get(3),
            viscosidade: r.get(4),
            densidade: r.get(5),
            unidades_por_caixa: r.get(6),
        })
        .collect();

    let prod_rows = match sqlx::query(
        r#"
        SELECT
            TRIM(codigo) AS codigo,
            COALESCE(descricao, codigo) AS descricao,
            qtde_cx
        FROM produtos
        WHERE codigo ILIKE $1 OR descricao ILIKE $1
        ORDER BY
            CASE WHEN codigo ILIKE $2 THEN 0
                 WHEN descricao ILIKE $2 THEN 1
                 ELSE 2 END,
            codigo
        LIMIT 10
        "#,
    )
    .bind(&pattern)
    .bind(&prefix)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    for r in prod_rows {
        let code: String = r.get(0);
        let desc: String = r.get(1);
        let upc: Option<i32> = r.get(2);

        let is_exact = code.eq_ignore_ascii_case(q);
        let already_present = out.iter().any(|item| item.product_code.eq_ignore_ascii_case(&code) && item.lote.is_empty());

        if !already_present {
            let item_out = ItemLookupOut {
                lote: String::new(),
                product_code: code.clone(),
                description: desc,
                ph: None,
                viscosidade: None,
                densidade: None,
                unidades_por_caixa: upc,
            };
            if is_exact {
                out.insert(0, item_out);
            } else if out.len() < 20 {
                out.push(item_out);
            }
        }
    }

    out.truncate(15);
    Json(out).into_response()
}

pub async fn lote_specs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LoteSpecsQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let lote = query.lote.unwrap_or_default();
    let lote = lote.trim();
    if lote.is_empty() {
        return Json(LoteSpecsOut {
            ph: None,
            viscosidade: None,
            densidade: None,
        })
        .into_response();
    }
    let code = query.code.unwrap_or_default();
    let code = code.trim();

    let row = sqlx::query(
        r#"
        SELECT ph, viscosidade, densidade
        FROM erp_lotes_laudos
        WHERE lote = $1 AND ($2 = '' OR product_code = $2)
        ORDER BY data_lote DESC NULLS LAST
        LIMIT 1
        "#,
    )
    .bind(lote)
    .bind(code)
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some(r)) => Json(LoteSpecsOut {
            ph: r.get(0),
            viscosidade: r.get(1),
            densidade: r.get(2),
        })
        .into_response(),
        Ok(None) => Json(LoteSpecsOut {
            ph: None,
            viscosidade: None,
            densidade: None,
        })
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn salvar_analise_fq(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<AnaliseFqRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let resultado = payload.resultado.trim().to_uppercase();
    if resultado != "AP" && resultado != "RP" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Resultado FQ deve ser AP ou RP" })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if !matches!(status.as_str(), "recebido" | "em_conferencia") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Análise FQ só durante a conferência" })),
        )
            .into_response();
    }

    let item = match sqlx::query(
        "SELECT lotes, item_code FROM qualidade_devolucao_itens WHERE id = $1 AND devolucao_id = $2",
    )
    .bind(item_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Item não encontrado" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let lotes: String = item.get(0);
    let item_code: String = item.get(1);
    let lote = lotes.split([',', ';', ' ']).find(|s| !s.trim().is_empty()).unwrap_or("").trim();

    let specs = sqlx::query(
        r#"
        SELECT ph, viscosidade, densidade
        FROM erp_lotes_laudos
        WHERE lote = $1 AND ($2 = '' OR product_code = $2)
        ORDER BY data_lote DESC NULLS LAST
        LIMIT 1
        "#,
    )
    .bind(lote)
    .bind(item_code.trim())
    .fetch_optional(pool)
    .await;

    let (ph_o, visc_o, dens_o): (Option<f64>, Option<f64>, Option<f64>) = match specs {
        Ok(Some(r)) => (r.get(0), r.get(1), r.get(2)),
        Ok(None) => (None, None, None),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let disposicao = if resultado == "RP" {
        "descartar"
    } else {
        match payload.disposicao_ap.as_deref().map(str::trim) {
            Some("trocar_embalagem") => "trocar_embalagem",
            _ => "retornar_estoque",
        }
    };

    if status == "recebido" {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET status = 'em_conferencia', updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await;
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucao_itens
        SET fq_ph_original = $3,
            fq_viscosidade_original = $4,
            fq_densidade_original = $5,
            fq_ph_medido = $6,
            fq_viscosidade_medido = $7,
            fq_densidade_medido = $8,
            fq_resultado = $9,
            fq_responsavel = $10,
            fq_observacao = $11,
            fq_at = NOW(),
            disposicao = $12
        WHERE id = $1 AND devolucao_id = $2
        "#,
    )
    .bind(item_id)
    .bind(id)
    .bind(ph_o)
    .bind(visc_o)
    .bind(dens_o)
    .bind(payload.ph_medido)
    .bind(payload.viscosidade_medido)
    .bind(payload.densidade_medido)
    .bind(&resultado)
    .bind(&ctx.display_name)
    .bind(payload.observacao.as_deref().map(str::trim))
    .bind(disposicao)
    .execute(pool)
    .await;

    match res {
        Ok(_) => match load_full(pool, id).await {
            Ok(o) => (StatusCode::OK, Json(o)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

fn foto_mime(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".heic") || lower.ends_with(".heif") {
        "image/heic"
    } else {
        "image/jpeg"
    }
}

pub async fn upload_item_foto(
    State(state): State<Arc<AppState>>,
    Path((id, item_id)): Path<(i64, i64)>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let exists: Option<i64> = match sqlx::query_scalar(
        "SELECT id FROM qualidade_devolucao_itens WHERE id = $1 AND devolucao_id = $2",
    )
    .bind(item_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if exists.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado" })),
        )
            .into_response();
    }

    let mut filename = String::from("foto.jpg");
    let mut bytes: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Some(name) = field.file_name() {
                filename = name.to_string();
            }
            match field.bytes().await {
                Ok(b) => bytes = Some(b.to_vec()),
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": e.to_string() })),
                    )
                        .into_response();
                }
            }
        }
    }
    let Some(data) = bytes else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo não enviado" })),
        )
            .into_response();
    };
    if data.is_empty() || data.len() > 8 * 1024 * 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A foto precisa ter até 8 MB" })),
        )
            .into_response();
    }

    let ext = filename
        .rsplit('.')
        .next()
        .unwrap_or("jpg")
        .to_lowercase();
    let ext = match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "heic" | "heif" => ext,
        _ => "jpg".to_string(),
    };
    let rel = format!("devolucoes/{id}/{item_id}.{ext}");
    let abs = crate::core::app_config::saves_dir().join(&rel);
    if let Some(parent) = abs.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    }
    if let Err(e) = std::fs::write(&abs, &data) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = sqlx::query(
        "UPDATE qualidade_devolucao_itens SET foto_path = $1 WHERE id = $2 AND devolucao_id = $3",
    )
    .bind(&rel)
    .bind(item_id)
    .bind(id)
    .execute(pool)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn get_item_foto(
    State(state): State<Arc<AppState>>,
    Path((id, item_id)): Path<(i64, i64)>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let rel: Option<String> = match sqlx::query(
        "SELECT foto_path FROM qualidade_devolucao_itens WHERE id = $1 AND devolucao_id = $2",
    )
    .bind(item_id)
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(r)) => r.get(0),
        Ok(None) => None,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let Some(rel) = rel.filter(|s| !s.trim().is_empty()) else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Foto não encontrada" })),
        )
            .into_response();
    };
    let abs = crate::core::app_config::saves_dir().join(&rel);
    match std::fs::read(&abs) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, foto_mime(&rel))
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Falha ao ler a foto" })),
                )
                    .into_response()
            }),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Foto não encontrada" })),
        )
            .into_response(),
    }
}

pub async fn delete_devolucao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let res =
        sqlx::query("DELETE FROM qualidade_devolucoes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Devolução não encontrada" })),
        )
            .into_response(),
        Ok(_) => {
            let dir = crate::core::app_config::saves_dir()
                .join("devolucoes")
                .join(id.to_string());
            let _ = std::fs::remove_dir_all(dir);
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
