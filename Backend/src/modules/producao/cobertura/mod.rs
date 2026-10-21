//! Cobertura de insumo por dia no Planejamento Semanal (somente leitura; só avisa, nunca bloqueia).
//! Regras e raciocínio em `calc.rs`; leitura do banco em `store.rs`.

pub mod calc;
pub mod store;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

use crate::handlers::AppState;
use calc::{simular, Aviso, OrdemEntrada, ResultadoOrdem, ResumoInsumo};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/cobertura", get(get_cobertura))
        .route("/api/producao/cobertura/simular", post(post_simular))
        .route("/api/producao/cobertura/validacao", get(get_validacao))
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

#[derive(Debug, Deserialize)]
pub struct CoberturaQuery {
    pub week: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RespostaCobertura {
    semana: String,
    hoje: NaiveDate,
    gerado_em: String,
    ordens: Vec<ResultadoOrdem>,
    insumos: Vec<ResumoInsumo>,
    avisos: Vec<Aviso>,
}

/// Cobertura das ordens da semana (as ordens anteriores ainda não abertas no ERP entram só no consumo).
async fn get_cobertura(State(state): State<Arc<AppState>>, Query(q): Query<CoberturaQuery>) -> impl IntoResponse {
    let semana = q
        .week
        .map(|w| w.trim().to_string())
        .filter(|w| !w.is_empty())
        .unwrap_or_else(|| store::semana_de(store::hoje_brasil()));
    if store::intervalo_semana(&semana).is_none() {
        return erro(StatusCode::BAD_REQUEST, format!("Semana inválida: {semana}. Use o formato 2026-W43."));
    }
    let ctx = match store::montar_contexto(state.db.pool(), &semana, &[]).await {
        Ok(c) => c,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let da_semana: HashSet<String> = ctx.entrada.ordens.iter().filter(|o| o.da_semana).map(|o| o.id.clone()).collect();
    let mut saida = simular(&ctx.entrada);
    saida.ordens.retain(|o| da_semana.contains(&o.id));
    (
        StatusCode::OK,
        Json(RespostaCobertura {
            semana,
            hoje: ctx.entrada.hoje,
            gerado_em: Utc::now().to_rfc3339(),
            ordens: saida.ordens,
            insumos: saida.insumos,
            avisos: saida.avisos,
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidato {
    pub codigo: String,
    pub kg: f64,
    pub data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SimularBody {
    pub week: Option<String>,
    pub candidatos: Vec<Candidato>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultadoCandidato {
    codigo: String,
    kg: f64,
    data: NaiveDate,
    resultado: ResultadoOrdem,
}

/// Avalia cada candidato da fila como se fosse a última ordem do dia, sem somar candidatos entre si.
async fn post_simular(State(state): State<Arc<AppState>>, Json(body): Json<SimularBody>) -> impl IntoResponse {
    if body.candidatos.len() > 60 {
        return erro(StatusCode::BAD_REQUEST, "No máximo 60 candidatos por chamada.");
    }
    let hoje = store::hoje_brasil();
    let semana = body
        .week
        .map(|w| w.trim().to_string())
        .filter(|w| !w.is_empty())
        .unwrap_or_else(|| store::semana_de(hoje));
    if store::intervalo_semana(&semana).is_none() {
        return erro(StatusCode::BAD_REQUEST, format!("Semana inválida: {semana}."));
    }
    let extras: Vec<String> = body.candidatos.iter().map(|c| c.codigo.clone()).collect();
    let ctx = match store::montar_contexto(state.db.pool(), &semana, &extras).await {
        Ok(c) => c,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    let mut out: Vec<ResultadoCandidato> = Vec::new();
    for (i, c) in body.candidatos.iter().enumerate() {
        let codigo = store::canon(&c.codigo);
        let data = c.data.as_deref().and_then(store::parse_data).unwrap_or_else(|| hoje.max(ctx.inicio_semana));
        let id = format!("cand:{i}");
        let mut entrada = ctx.entrada.clone();
        entrada.ordens.push(OrdemEntrada {
            id: id.clone(),
            data,
            sequencia: i32::MAX,
            codigo_produto: codigo.clone(),
            descricao: None,
            kg: c.kg,
            lote_erp: None,
            lote_no_erp: false,
            grupo: id.clone(),
            necessidades: ctx.formulas.necessidades(&codigo, c.kg),
            bases_usadas: ctx.formulas.bases_usadas(&codigo),
            da_semana: true,
        });
        let saida = simular(&entrada);
        if let Some(r) = saida.ordens.into_iter().find(|o| o.id == id) {
            out.push(ResultadoCandidato { codigo, kg: c.kg, data, resultado: r });
        }
    }
    (StatusCode::OK, Json(json!({ "semana": semana, "candidatos": out }))).into_response()
}

#[derive(Debug, Deserialize)]
pub struct ValidacaoQuery {
    pub limite: Option<i64>,
}

/// Backtest: compara a previsão da fórmula (com explosão de bases) com a baixa real dos lotes já fechados.
async fn get_validacao(State(state): State<Arc<AppState>>, Query(q): Query<ValidacaoQuery>) -> impl IntoResponse {
    match store::validar(state.db.pool(), q.limite.unwrap_or(30)).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}
