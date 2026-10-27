//! Cobertura de insumo por dia no Planejamento Semanal (somente leitura; só avisa, nunca bloqueia).
//! Regras e raciocínio em `calc.rs`; leitura do banco em `store.rs`.

pub mod calc;
pub mod faltas;
pub mod horizonte;
pub mod reserva;
pub mod store;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Extension, Json, Router,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::decisoes;
use calc::{simular, Aviso, BaseFonte, OrdemEntrada, ResultadoOrdem, ResumoInsumo};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/cobertura", get(get_cobertura))
        .route("/api/producao/cobertura/simular", post(post_simular))
        .route("/api/producao/cobertura/validacao", get(get_validacao))
        .route("/api/producao/cobertura/faltas-por-linha", get(get_faltas_por_linha))
        .route("/api/producao/cobertura/reserva-diagnostico", get(get_reserva_diagnostico))
        .route("/api/producao/cobertura/ordens/:id/base-fonte", put(put_base_fonte))
}

/// Ações da cobertura de insumos descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = crate::modules::producao::permissao::MODULO_PLANEJAMENTO;
    vec![
        Acao::leitura(
            "obter_cobertura_semana",
            M,
            "Mostra se há insumo para cada ordem da semana (dia a dia) e o resumo por insumo. Só avisa, nunca bloqueia.",
            "/api/producao/cobertura",
            vec![param("week", "query", "texto", false, "Semana 2026-W43; padrão: semana de hoje.")],
        ),
        Acao::calculo(
            "simular_candidatos_cobertura",
            M,
            "Avalia candidatos da fila como se fossem a última ordem do dia, sem gravar nada. Use antes de agendar para ver se falta insumo.",
            "/api/producao/cobertura/simular",
            vec![
                param("week", "corpo", "texto", false, "Semana 2026-W43; padrão: semana de hoje."),
                param("candidatos", "corpo", "lista {codigo, kg, data?}", true, "Até 60 candidatos; a data (AAAA-MM-DD) é opcional."),
            ],
        ),
        Acao::leitura(
            "listar_faltas_por_linha",
            M,
            "Insumos em falta na semana, agrupados pela linha de envase.",
            "/api/producao/cobertura/faltas-por-linha",
            vec![param("week", "query", "texto", false, "Semana 2026-W43; padrão: semana de hoje.")],
        ),
        Acao::leitura(
            "validar_previsao_insumos",
            M,
            "Compara a previsão de consumo da fórmula com a baixa real dos lotes já fechados (para conferir se a previsão é confiável).",
            "/api/producao/cobertura/validacao",
            vec![param("limite", "query", "inteiro", false, "Quantos lotes comparar (padrão 30).")],
        ),
        Acao::leitura(
            "diagnosticar_reserva_insumos",
            M,
            "Compara a reserva de insumos que o ERP informa com a que os lotes abertos gerariam pela fórmula, por insumo, com os lotes que mais reservam.",
            "/api/producao/cobertura/reserva-diagnostico",
            vec![
                param("codigo", "query", "texto", false, "Código de um insumo (padrão: todos)."),
                param("limite", "query", "inteiro", false, "Quantos insumos devolver (padrão 50), maiores diferenças primeiro."),
            ],
        ),
        Acao::gravacao(
            "definir_base_fonte_ordem",
            M,
            "Declara de onde sai a base de uma ordem (explodir, estoque ou ordem_base). Sem `confirmar=true` mostra só a prévia.",
            "PUT",
            "/api/producao/cobertura/ordens/:id/base-fonte",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da ordem."),
                param("fonte", "corpo", "texto", true, "explodir, estoque ou ordem_base."),
                param("confirmar", "corpo", "booleano", false, "true para gravar de fato."),
            ],
        ),
    ]
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
        if let Some(r) = simular_candidato(&ctx, i, &codigo, c.kg, data) {
            out.push(ResultadoCandidato { codigo, kg: c.kg, data, resultado: r });
        }
    }
    (StatusCode::OK, Json(json!({ "semana": semana, "candidatos": out }))).into_response()
}

/// Avalia um candidato (ainda não é ordem) como se fosse a última ordem do dia, sem somar com outros candidatos.
/// Usa a última escolha do Edson para a base (a ordem real só sugere).
pub(crate) fn simular_candidato(
    ctx: &store::Contexto,
    indice: usize,
    codigo: &str,
    kg: f64,
    data: NaiveDate,
) -> Option<ResultadoOrdem> {
    let id = format!("cand:{indice}");
    let fonte = ctx.decisoes_base.get(codigo).copied().unwrap_or_default();
    let mut entrada = ctx.entrada.clone();
    entrada.ordens.push(OrdemEntrada {
        id: id.clone(),
        data,
        sequencia: i32::MAX,
        codigo_produto: codigo.to_string(),
        descricao: None,
        kg,
        lote_erp: None,
        lote_no_erp: false,
        grupo: id.clone(),
        necessidades: ctx.formulas.necessidades_com(codigo, kg, fonte),
        bases_usadas: ctx.formulas.bases_usadas(codigo),
        base_fonte: fonte,
        sugestao_base: None,
        da_semana: true,
    });
    simular(&entrada).ordens.into_iter().find(|o| o.id == id)
}

#[derive(Debug, Deserialize)]
pub struct BaseFonteBody {
    pub fonte: String,
    /// Sem `true` a rota só devolve a prévia (nada é gravado).
    #[serde(default)]
    pub confirmar: bool,
}

/// O Edson declara de onde sai a base desta ordem; a escolha fica na ordem e na memória de decisões.
async fn put_base_fonte(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<BaseFonteBody>,
) -> impl IntoResponse {
    let Some(fonte) = BaseFonte::parse(&body.fonte) else {
        return erro(StatusCode::BAD_REQUEST, "Origem da base inválida. Use explodir, estoque ou ordem_base.");
    };
    let pool = state.db.pool();
    if !body.confirmar {
        return match previa_base_fonte(pool, &id, fonte).await {
            Ok(v) => (StatusCode::OK, Json(v)).into_response(),
            Err((status, msg)) => erro(status, msg),
        };
    }
    let codigo: Option<String> = match sqlx::query_scalar(
        "UPDATE producao_planejamento_semanal SET base_fonte = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING codigo_produto",
    )
    .bind(&id)
    .bind(fonte.como_texto())
    .fetch_optional(pool)
    .await
    {
        Ok(c) => c,
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar a origem da base: {e}")),
    };
    let Some(codigo) = codigo else {
        return erro(StatusCode::NOT_FOUND, "Ordem não encontrada no planejamento.");
    };
    if let Err(e) = decisoes::registrar(pool, decisoes::TIPO_BASE_FONTE, &store::canon(&codigo), fonte.como_texto(), &ctx.display_name).await {
        return erro(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    crate::modules::producao::auditoria::registrar(
        pool,
        &ctx.display_name,
        "definir_base_fonte",
        &id,
        json!({ "produto": codigo, "fonte": fonte }),
    )
    .await;
    (StatusCode::OK, Json(json!({ "ok": true, "id": id, "fonte": fonte }))).into_response()
}

/// Prévia: quais insumos passam a ser (ou deixam de ser) consumidos por esta ordem com a origem escolhida.
async fn previa_base_fonte(
    pool: &sqlx::PgPool,
    id: &str,
    fonte: BaseFonte,
) -> Result<serde_json::Value, (StatusCode, String)> {
    let interno = |e: String| (StatusCode::INTERNAL_SERVER_ERROR, e);
    let row = sqlx::query(
        "SELECT codigo_produto, quantidade_planejada::float8 AS kg, COALESCE(NULLIF(TRIM(base_fonte), ''), 'explodir') AS atual \
         FROM producao_planejamento_semanal WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| interno(format!("Erro ao ler a ordem: {e}")))?
    .ok_or((StatusCode::NOT_FOUND, "Ordem não encontrada no planejamento.".to_string()))?;
    use sqlx::Row;
    let produto = store::canon(&row.get::<String, _>("codigo_produto"));
    let kg = row.get::<Option<f64>, _>("kg").unwrap_or(0.0);
    let atual = BaseFonte::parse(&row.get::<String, _>("atual")).unwrap_or_default();
    let formulas = store::carregar_formulas(pool, &[produto.clone()]).await.map_err(interno)?;
    let antes = formulas.necessidades_com(&produto, kg, atual).unwrap_or_default();
    let depois = formulas.necessidades_com(&produto, kg, fonte).unwrap_or_default();
    let qtd = |v: &[calc::Necessidade], c: &str| v.iter().find(|n| n.codigo == c).map(|n| n.quantidade).unwrap_or(0.0);
    let mut mudancas = Vec::new();
    let mut codigos: Vec<&String> = antes.iter().chain(depois.iter()).map(|n| &n.codigo).collect();
    codigos.sort();
    codigos.dedup();
    for c in codigos {
        let (a, d) = (qtd(&antes, c), qtd(&depois, c));
        if (a - d).abs() > 1e-6 {
            let desc = antes.iter().chain(depois.iter()).find(|n| &n.codigo == c).map(|n| n.descricao.clone()).unwrap_or_default();
            mudancas.push(json!({ "insumo": c, "descricao": desc, "antes": a, "depois": d }));
        }
    }
    Ok(json!({
        "previa": true, "acao": "definir_base_fonte", "ordem": id, "produto": produto,
        "fonteAtual": atual, "fonteNova": fonte, "insumosQueMudam": mudancas,
        "confirmar": "repita com confirmar=true para gravar"
    }))
}

/// Relatório "Faltas de Insumos por Linha": ordens da semana e fila (Banco de Demandas), separadas.
async fn get_faltas_por_linha(State(state): State<Arc<AppState>>, Query(q): Query<CoberturaQuery>) -> impl IntoResponse {
    let semana = q
        .week
        .map(|w| w.trim().to_string())
        .filter(|w| !w.is_empty())
        .unwrap_or_else(|| store::semana_de(store::hoje_brasil()));
    if store::intervalo_semana(&semana).is_none() {
        return erro(StatusCode::BAD_REQUEST, format!("Semana inválida: {semana}. Use o formato 2026-W43."));
    }
    match faltas::gerar(state.db.pool(), &semana).await {
        Ok(r) => (StatusCode::OK, Json(r)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
pub struct ReservaQuery {
    pub codigo: Option<String>,
    pub limite: Option<usize>,
}

/// Diagnóstico da reserva: reserva do ERP x reserva dos lotes abertos, por insumo (somente leitura).
async fn get_reserva_diagnostico(State(state): State<Arc<AppState>>, Query(q): Query<ReservaQuery>) -> impl IntoResponse {
    match reserva::gerar(state.db.pool(), q.codigo.as_deref(), q.limite).await {
        Ok(d) => (StatusCode::OK, Json(d)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
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
