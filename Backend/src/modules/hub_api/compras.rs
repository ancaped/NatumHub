use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::*;
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

fn mode_to_parent_category(mode: Option<&str>) -> Option<String> {
    match mode {
        Some("embalagens") => Some("cat_emb".to_string()),
        Some("materia_prima") => Some("cat_mp".to_string()),
        Some("coloracao") => Some("coloracao".to_string()),
        Some("apoio") => Some("apoio".to_string()),
        _ => None,
    }
}

/// `GET /api/hub/compras/items`: sem parâmetros devolve só `items`; qualquer um deles junta os produtos de Apoio/Coloração.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemsQuery {
    #[serde(alias = "category_id")]
    category_id: Option<String>,
    search: Option<String>,
    #[serde(default)]
    incluir_produtos: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemandsQuery {
    category_id: Option<String>,
    #[serde(default = "default_target_days")]
    target_days: i32,
    override_period: Option<i32>,
}

fn default_target_days() -> i32 {
    90
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeQuery {
    code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusQuery {
    status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigKeyQuery {
    key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModeQuery {
    mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpendingQuery {
    start: String,
    end: String,
    mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemCodeQuery {
    item_code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemDetailsBody {
    code: String,
    notes: Option<String>,
    is_ignored: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimilarItemsBody {
    code_a: String,
    code_b: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemsCategoryBody {
    codes: Vec<String>,
    category_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportObservationsBody {
    observations: Vec<ObsInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteCustomConfigQuery {
    level: String,
    target_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateQuotationBody {
    title: String,
    item_codes: Vec<String>,
    recommended_qtys: Vec<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateQuotationStatusBody {
    status: String,
    notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectSupplierBody {
    quotation_item_id: String,
    price_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateQuotationItemQtyBody {
    field: String,
    qty: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportStockBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportConsumptionBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportInvoicesBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveComprasConfigBody {
    config: serde_json::Value,
    key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCustomConfigBody {
    row: CustomPurchaseConfigRow,
}

// --- Categories ---

async fn get_categories_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_categories_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_category_handler(State(state): State<Arc<AppState>>, Json(category): Json<Category>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_category_query(pool, &category)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_category_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(id): Path<String>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "a categoria", "SELECT to_jsonb(c) || jsonb_build_object('itensRemapeados', COALESCE((SELECT jsonb_agg(i.code) FROM items i WHERE i.category_id = c.id), '[]'::jsonb), 'produtosComCategoria', COALESCE((SELECT jsonb_agg(o.codigo) FROM overrides_produtos o WHERE o.categoria_produto = c.id), '[]'::jsonb)) FROM categories c WHERE c.id = $1", &[&id]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_category_query(pool, &id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_apoio", "excluir_categoria", "category", &id, "Categoria de compras excluída").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

// --- Items ---

async fn get_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<ItemsQuery>) -> impl IntoResponse {
    let filtro = FiltroItens { category_id: q.category_id, search: q.search, incluir_produtos: q.incluir_produtos };
    match with_pool(&state, |pool| get_items_query(pool, filtro)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_item_details_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemDetailsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_item_details_query(pool, &body.code, body.notes, body.is_ignored)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkSimilarBody {
    group_id: Option<String>,
    codes: Vec<String>,
}

async fn list_similar_groups_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, list_similar_groups_query).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn link_similar_group_handler(State(state): State<Arc<AppState>>, Json(body): Json<LinkSimilarBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| link_similar_group_query(pool, body.group_id.clone(), body.codes.clone())).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn unlink_similar_group_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(id): Path<String>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "o grupo de itens semelhantes", "SELECT jsonb_agg(to_jsonb(l)) FROM item_similar_links l WHERE l.group_id = $1", &[&id]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| unlink_similar_group_query(pool, &id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_apoio", "desfazer_grupo_semelhantes", "item_similar_group", &id, "Grupo de itens semelhantes desfeito").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn unlink_similar_item_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(code): Path<String>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "o item do grupo de semelhantes", "SELECT jsonb_agg(to_jsonb(l)) FROM item_similar_links l WHERE l.group_id IN (SELECT group_id FROM item_similar_links WHERE item_code = $1)", &[&code]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| unlink_similar_item_from_group_query(pool, &code)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_apoio", "tirar_item_do_grupo_semelhantes", "item_similar_link", &code, "Item tirado do grupo de semelhantes").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetItemStockBody {
    code: String,
    stock: f64,
}

async fn list_stock_calibrations_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, list_stock_calibrations_query).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn set_item_real_stock_handler(State(state): State<Arc<AppState>>, Json(body): Json<SetItemStockBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| set_item_real_stock_query(pool, &body.code, body.stock)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn list_similar_pairs_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, list_similar_pairs_query).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_similar_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<CodeQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_similar_items_query(pool, &q.code)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_similar_item_handler(State(state): State<Arc<AppState>>, Json(body): Json<SimilarItemsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| add_similar_item_query(pool, &body.code_a, &body.code_b)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn remove_similar_item_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(q): Query<SimilarItemsBody>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "o vínculo de itens semelhantes", "SELECT jsonb_build_object('par', (SELECT jsonb_agg(to_jsonb(s)) FROM similar_items s WHERE s.item_code_a = LEAST($1, $2) AND s.item_code_b = GREATEST($1, $2)))", &[&q.code_a, &q.code_b]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| remove_similar_item_query(pool, &q.code_a, &q.code_b)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_apoio", "remover_item_semelhante", "similar_items", &format!("{}/{}", q.code_a, q.code_b), "Vínculo de itens semelhantes removido").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn update_items_category_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemsCategoryBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_items_category_query(pool, &body.codes, body.category_id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrocarCategoriaItemBody {
    #[serde(default)]
    category_id: String,
}

// POST /api/hub/compras/items/:code/categoria (2 passos: sem confirmar=true só devolve a prévia)
async fn trocar_categoria_item_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<crate::core::acao::Confirmar>,
    Json(body): Json<TrocarCategoriaItemBody>,
) -> impl IntoResponse {
    match trocar_categoria_item(state.db.pool(), &ctx, &code, &body.category_id, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SalvarCategoriaBody {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    parent_id: String,
}

// POST /api/hub/compras/categorias (2 passos: sem confirmar=true só devolve a prévia)
async fn salvar_categoria_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(c): Query<crate::core::acao::Confirmar>,
    Json(body): Json<SalvarCategoriaBody>,
) -> impl IntoResponse {
    match salvar_categoria_compras(state.db.pool(), &ctx, body.id.as_deref(), &body.name, &body.parent_id, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_item_observations_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportObservationsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_item_observations_query(pool, &body.observations)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Demands & Custom Configs ---

async fn get_demands_handler(State(state): State<Arc<AppState>>, Query(q): Query<DemandsQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_demands_query(pool, q.category_id, q.target_days, q.override_period)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_custom_configs_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_custom_purchase_configs_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_custom_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveCustomConfigBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_custom_purchase_config_query(pool, &body.row)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_custom_config_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(q): Query<DeleteCustomConfigQuery>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "a configuração personalizada", "SELECT to_jsonb(c) FROM compras_config_personalizado c WHERE c.level = $1 AND c.target_id = $2", &[&q.level, &q.target_id]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_custom_purchase_config_query(pool, &q.level, &q.target_id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_apoio", "excluir_config_personalizada", "compras_config_personalizado", &format!("{}/{}", q.level, q.target_id), "Configuração personalizada de compras excluída").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

// --- Quotations ---

async fn create_quotation_handler(State(state): State<Arc<AppState>>, Json(body): Json<CreateQuotationBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| create_quotation_query(pool, &body.title, &body.item_codes, &body.recommended_qtys)).await {
        Ok(id) => ok_json(serde_json::json!({ "id": id })).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotations_handler(State(state): State<Arc<AppState>>, Query(q): Query<StatusQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_quotations_query(pool, q.status)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotation_detail_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_quotation_detail_query(pool, &id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_status_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationStatusBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_quotation_status_query(pool, &id, &body.status, body.notes)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_quotation_price_handler(State(state): State<Arc<AppState>>, Json(price): Json<QuotationPriceInput>) -> impl IntoResponse {
    match with_pool(&state, |pool| add_quotation_price_query(pool, &price)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn select_supplier_handler(State(state): State<Arc<AppState>>, Json(body): Json<SelectSupplierBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| select_supplier_query(pool, &body.quotation_item_id, &body.price_id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_quotation_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(id): Path<String>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(state.db.pool(), m.motivo.as_deref(), "a cotação", "SELECT to_jsonb(q) || jsonb_build_object('itens', COALESCE((SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object('precos', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM quotation_prices p WHERE p.quotation_item_id = i.id), '[]'::jsonb))) FROM quotation_items i WHERE i.quotation_id = q.id), '[]'::jsonb)) FROM quotations q WHERE q.id = $1", &[&id]).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_quotation_query(pool, &id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_quotations", "excluir_cotacao", "quotation", &id, "Cotação excluída").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_item_qty_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationItemQtyBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_quotation_item_qty_query(pool, &id, &body.field, body.qty)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Suppliers & Reports ---

async fn get_suppliers_handler(State(state): State<Arc<AppState>>, Query(q): Query<ModeQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_suppliers_query(pool, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_supplier_handler(State(state): State<Arc<AppState>>, Json(supplier): Json<Supplier>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_supplier_query(pool, &supplier)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn unify_suppliers_handler(State(state): State<Arc<AppState>>, Json(req): Json<UnifySuppliersRequest>) -> impl IntoResponse {
    match with_pool(&state, move |pool| async move {
        unify_suppliers_query(pool, &req.parent_id, &req.child_ids).await
    }).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn unlink_supplier_handler(State(state): State<Arc<AppState>>, Json(req): Json<UnlinkSupplierRequest>) -> impl IntoResponse {
    match with_pool(&state, move |pool| async move {
        unlink_supplier_query(pool, &req.supplier_id).await
    }).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_supplier_history_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_supplier_history_query(pool, &id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_price_evolution_handler(State(state): State<Arc<AppState>>, Query(q): Query<ItemCodeQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_price_evolution_query(pool, &q.item_code)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_supplier_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_spending_by_supplier_query(pool, &q.start, &q.end, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_category_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_spending_by_category_query(pool, &q.start, &q.end, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Config ---

async fn get_compras_config_handler(State(state): State<Arc<AppState>>, Query(q): Query<ConfigKeyQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_compras_config_query(pool, q.key)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_compras_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveComprasConfigBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_compras_config_query(pool, &body.config, body.key)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_pinned_subcategories_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, get_pinned_subcategories_query).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct PinnedSubcategoriesBody {
    ids: Vec<String>,
}

async fn save_pinned_subcategories_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PinnedSubcategoriesBody>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| save_pinned_subcategories_query(pool, &body.ids)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Imports ---

async fn import_stock_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportStockBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_stock_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_consumption_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportConsumptionBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_consumption_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_invoices_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportInvoicesBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_invoices_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_import_history_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_import_history_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_nf_import_control_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_nf_import_control_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PurchaseListsQuery {
    modulo: Option<String>,
    status: Option<String>,
    search: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePurchaseListBody {
    status: Option<String>,
    observacoes: Option<String>,
}

async fn get_purchase_lists_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PurchaseListsQuery>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| {
        get_purchase_request_batches_query(
            pool,
            query.modulo.as_deref(),
            query.status.as_deref(),
            query.search.as_deref(),
        )
    })
    .await
    {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_purchase_list_detail_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| get_purchase_request_batch_detail_query(pool, &id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn create_purchase_list_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreatePurchaseRequestBatchInput>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| create_purchase_request_batch_query(pool, input)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_purchase_list_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePurchaseListBody>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| {
        update_purchase_request_batch_query(pool, &id, body.status.as_deref(), body.observacoes.as_deref())
    })
    .await
    {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_purchase_list_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Path(id): Path<String>,
    Query(m): Query<crate::core::acao::Motivo>,
) -> impl IntoResponse {
    let copia = match crate::core::exclusao::preparar(
        state.db.pool(),
        m.motivo.as_deref(),
        "a lista de compra",
        "SELECT to_jsonb(b) || jsonb_build_object('itens', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM purchase_request_items i WHERE i.batch_id = b.id), '[]'::jsonb)) FROM purchase_request_batches b WHERE b.id = $1",
        &[&id],
    )
    .await
    {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| delete_purchase_request_batch_query(pool, &id)).await {
        Ok(()) => {
            copia.registrar(state.db.pool(), &ctx, "compras_pedidos", "excluir_lista_compra", "purchase_list", &id, "Lista de compra excluída").await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn get_active_requested_items_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_active_requested_items_summary_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Categories
        .route("/api/hub/compras/categories", get(get_categories_handler).post(save_category_handler))
        .route("/api/hub/compras/categories/:id", delete(delete_category_handler))
        .route("/api/hub/compras/categorias", post(salvar_categoria_handler))
        // Items
        .route("/api/hub/compras/items", get(get_items_handler))
        .route("/api/hub/compras/items/details", post(update_item_details_handler))
        .route("/api/hub/compras/items/similar", get(get_similar_items_handler).post(add_similar_item_handler).delete(remove_similar_item_handler))
        .route("/api/hub/compras/items/similar/pairs", get(list_similar_pairs_handler))
        .route("/api/hub/compras/items/similar/groups", get(list_similar_groups_handler))
        .route("/api/hub/compras/items/similar/groups/:id", delete(unlink_similar_group_handler))
        .route("/api/hub/compras/items/similar/link", post(link_similar_group_handler))
        .route("/api/hub/compras/items/similar/item/:code", delete(unlink_similar_item_handler))
        .route("/api/hub/compras/items/stock-calibrations", get(list_stock_calibrations_handler))
        .route("/api/hub/compras/items/stock", post(set_item_real_stock_handler))
        .route("/api/hub/compras/items/category", post(update_items_category_handler))
        .route("/api/hub/compras/items/:code/categoria", post(trocar_categoria_item_handler))
        .route("/api/hub/compras/items/observations", post(import_item_observations_handler))
        // Demands
        .route("/api/hub/compras/demands", get(get_demands_handler))
        .route("/api/hub/compras/custom-configs", get(get_custom_configs_handler).post(save_custom_config_handler).delete(delete_custom_config_handler))
        // Purchase Request Lists (Lotes de Listas & Acompanhamento)
        .route("/api/hub/compras/listas", get(get_purchase_lists_handler).post(create_purchase_list_handler))
        .route("/api/hub/compras/listas/:id", get(get_purchase_list_detail_handler).patch(update_purchase_list_handler).delete(delete_purchase_list_handler))
        .route("/api/hub/compras/itens-solicitados", get(get_active_requested_items_handler))
        // Quotations
        .route("/api/hub/compras/quotations", get(get_quotations_handler).post(create_quotation_handler))
        .route("/api/hub/compras/quotations/:id", get(get_quotation_detail_handler).delete(delete_quotation_handler))
        .route("/api/hub/compras/quotations/:id/status", post(update_quotation_status_handler))
        .route("/api/hub/compras/quotations/:id/qty", post(update_quotation_item_qty_handler))
        .route("/api/hub/compras/quotations/prices", post(add_quotation_price_handler))
        .route("/api/hub/compras/quotations/select-supplier", post(select_supplier_handler))
        // Suppliers
        .route("/api/hub/compras/suppliers", get(get_suppliers_handler).post(save_supplier_handler))
        .route("/api/hub/compras/suppliers/unify", post(unify_suppliers_handler))
        .route("/api/hub/compras/suppliers/unlink", post(unlink_supplier_handler))
        .route("/api/hub/compras/suppliers/:id/history", get(get_supplier_history_handler))
        // Reports
        .route("/api/hub/compras/price-evolution", get(get_price_evolution_handler))
        .route("/api/hub/compras/spending/supplier", get(get_spending_by_supplier_handler))
        .route("/api/hub/compras/spending/category", get(get_spending_by_category_handler))
        // Config
        .route("/api/hub/compras/config", get(get_compras_config_handler).post(save_compras_config_handler))
        .route(
            "/api/hub/compras/pinned-subcategories",
            get(get_pinned_subcategories_handler).post(save_pinned_subcategories_handler),
        )
        // Imports
        .route("/api/hub/compras/imports/stock", post(import_stock_handler))
        .route("/api/hub/compras/imports/consumption", post(import_consumption_handler))
        .route("/api/hub/compras/imports/invoices", post(import_invoices_handler))
        .route("/api/hub/compras/imports/history", get(get_import_history_handler))
        .route("/api/hub/compras/imports/nf-control", get(get_nf_import_control_handler))
        // Online orders & stores
}

/// Ações de leitura do Hub de Compras descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const MP: &str = "compras_materia_prima";
    vec![
        Acao::leitura(
            "listar_categorias_compras",
            MP,
            "Lista as categorias e subcategorias do Hub de Compras (id, nome e categoria-mãe). Use para obter o `categoryId` dos filtros de `listar_itens_compras` e `simular_demanda_compras`.",
            "/api/hub/compras/categories",
            vec![],
        ),
        Acao::leitura(
            "listar_itens_compras",
            MP,
            "Lista os itens do Hub de Compras por descrição: código, descrição, unidade, categoria, linha, tipo, observação e se está ignorado (e por quê). SEM filtro vêm só os insumos (matéria-prima, embalagens e materiais). Com `categoryId`, `search` ou `incluirProdutos=true` entram também os produtos de Material de Apoio e Coloração (marcados com `isProduct: true`, inclusive os ocultos, com `isIgnored: true`). `categoryId` aceita o id ou o nome exato da categoria e já inclui todas as subcategorias. Não traz estoque nem consumo: para isso use `simular_demanda_compras`.",
            "/api/hub/compras/items",
            vec![
                param("categoryId", "query", "texto", false, "Id ou nome exato (sem diferenciar maiúsculas) da categoria; inclui as subcategorias (ex.: cat_mp, cat_emb, cat_apoio, cat_coloracao). Ids em `listar_categorias_compras`."),
                param("search", "query", "texto", false, "Parte do código ou da descrição."),
                param("incluirProdutos", "query", "booleano", false, "true junta os produtos de Apoio/Coloração mesmo sem outro filtro (padrão false)."),
            ],
        ),
        Acao::gravacao(
            "salvar_categoria_compras",
            "compras_categorias",
            "Cria ou renomeia uma subcategoria do Hub de Compras. Sem `confirmar=true` devolve a prévia (`antes`, `depois`, `mudou`) e não grava; com ele grava e audita. `parentId` é obrigatório e precisa existir; `name` não pode ser vazio; sem `id` gera um (a prévia devolve `id` nulo). Recusa alterar categorias raiz e criar ciclo; `parentId` diferente do atual move a subcategoria. Não exclui. Os ids vêm de `listar_categorias_compras`.",
            "POST",
            "/api/hub/compras/categorias",
            true,
            vec![
                param("id", "corpo", "texto", false, "Id da categoria a renomear/mover; ausente cria uma nova."),
                param("name", "corpo", "texto", true, "Nome da categoria."),
                param("parentId", "corpo", "texto", true, "Id da categoria-mãe."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        ),
        Acao::gravacao(
            "trocar_categoria_item",
            "compras_apoio",
            "Troca a categoria de um item (produto de Apoio/Coloração ou insumo) pelo `code`. Sem `confirmar=true` devolve a prévia (`categoriaAntes`, `categoriaDepois`, `mudou`) e não grava; com ele grava e audita. Permissão: o agente precisa de editar em um módulo da família da categoria de ORIGEM e em um da família do DESTINO (cat_apoio = compras_apoio; cat_coloracao = compras_coloracao; cat_mp = compras_materia_prima; cat_emb = compras_embalagens; demais = materia_prima ou embalagens); a recusa diz qual módulo falta. Produto só pode ser movido por agente se já for de Apoio/Coloração. Os ids de categoria vêm de `listar_categorias_compras`.",
            "POST",
            "/api/hub/compras/items/:code/categoria",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item (produto ou insumo)."),
                param("categoryId", "corpo", "texto", true, "Id da categoria de destino."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        ),
        Acao::leitura(
            "simular_demanda_compras",
            "compras_simulation",
            "Simulador de compras: necessidade de cada insumo para cobrir os dias-alvo (estoque, consumo, pedidos pendentes e sugestão).",
            "/api/hub/compras/demands",
            vec![
                param("categoryId", "query", "texto", false, "Filtra por categoria."),
                param("targetDays", "query", "inteiro", false, "Dias de cobertura desejados (padrão 90)."),
                param("overridePeriod", "query", "inteiro", false, "Período de consumo a considerar, em dias, no lugar do configurado."),
            ],
        ),
        Acao::leitura(
            "listar_itens_semelhantes_compras",
            MP,
            "Itens semelhantes (intercambiáveis) de um insumo, por descrição, com os mesmos campos de `listar_itens_compras`. Vazio se o insumo não tem semelhantes. Use para considerar substitutos antes de comprar.",
            "/api/hub/compras/items/similar",
            vec![param("code", "query", "texto", true, "Código do insumo.")],
        ),
        Acao::leitura(
            "listar_listas_compra",
            MP,
            "Lista as listas de compra (solicitações em lote): número do lote, módulo de origem, título, observações, quem criou, status, total de itens, quantos já têm pedido e quantos foram concluídos. Filtre por módulo, status e busca (lote, título, item). Para os itens use `detalhar_lista_compra`.",
            "/api/hub/compras/listas",
            vec![
                param("modulo", "query", "texto", false, "Módulo de origem (ex.: materia_prima, embalagens)."),
                param("status", "query", "texto", false, "Status da lista."),
                param("search", "query", "texto", false, "Busca livre."),
            ],
        ),
        Acao::leitura(
            "detalhar_lista_compra",
            MP,
            "Uma lista de compra pelo id: o cabeçalho (`batch`, com totais) e os itens solicitados, com o pedido do ERP vinculado quando existe. Use depois de `listar_listas_compra`.",
            "/api/hub/compras/listas/:id",
            vec![param("id", "caminho", "texto", true, "Id da lista.")],
        ),
        Acao::leitura(
            "listar_itens_solicitados",
            MP,
            "Resumo dos itens com solicitação de compra ativa (lista não cancelada nem concluída, dos últimos 90 dias): item, quantidade pedida, lista de origem, dias desde a solicitação, status e, quando o ERP já tem pedido, número, fornecedor, quantidades e previsão de entrega. Use antes de solicitar de novo.",
            "/api/hub/compras/itens-solicitados",
            vec![],
        ),
        Acao::leitura(
            "listar_cotacoes",
            "compras_quotations",
            "Lista as cotações de compra, da mais nova à mais antiga: título, status, dias-alvo, tipo, quantidade de itens, valor total e as datas de aprovação e pedido. Filtre por `status`. Para itens, fornecedores e preços use `detalhar_cotacao`.",
            "/api/hub/compras/quotations",
            vec![param("status", "query", "texto", false, "Status da cotação.")],
        ),
        Acao::leitura(
            "detalhar_cotacao",
            "compras_quotations",
            "Uma cotação pelo id: cabeçalho (título, status, dias-alvo, notas e aprovações) e cada item com a quantidade recomendada, aprovada e final e os preços por fornecedor. Use depois de `listar_cotacoes`.",
            "/api/hub/compras/quotations/:id",
            vec![param("id", "caminho", "texto", true, "Id da cotação.")],
        ),
        Acao::leitura(
            "listar_fornecedores_compras",
            MP,
            "Lista os fornecedores do Hub de Compras: nome, CNPJ, contato, e-mail, observações, fornecedor-mãe e quantos fornecedores estão unificados nele. `mode` restringe aos que venderam itens daquele grupo (materia_prima, embalagens, coloracao ou apoio).",
            "/api/hub/compras/suppliers",
            vec![param("mode", "query", "texto", false, "materia_prima, embalagens, coloracao ou apoio.")],
        ),
        Acao::leitura(
            "historico_fornecedor_compras",
            MP,
            "Histórico de compras de um fornecedor (e dos unificados com ele): `invoices` (itens das notas de entrada, com preço, valor, impostos e frete) e `pricePoints` (evolução de preços). Use para avaliar o fornecedor antes de cotar.",
            "/api/hub/compras/suppliers/:id/history",
            vec![param("id", "caminho", "texto", true, "Id do fornecedor.")],
        ),
        Acao::leitura(
            "evolucao_preco_item",
            MP,
            "Evolução do preço pago por um insumo: lista de pontos (data, preço unitário, fornecedor e nota) a partir das notas de entrada. Use para ver se o preço subiu antes de comprar.",
            "/api/hub/compras/price-evolution",
            vec![param("itemCode", "query", "texto", true, "Código do insumo.")],
        ),
        Acao::leitura(
            "gasto_por_fornecedor",
            MP,
            "Gasto no período (`start` e `end`) agrupado por fornecedor: fornecedor, valor total e quantidade de notas. `mode` restringe a um grupo (materia_prima, embalagens, coloracao ou apoio). Para a visão por categoria use `gasto_por_categoria`.",
            "/api/hub/compras/spending/supplier",
            vec![
                param("start", "query", "data", true, "Início (AAAA-MM-DD)."),
                param("end", "query", "data", true, "Fim (AAAA-MM-DD)."),
                param("mode", "query", "texto", false, "materia_prima, embalagens, coloracao ou apoio."),
            ],
        ),
        Acao::leitura(
            "gasto_por_categoria",
            MP,
            "Gasto no período (`start` e `end`) agrupado por categoria: categoria, valor total e quantidade de itens. `mode` restringe a um grupo (materia_prima, embalagens, coloracao ou apoio). Para a visão por fornecedor use `gasto_por_fornecedor`.",
            "/api/hub/compras/spending/category",
            vec![
                param("start", "query", "data", true, "Início (AAAA-MM-DD)."),
                param("end", "query", "data", true, "Fim (AAAA-MM-DD)."),
                param("mode", "query", "texto", false, "materia_prima, embalagens, coloracao ou apoio."),
            ],
        ),
    ]
}
