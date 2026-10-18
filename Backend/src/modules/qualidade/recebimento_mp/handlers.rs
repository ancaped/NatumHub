use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{Datelike, NaiveDate, Utc};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use super::models::{
    AmostraItem, CreateAmostraRequest, CreateLaudoRequest, ErpFilterQuery, LaudoEnsaio, LaudoItem,
    RecebimentoErpItem, UpdateAmostraRequest, UpdateLaudoRequest,
};

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS erp_recebimentos_insumos (
            registro INT PRIMARY KEY,
            cod_fornecedor INT,
            fornecedor TEXT,
            nota_fiscal INT,
            data_emissao TIMESTAMPTZ,
            codigo_insumo TEXT NOT NULL,
            descricao_insumo TEXT NOT NULL,
            unidade TEXT,
            quantidade NUMERIC(14, 4) NOT NULL DEFAULT 0,
            valor_unitario NUMERIC(14, 4),
            valor_total NUMERIC(14, 4),
            data_entrada DATE,
            lote_fornecedor TEXT,
            data_validade DATE,
            tipo_recebimento TEXT,
            codigo_recebimento TEXT,
            observacoes TEXT,
            status_erp TEXT,
            usuario TEXT,
            num_registro INT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Falha ao inicializar erp_recebimentos_insumos: {}", e))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS recebimento_mp_laudos (
            id SERIAL PRIMARY KEY,
            codigo_laudo TEXT UNIQUE NOT NULL,
            registro_erp INT,
            codigo_recebimento TEXT,
            codigo_insumo TEXT NOT NULL,
            descricao_insumo TEXT NOT NULL,
            fornecedor TEXT NOT NULL,
            nota_fiscal INT,
            lote_fornecedor TEXT NOT NULL,
            quantidade NUMERIC(14, 4) NOT NULL,
            unidade TEXT NOT NULL DEFAULT 'KG',
            data_entrada DATE NOT NULL,
            data_validade DATE,
            data_laudo DATE NOT NULL DEFAULT CURRENT_DATE,
            parecer TEXT NOT NULL DEFAULT 'APROVADO',
            responsavel_cq TEXT NOT NULL,
            testes JSONB NOT NULL DEFAULT '[]'::jsonb,
            observacoes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Falha ao inicializar recebimento_mp_laudos: {}", e))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS recebimento_mp_amostras (
            id SERIAL PRIMARY KEY,
            codigo_amostra TEXT UNIQUE NOT NULL,
            codigo_laudo TEXT,
            registro_erp INT,
            codigo_insumo TEXT NOT NULL,
            descricao_insumo TEXT NOT NULL,
            fornecedor TEXT NOT NULL,
            lote_fornecedor TEXT NOT NULL,
            data_entrada DATE NOT NULL,
            data_validade DATE,
            quantidade_retida TEXT NOT NULL,
            local_armazenamento TEXT,
            status TEXT NOT NULL DEFAULT 'RETIDA',
            responsavel TEXT NOT NULL,
            observacoes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Falha ao inicializar recebimento_mp_amostras: {}", e))?;

    Ok(())
}

fn parse_br_or_iso_date(s: &str) -> Option<NaiveDate> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(d) = NaiveDate::parse_from_str(trimmed, "%d/%m/%Y") {
        return Some(d);
    }
    if let Ok(d) = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        return Some(d);
    }
    None
}

// -----------------------------------------------------------------------------
#[derive(Debug, serde::Deserialize)]
pub struct SyncErpQuery {
    pub full: Option<bool>,
}

// -----------------------------------------------------------------------------
// ERP Recebimentos (PostgreSQL espelhado via Passo Q)
// -----------------------------------------------------------------------------
pub async fn list_erp_recebimentos(
    State(state): State<Arc<AppState>>,
    Query(filter): Query<ErpFilterQuery>,
) -> Result<Json<Vec<RecebimentoErpItem>>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let limit = filter.limit.unwrap_or(200).clamp(1, 5000);
    let offset = filter.offset.unwrap_or(0).max(0);
    let class_filter = filter
        .classificacao
        .as_deref()
        .unwrap_or("MATERIA_PRIMA")
        .trim()
        .to_uppercase();

    let class_sql = match class_filter.as_str() {
        "MATERIA_PRIMA" | "MP" => "AND (c.id = 'cat_mp' OR c.name ILIKE '%frang%' OR i.codigo_insumo LIKE '9.15%' OR i.codigo_insumo ILIKE 'MP%')",
        "EMBALAGENS" | "EMB" => "AND (c.id = 'cat_emb' OR c.name ILIKE '%caixa%' OR c.name ILIKE '%valvul%' OR c.name ILIKE '%bepack%' OR c.name ILIKE '%alian%' OR c.name ILIKE '%inplavel%' OR i.codigo_insumo LIKE '9.06%' OR i.codigo_insumo LIKE '9.11%' OR i.codigo_insumo LIKE '9.13%' OR i.codigo_insumo LIKE '9.14%' OR i.codigo_insumo LIKE '9.31%' OR i.codigo_insumo LIKE '9.46%')",
        "ROTULOS" | "ROT" => "AND (c.name ILIKE '%rotulo%' OR i.descricao_insumo ILIKE 'ROT %' OR i.codigo_insumo LIKE '9.09%' OR i.codigo_insumo LIKE '9.32%')",
        "OUTROS" => "AND NOT (c.id = 'cat_mp' OR c.name ILIKE '%frang%' OR i.codigo_insumo LIKE '9.15%' OR i.codigo_insumo ILIKE 'MP%' OR c.name ILIKE '%rotulo%' OR i.descricao_insumo ILIKE 'ROT %' OR i.codigo_insumo LIKE '9.09%' OR i.codigo_insumo LIKE '9.32%' OR c.id = 'cat_emb' OR c.name ILIKE '%caixa%' OR c.name ILIKE '%valvul%' OR c.name ILIKE '%bepack%' OR c.name ILIKE '%alian%' OR c.name ILIKE '%inplavel%' OR i.codigo_insumo LIKE '9.06%' OR i.codigo_insumo LIKE '9.11%' OR i.codigo_insumo LIKE '9.13%' OR i.codigo_insumo LIKE '9.14%' OR i.codigo_insumo LIKE '9.31%' OR i.codigo_insumo LIKE '9.46%')",
        _ => "", // "TODOS"
    };

    let base_select = format!(
        r#"
        SELECT 
            i.registro,
            COALESCE(i.fornecedor, '') AS fornecedor,
            COALESCE(i.nota_fiscal, 0) AS nota,
            i.codigo_insumo AS codigo_ref,
            i.descricao_insumo AS insumo_desc,
            COALESCE(i.unidade, 'KG') AS unidade,
            CAST(i.quantidade AS FLOAT8) AS quantidade,
            COALESCE(TO_CHAR(i.data_entrada, 'DD/MM/YYYY'), '') AS data_entrada_str,
            COALESCE(i.lote_fornecedor, '') AS lote_fornec,
            COALESCE(TO_CHAR(i.data_validade, 'DD/MM/YYYY'), '') AS data_validade_str,
            COALESCE(i.codigo_recebimento, '') AS codigo_receb,
            COALESCE(i.status_erp, '') AS status_erp,
            COALESCE(i.usuario, '') AS usuario_erp,
            i.num_registro AS n_registro,
            l.id AS laudo_id,
            l.codigo_laudo,
            l.parecer AS laudo_parecer,
            CASE 
                WHEN c.id = 'cat_mp' OR c.name ILIKE '%frang%' OR i.codigo_insumo LIKE '9.15%' OR i.codigo_insumo ILIKE 'MP%' THEN 'MATERIA_PRIMA'
                WHEN c.name ILIKE '%rotulo%' OR i.descricao_insumo ILIKE 'ROT %' OR i.codigo_insumo LIKE '9.09%' OR i.codigo_insumo LIKE '9.32%' THEN 'ROTULOS'
                WHEN c.id = 'cat_emb' OR c.name ILIKE '%caixa%' OR c.name ILIKE '%valvul%' OR c.name ILIKE '%bepack%' OR c.name ILIKE '%alian%' OR c.name ILIKE '%inplavel%'
                     OR i.codigo_insumo LIKE '9.06%' OR i.codigo_insumo LIKE '9.11%' OR i.codigo_insumo LIKE '9.13%' OR i.codigo_insumo LIKE '9.14%' OR i.codigo_insumo LIKE '9.31%' OR i.codigo_insumo LIKE '9.46%' THEN 'EMBALAGENS'
                ELSE 'OUTROS'
            END AS classificacao
        FROM erp_recebimentos_insumos i
        LEFT JOIN items it ON it.code = i.codigo_insumo
        LEFT JOIN categories c ON c.id = it.category_id
        LEFT JOIN recebimento_mp_laudos l ON l.registro_erp = i.registro
        WHERE 1=1
        {}
        "#,
        class_sql
    );

    let rows = if let Some(ref term) = filter.search.as_ref().filter(|s| !s.trim().is_empty()) {
        let pattern = format!("%{}%", term.trim());
        let q = format!(
            r#"
            {}
            AND (
                i.descricao_insumo ILIKE $1
                OR i.codigo_insumo ILIKE $1
                OR i.lote_fornecedor ILIKE $1
                OR i.fornecedor ILIKE $1
                OR i.codigo_recebimento ILIKE $1
                OR CAST(i.nota_fiscal AS TEXT) ILIKE $1
            )
            ORDER BY i.data_entrada DESC NULLS LAST, i.registro DESC
            LIMIT $2 OFFSET $3
            "#,
            base_select
        );
        sqlx::query(&q)
            .bind(&pattern)
            .bind(limit)
            .bind(offset)
            .fetch_all(state.db.pool())
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro consultando recebimentos: {e}")))?
    } else {
        let q = format!(
            r#"
            {}
            ORDER BY i.data_entrada DESC NULLS LAST, i.registro DESC
            LIMIT $1 OFFSET $2
            "#,
            base_select
        );
        sqlx::query(&q)
            .bind(limit)
            .bind(offset)
            .fetch_all(state.db.pool())
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro consultando recebimentos: {e}")))?
    };

    let items = rows
        .into_iter()
        .map(|r| {
            let registro: i32 = r.get("registro");
            let laudo_id: Option<i32> = r.get("laudo_id");
            let codigo_laudo: Option<String> = r.get("codigo_laudo");
            let laudo_parecer: Option<String> = r.get("laudo_parecer");

            RecebimentoErpItem {
                registro,
                fornecedor: r.get("fornecedor"),
                nota: r.get("nota"),
                codigo_ref: r.get("codigo_ref"),
                insumo_desc: r.get("insumo_desc"),
                unidade: r.get("unidade"),
                quantidade: r.get("quantidade"),
                data_entrada: r.get("data_entrada_str"),
                lote_fornec: r.get("lote_fornec"),
                data_validade: r.get("data_validade_str"),
                codigo_receb: r.get("codigo_receb"),
                status_erp: r.get("status_erp"),
                usuario_erp: r.get("usuario_erp"),
                n_registro: r.get("n_registro"),
                laudo_id,
                codigo_laudo,
                laudo_parecer,
                classificacao: r.get("classificacao"),
            }
        })
        .collect();

    Ok(Json(items))
}

pub async fn sync_erp_recebimentos(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SyncErpQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let force_full = q.full.unwrap_or(false);
    match crate::core::legacy_db::sync_recebe_insumos(state.db.pool(), force_full).await {
        Ok((count, _)) => Ok(Json(json!({
            "success": true,
            "synced": count,
            "message": if count > 0 {
                format!("{} recebimentos sincronizados com sucesso.", count)
            } else {
                "Recebimentos já estão atualizados com o ERP.".to_string()
            }
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Falha na sincronização do ERP: {}", e),
        )),
    }
}

// -----------------------------------------------------------------------------
// Laudos CQ
// -----------------------------------------------------------------------------
pub async fn list_laudos(
    State(state): State<Arc<AppState>>,
    Query(filter): Query<ErpFilterQuery>,
) -> Result<Json<Vec<LaudoItem>>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let search = filter.search.unwrap_or_default().trim().to_string();
    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    let offset = filter.offset.unwrap_or(0).max(0);

    let rows = if search.is_empty() {
        sqlx::query(
            r#"
            SELECT id, codigo_laudo, COALESCE(registro_erp, 0) AS registro_erp,
                   COALESCE(codigo_recebimento, '') AS codigo_receb, codigo_insumo AS codigo_ref,
                   descricao_insumo AS insumo_nome, fornecedor AS fornecedor_nome,
                   COALESCE(nota_fiscal::text, '') AS nota_fiscal, lote_fornecedor,
                   CAST(quantidade AS FLOAT8) AS quantidade_total, unidade,
                   data_entrada, data_validade, data_laudo AS data_analise,
                   responsavel_cq, parecer, testes AS ensaios, COALESCE(observacoes, '') AS observacoes,
                   created_at, updated_at
            FROM recebimento_mp_laudos
            ORDER BY data_laudo DESC, id DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await
    } else {
        let term = format!("%{}%", search);
        sqlx::query(
            r#"
            SELECT id, codigo_laudo, COALESCE(registro_erp, 0) AS registro_erp,
                   COALESCE(codigo_recebimento, '') AS codigo_receb, codigo_insumo AS codigo_ref,
                   descricao_insumo AS insumo_nome, fornecedor AS fornecedor_nome,
                   COALESCE(nota_fiscal::text, '') AS nota_fiscal, lote_fornecedor,
                   CAST(quantidade AS FLOAT8) AS quantidade_total, unidade,
                   data_entrada, data_validade, data_laudo AS data_analise,
                   responsavel_cq, parecer, testes AS ensaios, COALESCE(observacoes, '') AS observacoes,
                   created_at, updated_at
            FROM recebimento_mp_laudos
            WHERE codigo_laudo ILIKE $1
               OR descricao_insumo ILIKE $1
               OR fornecedor ILIKE $1
               OR lote_fornecedor ILIKE $1
               OR codigo_recebimento ILIKE $1
               OR CAST(nota_fiscal AS TEXT) ILIKE $1
            ORDER BY data_laudo DESC, id DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(term)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro listando laudos: {}", e)))?;

    let mut result = Vec::new();
    for r in rows {
        let ensaios_val: serde_json::Value = r.get("ensaios");
        let ensaios: Vec<LaudoEnsaio> = serde_json::from_value(ensaios_val).unwrap_or_default();

        result.push(LaudoItem {
            id: r.get("id"),
            codigo_laudo: r.get("codigo_laudo"),
            registro_erp: r.get("registro_erp"),
            codigo_receb: r.get("codigo_receb"),
            codigo_ref: r.get("codigo_ref"),
            insumo_nome: r.get("insumo_nome"),
            fornecedor_nome: r.get("fornecedor_nome"),
            nota_fiscal: r.get("nota_fiscal"),
            lote_fornecedor: r.get("lote_fornecedor"),
            quantidade_total: r.get("quantidade_total"),
            unidade: r.get("unidade"),
            data_entrada: r.get("data_entrada"),
            data_validade: r.get("data_validade"),
            data_analise: r.get("data_analise"),
            responsavel_cq: r.get("responsavel_cq"),
            parecer: r.get("parecer"),
            ensaios,
            observacoes: r.get("observacoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        });
    }

    Ok(Json(result))
}

pub async fn get_laudo(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<LaudoItem>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let row = sqlx::query(
        r#"
        SELECT id, codigo_laudo, COALESCE(registro_erp, 0) AS registro_erp,
               COALESCE(codigo_recebimento, '') AS codigo_receb, codigo_insumo AS codigo_ref,
               descricao_insumo AS insumo_nome, fornecedor AS fornecedor_nome,
               COALESCE(nota_fiscal::text, '') AS nota_fiscal, lote_fornecedor,
               CAST(quantidade AS FLOAT8) AS quantidade_total, unidade,
               data_entrada, data_validade, data_laudo AS data_analise,
               responsavel_cq, parecer, testes AS ensaios, COALESCE(observacoes, '') AS observacoes,
               created_at, updated_at
        FROM recebimento_mp_laudos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro buscando laudo: {}", e)))?
    .ok_or((StatusCode::NOT_FOUND, "Laudo não encontrado".to_string()))?;

    let ensaios_val: serde_json::Value = row.get("ensaios");
    let ensaios: Vec<LaudoEnsaio> = serde_json::from_value(ensaios_val).unwrap_or_default();

    Ok(Json(LaudoItem {
        id: row.get("id"),
        codigo_laudo: row.get("codigo_laudo"),
        registro_erp: row.get("registro_erp"),
        codigo_receb: row.get("codigo_receb"),
        codigo_ref: row.get("codigo_ref"),
        insumo_nome: row.get("insumo_nome"),
        fornecedor_nome: row.get("fornecedor_nome"),
        nota_fiscal: row.get("nota_fiscal"),
        lote_fornecedor: row.get("lote_fornecedor"),
        quantidade_total: row.get("quantidade_total"),
        unidade: row.get("unidade"),
        data_entrada: row.get("data_entrada"),
        data_validade: row.get("data_validade"),
        data_analise: row.get("data_analise"),
        responsavel_cq: row.get("responsavel_cq"),
        parecer: row.get("parecer"),
        ensaios,
        observacoes: row.get("observacoes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn create_laudo(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateLaudoRequest>,
) -> Result<Json<LaudoItem>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let current_year = Utc::now().year();
    let year_str = current_year.to_string();

    let next_seq_row = sqlx::query(
        r#"
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(codigo_laudo FROM 'LAU-MP-[0-9]{4}-([0-9]+)') AS INT)
        ), 0) + 1 AS next_seq
        FROM recebimento_mp_laudos
        WHERE codigo_laudo LIKE 'LAU-MP-' || $1 || '-%'
        "#,
    )
    .bind(&year_str)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro gerando sequência de laudo: {}", e)))?;

    let next_seq: i32 = next_seq_row.get("next_seq");
    let codigo_laudo = format!("LAU-MP-{}-{:04}", current_year, next_seq);

    let data_entrada = payload.data_entrada.as_deref().and_then(parse_br_or_iso_date).unwrap_or_else(|| Utc::now().date_naive());
    let data_validade = payload.data_validade.as_deref().and_then(parse_br_or_iso_date);
    let data_analise = payload
        .data_analise
        .as_deref()
        .and_then(parse_br_or_iso_date)
        .unwrap_or_else(|| Utc::now().date_naive());

    let ensaios_json = serde_json::to_value(&payload.ensaios).unwrap_or(json!([]));
    let obs = payload.observacoes.unwrap_or_default();
    let nf_int: Option<i32> = payload.nota_fiscal.parse().ok();

    let row = sqlx::query(
        r#"
        INSERT INTO recebimento_mp_laudos (
            codigo_laudo, registro_erp, codigo_recebimento, codigo_insumo, descricao_insumo,
            fornecedor, nota_fiscal, lote_fornecedor, quantidade, unidade,
            data_entrada, data_validade, data_laudo, responsavel_cq, parecer,
            testes, observacoes, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, NOW(), NOW()
        )
        RETURNING id, created_at, updated_at
        "#,
    )
    .bind(&codigo_laudo)
    .bind(payload.registro_erp)
    .bind(&payload.codigo_receb)
    .bind(&payload.codigo_ref)
    .bind(&payload.insumo_nome)
    .bind(&payload.fornecedor_nome)
    .bind(nf_int)
    .bind(&payload.lote_fornecedor)
    .bind(payload.quantidade_total)
    .bind(&payload.unidade)
    .bind(data_entrada)
    .bind(data_validade)
    .bind(data_analise)
    .bind(&payload.responsavel_cq)
    .bind(&payload.parecer)
    .bind(ensaios_json)
    .bind(&obs)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro salvando laudo: {}", e)))?;

    let new_id: i32 = row.get("id");

    if payload.criar_amostra_retencao.unwrap_or(false) {
        let sample_seq_row = sqlx::query(
            r#"
            SELECT COALESCE(MAX(
                CAST(SUBSTRING(codigo_amostra FROM 'AMO-MP-[0-9]{4}-([0-9]+)') AS INT)
            ), 0) + 1 AS next_seq
            FROM recebimento_mp_amostras
            WHERE codigo_amostra LIKE 'AMO-MP-' || $1 || '-%'
            "#,
        )
        .bind(&year_str)
        .fetch_one(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro gerando código da contraprova: {}", e)))?;

        let sample_seq: i32 = sample_seq_row.get("next_seq");
        let codigo_amostra = format!("AMO-MP-{}-{:04}", current_year, sample_seq);

        let localizacao = payload.localizacao_amostra.unwrap_or_else(|| "Armário de Contraprovas".to_string());
        let qtd_amostra = payload.quantidade_amostra.unwrap_or_else(|| "100 g".to_string());

        let _ = sqlx::query(
            r#"
            INSERT INTO recebimento_mp_amostras (
                codigo_amostra, codigo_laudo, registro_erp, codigo_insumo, descricao_insumo,
                fornecedor, lote_fornecedor, data_entrada, data_validade,
                local_armazenamento, quantidade_retida, status, responsavel,
                observacoes, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, 'RETIDA', $12,
                $13, NOW(), NOW()
            )
            "#,
        )
        .bind(&codigo_amostra)
        .bind(&codigo_laudo)
        .bind(payload.registro_erp)
        .bind(&payload.codigo_ref)
        .bind(&payload.insumo_nome)
        .bind(&payload.fornecedor_nome)
        .bind(&payload.lote_fornecedor)
        .bind(data_entrada)
        .bind(data_validade)
        .bind(&localizacao)
        .bind(&qtd_amostra)
        .bind(&payload.responsavel_cq)
        .bind(&obs)
        .execute(state.db.pool())
        .await;
    }

    Ok(Json(LaudoItem {
        id: new_id,
        codigo_laudo,
        registro_erp: payload.registro_erp,
        codigo_receb: payload.codigo_receb,
        codigo_ref: payload.codigo_ref,
        insumo_nome: payload.insumo_nome,
        fornecedor_nome: payload.fornecedor_nome,
        nota_fiscal: payload.nota_fiscal,
        lote_fornecedor: payload.lote_fornecedor,
        quantidade_total: payload.quantidade_total,
        unidade: payload.unidade,
        data_entrada: Some(data_entrada),
        data_validade,
        data_analise,
        responsavel_cq: payload.responsavel_cq,
        parecer: payload.parecer,
        ensaios: payload.ensaios,
        observacoes: obs,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn update_laudo(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateLaudoRequest>,
) -> Result<Json<LaudoItem>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let data_analise = payload
        .data_analise
        .as_deref()
        .and_then(parse_br_or_iso_date)
        .unwrap_or_else(|| Utc::now().date_naive());

    let ensaios_json = serde_json::to_value(&payload.ensaios).unwrap_or(json!([]));
    let obs = payload.observacoes.unwrap_or_default();

    let row = sqlx::query(
        r#"
        UPDATE recebimento_mp_laudos
        SET data_laudo = $1,
            responsavel_cq = $2,
            parecer = $3,
            testes = $4,
            observacoes = $5,
            updated_at = NOW()
        WHERE id = $6
        RETURNING id, codigo_laudo, COALESCE(registro_erp, 0) AS registro_erp,
                  COALESCE(codigo_recebimento, '') AS codigo_receb, codigo_insumo AS codigo_ref,
                  descricao_insumo AS insumo_nome, fornecedor AS fornecedor_nome,
                  COALESCE(nota_fiscal::text, '') AS nota_fiscal, lote_fornecedor,
                  CAST(quantidade AS FLOAT8) AS quantidade_total, unidade,
                  data_entrada, data_validade, data_laudo AS data_analise,
                  responsavel_cq, parecer, testes AS ensaios, COALESCE(observacoes, '') AS observacoes,
                  created_at, updated_at
        "#,
    )
    .bind(data_analise)
    .bind(&payload.responsavel_cq)
    .bind(&payload.parecer)
    .bind(ensaios_json)
    .bind(&obs)
    .bind(id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro atualizando laudo: {}", e)))?
    .ok_or((StatusCode::NOT_FOUND, "Laudo não encontrado".to_string()))?;

    let ensaios_val: serde_json::Value = row.get("ensaios");
    let ensaios: Vec<LaudoEnsaio> = serde_json::from_value(ensaios_val).unwrap_or_default();

    Ok(Json(LaudoItem {
        id: row.get("id"),
        codigo_laudo: row.get("codigo_laudo"),
        registro_erp: row.get("registro_erp"),
        codigo_receb: row.get("codigo_receb"),
        codigo_ref: row.get("codigo_ref"),
        insumo_nome: row.get("insumo_nome"),
        fornecedor_nome: row.get("fornecedor_nome"),
        nota_fiscal: row.get("nota_fiscal"),
        lote_fornecedor: row.get("lote_fornecedor"),
        quantidade_total: row.get("quantidade_total"),
        unidade: row.get("unidade"),
        data_entrada: row.get("data_entrada"),
        data_validade: row.get("data_validade"),
        data_analise: row.get("data_analise"),
        responsavel_cq: row.get("responsavel_cq"),
        parecer: row.get("parecer"),
        ensaios,
        observacoes: row.get("observacoes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn delete_laudo(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let res = sqlx::query("DELETE FROM recebimento_mp_laudos WHERE id = $1")
        .bind(id)
        .execute(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro excluindo laudo: {}", e)))?;

    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Laudo não encontrado".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// -----------------------------------------------------------------------------
// Amostras de Retenção / Contraprovas
// -----------------------------------------------------------------------------
pub async fn list_amostras(
    State(state): State<Arc<AppState>>,
    Query(filter): Query<ErpFilterQuery>,
) -> Result<Json<Vec<AmostraItem>>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let search = filter.search.unwrap_or_default().trim().to_string();
    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    let offset = filter.offset.unwrap_or(0).max(0);

    let rows = if search.is_empty() {
        sqlx::query(
            r#"
            SELECT a.id, a.codigo_amostra, l.id AS laudo_id, COALESCE(l.codigo_recebimento, '') AS codigo_receb,
                   a.descricao_insumo AS insumo_nome, a.lote_fornecedor AS lote, a.fornecedor,
                   a.data_entrada AS data_coleta, a.data_validade AS data_validade_retencao,
                   COALESCE(a.local_armazenamento, 'Armário de Contraprovas') AS localizacao,
                   COALESCE(a.quantidade_retida, '100 g') AS quantidade_amostra,
                   a.status, a.responsavel, COALESCE(a.observacoes, '') AS observacoes,
                   a.created_at, a.updated_at
            FROM recebimento_mp_amostras a
            LEFT JOIN recebimento_mp_laudos l ON l.codigo_laudo = a.codigo_laudo
            ORDER BY a.data_entrada DESC, a.id DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await
    } else {
        let term = format!("%{}%", search);
        sqlx::query(
            r#"
            SELECT a.id, a.codigo_amostra, l.id AS laudo_id, COALESCE(l.codigo_recebimento, '') AS codigo_receb,
                   a.descricao_insumo AS insumo_nome, a.lote_fornecedor AS lote, a.fornecedor,
                   a.data_entrada AS data_coleta, a.data_validade AS data_validade_retencao,
                   COALESCE(a.local_armazenamento, 'Armário de Contraprovas') AS localizacao,
                   COALESCE(a.quantidade_retida, '100 g') AS quantidade_amostra,
                   a.status, a.responsavel, COALESCE(a.observacoes, '') AS observacoes,
                   a.created_at, a.updated_at
            FROM recebimento_mp_amostras a
            LEFT JOIN recebimento_mp_laudos l ON l.codigo_laudo = a.codigo_laudo
            WHERE a.codigo_amostra ILIKE $1
               OR a.descricao_insumo ILIKE $1
               OR a.fornecedor ILIKE $1
               OR a.lote_fornecedor ILIKE $1
               OR a.local_armazenamento ILIKE $1
            ORDER BY a.data_entrada DESC, a.id DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(term)
        .bind(limit)
        .bind(offset)
        .fetch_all(state.db.pool())
        .await
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro listando amostras: {}", e)))?;

    let items = rows
        .into_iter()
        .map(|r| AmostraItem {
            id: r.get("id"),
            codigo_amostra: r.get("codigo_amostra"),
            laudo_id: r.get("laudo_id"),
            codigo_receb: r.get("codigo_receb"),
            insumo_nome: r.get("insumo_nome"),
            lote: r.get("lote"),
            fornecedor: r.get("fornecedor"),
            data_coleta: r.get("data_coleta"),
            data_validade_retencao: r.get("data_validade_retencao"),
            localizacao: r.get("localizacao"),
            quantidade_amostra: r.get("quantidade_amostra"),
            status: r.get("status"),
            responsavel: r.get("responsavel"),
            observacoes: r.get("observacoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(items))
}

pub async fn create_amostra(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateAmostraRequest>,
) -> Result<Json<AmostraItem>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let current_year = Utc::now().year();
    let year_str = current_year.to_string();

    let next_seq_row = sqlx::query(
        r#"
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(codigo_amostra FROM 'AMO-MP-[0-9]{4}-([0-9]+)') AS INT)
        ), 0) + 1 AS next_seq
        FROM recebimento_mp_amostras
        WHERE codigo_amostra LIKE 'AMO-MP-' || $1 || '-%'
        "#,
    )
    .bind(&year_str)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro gerando código da contraprova: {}", e)))?;

    let next_seq: i32 = next_seq_row.get("next_seq");
    let codigo_amostra = format!("AMO-MP-{}-{:04}", current_year, next_seq);

    let data_coleta = payload.data_coleta.as_deref().and_then(parse_br_or_iso_date).unwrap_or_else(|| Utc::now().date_naive());
    let data_validade = payload.data_validade_retencao.as_deref().and_then(parse_br_or_iso_date);
    let localizacao = payload.localizacao.unwrap_or_else(|| "Armário de Contraprovas".to_string());
    let quantidade_amostra = payload.quantidade_amostra.unwrap_or_else(|| "100 g".to_string());
    let status = payload.status.unwrap_or_else(|| "RETIDA".to_string());
    let responsavel = payload.responsavel.unwrap_or_else(|| "CQ".to_string());
    let obs = payload.observacoes.unwrap_or_default();

    let codigo_laudo_val = if let Some(lid) = payload.laudo_id {
        sqlx::query_scalar::<_, String>("SELECT codigo_laudo FROM recebimento_mp_laudos WHERE id = $1")
            .bind(lid)
            .fetch_optional(state.db.pool())
            .await
            .unwrap_or(None)
    } else {
        None
    };

    let row = sqlx::query(
        r#"
        INSERT INTO recebimento_mp_amostras (
            codigo_amostra, codigo_laudo, codigo_insumo, descricao_insumo,
            fornecedor, lote_fornecedor, data_entrada, data_validade,
            local_armazenamento, quantidade_retida, status, responsavel,
            observacoes, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, NOW(), NOW()
        )
        RETURNING id, created_at, updated_at
        "#,
    )
    .bind(&codigo_amostra)
    .bind(&codigo_laudo_val)
    .bind("")
    .bind(&payload.insumo_nome)
    .bind(&payload.fornecedor)
    .bind(&payload.lote)
    .bind(data_coleta)
    .bind(data_validade)
    .bind(&localizacao)
    .bind(&quantidade_amostra)
    .bind(&status)
    .bind(&responsavel)
    .bind(&obs)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro salvando contraprova: {}", e)))?;

    Ok(Json(AmostraItem {
        id: row.get("id"),
        codigo_amostra,
        laudo_id: payload.laudo_id,
        codigo_receb: payload.codigo_receb,
        insumo_nome: payload.insumo_nome,
        lote: payload.lote,
        fornecedor: payload.fornecedor,
        data_coleta,
        data_validade_retencao: data_validade,
        localizacao,
        quantidade_amostra,
        status,
        responsavel,
        observacoes: obs,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn update_amostra(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateAmostraRequest>,
) -> Result<Json<AmostraItem>, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let data_validade = payload.data_validade_retencao.as_deref().and_then(parse_br_or_iso_date);
    let obs = payload.observacoes.unwrap_or_default();

    let row = sqlx::query(
        r#"
        UPDATE recebimento_mp_amostras
        SET data_validade = $1,
            local_armazenamento = $2,
            quantidade_retida = $3,
            status = $4,
            responsavel = $5,
            observacoes = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING id, codigo_amostra, codigo_laudo, descricao_insumo AS insumo_nome,
                  lote_fornecedor AS lote, fornecedor, data_entrada AS data_coleta,
                  data_validade AS data_validade_retencao, local_armazenamento AS localizacao,
                  quantidade_retida AS quantidade_amostra, status, responsavel,
                  observacoes, created_at, updated_at
        "#,
    )
    .bind(data_validade)
    .bind(&payload.localizacao)
    .bind(&payload.quantidade_amostra)
    .bind(&payload.status)
    .bind(&payload.responsavel)
    .bind(&obs)
    .bind(id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro atualizando contraprova: {}", e)))?
    .ok_or((StatusCode::NOT_FOUND, "Contraprova não encontrada".to_string()))?;

    Ok(Json(AmostraItem {
        id: row.get("id"),
        codigo_amostra: row.get("codigo_amostra"),
        laudo_id: None,
        codigo_receb: "".to_string(),
        insumo_nome: row.get("insumo_nome"),
        lote: row.get("lote"),
        fornecedor: row.get("fornecedor"),
        data_coleta: row.get("data_coleta"),
        data_validade_retencao: row.get("data_validade_retencao"),
        localizacao: row.get("localizacao"),
        quantidade_amostra: row.get("quantidade_amostra"),
        status: row.get("status"),
        responsavel: row.get("responsavel"),
        observacoes: row.get("observacoes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn delete_amostra(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    ensure_tables(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let res = sqlx::query("DELETE FROM recebimento_mp_amostras WHERE id = $1")
        .bind(id)
        .execute(state.db.pool())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro excluindo contraprova: {}", e)))?;

    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Contraprova não encontrada".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}
