//! Planejamento semanal de produção (quadro de reatores x dias).
//!
//! Regras (normalizar, validar status/alocação, upsert, bloqueio de exclusão) ficam em funções do módulo que
//! recebem conexão e dados; os handlers só extraem, checam permissão, chamam o serviço, auditam e respondem.
//! Exclusão e limpeza de semana são escritas em 2 passos (`executar_em_2_passos`).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, permissao};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/producao/planejamento-semanal",
            get(list_planejamento_semanal).post(save_planejamento_item),
        )
        .route("/api/producao/planejamento-semanal/bulk", put(bulk_save_planejamento))
        .route("/api/producao/planejamento-semanal/:id", delete(delete_planejamento_item))
        .route(
            "/api/producao/planejamento-semanal/:id/confirmar-fisico",
            post(confirm_fisico_planejamento),
        )
        .route("/api/producao/planejamento-semanal/clear", delete(clear_planejamento_semana))
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct PlanejamentoItemDto {
    pub id: String,
    pub week_key: String,
    pub data_planejada: String,
    pub reator_id: String,
    pub codigo_produto: String,
    pub descricao: Option<String>,
    pub quantidade_planejada: f64,
    pub unidade: Option<String>,
    pub base_codigo: Option<String>,
    pub base_nome: Option<String>,
    pub linha_envase: Option<String>,
    pub observacoes: Option<String>,
    pub ordem_status: Option<String>,
    pub lote_erp: Option<String>,
    pub fisico_confirmado_massa: Option<bool>,
    pub fisico_confirmado_embalagem: Option<bool>,
    pub fisico_confirmado_rotulo: Option<bool>,
    pub recipiente_detalhe: Option<String>,
    pub cor_tag: Option<String>,
    pub ordem_sequencia: Option<i32>,
    pub processo_termico: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub batch_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct PlanejamentoQueryParams {
    pub week: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ConfirmFisicoPayload {
    pub massa: Option<bool>,
    pub embalagem: Option<bool>,
    pub rotulo: Option<bool>,
    pub ordem_status: Option<String>,
}

pub async fn list_planejamento_semanal(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PlanejamentoQueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let q = if let Some(ref w) = params.week {
        let sql = r#"
            SELECT id, week_key, data_planejada::text, reator_id, codigo_produto, descricao,
                   quantidade_planejada::float8, unidade, base_codigo, base_nome, linha_envase,
                   observacoes, ordem_status, lote_erp, fisico_confirmado_massa,
                   fisico_confirmado_embalagem, fisico_confirmado_rotulo,
                   recipiente_detalhe, cor_tag, COALESCE(ordem_sequencia, 1), processo_termico,
                   created_at::text, updated_at::text, batch_id
            FROM producao_planejamento_semanal
            WHERE week_key = $1
            ORDER BY data_planejada ASC, COALESCE(ordem_sequencia, 1) ASC, reator_id ASC
        "#;
        sqlx::query(sql).bind(w).fetch_all(pool).await
    } else if let (Some(ref s), Some(ref e)) = (params.start_date, params.end_date) {
        let sql = r#"
            SELECT id, week_key, data_planejada::text, reator_id, codigo_produto, descricao,
                   quantidade_planejada::float8, unidade, base_codigo, base_nome, linha_envase,
                   observacoes, ordem_status, lote_erp, fisico_confirmado_massa,
                   fisico_confirmado_embalagem, fisico_confirmado_rotulo,
                   recipiente_detalhe, cor_tag, COALESCE(ordem_sequencia, 1), processo_termico,
                   created_at::text, updated_at::text, batch_id
            FROM producao_planejamento_semanal
            WHERE data_planejada >= $1::date AND data_planejada <= $2::date
            ORDER BY data_planejada ASC, COALESCE(ordem_sequencia, 1) ASC, reator_id ASC
        "#;
        sqlx::query(sql).bind(s).bind(e).fetch_all(pool).await
    } else {
        let sql = r#"
            SELECT id, week_key, data_planejada::text, reator_id, codigo_produto, descricao,
                   quantidade_planejada::float8, unidade, base_codigo, base_nome, linha_envase,
                   observacoes, ordem_status, lote_erp, fisico_confirmado_massa,
                   fisico_confirmado_embalagem, fisico_confirmado_rotulo,
                   recipiente_detalhe, cor_tag, COALESCE(ordem_sequencia, 1), processo_termico,
                   created_at::text, updated_at::text, batch_id
            FROM producao_planejamento_semanal
            ORDER BY data_planejada DESC LIMIT 200
        "#;
        sqlx::query(sql).fetch_all(pool).await
    };

    match q {
        Ok(rows) => {
            let items: Vec<PlanejamentoItemDto> = rows.into_iter().map(|r| {
                PlanejamentoItemDto {
                    id: r.get(0),
                    week_key: r.get(1),
                    data_planejada: r.get(2),
                    reator_id: r.get(3),
                    codigo_produto: r.get(4),
                    descricao: r.get(5),
                    quantidade_planejada: r.get(6),
                    unidade: r.get(7),
                    base_codigo: r.get(8),
                    base_nome: r.get(9),
                    linha_envase: r.get(10),
                    observacoes: r.get(11),
                    ordem_status: r.get(12),
                    lote_erp: r.get(13),
                    fisico_confirmado_massa: r.get(14),
                    fisico_confirmado_embalagem: r.get(15),
                    fisico_confirmado_rotulo: r.get(16),
                    recipiente_detalhe: r.get(17),
                    cor_tag: r.get(18),
                    ordem_sequencia: r.get(19),
                    processo_termico: r.get(20),
                    created_at: r.get(21),
                    updated_at: r.get(22),
                    batch_id: r.get(23),
                }
            }).collect();
            (StatusCode::OK, Json(json!(items))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    }
}

const ORDEM_STATUS_VALIDOS: [&str; 3] = ["planejado", "aprovado", "cancelado"];

/// Erro de banco no planejamento: sempre 500 com o texto do próprio erro (sem virar 404 em RowNotFound).
fn db(e: sqlx::Error) -> ErroApi {
    ErroApi::interno(e.to_string())
}

/// Normaliza data e semana: o servidor é a fonte da `week_key` (ISO `YYYY-Www`), derivada da data.
fn normalizar_planejamento_item(item: &mut PlanejamentoItemDto) -> Result<(), ErroApi> {
    use chrono::Datelike;
    if item.id.trim().is_empty() {
        return Err(ErroApi::regra("Ordem sem identificador.".to_string()));
    }
    let dia = item.data_planejada.split('T').next().unwrap_or("").trim().to_string();
    let data = chrono::NaiveDate::parse_from_str(&dia, "%Y-%m-%d").map_err(|_| {
        ErroApi::regra(format!("Data planejada inválida: {}.", item.data_planejada))
    })?;
    let iso = data.iso_week();
    item.week_key = format!("{}-W{:02}", iso.year(), iso.week());
    item.data_planejada = dia;
    Ok(())
}

/// Aceita um status fora da lista só se a linha já o tem gravado (legado); não deixa criar novos.
async fn validar_status_planejamento(
    conn: &mut sqlx::PgConnection,
    item: &PlanejamentoItemDto,
) -> Result<(), ErroApi> {
    let status = item
        .ordem_status
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("planejado");
    if ORDEM_STATUS_VALIDOS.contains(&status) {
        return Ok(());
    }
    let atual: Option<String> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT ordem_status FROM producao_planejamento_semanal WHERE id = $1",
    )
    .bind(&item.id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?
    .flatten();
    if atual.as_deref() == Some(status) {
        return Ok(());
    }
    Err(ErroApi::regra(format!(
        "Status de ordem inválido: {status}. Use planejado, aprovado ou cancelado."
    )))
}

/// Mesma chave de agrupamento do quadro (`groupCellItems` no front): batelada, lote ERP ou a própria linha.
fn chave_grupo_planejamento(id: &str, batch_id: Option<&str>, lote_erp: Option<&str>) -> String {
    if let Some(b) = batch_id.map(str::trim).filter(|s| !s.is_empty()) {
        return format!("BATCH_{b}");
    }
    if let Some(l) = lote_erp.map(str::trim).filter(|s| !s.is_empty()) {
        let up = l.to_uppercase();
        if !up.starts_with("PLAN_") && !up.starts_with("PL-") {
            return format!("LOTE_{l}");
        }
    }
    format!("ITEM_{id}")
}

/// Regras duras do chão de fábrica, as mesmas de `validarAlocacao` no front, aplicadas depois do upsert
/// (dentro da transação) para enxergar a batelada inteira: massa do grupo <= capacidade do reator e
/// R-100 com no máximo 1 produção por dia.
async fn validar_alocacoes_planejamento(
    conn: &mut sqlx::PgConnection,
    itens: &[PlanejamentoItemDto],
) -> Result<(), ErroApi> {
    let mut celulas: std::collections::BTreeSet<(String, String)> = Default::default();
    let mut tocados: std::collections::HashSet<&str> = Default::default();
    for it in itens {
        if it.ordem_status.as_deref().map(str::trim) == Some("cancelado") {
            continue;
        }
        celulas.insert((it.reator_id.clone(), it.data_planejada.clone()));
        tocados.insert(it.id.as_str());
    }

    for (reator_id, dia) in celulas {
        let reator: Option<(String, f64, bool)> = sqlx::query_as(
            "SELECT nome, capacidade_kg::float8, COALESCE(ativo, TRUE) FROM producao_reatores_config WHERE id = $1",
        )
        .bind(&reator_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(db)?;
        let Some((nome, capacidade, ativo)) = reator else {
            return Err(ErroApi::regra(format!(
                "O reator {reator_id} não existe na configuração de reatores."
            )));
        };
        if !ativo {
            return Err(ErroApi::regra(format!("O reator {nome} está inativo.")));
        }

        let rows = sqlx::query(
            r#"
            SELECT id, batch_id, lote_erp, quantidade_planejada::float8
            FROM producao_planejamento_semanal
            WHERE reator_id = $1 AND data_planejada = $2::date
              AND COALESCE(ordem_status, 'planejado') <> 'cancelado'
            "#,
        )
        .bind(&reator_id)
        .bind(&dia)
        .fetch_all(&mut *conn)
        .await
        .map_err(db)?;

        // chave do grupo -> (massa total em kg, tem alguma linha desta requisição)
        let mut grupos: std::collections::HashMap<String, (f64, bool)> = std::collections::HashMap::new();
        for r in rows {
            let id: String = r.get(0);
            let batch: Option<String> = r.get(1);
            let lote: Option<String> = r.get(2);
            let kg: f64 = r.get(3);
            let chave = chave_grupo_planejamento(&id, batch.as_deref(), lote.as_deref());
            let g = grupos.entry(chave).or_insert((0.0, false));
            g.0 += kg;
            g.1 |= tocados.contains(id.as_str());
        }

        for (kg, tocado) in grupos.values() {
            if *tocado && *kg > capacidade + 0.05 {
                let msg = if reator_id == "BOMBONAS" {
                    format!("Bombona comporta até {capacidade} kg. Esta ordem tem {kg:.1} kg.")
                } else {
                    format!("A massa de {kg:.1} kg passa da capacidade de {capacidade} kg deste reator.")
                };
                return Err(ErroApi::regra(msg));
            }
        }
        if reator_id == "R_100" && grupos.len() > 1 && grupos.values().any(|g| g.1) {
            return Err(ErroApi::regra(
                "O Reator 100kg funciona por resistência e aceita no máximo 1 produção por dia.".to_string(),
            ));
        }
    }
    Ok(())
}

/// Upsert da ordem + migração do status do lote temporário para o lote ERP + agenda em `lote_custom_status`.
/// Roda dentro da transação do chamador: qualquer erro desfaz tudo.
async fn upsert_planejamento_item(
    conn: &mut sqlx::PgConnection,
    item: &PlanejamentoItemDto,
    usuario: &str,
) -> Result<(), sqlx::Error> {
    let q = r#"
        INSERT INTO producao_planejamento_semanal (
            id, week_key, data_planejada, reator_id, codigo_produto, descricao,
            quantidade_planejada, unidade, base_codigo, base_nome, linha_envase,
            observacoes, ordem_status, lote_erp, fisico_confirmado_massa,
            fisico_confirmado_embalagem, fisico_confirmado_rotulo,
            recipiente_detalhe, cor_tag, ordem_sequencia, processo_termico, batch_id, updated_at
        ) VALUES (
            $1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            COALESCE($15::boolean, FALSE), COALESCE($16::boolean, FALSE), COALESCE($17::boolean, FALSE),
            $18, $19, $20, $21, $22, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
            week_key = EXCLUDED.week_key,
            data_planejada = EXCLUDED.data_planejada,
            reator_id = EXCLUDED.reator_id,
            codigo_produto = EXCLUDED.codigo_produto,
            descricao = EXCLUDED.descricao,
            quantidade_planejada = EXCLUDED.quantidade_planejada,
            unidade = EXCLUDED.unidade,
            base_codigo = EXCLUDED.base_codigo,
            base_nome = EXCLUDED.base_nome,
            linha_envase = EXCLUDED.linha_envase,
            observacoes = EXCLUDED.observacoes,
            ordem_status = EXCLUDED.ordem_status,
            lote_erp = EXCLUDED.lote_erp,
            fisico_confirmado_massa = COALESCE($15::boolean, producao_planejamento_semanal.fisico_confirmado_massa),
            fisico_confirmado_embalagem = COALESCE($16::boolean, producao_planejamento_semanal.fisico_confirmado_embalagem),
            fisico_confirmado_rotulo = COALESCE($17::boolean, producao_planejamento_semanal.fisico_confirmado_rotulo),
            recipiente_detalhe = EXCLUDED.recipiente_detalhe,
            cor_tag = EXCLUDED.cor_tag,
            ordem_sequencia = EXCLUDED.ordem_sequencia,
            processo_termico = EXCLUDED.processo_termico,
            batch_id = EXCLUDED.batch_id,
            updated_at = CURRENT_TIMESTAMP
    "#;

    sqlx::query(q)
        .bind(&item.id)
        .bind(&item.week_key)
        .bind(&item.data_planejada)
        .bind(&item.reator_id)
        .bind(&item.codigo_produto)
        .bind(&item.descricao)
        .bind(item.quantidade_planejada)
        .bind(&item.unidade)
        .bind(&item.base_codigo)
        .bind(&item.base_nome)
        .bind(&item.linha_envase)
        .bind(&item.observacoes)
        .bind(item.ordem_status.as_deref().unwrap_or("planejado"))
        .bind(&item.lote_erp)
        .bind(item.fisico_confirmado_massa)
        .bind(item.fisico_confirmado_embalagem)
        .bind(item.fisico_confirmado_rotulo)
        .bind(item.recipiente_detalhe.as_deref().unwrap_or("Reator"))
        .bind(&item.cor_tag)
        .bind(item.ordem_sequencia.unwrap_or(1))
        .bind(&item.processo_termico)
        .bind(&item.batch_id)
        .execute(&mut *conn)
        .await?;

    let lote_limpo = item.lote_erp.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(clean) = lote_limpo {
        // Migra todos os dados customizados (etapas_status, quadros_ocultos, datas) do ID temporário para o lote ERP real
        sqlx::query(
            r#"
            INSERT INTO lote_custom_status (
                lote_number, custom_status, category, notes, motivo_espera,
                data_pesagem, data_producao, data_rotulagem, data_envase, data_previsao,
                etapas_status, quadros_ocultos, historico_reagendamentos, updated_at
            )
            SELECT
                $2, custom_status, category, notes, motivo_espera,
                data_pesagem, data_producao, data_rotulagem, data_envase, data_previsao,
                etapas_status, quadros_ocultos, historico_reagendamentos, NOW()
            FROM lote_custom_status
            WHERE lote_number = $1
            ON CONFLICT (lote_number) DO UPDATE SET
                custom_status = COALESCE(EXCLUDED.custom_status, lote_custom_status.custom_status),
                etapas_status = COALESCE(lote_custom_status.etapas_status, '{}'::jsonb) || COALESCE(EXCLUDED.etapas_status, '{}'::jsonb),
                quadros_ocultos = COALESCE(EXCLUDED.quadros_ocultos, lote_custom_status.quadros_ocultos),
                data_pesagem = COALESCE(lote_custom_status.data_pesagem, EXCLUDED.data_pesagem),
                data_producao = COALESCE(lote_custom_status.data_producao, EXCLUDED.data_producao),
                updated_at = NOW()
            "#,
        )
        .bind(&item.id)
        .bind(clean)
        .execute(&mut *conn)
        .await?;

        // Atualiza programacao_rotulagem e programacao_envase que usavam o ID temporário
        sqlx::query("UPDATE programacao_rotulagem SET lote_number = $2 WHERE lote_number = $1")
            .bind(&item.id)
            .bind(clean)
            .execute(&mut *conn)
            .await?;
        sqlx::query("UPDATE programacao_envase SET lote_number = $2 WHERE lote_number = $1")
            .bind(&item.id)
            .bind(clean)
            .execute(&mut *conn)
            .await?;
        sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1")
            .bind(&item.id)
            .execute(&mut *conn)
            .await?;
    }

    let doc_num = lote_limpo.map(str::to_string).unwrap_or_else(|| item.id.clone());
    sqlx::query(
        r#"
        INSERT INTO lote_custom_status (
            lote_number, custom_status, data_pesagem, data_producao, data_previsao, updated_at
        ) VALUES (
            $1, 'Pesagem', ($2 || ' 08:00:00-03')::timestamptz, ($2 || ' 08:00:00-03')::timestamptz, ($2 || ' 08:00:00-03')::timestamptz, CURRENT_TIMESTAMP
        )
        ON CONFLICT (lote_number) DO UPDATE SET
            custom_status = CASE
                WHEN lote_custom_status.custom_status IN ('Finalizada', 'Ordem Finalizada', 'Produzido', 'Aberto', 'Pendente') THEN 'Pesagem'
                ELSE lote_custom_status.custom_status
            END,
            data_pesagem = CASE
                WHEN lote_custom_status.etapas_status->'pesagem'->>'status' IN ('concluido', 'Concluído', 'ativo', 'fila', 'Em Espera') THEN lote_custom_status.data_pesagem
                WHEN lote_custom_status.data_pesagem IS NOT NULL AND lote_custom_status.data_pesagem <> lote_custom_status.data_producao THEN lote_custom_status.data_pesagem
                ELSE ($2 || ' 08:00:00-03')::timestamptz
            END,
            historico_reagendamentos = CASE
                WHEN lote_custom_status.data_producao IS NOT NULL
                     AND TO_CHAR(lote_custom_status.data_producao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') <> $2
                THEN COALESCE(lote_custom_status.historico_reagendamentos, '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                        'tipo', CASE
                            WHEN TO_CHAR(lote_custom_status.data_producao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') < $2 THEN 'adiamento'
                            ELSE 'retorno'
                        END,
                        'etapa', 'producao',
                        'motivo', 'Reagendado de ' || TO_CHAR(lote_custom_status.data_producao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') || ' para ' || $2,
                        'dataAnterior', TO_CHAR(lote_custom_status.data_producao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'),
                        'novaData', $2,
                        'alteradoEm', CURRENT_TIMESTAMP,
                        'alteradoPor', $3::text
                    )
                )
                ELSE lote_custom_status.historico_reagendamentos
            END,
            data_producao = ($2 || ' 08:00:00-03')::timestamptz,
            data_previsao = ($2 || ' 08:00:00-03')::timestamptz,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&doc_num)
    .bind(&item.data_planejada)
    .bind(usuario)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

/// Grava uma ou várias ordens numa única transação: se qualquer uma falhar ou violar regra, nada é gravado.
async fn gravar_planejamento(
    pool: &PgPool,
    itens: &mut [PlanejamentoItemDto],
    usuario: &str,
) -> Result<(), ErroApi> {
    for it in itens.iter_mut() {
        normalizar_planejamento_item(it)?;
    }
    let mut tx = pool.begin().await.map_err(db)?;
    for it in itens.iter() {
        validar_status_planejamento(&mut tx, it).await?;
        upsert_planejamento_item(&mut tx, it, usuario).await.map_err(db)?;
    }
    validar_alocacoes_planejamento(&mut tx, itens).await?;
    tx.commit().await.map_err(db)?;
    Ok(())
}

pub async fn save_planejamento_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(item): Json<PlanejamentoItemDto>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let id = item.id.clone();
    let mut itens = vec![item];
    match gravar_planejamento(state.db.pool(), &mut itens, &ctx.display_name).await {
        Ok(()) => {
            auditoria::registrar(state.db.pool(), &ctx.display_name, "gravar_planejamento", &id, json!({ "itens": 1 })).await;
            (StatusCode::OK, Json(json!({ "ok": true, "id": id }))).into_response()
        }
        Err(e) => e.into_response(),
    }
}

pub async fn bulk_save_planejamento(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut itens): Json<Vec<PlanejamentoItemDto>>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let ids: Vec<String> = itens.iter().map(|i| i.id.clone()).collect();
    match gravar_planejamento(state.db.pool(), &mut itens, &ctx.display_name).await {
        Ok(()) => {
            auditoria::registrar(state.db.pool(), &ctx.display_name, "gravar_planejamento", &format!("{} ordens", ids.len()), json!({ "ids": ids })).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn motivo_bloqueio_exclusao_planejamento(
    conn: &mut sqlx::PgConnection,
    id: &str,
    lote_erp: Option<&str>,
) -> Result<Option<String>, sqlx::Error> {
    let lote = lote_erp.map(str::trim).filter(|s| !s.is_empty());
    let programado: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM programacao_envase
            WHERE lote_number = $1 OR ($2::text IS NOT NULL AND lote_number = $2)
        ) OR EXISTS (
            SELECT 1 FROM programacao_rotulagem
            WHERE lote_number = $1 OR ($2::text IS NOT NULL AND lote_number = $2)
        )
        "#,
    )
    .bind(id)
    .bind(lote)
    .fetch_one(&mut *conn)
    .await?;

    if programado {
        return Ok(Some(
            "Esta ordem já está na programação de envase ou rotulagem. Remova de lá antes de tirar do planejamento."
                .to_string(),
        ));
    }

    let status: Option<String> = sqlx::query_scalar::<_, Option<String>>(
        r#"
        SELECT custom_status FROM lote_custom_status
        WHERE lote_number = $1 OR ($2::text IS NOT NULL AND lote_number = $2)
        ORDER BY CASE WHEN lote_number = $2 THEN 0 ELSE 1 END
        LIMIT 1
        "#,
    )
    .bind(id)
    .bind(lote)
    .fetch_optional(&mut *conn)
    .await?
    .flatten();

    if let Some(ref s) = status {
        let cedo = matches!(s.as_str(), "Pesagem" | "Aberto" | "Pendente" | "");
        if !cedo {
            return Ok(Some(format!(
                "A ordem já avançou nos quadros ({s}). Ela permanece com quem está executando."
            )));
        }
    }
    Ok(None)
}

async fn limpar_status_planejamento(
    conn: &mut sqlx::PgConnection,
    id: &str,
    lote_erp: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM lote_custom_status WHERE lote_number = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    if let Some(lote) = lote_erp
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with("PLAN_") && !s.starts_with("PL-"))
    {
        sqlx::query(
            r#"
            DELETE FROM lote_custom_status
            WHERE lote_number = $1
              AND custom_status IN ('Pesagem', 'Aberto', 'Pendente')
              AND (etapas_status IS NULL OR etapas_status = '{}'::jsonb)
            "#,
        )
        .bind(lote)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Exclui a ordem com a linha travada (`FOR UPDATE`), dentro da transação do chamador (que decide commit/rollback).
/// Devolve o resumo do que foi apagado; ordem inexistente = 404, ordem já em andamento = 409.
async fn excluir_planejamento_item(conn: &mut sqlx::PgConnection, id: &str) -> Result<serde_json::Value, ErroApi> {
    let row: Option<(Option<String>, String, Option<String>, f64)> = sqlx::query_as(
        "SELECT lote_erp, codigo_produto, descricao, quantidade_planejada::float8 FROM producao_planejamento_semanal WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(db)?;
    let Some((lote, codigo, descricao, kg)) = row else {
        return Err(ErroApi::nao_encontrado("Item não encontrado"));
    };
    if let Some(motivo) = motivo_bloqueio_exclusao_planejamento(&mut *conn, id, lote.as_deref())
        .await
        .map_err(db)?
    {
        return Err(ErroApi::conflito(motivo));
    }
    sqlx::query("DELETE FROM producao_planejamento_semanal WHERE id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(db)?;
    limpar_status_planejamento(&mut *conn, id, lote.as_deref()).await.map_err(db)?;
    Ok(json!({
        "id": id, "codigoProduto": codigo, "descricao": descricao, "quantidadePlanejada": kg, "loteErp": lote
    }))
}

pub async fn delete_planejamento_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarParams>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let confirmar = q.confirmar == Some(true);
    let id_tx = id.clone();
    let r = executar_em_2_passos(state.db.pool(), "excluir_planejamento", confirmar, |tx| {
        Box::pin(async move { excluir_planejamento_item(&mut **tx, &id_tx).await })
    })
    .await;
    match r {
        Ok(r) if r.previa => {
            (StatusCode::OK, Json(json!({ "previa": true, "acao": "excluir_planejamento", "item": r.resultado, "confirmar": "repita com confirmar=true para excluir" }))).into_response()
        }
        Ok(r) => {
            auditoria::registrar(state.db.pool(), &ctx.display_name, "excluir_planejamento", &id, r.resultado).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => e.into_response(),
    }
}

pub async fn confirm_fisico_planejamento(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(payload): Json<ConfirmFisicoPayload>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let pool = state.db.pool();
    if let Some(ref s) = payload.ordem_status {
        if !ORDEM_STATUS_VALIDOS.contains(&s.trim()) {
            return ErroApi::regra(format!("Status de ordem inválido: {s}. Use planejado, aprovado ou cancelado.")).into_response();
        }
    }
    let q = r#"
        UPDATE producao_planejamento_semanal
        SET fisico_confirmado_massa = COALESCE($2, fisico_confirmado_massa),
            fisico_confirmado_embalagem = COALESCE($3, fisico_confirmado_embalagem),
            fisico_confirmado_rotulo = COALESCE($4, fisico_confirmado_rotulo),
            ordem_status = COALESCE($5, ordem_status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING data_planejada::text, lote_erp, ordem_status
    "#;
    match sqlx::query(q)
        .bind(&id)
        .bind(payload.massa)
        .bind(payload.embalagem)
        .bind(payload.rotulo)
        .bind(payload.ordem_status.as_deref().map(str::trim))
        .fetch_optional(pool)
        .await
    {
        Ok(Some(_row)) => {
            auditoria::registrar(pool, &ctx.display_name, "aprovar_planejamento", &id, json!({ "ordemStatus": payload.ordem_status })).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(None) => ErroApi::nao_encontrado("Item não encontrado").into_response(),
        Err(e) => db(e).into_response(),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct ClearWeekParams {
    pub week: String,
    pub confirmar: Option<bool>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ConfirmarParams {
    pub confirmar: Option<bool>,
}

/// Limpa a semana numa transação. Ordens bloqueadas (já em envase/rotulagem ou adiante nos quadros) ficam.
/// Limpa a semana dentro da transação do chamador. Ordens bloqueadas (já em envase/rotulagem ou adiante nos quadros) ficam.
/// Devolve as ordens apagadas e quantas ficaram bloqueadas.
async fn limpar_semana_planejamento(
    conn: &mut sqlx::PgConnection,
    week: &str,
) -> Result<(Vec<serde_json::Value>, i64), ErroApi> {
    let rows = sqlx::query(
        r#"
        SELECT id, lote_erp, codigo_produto, descricao, quantidade_planejada::float8, unidade, base_codigo, base_nome
        FROM producao_planejamento_semanal
        WHERE week_key = $1
        FOR UPDATE
        "#,
    )
    .bind(week)
    .fetch_all(&mut *conn)
    .await
    .map_err(db)?;

    let mut deleted = Vec::new();
    let mut blocked = 0i64;
    for row in rows {
        let id: String = row.get(0);
        let lote_erp: Option<String> = row.get(1);
        if motivo_bloqueio_exclusao_planejamento(&mut *conn, &id, lote_erp.as_deref())
            .await
            .map_err(db)?
            .is_some()
        {
            blocked += 1;
            continue;
        }
        sqlx::query("DELETE FROM producao_planejamento_semanal WHERE id = $1")
            .bind(&id)
            .execute(&mut *conn)
            .await
            .map_err(db)?;
        limpar_status_planejamento(&mut *conn, &id, lote_erp.as_deref()).await.map_err(db)?;
        let quantidade: f64 = row.get(4);
        deleted.push(json!({
            "id": id,
            "codigoProduto": row.get::<String, _>(2),
            "descricao": row.get::<Option<String>, _>(3),
            "quantidadePlanejada": quantidade,
            "unidade": row.get::<Option<String>, _>(5),
            "baseCodigo": row.get::<Option<String>, _>(6),
            "baseNome": row.get::<Option<String>, _>(7),
        }));
    }
    Ok((deleted, blocked))
}

pub async fn clear_planejamento_semana(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(params): Query<ClearWeekParams>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    let confirmar = params.confirmar == Some(true);
    let semana = params.week.clone();
    let r = executar_em_2_passos(state.db.pool(), "limpar_semana_planejamento", confirmar, |tx| {
        Box::pin(async move { limpar_semana_planejamento(&mut **tx, &semana).await })
    })
    .await;
    match r {
        Ok(r) if r.previa => {
            let (deleted, blocked) = r.resultado;
            (
                StatusCode::OK,
                Json(json!({ "previa": true, "acao": "limpar_semana_planejamento", "semana": params.week, "deleted": deleted, "blocked": blocked, "confirmar": "repita com confirmar=true para limpar" })),
            )
                .into_response()
        }
        Ok(r) => {
            let (deleted, blocked) = r.resultado;
            auditoria::registrar(state.db.pool(), &ctx.display_name, "limpar_semana_planejamento", &params.week, json!({ "apagados": deleted, "bloqueados": blocked })).await;
            (
                StatusCode::OK,
                Json(json!({ "ok": true, "deleted": deleted, "blocked": blocked, "rows_deleted": deleted.len() })),
            )
                .into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// O axum entra em pânico ao montar rotas repetidas: as de Produção têm de conviver no mesmo Router.
    #[test]
    fn rotas_de_planejamento_fila_e_reatores_montam_sem_conflito() {
        let _ = Router::<Arc<AppState>>::new()
            .merge(router())
            .merge(crate::modules::producao::fila::router())
            .merge(crate::modules::producao::reatores::router());
    }

    fn item(id: &str, data: &str) -> PlanejamentoItemDto {
        PlanejamentoItemDto {
            id: id.into(),
            week_key: String::new(),
            data_planejada: data.into(),
            reator_id: "R_100".into(),
            codigo_produto: "X".into(),
            descricao: None,
            quantidade_planejada: 10.0,
            unidade: None,
            base_codigo: None,
            base_nome: None,
            linha_envase: None,
            observacoes: None,
            ordem_status: None,
            lote_erp: None,
            fisico_confirmado_massa: None,
            fisico_confirmado_embalagem: None,
            fisico_confirmado_rotulo: None,
            recipiente_detalhe: None,
            cor_tag: None,
            ordem_sequencia: None,
            processo_termico: None,
            created_at: None,
            updated_at: None,
            batch_id: None,
        }
    }

    #[test]
    fn data_valida_vira_semana_iso() {
        let mut it = item("a", "2026-10-23T12:00:00");
        normalizar_planejamento_item(&mut it).unwrap();
        assert_eq!(it.week_key, "2026-W43");
        assert_eq!(it.data_planejada, "2026-10-23");
    }

    #[test]
    fn data_invalida_ou_id_vazio_e_regra_violada() {
        let e = normalizar_planejamento_item(&mut item("a", "23/10/2026")).unwrap_err();
        assert_eq!((e.status, e.codigo), (StatusCode::UNPROCESSABLE_ENTITY, "regra_violada"));
        assert!(e.mensagem.starts_with("Data planejada inválida"));
        let e = normalizar_planejamento_item(&mut item("  ", "2026-10-23")).unwrap_err();
        assert_eq!(e.codigo, "regra_violada");
    }

    #[test]
    fn chave_do_grupo_segue_batelada_lote_ou_item() {
        assert_eq!(chave_grupo_planejamento("1", Some(" B7 "), Some("L1")), "BATCH_B7");
        assert_eq!(chave_grupo_planejamento("1", None, Some("L1")), "LOTE_L1");
        assert_eq!(chave_grupo_planejamento("1", Some(" "), Some("PLAN_9")), "ITEM_1");
        assert_eq!(chave_grupo_planejamento("1", None, Some("pl-9")), "ITEM_1");
        assert_eq!(chave_grupo_planejamento("1", None, None), "ITEM_1");
    }

    #[test]
    fn status_validos_da_ordem() {
        assert_eq!(ORDEM_STATUS_VALIDOS, ["planejado", "aprovado", "cancelado"]);
    }
}
