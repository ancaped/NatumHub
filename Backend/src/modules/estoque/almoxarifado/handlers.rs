use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_COMPRAS_ALMOX, MODULE_ESTOQUE_ALMOX, MODULE_ESTOQUE_EQUIPAMENTOS, MODULE_ESTOQUE_ITENS,
    MODULE_ESTOQUE_MANUTENCOES, MODULE_ESTOQUE_PECAS, MODULE_ESTOQUE_SUPERMERCADO,
};
use crate::modules::geral::notifications;

use super::models::*;
use super::store;

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
        || ctx.has_module(MODULE_COMPRAS_ALMOX)
}

fn module_for_section(section: &str) -> Option<&'static str> {
    match section {
        "almoxarifado" => Some(MODULE_ESTOQUE_ALMOX),
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
        || ctx.has_module(MODULE_COMPRAS_ALMOX)
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
    let pool = state.db.pool();
    match store::list_items(
        pool,
        q.only_active.unwrap_or(false),
        q.section.as_deref(),
    )
    .await
    {
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
    match store::search_erp_catalog(state.db.pool(), &term, q.limit.unwrap_or(40)).await {
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
    match store::get_item(state.db.pool(), &code).await {
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
    Json(body): Json<UpsertItemConfigRequest>,
) -> impl IntoResponse {
    let section = body
        .section
        .clone()
        .unwrap_or_else(|| "almoxarifado".into());
    if !can_write_section(&ctx, &section) {
        // allow update if already can write stock and section omitted later — check item
        if !can_write_stock(&ctx) {
            return deny_module();
        }
    }
    let pool = state.db.pool();
    match store::upsert_item_config(pool, &code, &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "item": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn link_erp_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<LinkErpItemRequest>,
) -> impl IntoResponse {
    if !can_write_section(&ctx, &body.section) {
        return deny_module();
    }
    match store::link_erp_item(state.db.pool(), &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "item": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn create_local_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateLocalItemRequest>,
) -> impl IntoResponse {
    if body.section.trim().to_lowercase() != "supermercado" {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Cadastro local só no Supermercado." })),
        )
            .into_response();
    }
    if !can_write_section(&ctx, "supermercado") {
        return deny_module();
    }
    match store::create_local_item(state.db.pool(), &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "item": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn create_movement(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateMovementRequest>,
) -> impl IntoResponse {
    if !can_write_stock(&ctx) {
        return deny_module();
    }
    let allow_neg = body.allow_negative.unwrap_or(false) && is_supervisor(&ctx);
    let is_ajuste = body.movement_type.eq_ignore_ascii_case("ajuste");
    if is_ajuste && !is_supervisor(&ctx) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Ajuste de saldo exige supervisor." })),
        )
            .into_response();
    }

    let pool = state.db.pool();
    match store::create_movement(
        pool,
        Some(&ctx.operator_id),
        &body,
        allow_neg || is_ajuste && is_supervisor(&ctx),
        None,
    )
    .await
    {
        Ok(mv) => {
            if let Ok(stats) = store::item_stats(pool, &mv.item_code).await {
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
            (StatusCode::OK, Json(json!({ "movement": mv }))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
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
    let pool = state.db.pool();
    match store::list_movements(
        pool,
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
    match store::item_stats(state.db.pool(), &code).await {
        Ok(s) => (StatusCode::OK, Json(json!({ "stats": s }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn seed_from_erp(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    if !is_supervisor(&ctx) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Seed do ERP exige supervisor." })),
        )
            .into_response();
    }
    match store::seed_from_erp(state.db.pool(), &code, Some(&ctx.operator_id)).await {
        Ok(mv) => (StatusCode::OK, Json(json!({ "movement": mv }))).into_response(),
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
    match store::list_replenishment(state.db.pool()).await {
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
    match store::list_demands(state.db.pool(), None).await {
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
    Json(body): Json<CreateDemandRequest>,
) -> impl IntoResponse {
    if !require_compras_almox(&ctx) {
        return deny_module();
    }
    match store::create_demand(state.db.pool(), Some(&ctx.operator_id), &body).await {
        Ok(d) => (StatusCode::OK, Json(json!({ "demand": d }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn create_demand_from_min(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !require_compras_almox(&ctx) {
        return deny_module();
    }
    match store::create_demands_from_replenishment(state.db.pool(), Some(&ctx.operator_id)).await {
        Ok(d) => {
            notifications::notify(
                &state,
                MODULE_COMPRAS_ALMOX,
                "info",
                "Nova demanda de almoxarifado",
                d.title.as_deref().unwrap_or("Reposição"),
                None,
            );
            (StatusCode::OK, Json(json!({ "demand": d }))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn update_demand_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDemandStatusRequest>,
) -> impl IntoResponse {
    if !require_compras_almox(&ctx) {
        return deny_module();
    }
    match store::update_demand_status(state.db.pool(), &id, &body.status).await {
        Ok(d) => (StatusCode::OK, Json(json!({ "demand": d }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn receive_demand(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<ReceiveDemandRequest>,
) -> impl IntoResponse {
    if !require_compras_almox(&ctx) {
        return deny_module();
    }
    match store::receive_demand(state.db.pool(), &id, Some(&ctx.operator_id), &body).await {
        Ok(d) => (StatusCode::OK, Json(json!({ "demand": d }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
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
    match store::list_equipments(state.db.pool()).await {
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
    match store::get_equipment(state.db.pool(), &id).await {
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
    Json(body): Json<UpsertEquipmentRequest>,
) -> impl IntoResponse {
    if !can_write_park(&ctx) {
        return deny_module();
    }
    match store::upsert_equipment(state.db.pool(), None, &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "equipment": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn update_equipment(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<UpsertEquipmentRequest>,
) -> impl IntoResponse {
    if !can_write_park(&ctx) {
        return deny_module();
    }
    match store::upsert_equipment(state.db.pool(), Some(&id), &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "equipment": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
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
    match store::list_maintenances(state.db.pool(), q.equipment_id.as_deref()).await {
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
    Json(body): Json<CreateMaintenanceRequest>,
) -> impl IntoResponse {
    if !can_write_park(&ctx) {
        return deny_module();
    }
    match store::create_maintenance(state.db.pool(), Some(&ctx.operator_id), &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "maintenance": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn update_maintenance(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<UpdateMaintenanceRequest>,
) -> impl IntoResponse {
    if !can_write_park(&ctx) {
        return deny_module();
    }
    match store::update_maintenance(state.db.pool(), &id, &body).await {
        Ok(item) => (StatusCode::OK, Json(json!({ "maintenance": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn get_dashboard_stats(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    match store::get_dashboard_stats(state.db.pool()).await {
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
    match store::list_fotos(state.db.pool(), &entity_type, &entity_id).await {
        Ok(items) => (StatusCode::OK, Json(json!({ "fotos": items }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn add_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((entity_type, entity_id)): Path<(String, String)>,
    Json(body): Json<AddFotoRequest>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    match store::add_foto(
        state.db.pool(),
        &entity_type,
        &entity_id,
        &body.photo_data,
        body.notes.as_deref(),
    )
    .await
    {
        Ok(item) => (StatusCode::OK, Json(json!({ "foto": item }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn delete_foto(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    match store::delete_foto(state.db.pool(), &id).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn get_item_consumption(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    if !has_any_ops(&ctx) {
        return deny_module();
    }
    match store::get_item_consumption(state.db.pool(), &code).await {
        Ok(c) => (StatusCode::OK, Json(c)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}
