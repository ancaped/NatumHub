use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};

use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::{corpo_acao, Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_ESTOQUE_ALMOX, MODULE_ESTOQUE_EQUIPAMENTOS, MODULE_ESTOQUE_ITENS,
    MODULE_ESTOQUE_MANUTENCOES, MODULE_ESTOQUE_PECAS, MODULE_ESTOQUE_SUPERMERCADO,
};
use crate::modules::geral::notifications;

use super::models::*;
use super::{servicos, store};

/// Conexão do pool com as tabelas garantidas, para as leituras (o store trabalha sobre uma conexão para poder
/// rodar também dentro da transação do 2 passos).
async fn conexao(state: &AppState) -> Result<sqlx::pool::PoolConnection<sqlx::Postgres>, String> {
    let pool = state.db.pool();
    store::ensure_tables(pool).await?;
    pool.acquire().await.map_err(|e| e.to_string())
}

macro_rules! conexao {
    ($state:expr) => {
        match conexao(&$state).await {
            Ok(c) => c,
            Err(e) => {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
            }
        }
    };
}

/// O autor de toda gravação é o usuário logado, nunca um nome vindo do corpo.
fn autor(ctx: &AuthContext) -> String {
    let n = ctx.display_name.trim();
    if n.is_empty() { "Operador".to_string() } else { n.to_string() }
}

const SEM_PERMISSAO: &str = "Sem permissão para este módulo de estoque.";

fn permissao(msg: &str) -> ErroApi {
    ErroApi::sem_permissao(msg)
}

fn resposta(r: &crate::core::acao::RespostaAcao<serde_json::Value>) -> Response {
    (StatusCode::OK, Json(corpo_acao(r))).into_response()
}

fn deny_module() -> axum::response::Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({ "error": "Sem permissão para este módulo de estoque." })),
    )
        .into_response()
}

fn is_supervisor(ctx: &AuthContext) -> bool {
    ctx.role.is_supervisor()
}

fn has_any_ops(ctx: &AuthContext) -> bool {
    is_supervisor(ctx)
        || ctx.has_module(MODULE_ESTOQUE_ITENS)
        || ctx.has_module(MODULE_ESTOQUE_ALMOX)
        || ctx.has_module(MODULE_ESTOQUE_SUPERMERCADO)
        || ctx.has_module(MODULE_ESTOQUE_PECAS)
        || ctx.has_module(MODULE_ESTOQUE_EQUIPAMENTOS)
        || ctx.has_module(MODULE_ESTOQUE_MANUTENCOES)
}

fn module_for_section(section: &str) -> Option<&'static str> {
    match section {
        "almoxarifado" | "escritorio" | "limpeza" | "outros" => Some(MODULE_ESTOQUE_ALMOX),
        "supermercado" => Some(MODULE_ESTOQUE_SUPERMERCADO),
        "pecas" => Some(MODULE_ESTOQUE_PECAS),
        _ => None,
    }
}

fn can_write_section(ctx: &AuthContext, section: &str) -> bool {
    if is_supervisor(ctx) {
        return true;
    }
    match module_for_section(section) {
        Some(m) => ctx.has_module(m),
        None => false,
    }
}

fn can_write_stock(ctx: &AuthContext) -> bool {
    is_supervisor(ctx)
        || ctx.has_module(MODULE_ESTOQUE_ALMOX)
        || ctx.has_module(MODULE_ESTOQUE_SUPERMERCADO)
        || ctx.has_module(MODULE_ESTOQUE_PECAS)
}

fn require_compras_almox(ctx: &AuthContext) -> bool {
    is_supervisor(ctx)
        || ctx.has_module(MODULE_ESTOQUE_ALMOX)
        || can_write_stock(ctx)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItemsQuery {
    pub only_active: Option<bool>,
    pub section: Option<String>,
}

pub async fn list_items(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<ListItemsQuery>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_items(&mut conn, q.only_active.unwrap_or(false), q.section.as_deref()).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "items": items }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCatalogQuery {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

pub async fn search_catalog(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<SearchCatalogQuery>,
) -> impl IntoResponse {
    if !can_write_stock(&ctx) && !is_supervisor(&ctx) && !ctx.has_module(MODULE_ESTOQUE_ITENS) {
        return deny_module();
    }
    let term = q.q.unwrap_or_default();
    if term.trim().len() < 1 {
        return (StatusCode::OK, Json(json!({ "items": [] }))).into_response();
    }
    let mut conn = conexao!(state);
    match store::search_erp_catalog(&mut conn, &term, q.limit.unwrap_or(40)).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "items": items }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn get_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::get_item(&mut conn, &code).await {
        Ok(Some(item)) => (StatusCode::OK, Json(json!({ "item": item }))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado no catálogo operacional." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn upsert_item_config(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<UpsertItemConfigRequest>,
) -> Result<Response, ErroApi> {
    let section = body
        .section
        .clone()
        .unwrap_or_else(|| "almoxarifado".into());
    if !can_write_section(&ctx, &section) {
        // allow update if already can write stock and section omitted later — check item
        if !can_write_stock(&ctx) {
            return Err(permissao(SEM_PERMISSAO));
        }
    }
    let r = servicos::salvar_config_item(state.db.pool(), code, body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn create_local_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CreateLocalItemRequest>,
) -> Result<Response, ErroApi> {
    if body.section.trim().to_lowercase() != "supermercado" {
        return Err(permissao("Cadastro local só no Supermercado."));
    }
    if !can_write_section(&ctx, "supermercado") {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::criar_item_local(state.db.pool(), body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn create_movement(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CreateMovementRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_stock(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let allow_neg = body.allow_negative.unwrap_or(false) && is_supervisor(&ctx);
    let is_ajuste = body.movement_type.eq_ignore_ascii_case("ajuste");
    if is_ajuste && !is_supervisor(&ctx) {
        return Err(permissao("Ajuste de saldo exige supervisor."));
    }

    let pool = state.db.pool();
    let r = servicos::lancar_movimento(
        pool,
        body,
        allow_neg || is_ajuste && is_supervisor(&ctx),
        ctx.operator_id.clone(),
        &autor(&ctx),
        c.confirmar,
    )
    .await?;
    if c.confirmar {
        if let Some(mv) = r.resultado.get("movement").and_then(|v| serde_json::from_value::<AlmoxMovementRow>(v.clone()).ok()) {
            if let Ok(mut conn) = pool.acquire().await {
                if let Ok(stats) = store::item_stats(&mut conn, &mv.item_code).await {
                    if stats.below_min {
                        notifications::notify(
                            &state,
                            MODULE_ESTOQUE_ALMOX,
                            "warning",
                            "Estoque ops: abaixo do mínimo",
                            &format!(
                                "{} ({}) — saldo {:.3}, mínimo {:.3}",
                                mv.item_description.as_deref().unwrap_or(&mv.item_code),
                                mv.item_code,
                                stats.qty_on_hand,
                                stats.min_qty
                            ),
                            None,
                        );
                    }
                }
            }
        }
    }
    Ok(resposta(&r))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementsQuery {
    pub item_code: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
}

pub async fn list_movements(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<MovementsQuery>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_movements(
        &mut conn,
        q.item_code.as_deref(),
        q.from.as_deref(),
        q.to.as_deref(),
        q.limit.unwrap_or(200),
    )
    .await
    {
        Ok(movements) => (StatusCode::OK, Json(json!({ "movements": movements }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn get_item_stats(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::item_stats(&mut conn, &code).await {
        Ok(s) => (StatusCode::OK, Json(json!({ "stats": s }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn list_replenishment(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_replenishment(&mut conn).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "items": items }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn list_demands(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !require_compras_almox(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_demands(&mut conn, None).await {
        Ok(demands) => (StatusCode::OK, Json(json!({ "demands": demands }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_demand(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CreateDemandRequest>,
) -> Result<Response, ErroApi> {
    if !require_compras_almox(&ctx) && !has_any_ops(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::criar_demanda(state.db.pool(), body, ctx.operator_id.clone(), &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn create_demand_from_min(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    if !require_compras_almox(&ctx) && !has_any_ops(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::criar_demanda_do_minimo(state.db.pool(), ctx.operator_id.clone(), &autor(&ctx), c.confirmar).await?;
    if c.confirmar {
        let titulo = r
            .resultado
            .get("demand")
            .and_then(|d| d.get("title"))
            .and_then(|t| t.as_str())
            .unwrap_or("Reposição")
            .to_string();
        notifications::notify(&state, MODULE_ESTOQUE_ALMOX, "info", "Nova demanda de almoxarifado", &titulo, None);
    }
    Ok(resposta(&r))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQuery {
    pub item_code: Option<String>,
    pub q: Option<String>,
}

pub async fn get_item_purchase_history(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(params): Query<HistoryQuery>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::get_item_purchase_history(&mut conn, params.item_code.as_deref(), params.q.as_deref()).await {
        Ok(history) => (StatusCode::OK, Json(json!({ "history": history }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn latest_stock_count(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::latest_stock_count(&mut conn).await {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn apply_stock_count(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<StockCountRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_stock(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::aplicar_contagem(state.db.pool(), body, ctx.operator_id.clone(), &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

// Equipamentos / Manutenções

fn can_park(ctx: &AuthContext) -> bool {
    is_supervisor(ctx)
        || ctx.has_module(MODULE_ESTOQUE_EQUIPAMENTOS)
        || ctx.has_module(MODULE_ESTOQUE_MANUTENCOES)
        || ctx.has_module(MODULE_ESTOQUE_PECAS)
}

fn can_write_park(ctx: &AuthContext) -> bool {
    is_supervisor(ctx)
        || ctx.has_module(MODULE_ESTOQUE_EQUIPAMENTOS)
        || ctx.has_module(MODULE_ESTOQUE_MANUTENCOES)
}

pub async fn list_equipments(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !can_park(&ctx) && !ctx.has_module(MODULE_ESTOQUE_ITENS) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_equipments(&mut conn).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "equipments": items }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn get_equipment(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !can_park(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::get_equipment(&mut conn, &id).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "equipment": item }))).into_response(),
        Err(e) if e.contains("não encontrado") => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": e }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_equipment(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<UpsertEquipmentRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_park(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::salvar_equipamento(state.db.pool(), "criar_equipamento_almox", None, body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn update_equipment(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<UpsertEquipmentRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_park(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::salvar_equipamento(state.db.pool(), "atualizar_equipamento_almox", Some(id), body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintQuery {
    pub equipment_id: Option<String>,
}

pub async fn list_maintenances(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<MaintQuery>,
) -> impl IntoResponse {
    if !can_park(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_maintenances(&mut conn, q.equipment_id.as_deref()).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "maintenances": items }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_maintenance(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<CreateMaintenanceRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_park(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::criar_manutencao(state.db.pool(), body, ctx.operator_id.clone(), &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn update_maintenance(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<UpdateMaintenanceRequest>,
) -> Result<Response, ErroApi> {
    if !can_write_park(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::atualizar_manutencao(state.db.pool(), id, body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn get_dashboard_stats(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::get_dashboard_stats(&mut conn).await {
        Ok(stats) => (StatusCode::OK, Json(stats)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn list_fotos(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((entity_type, entity_id)): Path<(String, String)>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_fotos(&mut conn, &entity_type, &entity_id).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "fotos": items }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn add_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((entity_type, entity_id)): Path<(String, String)>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AddFotoRequest>,
) -> Result<Response, ErroApi> {
    if !has_any_ops(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::adicionar_foto(state.db.pool(), entity_type, entity_id, body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn delete_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    if !has_any_ops(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::excluir_foto(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn get_item_consumption(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::get_item_consumption(&mut conn, &code).await {
        Ok(c) => (StatusCode::OK, Json(c)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn list_familias(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    let mut conn = conexao!(state);
    match store::list_familias(&mut conn).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "familias": items }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn upsert_familia(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AlmoxFamilia>,
) -> Result<Response, ErroApi> {
    if !can_write_stock(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::salvar_familia(state.db.pool(), body, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn delete_familia(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    if !can_write_stock(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::excluir_familia(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn delete_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    if !can_write_stock(&ctx) {
        return Err(permissao(SEM_PERMISSAO));
    }
    let r = servicos::excluir_item(state.db.pool(), code, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r))
}

pub async fn get_print_sequence(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    let mut conn = conexao!(state);
    match store::get_print_sequence(&mut conn).await {
        Ok(seq) => (StatusCode::OK, Json(json!({ "lastSequence": seq, "nextSequence": seq + 1 }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}


