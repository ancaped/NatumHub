use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;

use crate::core::acao::{Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_EXPEDICAO, MODULE_EXPEDICAO_ALOCACAO, MODULE_EXPEDICAO_ECOMMERCE,
};

use super::models::*;
use super::service;

#[derive(Debug, Default, Deserialize)]
pub struct ConfirmarMotivo {
    #[serde(default)]
    pub confirmar: bool,
    #[serde(default)]
    pub motivo: Option<String>,
}

fn exigir_edicao(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.can_edit_module(MODULE_EXPEDICAO_ALOCACAO)
        || ctx.can_edit_module(MODULE_EXPEDICAO_ECOMMERCE)
        || ctx.can_edit_module(MODULE_EXPEDICAO)
    {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao(
            "Você tem acesso somente de leitura na Alocação da Expedição.",
        ))
    }
}

pub async fn get_painel(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PainelQuery>,
) -> Result<Response, ErroApi> {
    let painel = service::carregar_painel(state.db.pool(), &q).await?;
    Ok((StatusCode::OK, Json(painel)).into_response())
}

pub async fn get_ops_chegando(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OpsChegandoQuery>,
) -> Result<Response, ErroApi> {
    let ops = service::listar_ops_chegando(state.db.pool(), &q).await?;
    Ok((StatusCode::OK, Json(ops)).into_response())
}

pub async fn get_clientes_sugestao(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ClientesSugestaoQuery>,
) -> Result<Response, ErroApi> {
    let lista = service::listar_clientes_sugestao(state.db.pool(), &q).await?;
    Ok((StatusCode::OK, Json(lista)).into_response())
}

pub async fn post_estrutura(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<EstruturaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::criar_estrutura(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn put_estrutura(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<EstruturaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::atualizar_estrutura(state.db.pool(), &ctx, &id, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_estrutura(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_estrutura(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_gerar_grade(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<GerarGradeInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::gerar_grade_estrutura(state.db.pool(), &ctx, &id, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn put_posicao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<PosicaoUpdateInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::atualizar_posicao(state.db.pool(), &ctx, &id, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_posicao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_posicao(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_caixa(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CaixaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::criar_caixa(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn put_caixa(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CaixaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::atualizar_caixa(state.db.pool(), &ctx, &id, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_caixa(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_caixa(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn put_produto_caixa(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(codigo): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<ProdutoCaixaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::vincular_produto_caixa(state.db.pool(), &ctx, &codigo, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_atacadista(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AtacadistaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::criar_atacadista(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn put_atacadista(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AtacadistaInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::atualizar_atacadista(state.db.pool(), &ctx, &id, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_atacadista(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_atacadista(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_alocacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AlocacaoUpsertInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::salvar_alocacao(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_alocacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_alocacao(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_sugerir(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<SugerirInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::aplicar_sugestao(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_mover_alocacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<MoverAlocacaoInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::mover_alocacao(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_produtos_caixa_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<ProdutoCaixaLoteInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::vincular_produtos_caixa_lote(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_importar_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<ImportarMapaLoteInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::importar_mapa_lote(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_abc_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AbcElegibilidadeLoteInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::atualizar_elegibilidade_abc_lote(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn get_reposicao_fefo(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ReposicaoFefoQuery>,
) -> Result<Response, ErroApi> {
    let res = service::listar_reposicao_fefo(state.db.pool(), &q).await?;
    Ok((StatusCode::OK, Json(res)).into_response())
}

pub async fn get_lotes_erp_produto(
    State(state): State<Arc<AppState>>,
    Path(codigo): Path<String>,
) -> Result<Response, ErroApi> {
    let lista = service::listar_lotes_erp_produto(state.db.pool(), &codigo).await?;
    Ok((StatusCode::OK, Json(lista)).into_response())
}

pub async fn post_salvar_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<SalvarLotePosicaoInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::salvar_lote_posicao(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn post_mover_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<MoverLoteInput>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::mover_lote_posicao(state.db.pool(), &ctx, body, c.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}

pub async fn delete_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ConfirmarMotivo>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = service::excluir_lote_posicao(state.db.pool(), &ctx, &id, q.motivo.as_deref(), q.confirmar).await?;
    Ok((StatusCode::OK, Json(service::resposta_json(r))).into_response())
}
