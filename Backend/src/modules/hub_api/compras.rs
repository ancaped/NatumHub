use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::core::acao::{corpo_acao, executar_em_2_passos, Confirmar, RespostaAcao};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::modules::compras::planejamento::commands::agente;
use crate::modules::compras::planejamento::commands::*;
use crate::modules::compras::planejamento::models::*;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NovaSubcategoria {
    nome: String,
    parent_id: String,
    motivo: String,
    periodo: Option<i32>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PostCategoria {
    /// Agente: `{nome, parentId, motivo}`. A tela continua com `{id, name, parentId}`.
    Agente(NovaSubcategoria),
    Tela(Category),
}

async fn save_category_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<PostCategoria>,
) -> Response {
    match body {
        PostCategoria::Tela(category) => {
            if !ctx.role.is_supervisor() {
                return crate::core::acao::ErroApi::novo(
                    axum::http::StatusCode::FORBIDDEN,
                    "apenas_supervisor",
                    "A gravação da tela de categorias continua só com o supervisor.",
                )
                .into_response();
            }
            match with_pool(&state, |pool| save_category_query(pool, &category)).await {
                Ok(()) => ok_status().into_response(),
                Err(e) => e.into_response(),
            }
        }
        PostCategoria::Agente(b) => {
            let ctx_tx = ctx.clone();
            let nome = b.nome.clone();
            let parent = b.parent_id.clone();
            let motivo = b.motivo.clone();
            let periodo = b.periodo;
            match executar_em_2_passos(state.db.pool(), "criar_subcategoria_compras", c.confirmar, move |tx| {
                Box::pin(async move { agente::criar_subcategoria(&mut **tx, &ctx_tx, &nome, &parent, periodo, &motivo).await })
            })
            .await
            {
                Ok(r) => concluir(state.db.pool(), &ctx, "criar_subcategoria_compras", "category", r, true).await,
                Err(e) => e.into_response(),
            }
        }
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AjustarCategoriaBody {
    nome: Option<String>,
    periodo: Option<i32>,
    motivo: String,
    #[serde(default)]
    permitir_restrito: bool,
}

// PATCH /api/hub/compras/categories/:id (2 passos). Raiz e Classe A exigem permitirRestrito=true.
async fn ajustar_categoria_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<AjustarCategoriaBody>,
) -> Response {
    let ctx_tx = ctx.clone();
    let id_tx = id.clone();
    let nome = body.nome.clone();
    let periodo = body.periodo;
    let restrito = body.permitir_restrito;
    let motivo = body.motivo.clone();
    match executar_em_2_passos(state.db.pool(), "ajustar_subcategoria_compras", c.confirmar, move |tx| {
        let nome = nome.clone();
        Box::pin(async move {
            agente::ajustar_subcategoria(&mut **tx, &ctx_tx, &id_tx, nome.as_deref(), periodo, restrito, &motivo).await
        })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "ajustar_subcategoria_compras", "category", r, false).await,
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoverItensBody {
    #[serde(default)]
    codigos: Vec<String>,
    #[serde(default)]
    category_id: String,
    #[serde(default)]
    motivo: String,
}

// POST /api/hub/compras/items/categoria/bulk (2 passos)
async fn mover_itens_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<MoverItensBody>,
) -> Response {
    let ctx_tx = ctx.clone();
    let codigos = body.codigos.clone();
    let category_id = body.category_id.clone();
    let motivo = body.motivo.clone();
    match executar_em_2_passos(state.db.pool(), "mover_itens_categoria", c.confirmar, move |tx| {
        Box::pin(async move { agente::mover_itens(&mut **tx, &ctx_tx, &codigos, &category_id, &motivo).await })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "mover_itens_categoria", "item", r, false).await,
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusItemBody {
    #[serde(default)]
    status: String,
    #[serde(default)]
    motivo: String,
}

// POST /api/hub/compras/items/:code/status (2 passos). Suspenso e ignorado saem da demanda; o cadastro fica.
async fn status_item_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Path(code): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<StatusItemBody>,
) -> Response {
    let ctx_tx = ctx.clone();
    let code_tx = code.clone();
    let status = body.status.clone();
    let motivo = body.motivo.clone();
    match executar_em_2_passos(state.db.pool(), "alterar_status_item_compras", c.confirmar, move |tx| {
        Box::pin(async move { agente::alterar_status_item(&mut **tx, &ctx_tx, &code_tx, &status, &motivo).await })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "alterar_status_item_compras", "item", r, false).await,
        Err(e) => e.into_response(),
    }
}

/// Números de cada item na hora do pedido: o que o agente mandou vale; o que faltar vem da demanda do ERP.
async fn dados_dos_itens(pool: &sqlx::PgPool, itens: &[CreatePurchaseRequestItemInput]) -> Vec<agente::DadosDoItem> {
    let completos = itens.iter().all(|i| i.current_stock_at_time.is_some() && i.overall_avg_at_time.is_some());
    let demanda = if completos {
        Vec::new()
    } else {
        get_demands_query(pool.clone(), None, default_target_days(), None).await.unwrap_or_default()
    };
    let por_codigo: std::collections::HashMap<String, &DemandResult> =
        demanda.iter().map(|d| (d.item_code.replace('.', ""), d)).collect();
    itens
        .iter()
        .map(|i| agente::DadosDoItem::montar(i, por_codigo.get(&i.item_code.trim().replace('.', "")).copied()))
        .collect()
}

fn id_do_resultado(v: &Value) -> String {
    v.pointer("/depois/id")
        .or_else(|| v.pointer("/depois/codigo"))
        .and_then(|x| x.as_str())
        .or_else(|| v.get("categoryId").and_then(|x| x.as_str()))
        .unwrap_or("-")
        .to_string()
}

async fn concluir(pool: &sqlx::PgPool, ctx: &AuthContext, acao: &'static str, entidade: &str, mut r: RespostaAcao<Value>, anular_id: bool) -> Response {
    if anular_id && r.previa {
        if let Some(obj) = r.resultado.get_mut("depois").and_then(|d| d.as_object_mut()) {
            obj.insert("id".into(), Value::Null);
        }
    }
    if !r.previa {
        let familia = r.resultado.get("familia").and_then(|v| v.as_str()).unwrap_or("compras_materia_prima").to_string();
        let id = id_do_resultado(&r.resultado);
        let motivo = r.resultado.get("motivo").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let antes = r.resultado.get("antes").cloned();
        let mut depois = r.resultado.get("depois").cloned().unwrap_or(Value::Null);
        if let Some(obj) = depois.as_object_mut() {
            obj.insert("motivo".into(), json!(motivo));
        }
        audit::record_domain(pool, Some(ctx), &familia, acao, entidade, &id, &format!("{acao}: {motivo}"), antes, Some(depois)).await;
    }
    Json(corpo_acao(&r)).into_response()
}

// --- Lista de Compra (itens separados para o próximo lote, uma lista por módulo) ---

#[derive(Deserialize)]
struct ListaCompraQuery {
    #[serde(default)]
    modulo: String,
}

// GET /api/hub/compras/lista-compra?modulo=
async fn lista_compra_handler(State(state): State<Arc<AppState>>, Query(q): Query<ListaCompraQuery>) -> impl IntoResponse {
    match listar_lista_compra(state.db.pool(), &q.modulo).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct ListaCompraCodigosBody {
    #[serde(default)]
    modulo: String,
    #[serde(default)]
    codigos: Vec<String>,
}

// POST /api/hub/compras/lista-compra/adicionar (2 passos)
async fn lista_compra_adicionar_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(c): Query<crate::core::acao::Confirmar>,
    Json(body): Json<ListaCompraCodigosBody>,
) -> impl IntoResponse {
    match adicionar_itens_lista_compra(state.db.pool(), &ctx, &body.modulo, &body.codigos, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// POST /api/hub/compras/lista-compra/remover (2 passos)
async fn lista_compra_remover_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(c): Query<crate::core::acao::Confirmar>,
    Json(body): Json<ListaCompraCodigosBody>,
) -> impl IntoResponse {
    match remover_itens_lista_compra(state.db.pool(), &ctx, &body.modulo, &body.codigos, c.confirmar).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListaCompraAjusteBody {
    #[serde(default)]
    modulo: String,
    #[serde(default)]
    codigo: String,
    #[serde(default)]
    quantidade_manual: Option<f64>,
    #[serde(default)]
    media_manual: Option<f64>,
}

// POST /api/hub/compras/lista-compra/ajustar (2 passos)
async fn lista_compra_ajustar_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Query(c): Query<crate::core::acao::Confirmar>,
    Json(body): Json<ListaCompraAjusteBody>,
) -> impl IntoResponse {
    match ajustar_item_lista_compra(state.db.pool(), &ctx, &body.modulo, &body.codigo, body.quantidade_manual, body.media_manual, c.confirmar).await {
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
    titulo: Option<String>,
    #[serde(default)]
    motivo: Option<String>,
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
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(input): Json<CreatePurchaseRequestBatchInput>,
) -> Response {
    let motivo = input.motivo.clone().unwrap_or_default();
    if motivo.trim().is_empty() {
        return match with_pool(&state, |pool| create_purchase_request_batch_query(pool, input)).await {
            Ok(v) => ok_json(v).into_response(),
            Err(e) => e.into_response(),
        };
    }
    let ctx_tx = ctx.clone();
    let modulo = input.modulo.clone();
    let titulo = input.titulo.clone();
    let observacoes = input.observacoes.clone();
    let created_by = input.created_by.clone().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| ctx.display_name.clone());
    let itens = input.items.clone();
    let dados = dados_dos_itens(state.db.pool(), &input.items).await;
    let confirmar = c.confirmar || input.confirmar;
    match executar_em_2_passos(state.db.pool(), "criar_lista_compra", confirmar, move |tx| {
        Box::pin(async move {
            let linhas: Vec<agente::ItemLista<'_>> = itens
                .iter()
                .zip(dados.iter())
                .map(|(i, d)| agente::ItemLista {
                    item_code: i.item_code.as_str(),
                    item_description: i.item_description.as_str(),
                    unit: i.unit.as_deref(),
                    quantity_requested: i.quantity_requested,
                    observacao: i.observacao.as_deref(),
                    dados: d.clone(),
                })
                .collect();
            agente::criar_lista(
                &mut **tx,
                &ctx_tx,
                &modulo,
                titulo.as_deref(),
                observacoes.as_deref(),
                &created_by,
                &linhas,
                &motivo,
            )
            .await
        })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "criar_lista_compra", "purchase_list", r, true).await,
        Err(e) => e.into_response(),
    }
}

async fn update_purchase_list_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<UpdatePurchaseListBody>,
) -> Response {
    let motivo = body.motivo.clone().unwrap_or_default();
    if motivo.trim().is_empty() {
        return match with_pool(&state, |pool| {
            update_purchase_request_batch_query(pool, &id, body.status.as_deref(), body.observacoes.as_deref())
        })
        .await
        {
            Ok(()) => ok_status().into_response(),
            Err(e) => e.into_response(),
        };
    }
    let ctx_tx = ctx.clone();
    let id_tx = id.clone();
    let titulo = body.titulo.clone();
    let observacoes = body.observacoes.clone();
    let status = body.status.clone();
    match executar_em_2_passos(state.db.pool(), "editar_lista_compra", c.confirmar, move |tx| {
        Box::pin(async move {
            agente::editar_lista(
                &mut **tx,
                &ctx_tx,
                &id_tx,
                titulo.as_deref(),
                observacoes.as_deref(),
                status.as_deref(),
                &motivo,
            )
            .await
        })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "editar_lista_compra", "purchase_list", r, false).await,
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncluirItensListaBody {
    #[serde(default)]
    itens: Vec<CreatePurchaseRequestItemInput>,
    #[serde(default)]
    motivo: String,
}

// POST /api/hub/compras/listas/:id/itens (2 passos)
async fn incluir_itens_lista_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<IncluirItensListaBody>,
) -> Response {
    let ctx_tx = ctx.clone();
    let id_tx = id.clone();
    let itens = body.itens.clone();
    let dados = dados_dos_itens(state.db.pool(), &body.itens).await;
    let motivo = body.motivo.clone();
    match executar_em_2_passos(state.db.pool(), "incluir_item_lista_compra", c.confirmar, move |tx| {
        Box::pin(async move {
            let linhas: Vec<agente::ItemLista<'_>> = itens
                .iter()
                .zip(dados.iter())
                .map(|(i, d)| agente::ItemLista {
                    item_code: i.item_code.as_str(),
                    item_description: i.item_description.as_str(),
                    unit: i.unit.as_deref(),
                    quantity_requested: i.quantity_requested,
                    observacao: i.observacao.as_deref(),
                    dados: d.clone(),
                })
                .collect();
            agente::incluir_itens_lista(&mut **tx, &ctx_tx, &id_tx, &linhas, &motivo).await
        })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "incluir_item_lista_compra", "purchase_list", r, false).await,
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetirarItensListaBody {
    #[serde(default)]
    codigos: Vec<String>,
    #[serde(default)]
    motivo: String,
}

// POST /api/hub/compras/listas/:id/itens/retirar (2 passos). Marca o item como retirado; não apaga a linha.
async fn retirar_itens_lista_handler(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<AuthContext>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(body): Json<RetirarItensListaBody>,
) -> Response {
    let ctx_tx = ctx.clone();
    let id_tx = id.clone();
    let codigos = body.codigos.clone();
    let motivo = body.motivo.clone();
    match executar_em_2_passos(state.db.pool(), "retirar_item_lista_compra", c.confirmar, move |tx| {
        Box::pin(async move { agente::retirar_itens_lista(&mut **tx, &ctx_tx, &id_tx, &codigos, &motivo).await })
    })
    .await
    {
        Ok(r) => concluir(state.db.pool(), &ctx, "retirar_item_lista_compra", "purchase_list", r, false).await,
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
        .route("/api/hub/compras/categories/:id", patch(ajustar_categoria_handler).delete(delete_category_handler))
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
        .route("/api/hub/compras/items/categoria/bulk", post(mover_itens_handler))
        .route("/api/hub/compras/items/:code/categoria", post(trocar_categoria_item_handler))
        .route("/api/hub/compras/items/:code/status", post(status_item_handler))
        .route("/api/hub/compras/items/observations", post(import_item_observations_handler))
        // Demands
        .route("/api/hub/compras/demands", get(get_demands_handler))
        .route("/api/hub/compras/custom-configs", get(get_custom_configs_handler).post(save_custom_config_handler).delete(delete_custom_config_handler))
        // Purchase Request Lists (Lotes de Listas & Acompanhamento)
        .route("/api/hub/compras/listas", get(get_purchase_lists_handler).post(create_purchase_list_handler))
        .route("/api/hub/compras/listas/:id", get(get_purchase_list_detail_handler).patch(update_purchase_list_handler).delete(delete_purchase_list_handler))
        .route("/api/hub/compras/listas/:id/itens/retirar", post(retirar_itens_lista_handler))
        .route("/api/hub/compras/listas/:id/itens", post(incluir_itens_lista_handler))
        .route("/api/hub/compras/itens-solicitados", get(get_active_requested_items_handler))
        // Lista de Compra (no servidor, uma por módulo)
        .route("/api/hub/compras/lista-compra", get(lista_compra_handler))
        .route("/api/hub/compras/lista-compra/adicionar", post(lista_compra_adicionar_handler))
        .route("/api/hub/compras/lista-compra/remover", post(lista_compra_remover_handler))
        .route("/api/hub/compras/lista-compra/ajustar", post(lista_compra_ajustar_handler))
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
            "Cria ou renomeia uma subcategoria do Hub de Compras. Sem `confirmar=true` devolve a prévia (`antes`, `depois`, `mudou`) e não grava; com ele grava e audita. `parentId` é obrigatório e precisa existir; `name` não pode ser vazio; sem `id` gera um (a prévia devolve `id` nulo). Recusa alterar categorias raiz e criar ciclo; `parentId` diferente do atual move a subcategoria dentro da mesma família; mover para outra família é só do supervisor (recusa `sem_permissao`). Não exclui. Os ids vêm de `listar_categorias_compras`.",
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
            MP,
            "Troca a categoria de um item (produto de Apoio/Coloração ou insumo) pelo `code`. Sem `confirmar=true` devolve a prévia (`categoriaAntes`, `categoriaDepois`, `mudou`) e não grava; com ele grava e audita. Permissão: o agente precisa de editar em um módulo da família da categoria de ORIGEM e em um da família do DESTINO (cat_apoio = compras_apoio; cat_coloracao = compras_coloracao; cat_mp = compras_materia_prima; cat_emb = compras_embalagens; demais = materia_prima ou embalagens); a recusa diz qual módulo falta. Produto só pode ser movido por agente se já for de Apoio/Coloração. Os ids de categoria vêm de `listar_categorias_compras`.",
            "POST",
            "/api/hub/compras/items/:code/categoria",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item (produto ou insumo)."),
                param("categoryId", "corpo", "texto", true, "Id da categoria de destino."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "criar_subcategoria_compras",
            MP,
            "Cria uma subcategoria em POST /api/hub/compras/categories com nome, parentId e motivo. Sem `confirmar=true` devolve a prévia (o id fica nulo, porque a gravação é desfeita) e não grava; com ele grava, herda o período de estoque da mãe e audita o motivo. `periodo` opcional substitui o herdado. Exige editar a família da categoria-mãe. Não mexe na raiz e não apaga.",
            "POST",
            "/api/hub/compras/categories",
            true,
            vec![
                param("nome", "corpo", "texto", true, "Nome da subcategoria."),
                param("parentId", "corpo", "texto", true, "Id da categoria-mãe."),
                param("periodo", "corpo", "inteiro", false, "Período de estoque em dias; ausente herda da mãe."),
                param("motivo", "corpo", "texto", true, "Por que a subcategoria está sendo criada."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "ajustar_subcategoria_compras",
            MP,
            "Renomeia uma subcategoria ou ajusta o período de estoque. Sem `confirmar=true` só devolve a prévia (`antes`, `depois`) e não grava; com ele grava e audita o motivo. Categoria raiz e nome com Classe A exigem `permitirRestrito=true`; raiz ainda exige supervisor. Não apaga a categoria.",
            "PATCH",
            "/api/hub/compras/categories/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da subcategoria."),
                param("nome", "corpo", "texto", false, "Novo nome; ausente mantém o atual."),
                param("periodo", "corpo", "inteiro", false, "Novo período de estoque em dias."),
                param("permitirRestrito", "corpo", "booleano", false, "true libera raiz e Classe A."),
                param("motivo", "corpo", "texto", true, "Por que a subcategoria está sendo ajustada."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "mover_itens_categoria",
            MP,
            "Troca a categoria de vários itens de uma vez (até 1000 códigos). Sem `confirmar=true` devolve a prévia de cada código (`antes`, `depois`) e não grava; com ele grava e audita o motivo. A permissão é a família do destino; cruzar família é só do supervisor. Não apaga item.",
            "POST",
            "/api/hub/compras/items/categoria/bulk",
            true,
            vec![
                param("codigos", "corpo", "lista", true, "Códigos dos itens."),
                param("categoryId", "corpo", "texto", true, "Id da categoria de destino."),
                param("motivo", "corpo", "texto", true, "Por que os itens estão mudando de categoria."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "alterar_status_item_compras",
            MP,
            "Marca um item como ativo, suspenso ou ignorado. Suspenso e ignorado saem da demanda e o cadastro permanece. Sem `confirmar=true` só devolve a prévia e não grava; com ele grava e audita o motivo. A permissão é a família da categoria do item.",
            "POST",
            "/api/hub/compras/items/:code/status",
            true,
            vec![
                param("code", "caminho", "texto", true, "Código do item."),
                param("status", "corpo", "texto", true, "ativo, suspenso ou ignorado."),
                param("motivo", "corpo", "texto", true, "Por que o status está mudando."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::leitura(
            "listar_lista_compra",
            MP,
            "Lista os itens da Lista de Compra de um módulo do Hub de Compras (os separados para o próximo lote de solicitação): `itemCode`, `quantidadeManual`, `mediaManual`, quem adicionou e quando. O `modulo` decide a lista: materia_prima, embalagens, coloracao ou apoio.",
            "/api/hub/compras/lista-compra",
            vec![param("modulo", "query", "texto", true, "materia_prima, embalagens, coloracao ou apoio.")],
        ),
        Acao::gravacao(
            "adicionar_itens_lista_compra",
            MP,
            "Põe itens na Lista de Compra de um módulo (`modulo`: materia_prima, embalagens, coloracao ou apoio). Sem `confirmar=true` só devolve a prévia (`adicionados`, `jaNaLista`) e não grava; com ele grava e audita. Itens que já estão são ignorados; código que não existe no cadastro é recusado (`invalido`). Exige editar o módulo de Compras correspondente à lista (`sem_permissao`).",
            "POST",
            "/api/hub/compras/lista-compra/adicionar",
            true,
            vec![
                param("modulo", "corpo", "texto", true, "Lista de destino: materia_prima, embalagens, coloracao ou apoio."),
                param("codigos", "corpo", "lista", true, "Códigos dos itens (insumos ou produtos de Apoio/Coloração)."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "remover_itens_lista_compra",
            MP,
            "Tira itens da Lista de Compra de um módulo (`modulo`: materia_prima, embalagens, coloracao ou apoio). Sem `confirmar=true` só devolve a prévia (`removidos`, `naoEstavam`) e não grava; com ele grava e audita. Exige editar o módulo de Compras correspondente à lista (`sem_permissao`).",
            "POST",
            "/api/hub/compras/lista-compra/remover",
            true,
            vec![
                param("modulo", "corpo", "texto", true, "Lista de destino: materia_prima, embalagens, coloracao ou apoio."),
                param("codigos", "corpo", "lista", true, "Códigos dos itens a tirar da lista."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "ajustar_item_lista_compra",
            MP,
            "Grava a quantidade e a média manuais de um item que já está na Lista de Compra de um módulo (`modulo`: materia_prima, embalagens, coloracao ou apoio); valor nulo ou ausente limpa o campo, negativo é recusado. Sem `confirmar=true` só devolve a prévia (`antes`, `depois`, `mudou`) e não grava; com ele grava e audita. Item fora da lista dá `nao_encontrado`. Exige editar o módulo de Compras correspondente (`sem_permissao`).",
            "POST",
            "/api/hub/compras/lista-compra/ajustar",
            true,
            vec![
                param("modulo", "corpo", "texto", true, "Lista de destino: materia_prima, embalagens, coloracao ou apoio."),
                param("codigo", "corpo", "texto", true, "Código do item na lista."),
                param("quantidadeManual", "corpo", "numero", false, "Quantidade a comprar digitada; ausente ou nula limpa."),
                param("mediaManual", "corpo", "numero", false, "Média mensal digitada; ausente ou nula limpa."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "criar_lista_compra",
            MP,
            "Cria uma lista de solicitação (lote) quando o corpo traz `motivo`. Sem `confirmar=true` devolve a prévia e não grava (o id fica nulo); com ele grava os itens e audita. A tela, sem motivo, continua gravando direto. Exige editar a família do módulo da lista. Não apaga lista. Estoque, média, simulação, previsão, dias e fornecedor de cada item vêm da demanda do ERP (o que o item trouxer no corpo vale mais); itens sem esses números voltam em `semDadosDeEstoque`. Os itens do lote saem da Lista de Compra do módulo.",
            "POST",
            "/api/hub/compras/listas",
            true,
            vec![
                param("modulo", "corpo", "texto", true, "materia_prima, embalagens, coloracao ou apoio."),
                param("titulo", "corpo", "texto", false, "Título da lista."),
                param("observacoes", "corpo", "texto", false, "Observações."),
                param("items", "corpo", "lista", true, "Itens: itemCode, itemDescription, quantityRequested."),
                param("motivo", "corpo", "texto", true, "Por que a lista está sendo criada."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "editar_lista_compra",
            MP,
            "Altera título, observações ou status de uma lista de solicitação quando o corpo traz `motivo`. Sem `confirmar=true` só devolve a prévia; com ele grava e audita. Status aceita pendente, cancelado ou concluido. A tela, sem motivo, continua gravando direto. Não apaga a lista.",
            "PATCH",
            "/api/hub/compras/listas/:id",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da lista."),
                param("titulo", "corpo", "texto", false, "Novo título."),
                param("observacoes", "corpo", "texto", false, "Novas observações."),
                param("status", "corpo", "texto", false, "pendente, cancelado ou concluido."),
                param("motivo", "corpo", "texto", true, "Por que a lista está sendo alterada."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "incluir_item_lista_compra",
            MP,
            "Inclui itens numa lista de solicitação já existente. Sem `confirmar=true` só devolve a prévia e não grava; com ele grava e audita o motivo. Exige editar a família do módulo da lista. Não apaga item.",
            "POST",
            "/api/hub/compras/listas/:id/itens",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da lista."),
                param("itens", "corpo", "lista", true, "Itens: itemCode, itemDescription, quantityRequested."),
                param("motivo", "corpo", "texto", true, "Por que os itens estão entrando na lista."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
        Acao::gravacao(
            "retirar_item_lista_compra",
            MP,
            "Tira itens de uma lista de solicitação marcando o status como retirado. A linha permanece no banco. Sem `confirmar=true` só devolve a prévia; com ele grava e audita o motivo. Exige editar a família do módulo da lista.",
            "POST",
            "/api/hub/compras/listas/:id/itens/retirar",
            true,
            vec![
                param("id", "caminho", "texto", true, "Id da lista."),
                param("codigos", "corpo", "lista", true, "Códigos a marcar como retirados."),
                param("motivo", "corpo", "texto", true, "Por que os itens estão saindo da lista."),
                param("confirmar", "query", "booleano", false, "true grava; ausente só devolve a prévia."),
            ],
        )
        .com_familias(agente::FAMILIAS),
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
