use axum::{
    extract::{Multipart, Query, State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use serde_json::json;
use rusqlite::params;

use crate::db::Db;
use crate::models::{
    BulkOverrideRequest, KitComponentDetail, KitCalculationResult, LineConfig, Product, ProductCalculationResult, ProductOverride, QueryParams, Stock,
    NewProducaoEntry, HistoryQueryParams,
    WatchConfig, NewKitComposicao,
};
use crate::calculations::calculate_products;


pub struct AppState {
    pub db: Db,
}

// 1. GET /api/configs
pub async fn get_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_line_configs() {
        Ok(configs) => (StatusCode::OK, Json(configs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configurações: {}", e) })),
        ).into_response(),
    }
}

// 2. PUT /api/configs
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(config): Json<LineConfig>,
) -> impl IntoResponse {
    match state.db.update_line_config(&config) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) })),
        ).into_response(),
    }
}

// 2b. DELETE /api/configs/:prefix
pub async fn delete_config(
    State(state): State<Arc<AppState>>,
    Path(prefix): Path<String>,
) -> impl IntoResponse {
    if prefix == "DEFAULT" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A linha DEFAULT não pode ser excluída" })),
        ).into_response();
    }
    match state.db.delete_line_config(&prefix) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir linha: {}", e) })),
        ).into_response(),
    }
}

// 2c. GET /api/overrides
pub async fn get_overrides(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_all_overrides() {
        Ok(overrides) => (StatusCode::OK, Json(overrides)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar overrides: {}", e) })),
        ).into_response(),
    }
}

// 3. POST /api/overrides
pub async fn save_override(
    State(state): State<Arc<AppState>>,
    Json(ovr): Json<ProductOverride>,
) -> impl IntoResponse {
    match state.db.save_override(&ovr) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar override: {}", e) })),
        ).into_response(),
    }
}

// 3b. POST /api/overrides/bulk
pub async fn save_override_bulk(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BulkOverrideRequest>,
) -> impl IntoResponse {
    match state.db.save_override_bulk(&req) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar overrides em lote: {}", e) })),
        ).into_response(),
    }
}

// 4. POST /api/import/faturamento
pub async fn import_faturamento(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name: Option<String> = None;
    
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }

    let bytes = match file_data {
        Some(b) => b,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    // Create temp file
    let temp_path = std::env::temp_dir().join("temp_faturamento.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    // Connect and parse
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::parser::parse_faturamento_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count)));
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Faturamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, 0, "error", Some(&e.to_string()));
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha Excel: {}", e) }))
            ).into_response()
        }
    }
}

// 5. POST /api/import/levantamento
pub async fn import_levantamento(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name: Option<String> = None;
    
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }

    let bytes = match file_data {
        Some(b) => b,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    // Create temp file
    let temp_path = std::env::temp_dir().join("temp_levantamento.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    // Connect and parse
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::parser::parse_levantamento_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count)));
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Levantamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, 0, "error", Some(&e.to_string()));
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha Excel: {}", e) }))
            ).into_response()
        }
    }
}

// Helper to query all needed arrays for calculations
fn fetch_calculation_data(state: &Db) -> anyhow::Result<(
    Vec<Product>,
    Vec<Stock>,
    HashMap<String, Vec<i64>>,
    Vec<LineConfig>,
    Vec<ProductOverride>,
)> {
    let conn = state.connect()?;

    // 1. Products
    let mut stmt = conn.prepare("SELECT codigo, descricao, linha_prefix, base, media_levantamento FROM produtos")?;
    let products_iter = stmt.query_map([], |row| {
        Ok(Product {
            codigo: row.get(0)?,
            descricao: row.get(1)?,
            linha_prefix: row.get(2)?,
            base: row.get(3)?,
            media_levantamento: row.get(4)?,
        })
    })?;
    let mut products = Vec::new();
    for p in products_iter {
        products.push(p?);
    }

    // 2. Stock (overwritten using date-limited sales orders query to filter out 2024 orders)
    let sales_faltas_days: i32 = {
        let query = "SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'";
        if let Ok(val) = conn.query_row(query, [], |row| row.get::<_, String>(0)) {
            val.parse::<i32>().unwrap_or(180)
        } else {
            180
        }
    };

    let mut sales_faltas_map: HashMap<String, i64> = HashMap::new();
    let sales_faltas_query = if sales_faltas_days > 0 {
        format!("
            SELECT soi.c_cod_prod, SUM(soi.n_qtde - soi.n_qtde_fat) 
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
              AND so.d_pedido >= date('now', '-{} days')
            GROUP BY soi.c_cod_prod
        ", sales_faltas_days)
    } else {
        "
            SELECT soi.c_cod_prod, SUM(soi.n_qtde - soi.n_qtde_fat) 
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
            GROUP BY soi.c_cod_prod
        ".to_string()
    };

    if let Ok(mut stmt_faltas) = conn.prepare(&sales_faltas_query) {
        let rows_faltas = stmt_faltas.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        });
        if let Ok(iter) = rows_faltas {
            for r in iter {
                if let Ok((code, qty)) = r {
                    sales_faltas_map.insert(code, qty);
                }
            }
        }
    }

    let mut stmt = conn.prepare("SELECT codigo, estoque, producao, pedidos_aberto, fase FROM estoque_atual")?;
    let stock_iter = stmt.query_map([], |row| {
        let codigo: String = row.get(0)?;
        let estoque: i64 = row.get(1)?;
        let producao: i64 = row.get(2)?;
        let fase: Option<String> = row.get(4)?;
        let pedidos_aberto = *sales_faltas_map.get(&codigo).unwrap_or(&0);
        Ok(Stock {
            codigo,
            estoque,
            producao,
            pedidos_aberto,
            fase,
        })
    })?;
    let mut stocks = Vec::new();
    for s in stock_iter {
        stocks.push(s?);
    }

    // 3. Line configs
    let configs = state.get_line_configs()?;

    // 4. Overrides
    let overrides = state.get_all_overrides()?;

    // 5. Faturamento history
    let mut fat_map = HashMap::new();
    let mut stmt = conn.prepare("SELECT codigo, mes, quantidade FROM historico_faturamento")?;
    let fat_iter = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, i64>(2)?))
    })?;
    for r in fat_iter {
        let (code, mes, qty) = r?;
        let entry = fat_map.entry(code).or_insert_with(|| vec![0; 12]);
        if mes >= 1 && mes <= 12 {
            entry[(mes - 1) as usize] = qty;
        }
    }

    Ok((products, stocks, fat_map, configs, overrides))
}

pub fn post_process_kit_only_production(
    computed: &mut [ProductCalculationResult],
    kit_composition: &HashMap<String, Vec<(String, i64)>>,
) {
    // 1. Build a map of product code -> index in computed slice
    let mut code_to_idx = HashMap::new();
    for (i, p) in computed.iter().enumerate() {
        code_to_idx.insert(p.codigo.clone(), i);
    }

    // 2. Build a map of component -> list of parent kits
    let mut component_to_kits: HashMap<String, Vec<String>> = HashMap::new();
    for (kit_code, components) in kit_composition {
        for (comp, _qty) in components {
            component_to_kits.entry(comp.clone()).or_default().push(kit_code.clone());
        }
    }

    // 3. For each computed product, if it's marked `produzir_apenas_kit`, check parent kits
    for i in 0..computed.len() {
        if computed[i].produzir_apenas_kit.unwrap_or(0) == 1 {
            if let Some(kits) = component_to_kits.get(&computed[i].codigo) {
                let mut all_kits_ok = true;
                for kit_code in kits {
                    if let Some(&kit_idx) = code_to_idx.get(kit_code) {
                        let kit_rec_prod = computed[kit_idx].producao_recomendada;
                        if kit_rec_prod > 0 {
                            all_kits_ok = false;
                            break;
                        }
                    }
                }
                
                if all_kits_ok {
                    computed[i].producao_recomendada = 0;
                    computed[i].status = "saudavel".to_string();
                    computed[i].status_label = "Estoque OK (Apenas Kit)".to_string();
                }
            }
        }
    }
}

// 6. GET /api/products (List products, calculate stock metrics in real-time, filter and paginate)
pub async fn list_products(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let (products, stocks, fat_map, configs, overrides) = match fetch_calculation_data(&state.db) {
        Ok(data) => data,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao ler dados para cálculos: {}", e) }))
        ).into_response(),
    };

    // Calculate all items in real time
    let mut computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);

    // Fetch kit composition and apply kit-only overrides
    let kit_composition = state.db.get_kit_composition().unwrap_or_default();
    post_process_kit_only_production(&mut computed, &kit_composition);

    let mut kit_components_set = std::collections::HashSet::new();
    for components in kit_composition.values() {
        for (comp, _qty) in components {
            kit_components_set.insert(comp.clone());
        }
    }

    // Connect to fetch formulation and latest stock levels for error decoration
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao conectar ao banco para buscar receitas: {}", e) }))
        ).into_response(),
    };

    // Load config targetDays for coloracao and apoio
    let target_days_coloracao = {
        let mut target = 90.0;
        if let Ok(mut stmt) = conn.prepare("SELECT value FROM config WHERE key = 'compras_coloracao'") {
            if let Ok(val) = stmt.query_row([], |row| row.get::<_, String>(0)) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&val) {
                    if let Some(days) = json.get("targetDays").and_then(|d| d.as_f64()) {
                        target = days;
                    }
                }
            }
        }
        target
    };

    let target_days_apoio = {
        let mut target = 90.0;
        if let Ok(mut stmt) = conn.prepare("SELECT value FROM config WHERE key = 'compras_apoio'") {
            if let Ok(val) = stmt.query_row([], |row| row.get::<_, String>(0)) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&val) {
                    if let Some(days) = json.get("targetDays").and_then(|d| d.as_f64()) {
                        target = days;
                    }
                }
            }
        }
        target
    };

    // Fetch category parent mapping to resolve subcategories to roots
    let mut category_parent_map: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, parent_id FROM categories") {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((id, parent_id)) = r {
                    if let Some(p_id) = parent_id {
                        category_parent_map.insert(id, p_id);
                    }
                }
            }
        }
    }

    let resolve_root_category = |cat_id: &str, parent_map: &HashMap<String, String>| -> String {
        let mut current = cat_id.to_string();
        let mut visited = std::collections::HashSet::new();
        visited.insert(current.clone());
        while let Some(parent) = parent_map.get(&current) {
            if visited.contains(parent) {
                break;
            }
            current = parent.clone();
            visited.insert(current.clone());
        }
        current
    };

    // Fetch formulations
    let mut formulations_map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
    let stmt_form = conn.prepare("SELECT product_code, ingredient_code, description, quantity FROM formulations");
    if let Ok(mut stmt) = stmt_form {
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                row.get::<_, f64>(3)?
            ))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((p_code, ing_code, desc, qty)) = r {
                    let ingredients = formulations_map.entry(p_code).or_default();
                    if let Some(existing) = ingredients.iter_mut().find(|(code, _, _)| code == &ing_code) {
                        existing.2 += qty;
                    } else {
                        ingredients.push((ing_code, desc, qty));
                    }
                }
            }
        }
    }

    // Fetch latest stock snapshots
    let mut item_stock_map: HashMap<String, f64> = HashMap::new();
    let stmt_snap = conn.prepare("
        SELECT item_code, stock_qty 
        FROM stock_snapshots ss
        WHERE ss.id = (
            SELECT id FROM stock_snapshots ss2 
            WHERE ss2.item_code = ss.item_code 
            ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
        )
    ");
    if let Ok(mut stmt) = stmt_snap {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((code, stock)) = r {
                    item_stock_map.insert(code, stock);
                }
            }
        }
    }

    // Fetch active sales orders faltas per product
    let mut sales_faltas_map: HashMap<String, i64> = HashMap::new();
    let sales_faltas_days: i32 = {
        let query = "SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'";
        if let Ok(val) = conn.query_row(query, [], |row| row.get::<_, String>(0)) {
            val.parse::<i32>().unwrap_or(180)
        } else {
            180
        }
    };

    let sales_faltas_query = if sales_faltas_days > 0 {
        format!("
            SELECT soi.c_cod_prod, SUM(soi.n_qtde - soi.n_qtde_fat) 
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
              AND so.d_pedido >= date('now', '-{} days')
            GROUP BY soi.c_cod_prod
        ", sales_faltas_days)
    } else {
        "
            SELECT soi.c_cod_prod, SUM(soi.n_qtde - soi.n_qtde_fat) 
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
            GROUP BY soi.c_cod_prod
        ".to_string()
    };

    let stmt_sales_faltas = conn.prepare(&sales_faltas_query);
    if let Ok(mut stmt) = stmt_sales_faltas {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((code, qty)) = r {
                    sales_faltas_map.insert(code, qty);
                }
            }
        }
    }

    // Fetch active purchase orders in transit per product
    let mut purchase_transit_map: HashMap<String, i64> = HashMap::new();
    let stmt_purchase_transit = conn.prepare("
        SELECT poi.c_referencia, SUM(poi.n_qtde - poi.n_chegou) 
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
        GROUP BY poi.c_referencia
    ");
    if let Ok(mut stmt) = stmt_purchase_transit {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((code, qty)) = r {
                    purchase_transit_map.insert(code, qty.round() as i64);
                }
            }
        }
    }

    // Decorate computed items with formulation and missing ingredients info
    for p in &mut computed {
        let has_form = formulations_map.contains_key(&p.codigo);
        let mut missing = Vec::new();
        if has_form && p.producao_recomendada > 0 {
            if let Some(ingredients) = formulations_map.get(&p.codigo) {
                for (ing_code, desc, qty) in ingredients {
                    let req = p.producao_recomendada as f64 * qty;
                    let stock = *item_stock_map.get(ing_code).unwrap_or(&0.0);
                    if stock < req {
                        missing.push(desc.clone());
                    }
                }
            }
        }
        p.has_formulation = has_form;
        p.missing_ingredients = missing;
        p.is_kit_component = Some(kit_components_set.contains(&p.codigo));

        // Populate sales order faltas and purchase transit
        let active_faltas = *sales_faltas_map.get(&p.codigo).unwrap_or(&0);
        let transit_purchase = *purchase_transit_map.get(&p.codigo).unwrap_or(&0);
        p.faltas_ativas = Some(active_faltas);
        p.pedidos_compra_aberto = Some(transit_purchase);

        // Calculate sugestao_compra if the category resolves to coloracao or apoio
        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
        let root_cat = if !cat_p.is_empty() {
            resolve_root_category(cat_p, &category_parent_map)
        } else {
            "".to_string()
        };
        let is_coloracao = root_cat == "cat_coloracao";
        let is_apoio = root_cat == "cat_apoio";

        if is_coloracao || is_apoio {
            let target_days = if is_coloracao { target_days_coloracao } else { target_days_apoio };
            let media_vendas = p.media_vendas;
            // Recalculate ideal quantity: (target_days / 30) * media_vendas (respect manual override if present)
            let ideal_qty = if let Some(manual_ideal) = p.estoque_ideal_manual {
                manual_ideal as f64
            } else {
                (target_days / 30.0) * media_vendas
            };
            p.estoque_ideal_qtd = ideal_qty;

            let current_stock = p.estoque as f64;
            let faltas = active_faltas as f64;
            let in_transit = transit_purchase as f64;
            let suggestion = ideal_qty + faltas - current_stock - in_transit;
            p.sugestao_compra = Some(if suggestion > 0.0 { suggestion.round() as i64 } else { 0 });
        }
    }

    // Filter out kits, coloracao, and apoio from the general production list!
    computed.retain(|p| {
        let is_kit = kit_composition.contains_key(&p.codigo);
        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
        let root_cat = if !cat_p.is_empty() {
            resolve_root_category(cat_p, &category_parent_map)
        } else {
            "".to_string()
        };
        let is_coloracao = root_cat == "cat_coloracao";
        let is_apoio = root_cat == "cat_apoio";
        
        if let Some(ref status) = params.status {
            if status == "coloracao" && is_coloracao {
                return true;
            }
            if status == "apoio" && is_apoio {
                return true;
            }
        }
        
        !is_kit && !is_coloracao && !is_apoio
    });

    // Extract stats for metadata based on visible products (excluding hidden ones and ignored statuses)
    let ignored_statuses = crate::get_ignored_product_statuses(&conn);
    let visible_products: Vec<&crate::models::ProductCalculationResult> = computed
        .iter()
        .filter(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            !ignored_statuses.contains(&status.to_string()) && p.visivel.unwrap_or(1) != 0
        })
        .collect();
    let count_critico = visible_products.iter().filter(|p| p.status == "critico").count();
    let count_ordem = visible_products.iter().filter(|p| p.status == "ordem").count();
    let count_saudavel = visible_products.iter().filter(|p| p.status == "saudavel").count();
    let count_abundante = visible_products.iter().filter(|p| p.status == "abundante").count();
    let count_lancamentos = visible_products.iter().filter(|p| p.is_lancamento).count();
    let total_visible = visible_products.len();

    // Apply visibility filter
    let show_hidden = params.show_hidden.unwrap_or(false);
    if !show_hidden && !params.suspended_only.unwrap_or(false) {
        computed.retain(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            !ignored_statuses.contains(&status.to_string()) && p.visivel.unwrap_or(1) != 0
        });
    }

    // Apply suspended filter if requested
    if params.suspended_only.unwrap_or(false) {
        computed.retain(|p| {
            let status = p.status_produto.as_deref().unwrap_or("ativo");
            ignored_statuses.contains(&status.to_string()) || p.visivel.unwrap_or(1) == 0
        });
    }

    // Apply filtering
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let term = search.trim().to_lowercase();
            computed.retain(|p| {
                p.codigo.to_lowercase().contains(&term) || p.descricao.to_lowercase().contains(&term)
            });
        }
    }

    if let Some(ref line) = params.linha {
        if !line.is_empty() && line != "ALL" {
            computed.retain(|p| p.linha_prefix == *line);
        }
    }

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            match status.as_str() {
                "ERR_NO_FORMULA" => {
                    computed.retain(|p| !p.has_formulation);
                }
                "ERR_MISSING_MATS" => {
                    computed.retain(|p| !p.missing_ingredients.is_empty());
                }
                "ERR_ANY" => {
                    computed.retain(|p| !p.has_formulation || !p.missing_ingredients.is_empty());
                }
                "coloracao" => {
                    computed.retain(|p| {
                        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                        let root_cat = if !cat_p.is_empty() {
                            resolve_root_category(cat_p, &category_parent_map)
                        } else {
                            "".to_string()
                        };
                        root_cat == "cat_coloracao"
                    });
                }
                "apoio" => {
                    computed.retain(|p| {
                        let cat_p = p.categoria_produto.as_deref().unwrap_or("");
                        let root_cat = if !cat_p.is_empty() {
                            resolve_root_category(cat_p, &category_parent_map)
                        } else {
                            "".to_string()
                        };
                        root_cat == "cat_apoio"
                    });
                }
                _ => {
                    computed.retain(|p| p.status == *status);
                }
            }
        }
    }

    if let Some(ref base_filter) = params.base {
        if !base_filter.is_empty() && base_filter != "ALL" {
            if base_filter == "HAS_BASE" {
                computed.retain(|p| p.base.is_some() && !p.base.as_ref().unwrap().trim().is_empty());
            } else if base_filter == "NO_BASE" {
                computed.retain(|p| p.base.is_none() || p.base.as_ref().unwrap().trim().is_empty());
            } else {
                computed.retain(|p| {
                    p.base.as_ref().map(|b| b.trim() == base_filter).unwrap_or(false)
                });
            }
        }
    }

    // Apply sorting
    if let Some(ref sort_field) = params.sort {
        let is_desc = params.order.as_deref().unwrap_or("asc") == "desc";
        match sort_field.as_str() {
            "codigo" => {
                computed.sort_by(|a, b| {
                    let res = a.codigo.cmp(&b.codigo);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "descricao" => {
                computed.sort_by(|a, b| {
                    let res = a.descricao.to_lowercase().cmp(&b.descricao.to_lowercase());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "estoque_futuro_com_producao" | "efp" => {
                computed.sort_by(|a, b| {
                    let res = a.estoque_futuro_com_producao.cmp(&b.estoque_futuro_com_producao);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "duracao_meses" => {
                computed.sort_by(|a, b| {
                    let res = a.duracao_meses.partial_cmp(&b.duracao_meses).unwrap_or(std::cmp::Ordering::Equal);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "status" => {
                computed.sort_by(|a, b| {
                    let res = a.status.cmp(&b.status);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "producao_recomendada" => {
                computed.sort_by(|a, b| {
                    let res = a.producao_recomendada.cmp(&b.producao_recomendada);
                    if is_desc { res.reverse() } else { res }
                });
            }
            _ => {}
        }
    }

    let total_items = computed.len();

    // Get unique base names for filter dropdown
    let mut bases_set = HashMap::new();
    for p in &products {
        if let Some(ref b) = p.base {
            let b_trimmed = b.trim();
            if !b_trimmed.is_empty() {
                bases_set.insert(b_trimmed.to_string(), true);
            }
        }
    }
    let mut unique_bases: Vec<String> = bases_set.into_keys().collect();
    unique_bases.sort();

    // Paginate
    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);
    let total_pages = (total_items + limit - 1) / limit;
    
    let start = (page - 1) * limit;
    let items_slice = if start < total_items {
        let end = std::cmp::min(start + limit, total_items);
        computed[start..end].to_vec()
    } else {
        Vec::new()
    };

    (
        StatusCode::OK,
        Json(json!({
            "items": items_slice,
            "total": total_items,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "stats": {
                "critico": count_critico,
                "ordem": count_ordem,
                "saudavel": count_saudavel,
                "abundante": count_abundante,
                "lancamentos": count_lancamentos,
                "total_visible": total_visible,
            },
            "bases": unique_bases,
        }))
    ).into_response()
}

// 7. POST /api/import/kits
pub async fn import_kits(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_data: Option<axum::body::Bytes> = None;
    
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }

    let bytes = match file_data {
        Some(b) => b,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    let temp_path = std::env::temp_dir().join("temp_kits.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::parser::parse_kits_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(temp_path);
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Composição de kits importada: {} relações salvas", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(temp_path);
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha de kits: {}", e) }))
            ).into_response()
        }
    }
}

// 7b. POST /api/import/sync
pub async fn trigger_db_sync(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let db_path = state.db.db_path().to_string();

    match crate::legacy_db::sync_from_sql_server(&db_path).await {
        Ok(res) => {
            let total_records = (res.products + res.items + res.suppliers + res.invoices + res.formulations + res.movements + res.purchase_orders + res.sales_orders) as i64;
            let detail_msg = format!(
                "Sincronizados: {} produtos, {} insumos/materiais, {} fornecedores, {} compras, {} consumos, {} receitas, {} movimentações, {} pedidos de compra, {} pedidos de venda",
                res.products, res.items, res.suppliers, res.invoices, res.consumption, res.formulations, res.movements, res.purchase_orders, res.sales_orders
            );
            let _ = state.db.record_import(
                "sync",
                "Banco SQL Server NATUM",
                total_records,
                "success",
                Some(&detail_msg)
            );
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "imported": res.products,
                    "details": {
                        "products": res.products,
                        "suppliers": res.suppliers,
                        "items": res.items,
                        "snapshots": res.snapshots,
                        "invoices": res.invoices,
                        "consumption": res.consumption,
                        "formulations": res.formulations,
                        "movements": res.movements,
                        "purchase_orders": res.purchase_orders
                    },
                    "message": format!("Sincronização concluída com sucesso! {} produtos, {} insumos/materiais, {} receitas e {} pedidos de compra atualizados.", res.products, res.items, res.formulations, res.purchase_orders)
                }))
            ).into_response()
        }
        Err(e) => {
            let error_msg = e.to_string();
            let _ = state.db.record_import(
                "sync",
                "Banco SQL Server NATUM",
                0,
                "error",
                Some(&error_msg)
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": format!("Falha ao sincronizar com o banco de dados NATUM: {}. Certifique-se de que está conectado à rede local do servidor.", error_msg)
                }))
            ).into_response()
        }
    }
}

fn clean_product_code(code: &str) -> String {
    let mut s = code.trim().to_string();
    if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    if s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    s.trim().to_string()
}

// 8. GET /api/kits (Get list of all kits with calculations and components)
pub async fn list_kits(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    // 1. Fetch normal calculation data
    let (products, stocks, fat_map, configs, overrides) = match fetch_calculation_data(&state.db) {
        Ok(data) => data,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao ler dados para cálculos: {}", e) }))
        ).into_response(),
    };

    // 2. Fetch kit composition
    let kit_composition = match state.db.get_kit_composition() {
        Ok(comp) => comp,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar composição dos kits: {}", e) }))
        ).into_response(),
    };

    // 3. Calculate all items in real time
    let mut computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    post_process_kit_only_production(&mut computed, &kit_composition);

    // Create a HashMap of computed products for fast lookup of component details
    let computed_map: HashMap<String, ProductCalculationResult> = computed
        .iter()
        .map(|p| (clean_product_code(&p.codigo), p.clone()))
        .collect();

    // 4. Build results for each kit
    let mut kit_results = Vec::new();

    for (raw_kit_code, raw_components_codes) in &kit_composition {
        let kit_code = clean_product_code(raw_kit_code);
        let components_with_qty: Vec<(String, i64)> = raw_components_codes.iter().map(|(c, q)| (clean_product_code(c), *q)).collect();

        // Find kit calculation details
        let mut kit_calc = match computed_map.get(&kit_code) {
            Some(c) => c.clone(),
            None => {
                let cleaned_code = clean_product_code(&kit_code);
                let kit_desc = match conn.query_row(
                    "SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = ?1",
                    params![cleaned_code],
                    |row| row.get::<_, String>(0)
                ) {
                    Ok(desc) => desc,
                    Err(_) => format!("Kit: {}", kit_code),
                };

                let kit_stock = stocks.iter().find(|s| clean_product_code(&s.codigo) == kit_code);
                let estoque_val = kit_stock.map(|s| s.estoque).unwrap_or(0);
                let prod_val = kit_stock.map(|s| s.producao).unwrap_or(0);
                let pedidos_val = kit_stock.map(|s| s.pedidos_aberto).unwrap_or(0);

                ProductCalculationResult {
                    codigo: kit_code.clone(),
                    descricao: kit_desc,
                    linha_prefix: "".to_string(),
                    nome_linha: "Kits Comerciais".to_string(),
                    base: None,
                    fase: None,
                    estoque: estoque_val,
                    producao: prod_val,
                    pedidos_aberto: pedidos_val,
                    estoque_futuro: estoque_val - pedidos_val,
                    estoque_futuro_com_producao: estoque_val + prod_val - pedidos_val,
                    estoque_ideal_manual: None,
                    pedidos_manual: None,
                    media_manual: None,
                    is_lancamento_manual: None,
                    visivel: Some(1),
                    observacao: None,
                    linha_prefix_manual: None,
                    status_produto: Some("ativo".to_string()),
                    categoria_produto: Some("kit".to_string()),
                    produzir_apenas_kit: Some(0),
                    lancamento_meta_meses: None,
                    lancamento_data_inicio: None,
                    is_kit_component: Some(false),
                    media_vendas: 0.0,
                    desvio_padrao: 0.0,
                    demanda_ajustada: 0.0,
                    is_lancamento: false,
                    estoque_ideal_meses: 0.0,
                    abrir_ordem_meses: 0.0,
                    abrir_prod_meses: 0.0,
                    estoque_ideal_qtd: 0.0,
                    abrir_ordem_qtd: 0.0,
                    abrir_prod_qtd: 0.0,
                    duracao_meses: 99.0,
                    duracao_dias: 999.0,
                    status: "saudavel".to_string(),
                    status_label: "Estoque OK".to_string(),
                    producao_recomendada: 0,
                    has_formulation: true,
                    missing_ingredients: Vec::new(),
                    faltas_ativas: None,
                    pedidos_compra_aberto: None,
                    sugestao_compra: None,
                }
            }
        };

        kit_calc.codigo = clean_product_code(&kit_calc.codigo);

        // Gather components status
        let mut components_detail = Vec::new();
        let mut min_stock: Option<i64> = None;
        let mut critical_components = Vec::new();

        for (comp_code, comp_qty) in &components_with_qty {
            if let Some(comp_calc) = computed_map.get(comp_code) {
                // Record minimum stock based on future stock with production (EFP)
                min_stock = Some(match min_stock {
                    Some(m) => std::cmp::min(m, comp_calc.estoque_futuro_com_producao),
                    None => comp_calc.estoque_futuro_com_producao,
                });

                if comp_calc.producao_recomendada > 0 {
                    critical_components.push(comp_code.clone());
                }

                components_detail.push(KitComponentDetail {
                    codigo: clean_product_code(&comp_calc.codigo),
                    descricao: comp_calc.descricao.clone(),
                    estoque: comp_calc.estoque,
                    producao: comp_calc.producao,
                    pedidos_aberto: comp_calc.pedidos_aberto,
                    estoque_futuro_com_producao: comp_calc.estoque_futuro_com_producao,
                    producao_recomendada: comp_calc.producao_recomendada,
                    status: comp_calc.status.clone(),
                    status_label: comp_calc.status_label.clone(),
                    quantidade: *comp_qty,
                    necessita_producao: comp_calc.producao_recomendada > 0,
                });
            }
        }

        let max_mont_val = min_stock.unwrap_or(0);
        let max_mont = if max_mont_val < 0 { 0 } else { max_mont_val };

        kit_results.push(KitCalculationResult {
            kit_detalhes: kit_calc,
            componentes: components_detail,
            max_montavel: max_mont,
            componentes_criticos: critical_components,
        });
    }

    // Apply visibility filter
    let show_hidden = params.show_hidden.unwrap_or(false);
    if !show_hidden {
        kit_results.retain(|k| k.kit_detalhes.visivel.unwrap_or(1) != 0);
    }

    // Apply filtering
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let term = search.trim().to_lowercase();
            kit_results.retain(|k| {
                k.kit_detalhes.codigo.to_lowercase().contains(&term) || 
                k.kit_detalhes.descricao.to_lowercase().contains(&term)
            });
        }
    }

    if let Some(ref line) = params.linha {
        if !line.is_empty() && line != "ALL" {
            kit_results.retain(|k| k.kit_detalhes.linha_prefix == *line);
        }
    }

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            kit_results.retain(|k| k.kit_detalhes.status == *status);
        }
    }

    // Apply sorting
    if let Some(ref sort_field) = params.sort {
        let is_desc = params.order.as_deref().unwrap_or("asc") == "desc";
        match sort_field.as_str() {
            "codigo" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.codigo.cmp(&b.kit_detalhes.codigo);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "descricao" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.descricao.to_lowercase().cmp(&b.kit_detalhes.descricao.to_lowercase());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "max_montavel" => {
                kit_results.sort_by(|a, b| {
                    let res = a.max_montavel.cmp(&b.max_montavel);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "componentes_criticos" => {
                kit_results.sort_by(|a, b| {
                    let res = a.componentes_criticos.len().cmp(&b.componentes_criticos.len());
                    if is_desc { res.reverse() } else { res }
                });
            }
            "estoque_futuro_com_producao" | "efp" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.estoque_futuro_com_producao.cmp(&b.kit_detalhes.estoque_futuro_com_producao);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "duracao_meses" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.duracao_meses.partial_cmp(&b.kit_detalhes.duracao_meses).unwrap_or(std::cmp::Ordering::Equal);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "status" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.status.cmp(&b.kit_detalhes.status);
                    if is_desc { res.reverse() } else { res }
                });
            }
            "producao_recomendada" => {
                kit_results.sort_by(|a, b| {
                    let res = a.kit_detalhes.producao_recomendada.cmp(&b.kit_detalhes.producao_recomendada);
                    if is_desc { res.reverse() } else { res }
                });
            }
            _ => {}
        }
    }

    // Extract stats for metadata
    let total_items = kit_results.len();

    // Paginate
    let page = params.page.unwrap_or(1);
    let limit = params.limit.unwrap_or(50);
    let total_pages = (total_items + limit - 1) / limit;
    
    let start = (page - 1) * limit;
    let items_slice = if start < total_items {
        let end = std::cmp::min(start + limit, total_items);
        kit_results[start..end].to_vec()
    } else {
        Vec::new()
    };

    (
        StatusCode::OK,
        Json(json!({
            "items": items_slice,
            "total": total_items,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }))
    ).into_response()
}

// 10. POST /api/historico
pub async fn add_producao(
    State(state): State<Arc<AppState>>,
    Json(entry): Json<NewProducaoEntry>,
) -> impl IntoResponse {
    if entry.codigo.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Código do produto não pode ser vazio" }))
        ).into_response();
    }
    if entry.quantidade <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Quantidade deve ser maior que zero" }))
        ).into_response();
    }
    if entry.data_producao.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Data da produção não pode ser vazia" }))
        ).into_response();
    }

    match state.db.add_producao_entry(&entry) {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({ "status": "success", "id": id, "message": "Produção lançada com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar lançamento de produção: {}", e) }))
        ).into_response(),
    }
}

// 11. GET /api/historico
pub async fn list_producao(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQueryParams>,
) -> impl IntoResponse {
    match state.db.list_producao_history(&params) {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar histórico de produção: {}", e) }))
        ).into_response(),
    }
}

// 12. DELETE /api/historico/:id
pub async fn delete_producao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match state.db.delete_producao_entry(id) {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Produção estornada/excluída com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao estornar produção: {}", e) }))
        ).into_response(),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateLotePayload {
    pub lote_erp: Option<String>,
}

// 12b. PUT /api/historico/:id/lote
pub async fn update_producao_lote(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateLotePayload>,
) -> impl IntoResponse {
    match state.db.update_producao_lote(id, payload.lote_erp.as_deref()) {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Lote ERP atualizado com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao atualizar Lote ERP: {}", e) }))
        ).into_response(),
    }
}

// ===== KIT COMPOSICAO HANDLERS =====

// GET /api/kits/composicao
pub async fn list_kit_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_kit_composition_full() {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar composição de kits: {}", e) }))).into_response(),
    }
}

// POST /api/kits/composicao
pub async fn add_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NewKitComposicao>,
) -> impl IntoResponse {
    if body.kit_codigo.trim().is_empty() || body.componente_codigo.trim().is_empty() {
        return (StatusCode::BAD_REQUEST,
            Json(json!({ "error": "kit_codigo e componente_codigo são obrigatórios" }))).into_response();
    }
    let qty = if body.quantidade < 1 { 1 } else { body.quantidade };
    match state.db.add_kit_composicao(&body.kit_codigo, &body.componente_codigo, qty) {
        Ok(_) => (StatusCode::CREATED, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao adicionar relação de kit: {}", e) }))).into_response(),
    }
}

// DELETE /api/kits/composicao/:kit/:comp
pub async fn delete_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Path((kit, comp)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.db.delete_kit_composicao(&kit, &comp) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir relação de kit: {}", e) }))).into_response(),
    }
}

// POST /api/kits/composicao/upload (re-import xlsx, replaces all)
pub async fn upload_kit_composicao(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name: Option<String> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }
    let bytes = match file_data {
        Some(b) => b,
        None => return (StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo não encontrado no formulário" }))).into_response(),
    };
    let temp_path = std::env::temp_dir().join("temp_kits_upload.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))).into_response(),
    };
    if let Err(e) = file.write_all(&bytes) {
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo: {}", e) }))).into_response();
    }
    // Clear existing and re-import
    if let Err(e) = state.db.delete_all_kit_composicao() {
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao limpar composições existentes: {}", e) }))).into_response();
    }
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão: {}", e) }))).into_response(),
    };
    match crate::parser::parse_kits_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let fname = file_name.unwrap_or_else(|| "kits.xlsx".to_string());
            let _ = state.db.record_import("kits", &fname, count as i64, "success",
                Some(&format!("{} relações importadas", count)));
            (StatusCode::OK, Json(json!({ "status": "success", "imported": count,
                "message": format!("Composição de kits importada: {} relações", count) }))).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Erro ao processar planilha: {}", e) }))).into_response()
        }
    }
}

// ===== IMPORT HISTORY & STATUS HANDLERS =====

// GET /api/import/history
pub async fn get_import_history(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_import_history() {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar histórico: {}", e) }))).into_response(),
    }
}

// GET /api/import/status
pub async fn get_import_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_import_status() {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar status: {}", e) }))).into_response(),
    }
}

// GET /api/import/watch-config
pub async fn get_watch_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_watch_config() {
        Ok(cfg) => (StatusCode::OK, Json(cfg)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configuração de pasta: {}", e) }))).into_response(),
    }
}

// POST /api/import/watch-config
pub async fn save_watch_config_handler(
    State(state): State<Arc<AppState>>,
    Json(cfg): Json<WatchConfig>,
) -> impl IntoResponse {
    match state.db.save_watch_config(&cfg) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) }))).into_response(),
    }
}

// GET /api/estoque/movimentacoes/:code
pub async fn get_stock_movements(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let mut stmt = match conn.prepare("SELECT id, item_code, item_type, movement_type, quantity, date, document_number, details, created_at FROM stock_movements WHERE item_code = ?1 ORDER BY date DESC") {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let rows = stmt.query_map(params![code], |row| {
        Ok(crate::models::StockMovement {
            id: row.get(0)?,
            item_code: row.get(1)?,
            item_type: row.get(2)?,
            movement_type: row.get(3)?,
            quantity: row.get(4)?,
            date: row.get(5)?,
            document_number: row.get(6)?,
            details: row.get(7)?,
            created_at: row.get(8)?,
        })
    });
    match rows {
        Ok(iter) => {
            let mut list = Vec::new();
            for r in iter {
                if let Ok(m) = r { list.push(m); }
            }
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/produtos/formulacao/:code
pub async fn get_product_formulation(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let mut stmt = match conn.prepare(
        "SELECT product_code, ingredient_code, description, quantity, percentage FROM formulations 
         WHERE product_code = ?1 OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = ?1) OR (?1 LIKE '0%' AND product_code = SUBSTR(?1, 2)) 
         ORDER BY quantity DESC"
    ) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let rows = stmt.query_map(params![code], |row| {
        Ok(crate::models::FormulationLine {
            product_code: row.get(0)?,
            ingredient_code: row.get(1)?,
            description: row.get(2)?,
            quantity: row.get(3)?,
            percentage: row.get(4)?,
        })
    });
    match rows {
        Ok(iter) => {
            let mut list = Vec::new();
            for r in iter {
                if let Ok(line) = r { list.push(line); }
            }
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// POST /api/import/dump
pub async fn trigger_db_dump(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let dump_path = "../legacy_dump.db";
    match crate::legacy_db::create_database_dump(dump_path).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Falha ao gerar cópia do banco: {}", e) }))).into_response(),
    }
}

// GET /api/settings/:key
pub async fn get_setting_handler(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> impl IntoResponse {
    if key == "hub_token" {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "hub_token is not readable via HTTP. Use NATUM_HUB_TOKEN, .natum_hub_token, or the Tauri get_hub_token command." })),
        )
            .into_response();
    }
    match state.db.get_setting(&key) {
        Ok(Some(val)) if crate::auth::is_sensitive_setting_key(&key) => {
            let is_set = !val.is_empty();
            (
                StatusCode::OK,
                Json(json!({
                    "key": key,
                    "value": null,
                    "is_set": is_set,
                    "masked": true
                })),
            )
                .into_response()
        }
        Ok(Some(val)) => (StatusCode::OK, Json(json!({ "key": key, "value": val, "is_set": true, "masked": false }))).into_response(),
        Ok(None) => {
            if crate::auth::is_sensitive_setting_key(&key) {
                (
                    StatusCode::OK,
                    Json(json!({ "key": key, "value": null, "is_set": false, "masked": true })),
                )
                    .into_response()
            } else {
                (StatusCode::NOT_FOUND, Json(json!({ "error": "Setting not found" }))).into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// POST /api/settings/:key
#[derive(serde::Deserialize)]
pub struct SaveSettingInput {
    pub value: String,
}

pub async fn save_setting_handler(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
    Json(body): Json<SaveSettingInput>,
) -> impl IntoResponse {
    if key == "hub_token" {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "hub_token cannot be changed via this endpoint. Set NATUM_HUB_TOKEN or the gitignored token file and restart." })),
        )
            .into_response();
    }
    if crate::auth::is_sensitive_setting_key(&key) && crate::auth::is_secret_placeholder(&body.value) {
        return (StatusCode::OK, Json(json!({ "status": "success", "unchanged": true }))).into_response();
    }
    match state.db.save_setting(&key, &body.value) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ===== PEDIDOS DE COMPRA & ITEM EXTRA INFO HANDLERS =====

#[derive(serde::Deserialize, Debug)]
pub struct PedidosQueryParams {
    pub search: Option<String>,
    pub status: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderResponse {
    pub n_registro: i32,
    pub n_pedido: i32,
    pub d_pedido: Option<String>,
    pub n_cod_fornec: Option<i32>,
    pub c_nome_f: Option<String>,
    pub c_usuario: Option<String>,
    pub c_status: Option<String>,
    pub c_prazo_pgto: Option<String>,
    pub c_prev_entrega: Option<String>,
    pub n_valor: f64,
    pub d_previsao: Option<String>,
    pub c_email: Option<String>,
    pub m_observac: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderItemResponse {
    pub id: i32,
    pub n_pedido_registro: i32,
    pub n_pedido: i32,
    pub c_referencia: String,
    pub n_qtde: f64,
    pub n_preco: f64,
    pub n_chegou: f64,
    pub c_descricao: Option<String>,
    pub c_unidade: Option<String>,
    pub n_valor_total: f64,
    pub n_registro: i32,
    pub c_chegada: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseOrderDetailResponse {
    #[serde(flatten)]
    pub header: PurchaseOrderResponse,
    pub items: Vec<PurchaseOrderItemResponse>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProductLoteInfo {
    pub id: String,
    pub quantity: f64,
    pub date: String,
    pub document_number: Option<String>,
    pub details: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingPurchaseOrderInfo {
    pub n_pedido: i32,
    pub d_pedido: Option<String>,
    pub c_nome_f: Option<String>,
    pub n_qtde: f64,
    pub n_chegou: f64,
    pub n_preco: f64,
}

// GET /api/compras/pedidos
pub async fn list_purchase_orders(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PedidosQueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    
    let mut query = "SELECT n_registro, n_pedido, d_pedido, n_cod_fornec, c_nome_f, c_usuario, c_status, c_prazo_pgto, c_prev_entrega, n_valor, d_previsao, c_email, m_observac FROM purchase_orders WHERE 1=1".to_string();
    let mut args: Vec<String> = Vec::new();

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            match status.as_str() {
                "ABERTO" => {
                    query.push_str(" AND (c_status = 'A' OR c_status = 'ABERTO')");
                }
                "PARCIAL" => {
                    query.push_str(" AND (c_status = 'P' OR c_status = 'PARCIAL')");
                }
                "FECHADO" | "CONCLUIDO" => {
                    query.push_str(" AND (c_status = 'F' OR c_status = 'T' OR c_status = 'FECHADO' OR c_status = 'CONCLUIDO')");
                }
                "CANCELADO" => {
                    query.push_str(" AND (c_status = 'C' OR c_status = 'CANCELADO')");
                }
                "ATRASADO" | "ATRASADOS" => {
                    query.push_str(" AND (c_status = '!' OR c_status = 'ATRASADO')");
                }
                _ => {
                    query.push_str(" AND c_status = ?");
                    args.push(status.clone());
                }
            }
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            query.push_str(" AND (c_nome_f LIKE ? OR CAST(n_pedido AS TEXT) LIKE ?)");
            let like_arg = format!("%{}%", search.trim());
            args.push(like_arg.clone());
            args.push(like_arg);
        }
    }

    query.push_str(" ORDER BY d_pedido DESC, n_pedido DESC");

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let params_converted = rusqlite::params_from_iter(args.iter());
    let rows = stmt.query_map(params_converted, |row| {
        Ok(PurchaseOrderResponse {
            n_registro: row.get(0)?,
            n_pedido: row.get(1)?,
            d_pedido: row.get(2)?,
            n_cod_fornec: row.get(3)?,
            c_nome_f: row.get(4)?,
            c_usuario: row.get(5)?,
            c_status: row.get(6)?,
            c_prazo_pgto: row.get(7)?,
            c_prev_entrega: row.get(8)?,
            n_valor: row.get(9)?,
            d_previsao: row.get(10)?,
            c_email: row.get(11)?,
            m_observac: row.get(12)?,
        })
    });

    match rows {
        Ok(iter) => {
            let mut list = Vec::new();
            for r in iter {
                if let Ok(m) = r { list.push(m); }
            }
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/compras/pedidos/:id
pub async fn get_purchase_order_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    // 1. Fetch header
    let header_res = conn.query_row(
        "SELECT n_registro, n_pedido, d_pedido, n_cod_fornec, c_nome_f, c_usuario, c_status, c_prazo_pgto, c_prev_entrega, n_valor, d_previsao, c_email, m_observac FROM purchase_orders WHERE n_registro = ?1",
        params![id],
        |row| {
            Ok(PurchaseOrderResponse {
                n_registro: row.get(0)?,
                n_pedido: row.get(1)?,
                d_pedido: row.get(2)?,
                n_cod_fornec: row.get(3)?,
                c_nome_f: row.get(4)?,
                c_usuario: row.get(5)?,
                c_status: row.get(6)?,
                c_prazo_pgto: row.get(7)?,
                c_prev_entrega: row.get(8)?,
                n_valor: row.get(9)?,
                d_previsao: row.get(10)?,
                c_email: row.get(11)?,
                m_observac: row.get(12)?,
            })
        }
    );

    let header = match header_res {
        Ok(h) => h,
        Err(rusqlite::Error::QueryReturnedNoRows) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Pedido não encontrado" }))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    // 2. Fetch items
    let mut stmt = match conn.prepare(
        "SELECT id, n_pedido_registro, n_pedido, c_referencia, n_qtde, n_preco, n_chegou, c_descricao, c_unidade, n_valor_total, n_registro, c_chegada FROM purchase_order_items WHERE n_pedido_registro = ?1 ORDER BY id ASC"
    ) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let items_rows = stmt.query_map(params![id], |row| {
        Ok(PurchaseOrderItemResponse {
            id: row.get(0)?,
            n_pedido_registro: row.get(1)?,
            n_pedido: row.get(2)?,
            c_referencia: row.get(3)?,
            n_qtde: row.get(4)?,
            n_preco: row.get(5)?,
            n_chegou: row.get(6)?,
            c_descricao: row.get(7)?,
            c_unidade: row.get(8)?,
            n_valor_total: row.get(9)?,
            n_registro: row.get(10)?,
            c_chegada: row.get(11)?,
        })
    });

    let mut items = Vec::new();
    if let Ok(iter) = items_rows {
        for r in iter {
            if let Ok(item) = r { items.push(item); }
        }
    }

    (StatusCode::OK, Json(PurchaseOrderDetailResponse { header, items })).into_response()
}

// ===== NOTAS FISCAIS HANDLERS =====

#[derive(serde::Deserialize, serde::Serialize)]
pub struct InvoicesQueryParams {
    pub search: Option<String>,
    pub supplier_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceHeaderResponse {
    pub invoice_number: String,
    pub invoice_date: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub total_value: f64,
    pub items_count: i32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceDetailResponse {
    pub invoice_number: String,
    pub invoice_date: Option<String>,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub total_value: f64,
    pub items: Vec<crate::Invoice>,
}

#[derive(serde::Deserialize)]
pub struct InvoiceDetailQueryParams {
    pub supplier_id: Option<String>,
}

// GET /api/compras/notas
pub async fn list_invoices(
    State(state): State<Arc<AppState>>,
    Query(params): Query<InvoicesQueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut query = "
        SELECT invoice_number, invoice_date, supplier_id, supplier_name, SUM(total_value) as total_val, COUNT(*) as items_count 
        FROM invoices 
        WHERE 1=1
    ".to_string();

    let mut args: Vec<String> = Vec::new();

    if let Some(ref supplier_id) = params.supplier_id {
        if !supplier_id.is_empty() {
            query.push_str(" AND supplier_id = ?");
            args.push(supplier_id.clone());
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            query.push_str(" AND (supplier_name LIKE ? OR invoice_number LIKE ?)");
            let like_arg = format!("%{}%", search.trim());
            args.push(like_arg.clone());
            args.push(like_arg);
        }
    }

    query.push_str(" GROUP BY invoice_number, supplier_id, supplier_name, invoice_date ORDER BY invoice_date DESC, invoice_number DESC");

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let params_converted = rusqlite::params_from_iter(args.iter());
    let rows = stmt.query_map(params_converted, |row| {
        Ok(InvoiceHeaderResponse {
            invoice_number: row.get(0)?,
            invoice_date: row.get(1)?,
            supplier_id: row.get(2)?,
            supplier_name: row.get(3)?,
            total_value: row.get(4)?,
            items_count: row.get(5)?,
        })
    });

    match rows {
        Ok(iter) => {
            let mut list = Vec::new();
            for r in iter {
                if let Ok(m) = r { list.push(m); }
            }
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/compras/notas/:number
pub async fn get_invoice_detail(
    State(state): State<Arc<AppState>>,
    Path(number): Path<String>,
    Query(params): Query<InvoiceDetailQueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut query = "
        SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date 
        FROM invoices 
        WHERE invoice_number = ?1
    ".to_string();

    let mut args: Vec<String> = vec![number.clone()];
    if let Some(ref supplier_id) = params.supplier_id {
        if !supplier_id.is_empty() {
            query.push_str(" AND supplier_id = ?2");
            args.push(supplier_id.clone());
        }
    }

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let params_converted = rusqlite::params_from_iter(args.iter());
    let rows = stmt.query_map(params_converted, |row| {
        Ok(crate::Invoice {
            id: row.get(0)?,
            invoice_number: row.get(1)?,
            item_code: row.get(2)?,
            description: row.get(3)?,
            unit: row.get(4)?,
            quantity: row.get(5)?,
            unit_price: row.get(6)?,
            total_value: row.get(7)?,
            supplier_name: row.get(8)?,
            supplier_id: row.get(9)?,
            invoice_date: row.get(10)?,
        })
    });

    let mut items = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(inv) = r { items.push(inv); }
        }
    }

    if items.is_empty() {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Nota fiscal não encontrada" }))).into_response();
    }

    let first = &items[0];
    let total_value: f64 = items.iter().map(|it| it.total_value).sum();

    let detail = InvoiceDetailResponse {
        invoice_number: first.invoice_number.clone(),
        invoice_date: first.invoice_date.clone(),
        supplier_id: first.supplier_id.clone(),
        supplier_name: first.supplier_name.clone(),
        total_value,
        items,
    };

    (StatusCode::OK, Json(detail)).into_response()
}

// GET /api/estoque/item-info/:code
pub async fn get_item_extra_info(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let code_clean = code.replace(".", "");

    let mut invoices = Vec::new();
    let mut pending_orders = Vec::new();
    let mut formulation = Vec::new();
    let mut lotes = Vec::new();

    // 1. Fetch recent purchase invoices (from invoices table)
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date FROM invoices WHERE item_code = ?1 OR item_code = ?2 ORDER BY invoice_date DESC LIMIT 10"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::Invoice {
                id: row.get(0)?,
                invoice_number: row.get(1)?,
                item_code: row.get(2)?,
                description: row.get(3)?,
                unit: row.get(4)?,
                quantity: row.get(5)?,
                unit_price: row.get(6)?,
                total_value: row.get(7)?,
                supplier_name: row.get(8)?,
                supplier_id: row.get(9)?,
                invoice_date: row.get(10)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(inv) = r { invoices.push(inv); }
            }
        }
    }

    // 2. Fetch pending purchase orders (from purchase_orders & purchase_order_items where n_chegou < n_qtde)
    if let Ok(mut stmt) = conn.prepare(
        "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, poi.n_preco 
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE (poi.c_referencia = ?1 OR poi.c_referencia = ?2) AND poi.n_chegou < poi.n_qtde
         ORDER BY po.d_pedido DESC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(PendingPurchaseOrderInfo {
                n_pedido: row.get(0)?,
                d_pedido: row.get(1)?,
                c_nome_f: row.get(2)?,
                n_qtde: row.get(3)?,
                n_chegou: row.get(4)?,
                n_preco: row.get(5)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(po) = r { pending_orders.push(po); }
            }
        }
    }

    // 3. Fetch formulation composition (if it's a finished product)
    if let Ok(mut stmt) = conn.prepare(
        "SELECT product_code, ingredient_code, description, quantity, percentage FROM formulations 
         WHERE product_code = ?1 OR product_code = ?2 OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = ?1) OR (?1 LIKE '0%' AND product_code = SUBSTR(?1, 2))
         ORDER BY quantity DESC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::FormulationLine {
                product_code: row.get(0)?,
                ingredient_code: row.get(1)?,
                description: row.get(2)?,
                quantity: row.get(3)?,
                percentage: row.get(4)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(line) = r { formulation.push(line); }
            }
        }
    }

    // 3.5. Always fetch in which products it is used (for usedIn info)
    let mut used_in = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT f.product_code, f.ingredient_code, p.descricao, f.quantity, f.percentage 
         FROM formulations f 
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         WHERE f.ingredient_code = ?1 OR f.ingredient_code = ?2
         ORDER BY p.descricao ASC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::FormulationLine {
                product_code: row.get(0)?,
                ingredient_code: row.get(1)?,
                description: row.get(2)?,
                quantity: row.get(3)?,
                percentage: row.get(4)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(line) = r { used_in.push(line); }
            }
        }
    }

    // Fallback: If no formulation found (maybe it's an insumo), check in which products it is used
    if formulation.is_empty() {
        formulation = used_in.clone();
    }

    // 4. Fetch production batches / lotes (from stock_movements with type 'entrada' and item_type 'produto')
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, quantity, date, document_number, details 
         FROM stock_movements 
         WHERE (item_code = ?1 OR item_code = ?2) AND item_type = 'produto' AND movement_type = 'entrada'
         ORDER BY date DESC LIMIT 15"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(ProductLoteInfo {
                id: row.get(0)?,
                quantity: row.get(1)?,
                date: row.get(2)?,
                document_number: row.get(3)?,
                details: row.get(4)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(lote) = r { lotes.push(lote); }
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "invoices": invoices,
            "pendingOrders": pending_orders,
            "formulation": formulation,
            "usedIn": used_in,
            "lotes": lotes,
        }))
    ).into_response()
}

// GET /api/compras/insumos/:code/detalhes
pub async fn get_insumo_detalhes(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    // 1. Fetch metadata
    let item_res = conn.query_row(
        "SELECT i.code, i.description, i.unit, i.notes, i.category_id, c.name 
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.code = ?1",
        params![code],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        }
    );

    let (item_code, description, unit, notes, category_id, category_name) = match item_res {
        Ok(vals) => vals,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "Item não encontrado" }))).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    // 2. Fetch current stock (latest snapshot)
    let current_stock: f64 = conn.query_row(
        "SELECT stock_qty FROM stock_snapshots WHERE item_code = ?1 ORDER BY snapshot_date DESC, id DESC LIMIT 1",
        params![code],
        |row| row.get(0)
    ).unwrap_or(0.0);

    // 3. Fetch consumption YoY
    let mut consumption_yoy = Vec::new();
    let code_clean = code.replace(".", "");
    if let Ok(mut stmt) = conn.prepare(
        "SELECT year, SUM(total_qty), SUM(total_qty) / 12.0 FROM consumption WHERE item_code = ?1 OR item_code = ?2 GROUP BY year ORDER BY year DESC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::ConsumptionYoYItem {
                year: row.get(0)?,
                total_qty: row.get(1)?,
                monthly_avg: row.get(2)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    consumption_yoy.push(item);
                }
            }
        }
    }

    // 4. Fetch monthly purchases (receipts) grouping by year/month
    let mut monthly_purchases = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT strftime('%Y-%m', invoice_date) as year_month, SUM(quantity) 
         FROM invoices 
         WHERE (item_code = ?1 OR item_code = ?2) AND invoice_date <= datetime('now', 'localtime')
         GROUP BY year_month 
         ORDER BY year_month ASC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::MonthlyPurchaseItem {
                month: row.get::<_, String>(0)?,
                qty: row.get::<_, f64>(1)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    monthly_purchases.push(item);
                }
            }
        }
    }

    // 4b. Fetch monthly consumption grouping by year/month from stock_movements
    let mut monthly_consumption = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT strftime('%Y-%m', date) as year_month, SUM(quantity) 
         FROM stock_movements 
         WHERE (item_code = ?1 OR item_code = ?2) AND movement_type = 'saida' AND item_type = 'insumo' AND date <= datetime('now', 'localtime')
         GROUP BY year_month 
         ORDER BY year_month ASC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::MonthlyConsumptionItem {
                month: row.get::<_, String>(0)?,
                qty: row.get::<_, f64>(1)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    monthly_consumption.push(item);
                }
            }
        }
    }

    // 5. Fetch recent invoices
    let mut recent_invoices = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT invoice_number, quantity, unit_price, total_value, supplier_name, invoice_date 
         FROM invoices 
         WHERE (item_code = ?1 OR item_code = ?2) AND invoice_date <= datetime('now', 'localtime')
         ORDER BY invoice_date DESC LIMIT 15"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::InsumoInvoiceItem {
                invoice_number: row.get(0)?,
                quantity: row.get(1)?,
                unit_price: row.get(2)?,
                total_value: row.get(3)?,
                supplier_name: row.get(4)?,
                invoice_date: row.get(5)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    recent_invoices.push(item);
                }
            }
        }
    }

    // 6. Last time used (from stock_movements with type 'saida' and item_type 'insumo')
    let last_used: Option<(String, String)> = conn.query_row(
        "SELECT date, document_number FROM stock_movements 
         WHERE (item_code = ?1 OR item_code = ?2) AND item_type = 'insumo' AND movement_type = 'saida' AND date <= datetime('now', 'localtime')
         ORDER BY date DESC LIMIT 1",
        params![code, code_clean],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default()))
    ).ok();

    let (last_used_date, last_used_lote) = match last_used {
        Some((date, lote)) => (Some(date), Some(lote)),
        None => (None, None),
    };

    // 7. Last received (from invoices)
    let last_received: Option<(String, String)> = conn.query_row(
        "SELECT invoice_date, invoice_number FROM invoices 
         WHERE (item_code = ?1 OR item_code = ?2) AND invoice_date <= datetime('now', 'localtime')
         ORDER BY invoice_date DESC LIMIT 1",
        params![code, code_clean],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    ).ok();

    let (last_received_date, last_received_doc) = match last_received {
        Some((date, doc)) => (Some(date), Some(doc)),
        None => (None, None),
    };

    // 8. Fetch products where this insumo is used
    let mut products_used_in = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT f.product_code, p.descricao, f.quantity 
         FROM formulations f
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         WHERE f.ingredient_code = ?1
         ORDER BY f.product_code ASC"
    ) {
        let rows = stmt.query_map(params![code], |row| {
            Ok(crate::models::InsumoUsedInProductItem {
                product_code: row.get(0)?,
                description: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                quantity: row.get(2)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    if let Some(existing) = products_used_in.iter_mut().find(|x: &&mut crate::models::InsumoUsedInProductItem| x.product_code == item.product_code) {
                        existing.quantity += item.quantity;
                    } else {
                        products_used_in.push(item);
                    }
                }
            }
        }
    }

    let mut pending_orders = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, poi.n_preco 
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE (poi.c_referencia = ?1 OR poi.c_referencia = ?2) AND poi.n_chegou < poi.n_qtde
         ORDER BY po.d_pedido DESC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::PendingPurchaseOrderInfo {
                n_pedido: row.get(0)?,
                d_pedido: row.get(1)?,
                c_nome_f: row.get(2)?,
                n_qtde: row.get(3)?,
                n_chegou: row.get(4)?,
                n_preco: row.get(5)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(po) = r { pending_orders.push(po); }
            }
        }
    }

    let mut quotations = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT q.id, q.title, q.status, qi.recommended_qty, qi.approved_qty, qi.final_qty, q.created_at
         FROM quotation_items qi
         INNER JOIN quotations q ON qi.quotation_id = q.id
         WHERE qi.item_code = ?1 OR qi.item_code = ?2
         ORDER BY q.created_at DESC"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::InsumoQuotationItem {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                recommended_qty: row.get(3)?,
                approved_qty: row.get(4)?,
                final_qty: row.get(5)?,
                created_at: row.get(6)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(q) = r { quotations.push(q); }
            }
        }
    }

    // 10. Fetch open production orders (lotes) for products that use this insumo
    let mut open_production_orders = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details
         FROM stock_movements m
         LEFT JOIN produtos p ON p.codigo = m.item_code
         WHERE m.item_type = 'produto' AND m.movement_type = 'entrada'
         AND EXISTS (
             SELECT 1 FROM formulations f
             WHERE (f.product_code = m.item_code 
                OR (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = m.item_code) 
                OR (m.item_code LIKE '0%' AND f.product_code = SUBSTR(m.item_code, 2)))
             AND f.ingredient_code = ?1
         )
         ORDER BY m.date DESC
         LIMIT 200"
    ) {
        struct RawOpenOP {
            lote_number: String,
            product_code: String,
            product_description: String,
            quantity_produced: f64,
            production_date: String,
            details: String,
        }
        let rows = stmt.query_map(params![code], |row| {
            Ok(RawOpenOP {
                lote_number: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                product_code: row.get(1)?,
                product_description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                quantity_produced: row.get(3)?,
                production_date: row.get(4)?,
                details: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        });

        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(raw_op) = r {
                    // Parse status and dPesado
                    let mut status = String::new();
                    let mut d_pesado = String::new();
                    for part in raw_op.details.split('|') {
                        let part = part.trim();
                        if part.starts_with("Status:") {
                            status = part.trim_start_matches("Status:").trim().to_string();
                        } else if part.starts_with("dPesado:") {
                            d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                        }
                    }
                    let status_label = match status.to_uppercase().as_str() {
                        "EA" => "Estoque Atualizado",
                        "PG" => "Em Pesagem",
                        "PP" => "Pré-Produção",
                        "PR" => "Em Produção",
                        "EN" => "Em Envase",
                        "CF" => "Conferido",
                        "CA" => "Cancelado",
                        "FP" => "Finalizado",
                        _ => &status,
                    }.to_string();

                    // Calculate true insumo_qty_per_unit (factor)
                    let mut insumo_qty_per_unit = 0.0;
                    if let Ok(mut stmt_form) = conn.prepare(
                        "SELECT quantity, IFNULL(percentage, 0.0) FROM formulations 
                         WHERE (product_code = ?1 
                            OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = ?1) 
                            OR (?1 LIKE '0%' AND product_code = SUBSTR(?1, 2)))
                         AND ingredient_code = ?2"
                    ) {
                        if let Ok(mut rows_form) = stmt_form.query(params![raw_op.product_code, code]) {
                            if let Ok(Some(row_form)) = rows_form.next() {
                                let qty: f64 = row_form.get(0).unwrap_or(0.0);
                                let pct: f64 = row_form.get(1).unwrap_or(0.0);
                                if pct > 0.0 {
                                    insumo_qty_per_unit = pct / 100.0;
                                } else {
                                    // Fallback: get the sum of quantities for this product
                                    let sum: f64 = match conn.query_row(
                                        "SELECT SUM(quantity) FROM formulations 
                                         WHERE (product_code = ?1 
                                            OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = ?1) 
                                            OR (?1 LIKE '0%' AND product_code = SUBSTR(?1, 2)))",
                                        params![raw_op.product_code],
                                        |r| r.get(0)
                                    ) {
                                        Ok(s) => s,
                                        Err(_) => 0.0,
                                    };
                                    if sum > 0.0 {
                                        insumo_qty_per_unit = qty / sum;
                                    }
                                }
                            }
                        }
                    }

                    // Calculate insumo quantities needed (Fallback to our calculation if not found in lotes_baixas)
                    let fallback_qty_needed = raw_op.quantity_produced * insumo_qty_per_unit;
                    
                    let insumo_qty_needed: f64 = match conn.query_row(
                        "SELECT nQtdeRef FROM lotes_baixas WHERE nLote = ?1 AND cReferencia = ?2",
                        params![raw_op.lote_number, code],
                        |row| row.get(0)
                    ) {
                        Ok(q) => q,
                        Err(_) => fallback_qty_needed,
                    };

                    // Query actual weighed quantity of this insumo in this lote
                    let insumo_qty_weighed: f64 = match conn.query_row(
                        "SELECT COALESCE(SUM(quantity), 0.0) FROM stock_movements
                         WHERE document_number = ?1 AND item_code = ?2 AND movement_type = 'saida'",
                         params![raw_op.lote_number, code],
                         |row| row.get(0)
                    ) {
                        Ok(q) => q,
                        Err(_) => 0.0,
                    };

                    // Check if pesagem is completed
                    let pesagem_completed = !d_pesado.is_empty();

                    // Filter: only show open orders (exclude EA, CF, FP, CA, FI)
                    // Also exclude if pesagem is effectively completed for this insumo
                    let is_closed_status = status == "EA" || status == "CF" || status == "FP" || status == "CA" || status == "FI";
                    
                    if !is_closed_status && !pesagem_completed {
                        open_production_orders.push(crate::models::OpenProductionOrderItem {
                            product_code: raw_op.product_code,
                            product_description: raw_op.product_description,
                            production_date: raw_op.production_date,
                            quantity_produced: raw_op.quantity_produced,
                            insumo_qty_per_unit,
                            insumo_qty_needed,
                            observations: Some(raw_op.details),
                            lote_number: raw_op.lote_number,
                            status,
                            status_label,
                            insumo_qty_weighed,
                            pesagem_completed,
                        });
                    }
                }
            }
        }
    }

    let response = crate::models::InsumoDetalhesResponse {
        code: item_code,
        description,
        unit,
        notes,
        category_id,
        category_name,
        current_stock,
        consumption_yoy,
        monthly_purchases,
        monthly_consumption,
        recent_invoices,
        last_used_date,
        last_used_lote,
        last_received_date,
        last_received_doc,
        products_used_in,
        pending_orders,
        quotations,
        open_production_orders,
    };

    (StatusCode::OK, Json(response)).into_response()
}

// GET /api/produtos/semelhantes/:code
pub async fn get_similar_products(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    
    // Fetch target ingredients with their quantities
    let mut target_map = HashMap::new();
    let mut stmt = match conn.prepare("SELECT ingredient_code, quantity FROM formulations WHERE product_code = ?1") {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let rows = stmt.query_map(params![code], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)));
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok((ing, qty)) = r {
                *target_map.entry(ing).or_insert(0.0) += qty;
            }
        }
    }
    
    if target_map.is_empty() {
        return (StatusCode::OK, Json(Vec::<crate::models::SimilarProductResult>::new())).into_response();
    }
    
    // Fetch all other formulations
    let mut product_ingredients: HashMap<String, HashMap<String, f64>> = HashMap::new();
    let mut stmt_all = match conn.prepare("SELECT product_code, ingredient_code, quantity FROM formulations WHERE product_code != ?1") {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let rows_all = stmt_all.query_map(params![code], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?)));
    if let Ok(iter) = rows_all {
        for r in iter {
            if let Ok((p_code, ing_code, qty)) = r {
                *product_ingredients.entry(p_code).or_default().entry(ing_code).or_insert(0.0) += qty;
            }
        }
    }
    
    let total_target_qty: f64 = target_map.values().sum();
    let mut match_map = HashMap::new();
    
    if total_target_qty > 0.0 {
        for (other_code, ingredients) in &product_ingredients {
            // Must have the exact same number of ingredients
            if ingredients.len() != target_map.len() {
                continue;
            }
            let total_other_qty: f64 = ingredients.values().sum();
            if total_other_qty <= 0.0 {
                continue;
            }
            // Check if all target ingredients exist in other and have matching relative proportions
            let mut is_identical = true;
            for (ing_code, target_qty) in &target_map {
                if let Some(other_qty) = ingredients.get(ing_code) {
                    let target_prop = target_qty / total_target_qty;
                    let other_prop = other_qty / total_other_qty;
                    if (other_prop - target_prop).abs() > 1e-4 {
                        is_identical = false;
                        break;
                    }
                } else {
                    is_identical = false;
                    break;
                }
            }
            if is_identical {
                match_map.insert(other_code.clone(), 1.0); // 1.0 similarity means 100% identical formula proportions
            }
        }
    }
    
    // Load calculated product details
    let (products, stocks, fat_map, configs, overrides) = match fetch_calculation_data(&state.db) {
        Ok(data) => data,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    
    // Fetch formulations and latest stock levels for decoration
    let mut formulations_map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
    let stmt_form = conn.prepare("SELECT product_code, ingredient_code, description, quantity FROM formulations");
    if let Ok(mut stmt) = stmt_form {
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                row.get::<_, f64>(3)?
            ))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((p_code, ing_code, desc, qty)) = r {
                    let ingredients = formulations_map.entry(p_code).or_default();
                    if let Some(existing) = ingredients.iter_mut().find(|(code, _, _)| code == &ing_code) {
                        existing.2 += qty;
                    } else {
                        ingredients.push((ing_code, desc, qty));
                    }
                }
            }
        }
    }

    let mut item_stock_map: HashMap<String, f64> = HashMap::new();
    let stmt_snap = conn.prepare("
        SELECT item_code, stock_qty 
        FROM stock_snapshots ss
        WHERE ss.id = (
            SELECT id FROM stock_snapshots ss2 
            WHERE ss2.item_code = ss.item_code 
            ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
        )
    ");
    if let Ok(mut stmt) = stmt_snap {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((c, s)) = r {
                    item_stock_map.insert(c, s);
                }
            }
        }
    }
    
    let mut similar_results = Vec::new();
    for mut comp in computed {
        if let Some(&sim) = match_map.get(&comp.codigo) {
            let has_form = formulations_map.contains_key(&comp.codigo);
            let mut missing = Vec::new();
            if has_form && comp.producao_recomendada > 0 {
                if let Some(ingredients) = formulations_map.get(&comp.codigo) {
                    for (ing_code, desc, qty) in ingredients {
                        let req = comp.producao_recomendada as f64 * qty;
                        let stock = *item_stock_map.get(ing_code).unwrap_or(&0.0);
                        if stock < req {
                            missing.push(desc.clone());
                        }
                    }
                }
            }
            comp.has_formulation = has_form;
            comp.missing_ingredients = missing;

            similar_results.push(crate::models::SimilarProductResult {
                product: comp,
                similarity: sim,
            });
        }
    }
    similar_results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    
    (StatusCode::OK, Json(similar_results)).into_response()
}

// GET /api/producao/recalcular/preview
pub async fn preview_recalculation(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let product_code = match params.get("product_code") {
        Some(code) => code,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Falta product_code" }))).into_response(),
    };
    let ingredient_code = match params.get("ingredient_code") {
        Some(code) => code,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Falta ingredient_code" }))).into_response(),
    };
    
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    
    // 1. Get product description
    let product_desc: String = match conn.query_row(
        "SELECT descricao FROM produtos WHERE codigo = ?1",
        params![product_code],
        |row| row.get(0)
    ) {
        Ok(desc) => desc,
        Err(_) => "Produto não encontrado".to_string(),
    };
    
    // 2. Get ingredient description
    let ingredient_desc: String = match conn.query_row(
        "SELECT description FROM items WHERE code = ?1",
        params![ingredient_code],
        |row| row.get(0)
    ) {
        Ok(desc) => desc,
        Err(_) => "Insumo não encontrado".to_string(),
    };
    
    // 3. Get formulation quantity
    let qty_per_unit: f64 = match conn.query_row(
        "SELECT SUM(quantity) FROM formulations WHERE product_code = ?1 AND ingredient_code = ?2",
        params![product_code, ingredient_code],
        |row| Ok(row.get::<_, Option<f64>>(0)?.unwrap_or(0.0))
    ) {
        Ok(qty) => qty,
        Err(_) => 0.0,
    };
    
    // 4. Calculate total produced
    let total_produced: i64 = match conn.query_row(
        "SELECT SUM(quantidade) FROM historico_producao WHERE codigo = ?1",
        params![product_code],
        |row| Ok(row.get::<_, Option<i64>>(0)?.unwrap_or(0))
    ) {
        Ok(sum) => sum,
        Err(_) => 0,
    };
    
    // 5. Get current stock
    let current_stock: f64 = match conn.query_row(
        "SELECT stock_qty FROM stock_snapshots ss 
         WHERE ss.item_code = ?1 
         ORDER BY ss.snapshot_date DESC, ss.id DESC LIMIT 1",
        params![ingredient_code],
        |row| row.get(0)
    ) {
        Ok(stock) => stock,
        Err(_) => 0.0,
    };
    
    let total_consumption = total_produced as f64 * qty_per_unit;
    let expected_stock = current_stock - total_consumption;
    
    (
        StatusCode::OK,
        Json(crate::models::RecalculationPreviewResponse {
            product_code: product_code.clone(),
            product_description: product_desc,
            ingredient_code: ingredient_code.clone(),
            ingredient_description: ingredient_desc,
            total_produced,
            qty_per_unit,
            total_consumption,
            current_stock,
            expected_stock,
        })
    ).into_response()
}

// POST /api/producao/recalcular/ajustar
pub async fn apply_recalculation_adjustment(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::RecalculationAdjustmentRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    
    // 1. Fetch latest snapshot details for this ingredient
    let latest_row_opt = conn.query_row(
        "SELECT stock_qty, reserved_qty, in_production, in_orders FROM stock_snapshots ss 
         WHERE ss.item_code = ?1 
         ORDER BY ss.snapshot_date DESC, ss.id DESC LIMIT 1",
        params![payload.ingredient_code],
        |row| Ok((row.get::<_, f64>(0)?, row.get::<_, f64>(1)?, row.get::<_, f64>(2)?, row.get::<_, f64>(3)?))
    );
    
    let (current_stock, reserved_qty, in_production, in_orders) = match latest_row_opt {
        Ok(details) => details,
        Err(_) => (0.0, 0.0, 0.0, 0.0), // fallback if no snapshots exist
    };
    
    let new_stock = (current_stock - payload.adjustment_qty).max(0.0);
    
    // 2. Insert import record if MANUAL_ADJUST doesn't exist
    let _ = conn.execute(
        "INSERT OR IGNORE INTO stock_imports (id, filename, source, imported_at, item_count)
         VALUES ('MANUAL_ADJUST', 'Ajuste Manual', 'AJUSTE', CURRENT_TIMESTAMP, 1)",
        [],
    );
    
    // 3. Insert new snapshot row
    let new_uuid = uuid::Uuid::new_v4().to_string();
    
    match conn.execute(
        "INSERT INTO stock_snapshots (id, import_id, item_code, stock_qty, reserved_qty, in_production, in_orders, snapshot_date)
         VALUES (?1, 'MANUAL_ADJUST', ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
        params![new_uuid, payload.ingredient_code, new_stock, reserved_qty, in_production, in_orders]
    ) {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ 
                "status": "success", 
                "message": format!("Estoque da embalagem/insumo {} ajustado de {} para {} com sucesso!", payload.ingredient_code, current_stock, new_stock) 
            }))
        ).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Erro ao inserir snapshot de ajuste: {}", e) }))).into_response(),
    }
}

// GET /api/compras/lojas
pub async fn list_online_stores(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, url, notes, created_at FROM online_stores ORDER BY name ASC"
    ) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let rows = match stmt.query_map([], |row| {
        Ok(crate::OnlineStore {
            id: row.get(0)?,
            name: row.get(1)?,
            url: row.get(2)?,
            notes: row.get(3)?,
            created_at: row.get(4)?,
        })
    }) {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut stores = Vec::new();
    for row in rows {
        match row {
            Ok(s) => stores.push(s),
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        }
    }

    (StatusCode::OK, Json(stores)).into_response()
}

// POST /api/compras/lojas
pub async fn save_online_store_handler(
    State(state): State<Arc<AppState>>,
    Json(store): Json<crate::OnlineStore>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    match conn.execute(
        "INSERT OR REPLACE INTO online_stores (id, name, url, notes) VALUES (?1, ?2, ?3, ?4)",
        params![
            store.id,
            store.name,
            store.url,
            store.notes,
        ],
    ) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/compras/lojas/:id
pub async fn delete_online_store_handler(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    match conn.execute("DELETE FROM online_stores WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/produtos/:code/detalhes
pub async fn get_product_detalhes(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let product_res = conn.query_row(
        "SELECT p.codigo, p.descricao, IFNULL(i.unit, 'UN') as unidade, IFNULL(e.estoque, 0.0)
         FROM produtos p
         LEFT JOIN items i ON p.codigo = i.code
         LEFT JOIN estoque_atual e ON p.codigo = e.codigo
         WHERE p.codigo = ?1",
        params![code],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        }
    );

    let (prod_code, description, unit, current_stock) = match product_res {
        Ok(vals) => vals,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "Produto não encontrado" }))).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    // Fetch category parent mapping to resolve subcategories to roots
    let mut category_parent_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, parent_id FROM categories") {
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok((id, parent_id)) = r {
                    if let Some(p_id) = parent_id {
                        category_parent_map.insert(id, p_id);
                    }
                }
            }
        }
    }

    let resolve_root_category = |cat_id: &str, parent_map: &std::collections::HashMap<String, String>| -> String {
        let mut current = cat_id.to_string();
        let mut visited = std::collections::HashSet::new();
        visited.insert(current.clone());
        while let Some(parent) = parent_map.get(&current) {
            if visited.contains(parent) {
                break;
            }
            current = parent.clone();
            visited.insert(current.clone());
        }
        current
    };

    // 2. Fetch formulation/composition left joined with latest ingredient stock snapshot
    let mut formulation = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT 
            f.product_code, 
            f.ingredient_code, 
            f.description, 
            f.quantity, 
            f.percentage,
            IFNULL(s.stock_qty, 0.0) as ingredient_stock,
            i.category_id
         FROM formulations f
         LEFT JOIN items i ON f.ingredient_code = i.code
         LEFT JOIN (
             SELECT ss.item_code, ss.stock_qty
             FROM stock_snapshots ss
             WHERE ss.id = (
                 SELECT id FROM stock_snapshots ss2 
                 WHERE ss2.item_code = ss.item_code 
                 ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
             )
         ) s ON f.ingredient_code = s.item_code
         WHERE f.product_code = ?1
         ORDER BY f.quantity DESC"
    ) {
        let rows = stmt.query_map(params![code], |row| {
            let cat_id: Option<String> = row.get(6)?;
            let root_cat = cat_id.map(|cid| resolve_root_category(&cid, &category_parent_map));
            Ok(crate::models::ProductFormulationLine {
                product_code: row.get(0)?,
                ingredient_code: row.get(1)?,
                description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                quantity: row.get(3)?,
                percentage: row.get(4)?,
                current_stock: row.get(5)?,
                category_id: root_cat,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(line) = r {
                    formulation.push(line);
                }
            }
        }
    }

    // 3. Fetch sales YoY (from stock_movements where movement_type = 'saida' and item_type = 'produto')
    let mut sales_yoy = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT 
            CAST(strftime('%Y', date) AS INTEGER) as year, 
            SUM(quantity) as total_qty,
            SUM(quantity) / 12.0 as monthly_avg
         FROM stock_movements 
         WHERE item_code = ?1 AND item_type = 'produto' AND movement_type = 'saida' AND date <= datetime('now', 'localtime')
         GROUP BY year 
         ORDER BY year DESC"
    ) {
        let rows = stmt.query_map(params![code], |row| {
            Ok(crate::models::SalesYoYItem {
                year: row.get(0)?,
                total_qty: row.get(1)?,
                monthly_avg: row.get(2)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    sales_yoy.push(item);
                }
            }
        }
    }

    // 4. Fetch monthly sales (from stock_movements)
    let mut monthly_sales = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT 
            strftime('%Y-%m', date) as year_month, 
            SUM(quantity) as qty
         FROM stock_movements 
         WHERE item_code = ?1 AND item_type = 'produto' AND movement_type = 'saida' AND date <= datetime('now', 'localtime')
         GROUP BY year_month 
         ORDER BY year_month ASC"
    ) {
        let rows = stmt.query_map(params![code], |row| {
            Ok(crate::models::MonthlySalesItem {
                month: row.get(0)?,
                qty: row.get(1)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    monthly_sales.push(item);
                }
            }
        }
    }

    // 5. Fetch recent invoices (if any)
    let mut recent_invoices = Vec::new();
    let code_clean = code.replace(".", "");
    if let Ok(mut stmt) = conn.prepare(
        "SELECT invoice_number, quantity, unit_price, total_value, supplier_name, invoice_date 
         FROM invoices 
         WHERE (item_code = ?1 OR item_code = ?2) AND invoice_date <= datetime('now', 'localtime')
         ORDER BY invoice_date DESC LIMIT 15"
    ) {
        let rows = stmt.query_map(params![code, code_clean], |row| {
            Ok(crate::models::InsumoInvoiceItem {
                invoice_number: row.get(0)?,
                quantity: row.get(1)?,
                unit_price: row.get(2)?,
                total_value: row.get(3)?,
                supplier_name: row.get(4)?,
                invoice_date: row.get(5)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    recent_invoices.push(item);
                }
            }
        }
    }

    // 6. Fetch recent production lots (up to 15) and calculate last production stats
    let mut last_production_date: Option<String> = None;
    let mut last_production_qty: Option<f64> = None;
    let mut last_lots: Vec<crate::models::ProductionLote> = Vec::new();

    if let Ok(mut stmt) = conn.prepare(
        "SELECT m.id, m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details 
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.item_code = ?1 AND m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date <= datetime('now', 'localtime')
         ORDER BY m.date DESC LIMIT 15"
    ) {
        let rows = stmt.query_map(params![code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                row.get::<_, f64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?.unwrap_or_default(),
            ))
        });
        if let Ok(iter) = rows {
            for (index, r) in iter.enumerate() {
                if let Ok((id, lote_number, product_code, product_description, quantity, date, details)) = r {
                    if index == 0 {
                        last_production_date = Some(date.clone());
                        last_production_qty = Some(quantity);
                    }
                    
                    let mut status = String::new();
                    let mut fabricated_by = String::new();
                    let mut authorized_by = String::new();
                    for part in details.split('|') {
                        let part = part.trim();
                        if part.starts_with("Status:") {
                            status = part.trim_start_matches("Status:").trim().to_string();
                        } else if part.starts_with("Fab:") {
                            fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
                        } else if part.starts_with("Aut:") {
                            authorized_by = part.trim_start_matches("Aut:").trim().to_string();
                        }
                    }

                    let mut new_lote = crate::models::ProductionLote {
                        id,
                        lote_number: lote_number.clone(),
                        product_code: product_code.clone(),
                        product_description: product_description.clone(),
                        quantity,
                        date: date.clone(),
                        status: status.clone(),
                        fabricated_by,
                        authorized_by,
                        yield_error: None,
                        pesagem_error: None,
                        envase_error: None,
                        conferencia_error: None,
                        is_resolved: None,
                        resolution_obs: None,
                    };

                    if status == "EA" || status == "FP" || status == "CF" {
                        // Get total ingredient weight exited for this OP
                        let ing_exit_sum: f64 = match conn.query_row(
                            "SELECT SUM(quantity) FROM stock_movements 
                             WHERE document_number = ?1 AND item_type = 'insumo' AND movement_type = 'saida'",
                            params![&new_lote.lote_number],
                            |r| Ok(r.get::<_, Option<f64>>(0)?.unwrap_or(0.0))
                        ) {
                            Ok(val) => val,
                            Err(_) => 0.0,
                        };

                        let form_sum: f64 = match conn.query_row(
                            "SELECT SUM(quantity) FROM formulations WHERE product_code = ?1",
                            params![&new_lote.product_code],
                            |r| Ok(r.get::<_, Option<f64>>(0)?.unwrap_or(1.0))
                        ) {
                            Ok(val) => val,
                            Err(_) => 1.0,
                        };
                        let total_expected_weight = new_lote.quantity * form_sum;

                        if ing_exit_sum > 0.0 && total_expected_weight > 0.0 {
                            let diff = (ing_exit_sum - total_expected_weight).abs() / total_expected_weight;
                            new_lote.yield_error = Some(diff > 0.10);
                        }

                        let (pe, ee, ce) = check_lote_errors(&conn, &new_lote.lote_number, &new_lote.product_code, new_lote.quantity, &details, &new_lote.product_description);
                        new_lote.pesagem_error = Some(pe);
                        new_lote.envase_error = Some(ee);
                        new_lote.conferencia_error = Some(ce);
                    }

                    last_lots.push(new_lote);
                }
            }
        }
    }

    let response = crate::models::ProductDetalhesResponse {
        code: prod_code,
        description,
        unit,
        current_stock,
        formulation,
        sales_yoy,
        monthly_sales,
        recent_invoices,
        last_production_date,
        last_production_qty,
        last_lots,
    };

    (StatusCode::OK, Json(response)).into_response()
}

// GET /api/producao/lotes
pub async fn get_production_lotes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut query = "
        SELECT m.id, m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details, r.is_resolved, r.observations
        FROM stock_movements m
        LEFT JOIN produtos p ON m.item_code = p.codigo
        LEFT JOIN lote_error_resolutions r ON m.document_number = r.lote_number
        WHERE m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date <= datetime('now', 'localtime')
    ".to_string();

    let mut args: Vec<String> = Vec::new();

    if let Some(ref status) = params.status {
        if !status.is_empty() && status != "ALL" {
            query.push_str(" AND m.details LIKE ?");
            args.push(format!("%Status: {}%", status));
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            query.push_str(" AND (m.document_number LIKE ? OR m.item_code LIKE ? OR p.descricao LIKE ? OR m.details LIKE ?)");
            let like_arg = format!("%{}%", search.trim());
            args.push(like_arg.clone());
            args.push(like_arg.clone());
            args.push(like_arg.clone());
            args.push(like_arg);
        }
    }

    query.push_str(" ORDER BY m.date DESC");

    let limit_val = params.limit.unwrap_or(10000);
    query.push_str(&format!(" LIMIT {}", limit_val));

    let raw_lotes = {
        let mut stmt = match conn.prepare(&query) {
            Ok(s) => s,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        };

        let params_converted = rusqlite::params_from_iter(args.iter());

        struct RawLote {
            id: String,
            lote_number: String,
            product_code: String,
            product_description: String,
            quantity: f64,
            date: String,
            details: String,
            is_resolved: Option<bool>,
            resolution_obs: Option<String>,
        }

        let rows_res = stmt.query_map(params_converted, |row| {
            let is_resolved_int: Option<i32> = row.get(7)?;
            let is_resolved = is_resolved_int.map(|v| v == 1);
            Ok(RawLote {
                id: row.get(0)?,
                lote_number: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                product_code: row.get(2)?,
                product_description: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                quantity: row.get(4)?,
                date: row.get(5)?,
                details: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                is_resolved,
                resolution_obs: row.get(8)?,
            })
        });

        match rows_res {
            Ok(iter) => {
                let mut list = Vec::new();
                for r in iter {
                    if let Ok(l) = r {
                        list.push(l);
                    }
                }
                list
            }
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        }
    };

    let mut grouped_lotes: Vec<crate::models::ProductionLote> = Vec::new();
    let mut lote_indices = std::collections::HashMap::new();

    for rl in raw_lotes {
        let mut status = String::new();
        let mut fabricated_by = String::new();
        let mut authorized_by = String::new();
        for part in rl.details.split('|') {
            let part = part.trim();
            if part.starts_with("Status:") {
                status = part.trim_start_matches("Status:").trim().to_string();
            } else if part.starts_with("Fab:") {
                fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
            } else if part.starts_with("Aut:") {
                authorized_by = part.trim_start_matches("Aut:").trim().to_string();
            }
        }

        if let Some(&idx) = lote_indices.get(&rl.lote_number) {
            let lote: &mut crate::models::ProductionLote = &mut grouped_lotes[idx];
            if !lote.product_code.contains(&rl.product_code) {
                lote.product_code = format!("{} / {}", lote.product_code, rl.product_code);
                lote.product_description = format!("{} / {}", lote.product_description, rl.product_description);
            }
            lote.quantity += rl.quantity;
        } else {
            let new_lote = crate::models::ProductionLote {
                id: rl.id,
                lote_number: rl.lote_number.clone(),
                product_code: rl.product_code,
                product_description: rl.product_description,
                quantity: rl.quantity,
                date: rl.date,
                status,
                fabricated_by,
                authorized_by,
                yield_error: None,
                pesagem_error: None,
                envase_error: None,
                conferencia_error: None,
                is_resolved: rl.is_resolved,
                resolution_obs: rl.resolution_obs,
            };
            lote_indices.insert(rl.lote_number, grouped_lotes.len());
            grouped_lotes.push(new_lote);
        }
    }

    for lote in &mut grouped_lotes {
        let status = &lote.status;
        if status == "EA" || status == "FP" || status == "CF" {
            // Find all products in this same batch
            let mut batch_products = Vec::new();
            if let Ok(mut stmt) = conn.prepare(
                "SELECT m.item_code, m.quantity, p.descricao, m.details 
                 FROM stock_movements m
                 LEFT JOIN produtos p ON m.item_code = p.codigo
                 WHERE m.document_number = ?1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'"
            ) {
                if let Ok(mut rows) = stmt.query(params![&lote.lote_number]) {
                    while let Ok(Some(row)) = rows.next() {
                        if let (Ok(code), Ok(qty), Ok(desc), Ok(details)) = (
                            row.get::<_, String>(0),
                            row.get::<_, f64>(1),
                            row.get::<_, Option<String>>(2),
                            row.get::<_, Option<String>>(3),
                        ) {
                            batch_products.push((code, qty, desc.unwrap_or_default(), details.unwrap_or_default()));
                        }
                    }
                }
            }

            if batch_products.is_empty() {
                batch_products.push((lote.product_code.clone(), lote.quantity, lote.product_description.clone(), lote.status.clone()));
            }

            // Get total ingredient weight exited for this OP
            let ing_exit_sum: f64 = match conn.query_row(
                "SELECT SUM(quantity) FROM stock_movements 
                 WHERE document_number = ?1 AND item_type = 'insumo' AND movement_type = 'saida'",
                params![&lote.lote_number],
                |r| Ok(r.get::<_, Option<f64>>(0)?.unwrap_or(0.0))
            ) {
                Ok(val) => val,
                Err(_) => 0.0,
            };

            // Compute total expected weight for the batch formulation
            let mut total_expected_weight = 0.0;
            for (p_code, p_qty, _, _) in &batch_products {
                let form_sum: f64 = match conn.query_row(
                    "SELECT SUM(quantity) FROM formulations WHERE product_code = ?1",
                    params![p_code],
                    |r| Ok(r.get::<_, Option<f64>>(0)?.unwrap_or(1.0))
                ) {
                    Ok(val) => val,
                    Err(_) => 1.0,
                };
                total_expected_weight += p_qty * form_sum;
            }

            if ing_exit_sum > 0.0 && total_expected_weight > 0.0 {
                let diff = (ing_exit_sum - total_expected_weight).abs() / total_expected_weight;
                lote.yield_error = Some(diff > 0.10);
            }

            // Compute pesagem, envase, and conferencia errors consolidated
            let mut pesagem_err = false;
            let mut envase_err = false;
            let mut conferencia_err = false;

            for (p_code, p_qty, p_desc, p_details) in &batch_products {
                let (pe, ee, ce) = check_lote_errors(&conn, &lote.lote_number, p_code, *p_qty, p_details, p_desc);
                if pe { pesagem_err = true; }
                if ee { envase_err = true; }
                if ce { conferencia_err = true; }
            }

            lote.pesagem_error = Some(pesagem_err);
            lote.envase_error = Some(envase_err);
            lote.conferencia_error = Some(conferencia_err);
        }
    }

    (StatusCode::OK, Json(grouped_lotes)).into_response()
}

fn check_lote_errors(
    conn: &rusqlite::Connection,
    lote_number: &str,
    product_code: &str,
    quantity: f64,
    details: &str,
    product_description: &str,
) -> (bool, bool, bool) {
    let mut pesagem_error = false;
    let mut envase_error = false;
    let mut conferencia_error = false;

    // 1. Get exits map for this lote
    let mut exits_map = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT item_code, quantity FROM stock_movements
         WHERE document_number = ?1 AND movement_type = 'saida'"
    ) {
        if let Ok(mut rows) = stmt.query(params![lote_number]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(code), Ok(qty)) = (row.get::<_, String>(0), row.get::<_, f64>(1)) {
                    *exits_map.entry(code).or_insert(0.0) += qty;
                }
            }
        }
    }

    // A. Detect if a base was consumed
    let mut base_code: Option<String> = None;
    if let Ok(bc) = conn.query_row(
        "SELECT base_code FROM historico_producao WHERE lote_erp = ?1 AND consume_base = 1 LIMIT 1",
        params![lote_number],
        |r| r.get::<_, Option<String>>(0)
    ) {
        base_code = bc;
    }
    if base_code.is_none() {
        if let Ok(Some(b_desc)) = conn.query_row(
            "SELECT base FROM produtos WHERE codigo = ?1 LIMIT 1",
            params![product_code],
            |r| r.get::<_, Option<String>>(0)
        ) {
            if let Ok(bc) = conn.query_row(
                "SELECT codigo FROM produtos WHERE descricao = ?1 LIMIT 1",
                params![&b_desc],
                |r| r.get::<_, String>(0)
            ) {
                if exits_map.contains_key(&bc) {
                    base_code = Some(bc);
                }
            }
        }
    }

    let mut base_ingredients = std::collections::HashSet::new();
    if let Some(ref bc) = base_code {
        if let Ok(mut stmt_base) = conn.prepare(
            "SELECT ingredient_code FROM formulations WHERE product_code = ?1"
        ) {
            if let Ok(mut rows_base) = stmt_base.query(params![bc]) {
                while let Ok(Some(row_base)) = rows_base.next() {
                    if let Ok(ing) = row_base.get::<_, String>(0) {
                        base_ingredients.insert(ing);
                    }
                }
            }
        }
    }

    // Find all products in this same batch
    let mut batch_products = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT m.item_code, m.quantity, p.descricao 
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.document_number = ?1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'"
    ) {
        if let Ok(mut rows) = stmt.query(params![lote_number]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(code), Ok(qty), Ok(desc)) = (
                    row.get::<_, String>(0),
                    row.get::<_, f64>(1),
                    row.get::<_, Option<String>>(2)
                ) {
                    batch_products.push((code, qty, desc.unwrap_or_default()));
                }
            }
        }
    }
    
    if batch_products.is_empty() {
        batch_products.push((product_code.to_string(), quantity, product_description.to_string()));
    }

    let total_batch_quantity: f64 = batch_products.iter().map(|(_, qty, _)| *qty).sum();

    // 2. Fetch recipe items for current product (for packaging)
    let mut recipe_items = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT ingredient_code, description, quantity, percentage FROM formulations WHERE product_code = ?1"
    ) {
        if let Ok(rows) = stmt.query_map(params![product_code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                row.get::<_, f64>(2)?,
                row.get::<_, Option<f64>>(3)?,
            ))
        }) {
            for r in rows {
                if let Ok(val) = r {
                    recipe_items.push(val);
                }
            }
        }
    }

    // Group duplicate recipe_items by ingredient_code
    let mut consolidated_recipe_items: Vec<(String, String, f64, Option<f64>)> = Vec::new();
    for (ing_code, ing_desc, qty, pct) in recipe_items {
        if let Some(existing) = consolidated_recipe_items.iter_mut().find(|(code, _, _, _)| code == &ing_code) {
            existing.2 += qty;
            if let Some(p) = pct {
                existing.3 = Some(existing.3.unwrap_or(0.0) + p);
            }
        } else {
            consolidated_recipe_items.push((ing_code, ing_desc, qty, pct));
        }
    }
    let recipe_items = consolidated_recipe_items;

    // 3. Check pesagem errors (consolidated for all products in the batch)
    let mut total_expected_ingredients = std::collections::HashMap::new();
    let pesagem_total_actual = exits_map.iter()
        .filter(|(code, _)| code.starts_with("9.15."))
        .map(|(_, qty)| *qty)
        .sum::<f64>();

    let basis_weight_total = if pesagem_total_actual > 0.0 {
        pesagem_total_actual
    } else {
        total_batch_quantity
    };

    for (p_code, p_qty, p_desc) in &batch_products {
        let prop = if total_batch_quantity > 0.0 { *p_qty / total_batch_quantity } else { 0.0 };
        let basis_weight_p = basis_weight_total * prop;
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        
        let mut p_recipe = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT ingredient_code, quantity, percentage FROM formulations WHERE product_code = ?1"
        ) {
            if let Ok(rows) = stmt.query_map(params![p_code], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, Option<f64>>(2)?,
                ))
            }) {
                for r in rows {
                    if let Ok(val) = r {
                        p_recipe.push(val);
                    }
                }
            }
        }

        for (ing_code, std_qty, percentage) in p_recipe {
            if ing_code.starts_with("9.15.") {
                let pct = percentage.unwrap_or(0.0);
                let expected_qty = if pct > 0.0 {
                    basis_weight_p * (pct / 100.0)
                } else {
                    let estimated_pct = if p_unit_weight > 0.0 { (std_qty / p_unit_weight) * 100.0 } else { 0.0 };
                    basis_weight_p * (estimated_pct / 100.0)
                };
                *total_expected_ingredients.entry(ing_code).or_insert(0.0) += expected_qty;
            }
        }
    }

    for (ing_code, expected_qty) in &total_expected_ingredients {
        let mut actual_qty = *exits_map.get(ing_code).unwrap_or(&0.0);
        
        // Sum exited quantity of similar items
        if let Ok(mut stmt_sim) = conn.prepare(
            "SELECT item_code_b FROM similar_items WHERE item_code_a = ?1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = ?1"
        ) {
            if let Ok(mut rows_sim) = stmt_sim.query(params![ing_code]) {
                while let Ok(Some(row_sim)) = rows_sim.next() {
                    if let Ok(sim_code) = row_sim.get::<_, String>(0) {
                        if let Some(&qty) = exits_map.get(&sim_code) {
                            actual_qty += qty;
                        }
                    }
                }
            }
        }

        if actual_qty < 0.0001 {
            actual_qty = 0.0;
        }

        let difference = actual_qty - expected_qty;
        let percentage_diff = if *expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        if (actual_qty == 0.0 && *expected_qty > 0.0) || (*expected_qty > 0.0 && percentage_diff.abs() > 10.0) {
            let is_missing = actual_qty == 0.0 && *expected_qty > 0.0;
            let is_in_base = is_missing && base_ingredients.contains(ing_code);
            if !is_in_base {
                pesagem_error = true;
            }
        }
    }

    // 4. Check envase errors (isolated for current product)
    let mut actual_units_envasadas = 0.0;
    let mut primary_units = 0.0;
    let mut has_primary = false;

    let mut packaging_recipe_items = Vec::new();
    for (code, desc, std_qty, _) in &recipe_items {
        if !code.starts_with("9.15.") {
            packaging_recipe_items.push((code.clone(), desc.clone(), *std_qty));
        }
    }

    let main_unit_weight = parse_unit_weight_from_desc(product_description);

    for (code, desc, std_qty) in &packaging_recipe_items {
        if *std_qty > 0.0 {
            let total_exit_qty = *exits_map.get(code).unwrap_or(&0.0);
            
            let mut total_sharing_weight = 0.0;
            let mut is_shared = false;
            for (other_code, other_qty, _) in &batch_products {
                let mut has_item = false;
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT count(*) FROM formulations WHERE product_code = ?1 AND ingredient_code = ?2"
                ) {
                    if let Ok(count) = stmt.query_row(params![other_code, code], |r| r.get::<_, i32>(0)) {
                        has_item = count > 0;
                    }
                }
                if has_item {
                    total_sharing_weight += *other_qty;
                    if other_code != product_code {
                        is_shared = true;
                    }
                }
            }
            
            let exit_qty = if is_shared && total_sharing_weight > 0.0 {
                total_exit_qty * (quantity / total_sharing_weight)
            } else {
                total_exit_qty
            };

            let units = exit_qty / std_qty;
            
            if is_primary_container(desc) && exit_qty > 0.0 {
                has_primary = true;
                if units > primary_units {
                    primary_units = units;
                }
            }
            
            if units > actual_units_envasadas {
                actual_units_envasadas = units;
            }
        }
    }

    let actual_units_envasadas = if has_primary {
        primary_units.round()
    } else {
        actual_units_envasadas.round()
    };

    let basis_units = if actual_units_envasadas > 0.0 {
        actual_units_envasadas
    } else {
        if main_unit_weight > 0.0 { (quantity / main_unit_weight).round() } else { quantity }
    };

    for (item_code, _, std_qty) in &packaging_recipe_items {
        let expected_qty = basis_units * std_qty;
        let total_exit_qty = *exits_map.get(item_code).unwrap_or(&0.0);
        
        let mut total_sharing_weight = 0.0;
        let mut is_shared = false;
        for (other_code, other_qty, _) in &batch_products {
            let mut has_item = false;
            if let Ok(mut stmt) = conn.prepare(
                "SELECT count(*) FROM formulations WHERE product_code = ?1 AND ingredient_code = ?2"
            ) {
                if let Ok(count) = stmt.query_row(params![other_code, item_code], |r| r.get::<_, i32>(0)) {
                    has_item = count > 0;
                }
            }
            if has_item {
                total_sharing_weight += *other_qty;
                if other_code != product_code {
                    is_shared = true;
                }
            }
        }
        
        let actual_qty = if is_shared && total_sharing_weight > 0.0 {
            total_exit_qty * (quantity / total_sharing_weight)
        } else {
            total_exit_qty
        };

        let difference = actual_qty - expected_qty;
        let percentage_diff = if expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        if (actual_qty == 0.0 && expected_qty > 0.0) || (expected_qty > 0.0 && percentage_diff.abs() > 10.0) {
            envase_error = true;
        }
    }

    // 5. Check conferencia errors (isolated for current product)
    let mut unidades_conferidas = None;
    for part in details.split('|') {
        let part = part.trim();
        if part.starts_with("Unidades:") {
            if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                if u > 0.0 {
                    unidades_conferidas = Some(u);
                }
            }
        }
    }

    let expected_finalized = if actual_units_envasadas > 0.0 {
        actual_units_envasadas - 1.0
    } else {
        let fallback_units = if let Some(u) = unidades_conferidas {
            u + 1.0
        } else if main_unit_weight > 0.0 {
            (quantity / main_unit_weight).round()
        } else {
            quantity
        };
        fallback_units - 1.0
    };

    let registered_units = if let Some(u) = unidades_conferidas {
        u
    } else if main_unit_weight > 0.0 {
        (quantity / main_unit_weight).round()
    } else {
        quantity
    };
    let discrepancy = registered_units - expected_finalized;
    if discrepancy.abs() > 0.5 {
        conferencia_error = true;
    }

    (pesagem_error, envase_error, conferencia_error)
}

fn is_primary_container(desc: &str) -> bool {
    let d = desc.to_uppercase();
    d.contains("FRASCO") || 
    d.starts_with("FR ") || d.contains(" FR ") ||
    d.starts_with("FR.") || d.contains(" FR.") ||
    d.contains("POTE") || 
    d.starts_with("PT ") || d.contains(" PT ") ||
    d.starts_with("PT.") || d.contains(" PT.") ||
    d.contains("VIDRO") || 
    d.contains("BISNAGA") || 
    d.contains("SACHE") || d.contains("SACHÊ") || 
    d.contains("AMPOLA") || 
    d.contains("BALDE") || 
    d.contains("GALÃO") || d.contains("GALAO") || 
    d.contains("PET") ||
    d.contains("TAMPA") ||
    d.starts_with("TP ") || d.contains(" TP ") ||
    d.starts_with("TP.") || d.contains(" TP.") ||
    d.contains("VALVULA") || d.contains("VÁLVULA") ||
    d.contains("GARGALO") || d.contains("BORRIFADOR") ||
    d.contains("SPRAY") || d.contains("DISPENCER") ||
    d.contains("BICO")
}

// Helpers for parsing product sizes from descriptions
fn parse_unit_weight_from_desc(desc: &str) -> f64 {
    let desc_upper = desc.to_uppercase();
    let chars: Vec<char> = desc_upper.chars().collect();
    let n = chars.len();
    
    let mut i = 0;
    while i < n {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < n && (chars[i].is_ascii_digit() || chars[i] == '.' || chars[i] == ',') {
                i += 1;
            }
            let num_str: String = chars[start..i].iter().collect();
            let num_str_clean = num_str.replace(',', ".");
            if let Ok(num) = num_str_clean.parse::<f64>() {
                while i < n && (chars[i] == ' ' || chars[i] == '\t') {
                    i += 1;
                }
                if i < n {
                    let remaining: String = chars[i..].iter().collect();
                    if remaining.starts_with("ML") {
                        return num / 1000.0;
                    } else if remaining.starts_with("KG") {
                        return num;
                    } else if remaining.starts_with("GR") {
                        return num / 1000.0;
                    } else if remaining.starts_with("G") {
                        let next_char = chars.get(i + 1);
                        if next_char.is_none() || !next_char.unwrap().is_ascii_alphabetic() {
                            return num / 1000.0;
                        }
                    } else if remaining.starts_with("L") {
                        let next_char = chars.get(i + 1);
                        if next_char.is_none() || !next_char.unwrap().is_ascii_alphabetic() {
                            return num;
                        }
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    0.25 // default
}

// Data structures for detailed lote view
#[derive(serde::Serialize)]
pub struct LoteDetalhes {
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub date: String,
    pub status: String,
    pub status_label: String,
    pub fabricated_by: String,
    pub authorized_by: String,
    pub pesagem_items: Vec<PesagemItemDetail>,
    pub pesagem_total_expected: f64,
    pub pesagem_total_actual: f64,
    pub envase_products: Vec<EnvaseProductDetail>,
    pub conferencia_items: Vec<ConferenciaItemDetail>,
    pub total_packaged_weight_kg: f64,
    pub bulk_loss_kg: f64,
    pub bulk_yield_percentage: f64,
    pub is_resolved: Option<bool>,
    pub resolution_obs: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PesagemItemDetail {
    pub ingredient_code: String,
    pub description: String,
    pub expected_qty: f64,
    pub actual_qty: f64,
    pub difference: f64,
    pub percentage_diff: f64,
    pub status: String,
}

#[derive(serde::Serialize)]
pub struct EnvaseProductDetail {
    pub product_code: String,
    pub description: String,
    pub unit_weight_kg: f64,
    pub actual_units_envasadas: f64,
    pub packaging_items: Vec<EnvaseItemDetail>,
    pub has_packaging_formula: bool,
}

#[derive(serde::Serialize)]
pub struct EnvaseItemDetail {
    pub packaging_code: String,
    pub description: String,
    pub expected_qty: f64,
    pub actual_qty: f64,
    pub difference: f64,
    pub percentage_diff: f64,
    pub status: String,
}

#[derive(serde::Serialize)]
pub struct ConferenciaItemDetail {
    pub product_code: String,
    pub description: String,
    pub actual_units_envasadas: f64,
    pub expected_finalized_units: f64,
    pub registered_units_stock: f64,
    pub discrepancy: f64,
    pub status: String,
}
// GET /api/producao/lotes/:number/detalhes
pub async fn get_lote_detalhes(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT m.item_code, p.descricao, m.quantity, m.date, m.details
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.document_number = ?1 AND m.item_type = 'produto' AND m.movement_type = 'entrada'"
    ) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let product_rows = stmt.query_map(params![&lote_number], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            row.get::<_, f64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        ))
    });

    let mut products = Vec::new();
    if let Ok(iter) = product_rows {
        for r in iter {
            if let Ok(vals) = r {
                products.push(vals);
            }
        }
    }

    if products.is_empty() {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Lote não encontrado no banco de dados" }))).into_response();
    }

    let product_code = products.iter().map(|p| p.0.clone()).collect::<Vec<_>>().join(" / ");
    let product_description = products.iter().map(|p| p.1.clone()).collect::<Vec<_>>().join(" / ");
    let quantity = products.iter().map(|p| p.2).sum::<f64>();
    let date = products[0].3.clone();
    
    let details_str = products[0].4.clone();
    let mut status = String::new();
    let mut fabricated_by = String::new();
    let mut authorized_by = String::new();
    for part in details_str.split('|') {
        let part = part.trim();
        if part.starts_with("Status:") {
            status = part.trim_start_matches("Status:").trim().to_string();
        } else if part.starts_with("Fab:") {
            fabricated_by = part.trim_start_matches("Fab:").trim().to_string();
        } else if part.starts_with("Aut:") {
            authorized_by = part.trim_start_matches("Aut:").trim().to_string();
        }
    }

    let status_label = match status.to_uppercase().as_str() {
        "EA" => "Estoque Atualizado",
        "PG" => "Em Pesagem",
        "PP" => "Pré-Produção",
        "PR" => "Em Produção",
        "EN" => "Em Envase",
        "CF" => "Conferido",
        "CA" => "Cancelado",
        "FP" => "Finalizado",
        _ => &status,
    }.to_string();

    let mut exits_map = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT item_code, quantity FROM stock_movements
         WHERE document_number = ?1 AND item_type = 'insumo' AND movement_type = 'saida'"
    ) {
        if let Ok(mut rows) = stmt.query(params![&lote_number]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(code), Ok(qty)) = (row.get::<_, String>(0), row.get::<_, f64>(1)) {
                    *exits_map.entry(code).or_insert(0.0) += qty;
                }
            }
        }
    }

    // B. Detect if a base was consumed
    let mut base_code: Option<String> = None;
    if let Ok(bc) = conn.query_row(
        "SELECT base_code FROM historico_producao WHERE lote_erp = ?1 AND consume_base = 1 LIMIT 1",
        params![&lote_number],
        |r| r.get::<_, Option<String>>(0)
    ) {
        base_code = bc;
    }
    if base_code.is_none() {
        for (p_code, _, _, _, _) in &products {
            if let Ok(Some(b_desc)) = conn.query_row(
                "SELECT base FROM produtos WHERE codigo = ?1 LIMIT 1",
                params![p_code],
                |r| r.get::<_, Option<String>>(0)
            ) {
                if let Ok(bc) = conn.query_row(
                    "SELECT codigo FROM produtos WHERE descricao = ?1 LIMIT 1",
                    params![&b_desc],
                    |r| r.get::<_, String>(0)
                ) {
                    if exits_map.contains_key(&bc) {
                        base_code = Some(bc);
                        break;
                    }
                }
            }
        }
    }

    let mut base_ingredients = std::collections::HashSet::new();
    if let Some(ref bc) = base_code {
        if let Ok(mut stmt_base) = conn.prepare(
            "SELECT ingredient_code FROM formulations WHERE product_code = ?1"
        ) {
            if let Ok(mut rows_base) = stmt_base.query(params![bc]) {
                while let Ok(Some(row_base)) = rows_base.next() {
                    if let Ok(ing) = row_base.get::<_, String>(0) {
                        base_ingredients.insert(ing);
                    }
                }
            }
        }
    }

    let mut total_expected_ingredients = std::collections::HashMap::new();


    let pesagem_total_actual: f64 = exits_map.iter()
        .filter(|(code, _)| code.starts_with("9.15."))
        .map(|(_, qty)| *qty)
        .sum();

    let basis_weight_total = if pesagem_total_actual >= 0.1 * quantity {
        pesagem_total_actual
    } else {
        quantity
    };

    for (p_code, p_desc, p_qty, _, _) in &products {
        let prop = if quantity > 0.0 { *p_qty / quantity } else { 0.0 };
        let basis_weight_p = basis_weight_total * prop;
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        
        let mut recipe_items = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT ingredient_code, description, quantity, percentage FROM formulations WHERE product_code = ?1"
        ) {
            if let Ok(rows) = stmt.query_map(params![p_code], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, f64>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                ))
            }) {
                for r in rows {
                    if let Ok(val) = r {
                        recipe_items.push(val);
                    }
                }
            }
        }
        
        for (ing_code, ing_desc, std_qty, percentage) in recipe_items {
            if ing_code.starts_with("9.15.") {
                let pct = percentage.unwrap_or(0.0);
                let expected_qty = if pct > 0.0 {
                    basis_weight_p * (pct / 100.0)
                } else {
                    let estimated_pct = if p_unit_weight > 0.0 { (std_qty / p_unit_weight) * 100.0 } else { 0.0 };
                    basis_weight_p * (estimated_pct / 100.0)
                };
                
                let entry = total_expected_ingredients.entry(ing_code.clone()).or_insert((ing_desc, 0.0));
                entry.1 += expected_qty;
            }
        }
    }

    let mut pesagem_items = Vec::new();
    let mut pesagem_total_expected = 0.0;
    
    for (ing_code, (ing_desc, expected_qty)) in &total_expected_ingredients {

        pesagem_total_expected += expected_qty;

        let mut actual_qty = *exits_map.get(ing_code).unwrap_or(&0.0);
        if actual_qty < 0.0001 {
            actual_qty = 0.0;
        }

        let difference = actual_qty - expected_qty;
        let percentage_diff = if *expected_qty > 0.0 {
            (difference / expected_qty) * 100.0
        } else {
            0.0
        };

        let item_status = if actual_qty == 0.0 && *expected_qty > 0.0 {
            if base_ingredients.contains(ing_code) {
                "OK (Na Base)"
            } else {
                "MISSING"
            }
        } else if percentage_diff.abs() > 10.0 {
            "DISCREPANCY"
        } else {
            "OK"
        };

        pesagem_items.push(PesagemItemDetail {
            ingredient_code: ing_code.clone(),
            description: ing_desc.clone(),
            expected_qty: *expected_qty,
            actual_qty,
            difference,
            percentage_diff,
            status: item_status.to_string(),
        });
    }

    // Also include unplanned/unregistered exits in pesagem_items
    for (ing_code, actual_qty) in &exits_map {
        let is_base = base_code.as_ref().map(|bc| bc == ing_code).unwrap_or(false);
        if is_base || (ing_code.starts_with("9.15.") && !total_expected_ingredients.contains_key(ing_code)) {
            let mut ing_desc = String::new();
            if let Ok(mut stmt_item) = conn.prepare("SELECT description FROM items WHERE code = ?1") {
                if let Ok(desc) = stmt_item.query_row(params![ing_code], |r| r.get::<_, String>(0)) {
                    ing_desc = desc;
                }
            }
            if ing_desc.is_empty() {
                if let Ok(mut stmt_item) = conn.prepare("SELECT descricao FROM produtos WHERE codigo = ?1") {
                    if let Ok(desc) = stmt_item.query_row(params![ing_code], |r| r.get::<_, String>(0)) {
                        ing_desc = desc;
                    }
                }
            }
            if ing_desc.is_empty() {
                ing_desc = "Insumo não cadastrado".to_string();
            }

            let (expected_qty, status_str) = if is_base {
                let mut expected_base_weight = 0.0;
                for (code, (_, exp_qty)) in &total_expected_ingredients {
                    if base_ingredients.contains(code) {
                        expected_base_weight += exp_qty;
                    }
                }
                (expected_base_weight, "OK (Base)".to_string())
            } else {
                (0.0, "UNPLANNED".to_string())
            };

            let difference = *actual_qty - expected_qty;
            let percentage_diff = if expected_qty > 0.0 {
                (difference / expected_qty) * 100.0
            } else {
                100.0
            };

            pesagem_items.push(PesagemItemDetail {
                ingredient_code: ing_code.clone(),
                description: ing_desc,
                expected_qty,
                actual_qty: *actual_qty,
                difference,
                percentage_diff,
                status: status_str,
            });
        }
    }

    let mut envase_products = Vec::new();
    let mut conferencia_items = Vec::new();
    let mut total_packaged_weight_kg = 0.0;

    for (p_code, p_desc, p_qty, _, p_details) in &products {
        let p_unit_weight = parse_unit_weight_from_desc(p_desc);
        
        let mut p_unidades_conferidas = None;
        for part in p_details.split('|') {
            let part = part.trim();
            if part.starts_with("Unidades:") {
                if let Ok(u) = part.trim_start_matches("Unidades:").trim().parse::<f64>() {
                    if u > 0.0 {
                        p_unidades_conferidas = Some(u);
                    }
                }
            }
        }

        let mut p_recipe_items = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT ingredient_code, description, quantity FROM formulations WHERE product_code = ?1"
        ) {
            if let Ok(rows) = stmt.query_map(params![p_code], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, f64>(2)?,
                ))
            }) {
                for r in rows {
                    if let Ok(val) = r {
                        if !val.0.starts_with("9.15.") {
                            p_recipe_items.push(val);
                        }
                    }
                }
            }
        }

        let mut actual_units_envasadas = 0.0;
        let mut primary_units = 0.0;
        let mut has_primary = false;

        for (code, desc, std_qty) in &p_recipe_items {
            if *std_qty > 0.0 {
                let total_exit_qty = *exits_map.get(code).unwrap_or(&0.0);
                
                let mut total_sharing_weight = 0.0;
                let mut is_shared = false;
                for (other_code, _, other_qty, _, _) in &products {
                    let mut has_item = false;
                    if let Ok(mut stmt) = conn.prepare(
                        "SELECT count(*) FROM formulations WHERE product_code = ?1 AND ingredient_code = ?2"
                    ) {
                        if let Ok(count) = stmt.query_row(params![other_code, code], |r| r.get::<_, i32>(0)) {
                            has_item = count > 0;
                        }
                    }
                    if has_item {
                        total_sharing_weight += *other_qty;
                        if other_code != p_code {
                            is_shared = true;
                        }
                    }
                }
                
                let exit_qty = if is_shared && total_sharing_weight > 0.0 {
                    total_exit_qty * (*p_qty / total_sharing_weight)
                } else {
                    total_exit_qty
                };

                let units = exit_qty / std_qty;
                
                if is_primary_container(desc) && exit_qty > 0.0 {
                    has_primary = true;
                    if units > primary_units {
                        primary_units = units;
                    }
                }
                
                if units > actual_units_envasadas {
                    actual_units_envasadas = units;
                }
            }
        }

        let actual_units_envasadas = if has_primary {
            primary_units.round()
        } else {
            actual_units_envasadas.round()
        };

        let basis_units = if actual_units_envasadas > 0.0 {
            actual_units_envasadas
        } else {
            if p_unit_weight > 0.0 { (*p_qty / p_unit_weight).round() } else { *p_qty }
        };

        let mut envase_items = Vec::new();

        for (item_code, item_desc, std_qty) in &p_recipe_items {
            let expected_qty = basis_units * std_qty;
            
            let total_exit_qty = *exits_map.get(item_code).unwrap_or(&0.0);
            let mut total_sharing_weight = 0.0;
            let mut is_shared = false;
            for (other_code, _, other_qty, _, _) in &products {
                let mut has_item = false;
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT count(*) FROM formulations WHERE product_code = ?1 AND ingredient_code = ?2"
                ) {
                    if let Ok(count) = stmt.query_row(params![other_code, item_code], |r| r.get::<_, i32>(0)) {
                        has_item = count > 0;
                    }
                }
                if has_item {
                    total_sharing_weight += *other_qty;
                    if other_code != p_code {
                        is_shared = true;
                    }
                }
            }
            
            let actual_qty = if is_shared && total_sharing_weight > 0.0 {
                total_exit_qty * (*p_qty / total_sharing_weight)
            } else {
                total_exit_qty
            };

            let difference = actual_qty - expected_qty;
            let percentage_diff = if expected_qty > 0.0 {
                (difference / expected_qty) * 100.0
            } else {
                0.0
            };

            let item_status = if actual_qty == 0.0 && expected_qty > 0.0 {
                "MISSING"
            } else if percentage_diff.abs() > 10.0 {
                "DISCREPANCY"
            } else {
                "OK"
            };

            envase_items.push(EnvaseItemDetail {
                packaging_code: item_code.clone(),
                description: item_desc.clone(),
                expected_qty,
                actual_qty,
                difference,
                percentage_diff,
                status: item_status.to_string(),
            });
        }

        let has_packaging_formula = !p_recipe_items.is_empty();

        envase_products.push(EnvaseProductDetail {
            product_code: p_code.clone(),
            description: p_desc.clone(),
            unit_weight_kg: p_unit_weight,
            actual_units_envasadas,
            packaging_items: envase_items,
            has_packaging_formula,
        });

        let expected_finalized = if actual_units_envasadas > 0.0 {
            actual_units_envasadas - 1.0
        } else {
            let fallback_units = if let Some(u) = p_unidades_conferidas {
                u + 1.0
            } else if p_unit_weight > 0.0 {
                (*p_qty / p_unit_weight).round()
            } else {
                *p_qty
            };
            fallback_units - 1.0
        };

        let registered_units = if let Some(u) = p_unidades_conferidas {
            u
        } else if p_unit_weight > 0.0 {
            (*p_qty / p_unit_weight).round()
        } else {
            *p_qty
        };
        let discrepancy = registered_units - expected_finalized;
        let conf_status = if discrepancy.abs() > 0.5 {
            "DISCREPANCY"
        } else {
            "OK"
        };

        conferencia_items.push(ConferenciaItemDetail {
            product_code: p_code.clone(),
            description: p_desc.clone(),
            actual_units_envasadas,
            expected_finalized_units: expected_finalized,
            registered_units_stock: registered_units,
            discrepancy,
            status: conf_status.to_string(),
        });

        total_packaged_weight_kg += actual_units_envasadas * p_unit_weight;
    }

    let bulk_loss_kg = (basis_weight_total - total_packaged_weight_kg).max(0.0);
    let bulk_yield_percentage = if basis_weight_total > 0.0 {
        (total_packaged_weight_kg / basis_weight_total) * 100.0
    } else {
        0.0
    };

    let mut is_resolved = None;
    let mut resolution_obs = None;

    if let Ok(mut stmt_res) = conn.prepare(
        "SELECT is_resolved, observations FROM lote_error_resolutions WHERE lote_number = ?1"
    ) {
        if let Ok(mut rows_res) = stmt_res.query(params![&lote_number]) {
            if let Ok(Some(row_res)) = rows_res.next() {
                let is_res_int: Option<i32> = row_res.get(0).ok();
                is_resolved = is_res_int.map(|v| v == 1);
                resolution_obs = row_res.get(1).ok();
            }
        }
    }

    let details = LoteDetalhes {
        lote_number,
        product_code,
        product_description,
        quantity,
        date,
        status,
        status_label,
        fabricated_by,
        authorized_by,
        pesagem_items,
        pesagem_total_expected,
        pesagem_total_actual,
        envase_products,
        conferencia_items,
        total_packaged_weight_kg,
        bulk_loss_kg,
        bulk_yield_percentage,
        is_resolved,
        resolution_obs,
    };

    (StatusCode::OK, Json(details)).into_response()
}

#[derive(Debug, serde::Deserialize)]
pub struct ResolveLotePayload {
    pub observations: String,
    pub resolved_by: Option<String>,
}

// POST /api/producao/lotes/:number/resolver
pub async fn save_lote_resolution(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
    Json(payload): Json<ResolveLotePayload>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let resolved_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let resolved_by = payload.resolved_by.unwrap_or_else(|| "Administrador".to_string());

    let res = conn.execute(
        "INSERT OR REPLACE INTO lote_error_resolutions (lote_number, is_resolved, resolved_by, resolved_at, observations)
         VALUES (?1, 1, ?2, ?3, ?4)",
        params![lote_number, resolved_by, resolved_at, payload.observations],
    );

    match res {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/producao/lotes/:number/resolver
pub async fn delete_lote_resolution(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let res = conn.execute(
        "DELETE FROM lote_error_resolutions WHERE lote_number = ?1",
        params![lote_number],
    );

    match res {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// === VENDAS: PEDIDOS DE VENDA & FALTAS ===

#[derive(Debug, serde::Deserialize)]
pub struct SalesOrdersQueryParams {
    pub search: Option<String>,
    pub status: Option<String>,
    pub days: Option<i32>,
}

// GET /api/vendas/pedidos
pub async fn list_sales_orders(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SalesOrdersQueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut sql = String::from(
        "SELECT n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac 
         FROM sales_orders WHERE 1=1"
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            sql.push_str(&format!(" AND (c_nome LIKE ?{} OR CAST(n_pedido AS TEXT) LIKE ?{})", param_idx, param_idx + 1));
            let like_pattern = format!("%{}%", search.trim());
            params_vec.push(Box::new(like_pattern.clone()));
            params_vec.push(Box::new(like_pattern));
            param_idx += 2;
        }
    }

    if let Some(ref status) = params.status {
        if !status.trim().is_empty() && status != "ALL" {
            if status == "ativos" {
                sql.push_str(" AND c_status NOT IN ('FT', 'CA')");
            } else if status == "concluidos" {
                sql.push_str(" AND c_status IN ('FT', 'CA')");
            } else {
                sql.push_str(&format!(" AND c_status = ?{}", param_idx));
                params_vec.push(Box::new(status.clone()));
                param_idx += 1;
            }
        }
    }

    if let Some(days) = params.days {
        if days > 0 {
            sql.push_str(&format!(" AND d_pedido >= date('now', '-{} days')", days));
        }
    }

    sql.push_str(" ORDER BY d_pedido DESC, n_pedido DESC");

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let orders_iter = stmt.query_map(&*params_refs, |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<i32>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, i32>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
        ))
    });

    let mut sales_orders = Vec::new();

    if let Ok(rows) = orders_iter {
        for r in rows {
            if let Ok((n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac)) = r {
                let mut items = Vec::new();
                let mut stmt_items = match conn.prepare(
                    "SELECT id, n_pedido, d_pedido, n_registro, c_cod_prod, n_qtde, n_qtde_fat, n_preco, c_lote 
                     FROM sales_order_items 
                     WHERE n_pedido = ?1 AND d_pedido = ?2"
                ) {
                    Ok(s) => s,
                    Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
                };

                let items_iter = stmt_items.query_map(params![n_pedido, d_pedido], |row_item| {
                    Ok(crate::models::SalesOrderItem {
                        id: row_item.get(0)?,
                        n_pedido: row_item.get(1)?,
                        d_pedido: row_item.get(2)?,
                        n_registro: row_item.get(3)?,
                        c_cod_prod: row_item.get(4)?,
                        n_qtde: row_item.get(5)?,
                        n_qtde_fat: row_item.get(6)?,
                        n_preco: row_item.get(7)?,
                        c_lote: row_item.get(8)?,
                    })
                });

                if let Ok(item_rows) = items_iter {
                    for ir in item_rows {
                        if let Ok(item) = ir {
                            items.push(item);
                        }
                    }
                }

                sales_orders.push(crate::models::SalesOrder {
                    n_pedido,
                    d_pedido,
                    n_codigo,
                    c_nome,
                    n_valor_tot,
                    c_status,
                    n_nota_fiscal,
                    d_previsao,
                    d_entrega,
                    m_observac,
                    items,
                });
            }
        }
    }

    (StatusCode::OK, Json(sales_orders)).into_response()
}

#[derive(Debug, serde::Deserialize)]
pub struct FaltasParams {
    pub days: Option<i32>,
}

// GET /api/vendas/faltas
pub async fn list_sales_faltas(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FaltasParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let days = params.days.unwrap_or(180); // Default to 180 days (6 months)

    // Load estoque and producao from estoque_atual
    let mut stock_map: HashMap<String, (i64, i64)> = HashMap::new();
    let stock_stmt_res = conn.prepare("SELECT codigo, estoque, producao FROM estoque_atual");
    if let Ok(mut stmt) = stock_stmt_res {
        let stock_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
        });
        if let Ok(iter) = stock_rows {
            for r in iter {
                if let Ok((code, estoque, producao)) = r {
                    stock_map.insert(code, (estoque, producao));
                }
            }
        }
    }

    // Load transit purchase orders
    let mut purchase_transit_map: HashMap<String, i64> = HashMap::new();
    let purchase_stmt_res = conn.prepare("
        SELECT poi.c_referencia, SUM(poi.n_qtde - poi.n_chegou) 
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
        GROUP BY poi.c_referencia
    ");
    if let Ok(mut stmt) = purchase_stmt_res {
        let purchase_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        });
        if let Ok(iter) = purchase_rows {
            for r in iter {
                if let Ok((code, qty)) = r {
                    purchase_transit_map.insert(code, qty.round() as i64);
                }
            }
        }
    }

    let active_query = if days > 0 {
        format!("
            SELECT 
                soi.c_cod_prod,
                p.descricao,
                IFNULL(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta_qty,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
            LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
            WHERE so.c_status NOT IN ('FT', 'CA') 
              AND (soi.n_qtde > soi.n_qtde_fat)
              AND so.d_pedido >= date('now', '-{} days')
            ORDER BY soi.c_cod_prod, soi.d_pedido DESC
        ", days)
    } else {
        "
            SELECT 
                soi.c_cod_prod,
                p.descricao,
                IFNULL(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta_qty,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
            LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
            WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
            ORDER BY soi.c_cod_prod, soi.d_pedido DESC
        ".to_string()
    };

    let mut active_stmt = match conn.prepare(&active_query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let active_rows = active_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Produto Legado".to_string()),
            row.get::<_, String>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, i32>(7)?,
            row.get::<_, i32>(8)?,
            row.get::<_, i32>(9)?,
            row.get::<_, Option<String>>(10)?,
        ))
    });

    let mut active_map: HashMap<String, (String, String, i32, Vec<crate::models::ProductFaltaItem>)> = HashMap::new();

    if let Ok(rows) = active_rows {
        for r in rows {
            if let Ok((code, desc, linha, n_pedido, d_pedido, c_nome, c_status, n_qtde, n_qtde_fat, falta_qty, d_previsao)) = r {
                let entry = active_map.entry(code.clone()).or_insert_with(|| (desc, linha, 0, Vec::new()));
                entry.2 += falta_qty;
                entry.3.push(crate::models::ProductFaltaItem {
                    n_pedido,
                    d_pedido,
                    c_nome,
                    c_status,
                    n_qtde,
                    n_qtde_fat,
                    falta: falta_qty,
                    d_previsao,
                });
            }
        }
    }

    let mut active_groups: Vec<crate::models::ProductFaltaGroup> = active_map
        .into_iter()
        .map(|(code, (desc, linha, total, items))| {
            let (estoque, producao) = stock_map.get(&code).cloned().unwrap_or((0, 0));
            let transit = purchase_transit_map.get(&code).cloned().unwrap_or(0);
            
            // net shortage = max(0, total - (estoque + producao + transit))
            let available = estoque + producao + transit;
            let net = if (total as i64) > available {
                (total as i64) - available
            } else {
                0
            };

            crate::models::ProductFaltaGroup {
                c_cod_prod: code,
                c_nome_prod: desc,
                c_nome_linha: linha,
                total_falta: total,
                pedidos_afetados: items,
                estoque,
                producao,
                transit_purchase: transit,
                falta_net: net,
            }
        })
        .collect();
    active_groups.sort_by(|a, b| b.total_falta.cmp(&a.total_falta));

    let hist_query = if days > 0 {
        format!("
            SELECT 
                soi.c_cod_prod,
                p.descricao,
                IFNULL(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta_qty,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
            LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
            WHERE so.c_status IN ('FT', 'CA') 
              AND (soi.n_qtde > soi.n_qtde_fat)
              AND so.d_pedido >= date('now', '-{} days')
            ORDER BY soi.c_cod_prod, soi.d_pedido DESC
        ", days)
    } else {
        "
            SELECT 
                soi.c_cod_prod,
                p.descricao,
                IFNULL(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta_qty,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
            LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
            WHERE so.c_status IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
            ORDER BY soi.c_cod_prod, soi.d_pedido DESC
        ".to_string()
    };

    let mut hist_stmt = match conn.prepare(&hist_query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let hist_rows = hist_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Produto Legado".to_string()),
            row.get::<_, String>(2)?,
            row.get::<_, i32>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, i32>(7)?,
            row.get::<_, i32>(8)?,
            row.get::<_, i32>(9)?,
            row.get::<_, Option<String>>(10)?,
        ))
    });

    let mut hist_map: HashMap<String, (String, String, i32, Vec<crate::models::ProductFaltaItem>)> = HashMap::new();

    if let Ok(rows) = hist_rows {
        for r in rows {
            if let Ok((code, desc, linha, n_pedido, d_pedido, c_nome, c_status, n_qtde, n_qtde_fat, falta_qty, d_previsao)) = r {
                let entry = hist_map.entry(code.clone()).or_insert_with(|| (desc, linha, 0, Vec::new()));
                entry.2 += falta_qty;
                entry.3.push(crate::models::ProductFaltaItem {
                    n_pedido,
                    d_pedido,
                    c_nome,
                    c_status,
                    n_qtde,
                    n_qtde_fat,
                    falta: falta_qty,
                    d_previsao,
                });
            }
        }
    }

    let mut hist_groups: Vec<crate::models::ProductFaltaGroup> = hist_map
        .into_iter()
        .map(|(code, (desc, linha, total, items))| crate::models::ProductFaltaGroup {
            c_cod_prod: code,
            c_nome_prod: desc,
            c_nome_linha: linha,
            total_falta: total,
            pedidos_afetados: items,
            estoque: 0,
            producao: 0,
            transit_purchase: 0,
            falta_net: 0,
        })
        .collect();
    hist_groups.sort_by(|a, b| b.total_falta.cmp(&a.total_falta));

    (StatusCode::OK, Json(json!({
        "ativas": active_groups,
        "historicas": hist_groups,
    }))).into_response()
}

// GET /api/produtos/:code/pedidos-pendentes
pub async fn get_product_pending_orders(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut pending_sales_orders = Vec::new();
    let sales_faltas_days: i32 = {
        let query = "SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'";
        if let Ok(val) = conn.query_row(query, [], |row| row.get::<_, String>(0)) {
            val.parse::<i32>().unwrap_or(180)
        } else {
            180
        }
    };

    let query_sales = if sales_faltas_days > 0 {
        format!("
            SELECT 
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE soi.c_cod_prod = ?1 
              AND so.c_status NOT IN ('FT', 'CA') 
              AND (soi.n_qtde > soi.n_qtde_fat)
              AND so.d_pedido >= date('now', '-{} days')
            ORDER BY soi.d_pedido DESC
        ", sales_faltas_days)
    } else {
        "
            SELECT 
                soi.n_pedido,
                soi.d_pedido,
                so.c_nome,
                so.c_status,
                soi.n_qtde,
                soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta,
                so.d_previsao
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
            WHERE soi.c_cod_prod = ?1 AND so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
            ORDER BY soi.d_pedido DESC
        ".to_string()
    };

    if let Ok(mut stmt) = conn.prepare(&query_sales) {
        let rows = stmt.query_map(params![code], |row| {
            Ok(crate::models::ProductFaltaItem {
                n_pedido: row.get(0)?,
                d_pedido: row.get(1)?,
                c_nome: row.get(2)?,
                c_status: row.get(3)?,
                n_qtde: row.get(4)?,
                n_qtde_fat: row.get(5)?,
                falta: row.get(6)?,
                d_previsao: row.get(7)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    pending_sales_orders.push(item);
                }
            }
        }
    }

    let mut in_transit_purchase_orders = Vec::new();
    let query_purchases = "
        SELECT 
            po.n_pedido,
            po.c_nome_f,
            po.d_previsao,
            poi.n_qtde,
            poi.n_chegou,
            (poi.n_qtde - poi.n_chegou) as n_pendente
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE poi.c_referencia = ?1 AND po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
        ORDER BY po.d_pedido DESC
    ";
    if let Ok(mut stmt) = conn.prepare(query_purchases) {
        let rows = stmt.query_map(params![code], |row| {
            Ok(crate::models::PendingPurchaseOrderItem {
                n_pedido: row.get(0)?,
                c_nome_f: row.get(1)?,
                d_previsao: row.get(2)?,
                n_qtde: row.get(3)?,
                n_chegou: row.get(4)?,
                n_pendente: row.get(5)?,
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(item) = r {
                    in_transit_purchase_orders.push(item);
                }
            }
        }
    }

    let resp = crate::models::PendingOrdersResponse {
        pending_sales_orders,
        in_transit_purchase_orders,
    };

    (StatusCode::OK, Json(resp)).into_response()
}

// GET /api/lancamento/graduation-check
pub async fn get_graduation_candidates_handler(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de conexão: {}", e) }))
        ).into_response(),
    };

    let global_limit: i64 = match state.db.get_setting("lancamento_meta_meses_global") {
        Ok(Some(val)) => val.parse().unwrap_or(6),
        _ => 6,
    };

    let query = "
        SELECT op.codigo, p.descricao, cl.nome_linha, op.lancamento_meta_meses, op.lancamento_data_inicio
        FROM overrides_produtos op
        JOIN produtos p ON op.codigo = p.codigo
        LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
        WHERE op.status_produto = 'lancamento'
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao preparar query: {}", e) }))
        ).into_response(),
    };

    let candidates_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    });

    let mut candidates = Vec::new();

    if let Ok(rows) = candidates_rows {
        for r in rows {
            if let Ok((code, desc, line_name, meta, date_start)) = r {
                let limit = meta.unwrap_or(global_limit);
                let mut months_with_sales = 0;
                let count_query = "SELECT COUNT(*) FROM historico_faturamento WHERE codigo = ?1 AND quantidade > 0";
                if let Ok(count) = conn.query_row(count_query, params![code], |row| row.get::<_, i64>(0)) {
                    months_with_sales = count;
                }

                if months_with_sales >= limit {
                    candidates.push(serde_json::json!({
                        "codigo": code,
                        "descricao": desc,
                        "nome_linha": line_name.unwrap_or_else(|| "Geral".to_string()),
                        "meses_com_historico": months_with_sales,
                        "meta_meses": limit,
                        "lancamento_data_inicio": date_start,
                    }));
                }
            }
        }
    }

    (StatusCode::OK, Json(candidates)).into_response()
}

// === KIT ASSEMBLY ORDERS HANDLERS ===

pub async fn list_kit_orders(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, order_number, kit_product_code, kit_product_description, quantity, 
                status, created_at, completed_at, assembled_by, checked_by, observations, 
                erp_launched, components_lotes, quantity_assembled 
         FROM kit_assembly_orders 
         ORDER BY id DESC"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::KitAssemblyOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            kit_product_code: row.get(2)?,
            kit_product_description: row.get(3)?,
            quantity: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            completed_at: row.get(7)?,
            assembled_by: row.get(8)?,
            checked_by: row.get(9)?,
            observations: row.get(10)?,
            erp_launched: row.get(11)?,
            components_lotes: row.get(12)?,
            quantity_assembled: row.get(13)?,
        })
    });

    let mut orders = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(order) = r {
                orders.push(order);
            }
        }
    }

    (StatusCode::OK, Json(orders)).into_response()
}

pub async fn create_kit_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateKitOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());

    let res = conn.execute(
        "INSERT INTO kit_assembly_orders (
            order_number, kit_product_code, kit_product_description, quantity, status, 
            created_at, assembled_by, checked_by, observations, erp_launched, components_lotes,
            quantity_assembled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)",
        params![
            payload.order_number,
            payload.kit_product_code,
            payload.kit_product_description,
            payload.quantity,
            status,
            created_at,
            payload.assembled_by,
            payload.checked_by,
            payload.observations,
            payload.components_lotes,
            payload.quantity_assembled.unwrap_or(payload.quantity)
        ],
    );

    match res {
        Ok(_) => {
            let last_id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(serde_json::json!({ "id": last_id, "message": "Ordem de montagem criada" }))).into_response()
        }
        Err(e) => {
            (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao criar ordem de montagem: {}", e) }))).into_response()
        }
    }
}

pub async fn update_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateKitOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let mut completed_at: Option<String> = None;
    if let Some(ref status) = payload.status {
        if status == "COMPLETED" {
            completed_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        }
    }

    let mut query = "UPDATE kit_assembly_orders SET ".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut sets = Vec::new();
    let mut param_idx = 1;

    if let Some(ref status) = payload.status {
        sets.push(format!("status = ?{}", param_idx));
        params_vec.push(Box::new(status.clone()));
        param_idx += 1;

        if status == "COMPLETED" {
            sets.push(format!("completed_at = ?{}", param_idx));
            params_vec.push(Box::new(completed_at.clone()));
            param_idx += 1;
        } else if status == "PENDING" {
            sets.push("completed_at = NULL".to_string());
        }
    }

    if let Some(ref assembled_by) = payload.assembled_by {
        sets.push(format!("assembled_by = ?{}", param_idx));
        params_vec.push(Box::new(assembled_by.clone()));
        param_idx += 1;
    }

    if let Some(ref checked_by) = payload.checked_by {
        sets.push(format!("checked_by = ?{}", param_idx));
        params_vec.push(Box::new(checked_by.clone()));
        param_idx += 1;
    }

    if let Some(ref observations) = payload.observations {
        sets.push(format!("observations = ?{}", param_idx));
        params_vec.push(Box::new(observations.clone()));
        param_idx += 1;
    }

    if let Some(erp_launched) = payload.erp_launched {
        sets.push(format!("erp_launched = ?{}", param_idx));
        params_vec.push(Box::new(erp_launched));
        param_idx += 1;
    }

    if let Some(ref components_lotes) = payload.components_lotes {
        sets.push(format!("components_lotes = ?{}", param_idx));
        params_vec.push(Box::new(components_lotes.clone()));
        param_idx += 1;
    }

    if let Some(quantity_assembled) = payload.quantity_assembled {
        sets.push(format!("quantity_assembled = ?{}", param_idx));
        params_vec.push(Box::new(quantity_assembled));
        param_idx += 1;
    }

    if sets.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Nenhum campo para atualizar" }))).into_response();
    }

    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    match conn.execute(&query, rusqlite::params_from_iter(params_refs)) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de montagem atualizada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao atualizar: {}", e) }))).into_response(),
    }
}

pub async fn delete_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    match conn.execute("DELETE FROM kit_assembly_orders WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de montagem excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao excluir: {}", e) }))).into_response(),
    }
}

pub async fn get_next_kit_order_number(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let last_order: Option<String> = conn.query_row(
        "SELECT order_number FROM kit_assembly_orders ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0)
    ).ok();

    let next_order = match last_order {
        Some(last) => {
            let mut prefix = String::new();
            let mut num_str = String::new();
            
            for c in last.chars() {
                if c.is_ascii_digit() {
                    num_str.push(c);
                } else {
                    if !num_str.is_empty() {
                        prefix.push_str(&num_str);
                        num_str.clear();
                    }
                    prefix.push(c);
                }
            }

            if let Ok(num) = num_str.parse::<i64>() {
                let formatted_num = format!("{:0width$}", num + 1, width = num_str.len());
                format!("{}{}", prefix, formatted_num)
            } else {
                format!("{}-1", last)
            }
        }
        None => "1001".to_string(),
    };

    (StatusCode::OK, Json(serde_json::json!({ "nextOrderNumber": next_order }))).into_response()
}

// === HANDLERS PARA VIRA DE PRODUTO ===

pub async fn list_vira_composicao(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT vc.de_produto_codigo, pd.descricao as de_desc,
                vc.para_produto_codigo, pp.descricao as para_desc,
                vc.quantidade
         FROM vira_composicao vc
         JOIN produtos pd ON TRIM(REPLACE(vc.de_produto_codigo, '\"', '')) = TRIM(REPLACE(pd.codigo, '\"', ''))
         JOIN produtos pp ON TRIM(REPLACE(vc.para_produto_codigo, '\"', '')) = TRIM(REPLACE(pp.codigo, '\"', ''))
         ORDER BY pd.descricao"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::ViraComposicaoRow {
            de_produto_codigo: row.get(0)?,
            de_produto_descricao: row.get(1)?,
            para_produto_codigo: row.get(2)?,
            para_produto_descricao: row.get(3)?,
            quantidade: row.get(4)?,
        })
    });

    let mut list = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(row) = r {
                list.push(row);
            }
        }
    }

    (StatusCode::OK, Json(list)).into_response()
}

pub async fn add_vira_composicao(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::NewViraComposicao>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let res = conn.execute(
        "INSERT INTO vira_composicao (de_produto_codigo, para_produto_codigo, quantidade) 
         VALUES (?1, ?2, ?3)
         ON CONFLICT(de_produto_codigo, para_produto_codigo) DO UPDATE SET quantidade = excluded.quantidade",
        params![payload.de_produto_codigo, payload.para_produto_codigo, payload.quantidade],
    );

    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({ "message": "Composição de vira adicionada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn delete_vira_composicao(
    State(state): State<Arc<AppState>>,
    Path((de, para)): Path<(String, String)>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    match conn.execute(
        "DELETE FROM vira_composicao WHERE de_produto_codigo = ?1 AND para_produto_codigo = ?2",
        params![de, para],
    ) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Composição de vira excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn list_vira_orders(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, order_number, de_produto_codigo, de_produto_descricao,
                para_produto_codigo, para_produto_descricao, quantity, status,
                created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, quantity_assembled
         FROM vira_ordens
         ORDER BY id DESC"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::ViraOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            de_produto_codigo: row.get(2)?,
            de_produto_descricao: row.get(3)?,
            para_produto_codigo: row.get(4)?,
            para_produto_descricao: row.get(5)?,
            quantity: row.get(6)?,
            status: row.get(7)?,
            created_at: row.get(8)?,
            completed_at: row.get(9)?,
            assembled_by: row.get(10)?,
            checked_by: row.get(11)?,
            observations: row.get(12)?,
            erp_launched: row.get(13)?,
            quantity_assembled: row.get(14)?,
        })
    });

    let mut list = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(row) = r {
                list.push(row);
            }
        }
    }

    (StatusCode::OK, Json(list)).into_response()
}

pub async fn create_vira_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateViraOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());

    let res = conn.execute(
        "INSERT INTO vira_ordens (
            order_number, de_produto_codigo, de_produto_descricao,
            para_produto_codigo, para_produto_descricao, quantity, status,
            created_at, assembled_by, checked_by, observations, erp_launched, quantity_assembled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12)",
        params![
            payload.order_number,
            payload.de_produto_codigo,
            payload.de_produto_codigo, // default desc to code
            payload.para_produto_codigo,
            payload.para_produto_codigo, // default desc to code
            payload.quantity,
            status,
            created_at,
            payload.assembled_by,
            payload.checked_by,
            payload.observations,
            payload.quantity_assembled.unwrap_or(payload.quantity)
        ],
    );

    match res {
        Ok(_) => {
            let last_id = conn.last_insert_rowid();
            
            // Post-process: update real product descriptions
            let _ = conn.execute(
                "UPDATE vira_ordens 
                 SET de_produto_descricao = COALESCE((SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(de_produto_codigo, '\"', '')) LIMIT 1), de_produto_codigo),
                     para_produto_descricao = COALESCE((SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(para_produto_codigo, '\"', '')) LIMIT 1), para_produto_codigo)
                 WHERE id = ?1",
                params![last_id]
            );

            (StatusCode::CREATED, Json(serde_json::json!({ "id": last_id, "message": "Ordem de vira criada" }))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao criar ordem de vira: {}", e) }))).into_response(),
    }
}

pub async fn update_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateViraOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut completed_at: Option<String> = None;
    if let Some(ref status) = payload.status {
        if status == "COMPLETED" {
            completed_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        }
    }

    let mut query = "UPDATE vira_ordens SET ".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut sets = Vec::new();
    let mut param_idx = 1;

    if let Some(ref status) = payload.status {
        sets.push(format!("status = ?{}", param_idx));
        params_vec.push(Box::new(status.clone()));
        param_idx += 1;

        if status == "COMPLETED" {
            sets.push(format!("completed_at = ?{}", param_idx));
            params_vec.push(Box::new(completed_at.clone()));
            param_idx += 1;
        } else if status == "PENDING" {
            sets.push("completed_at = NULL".to_string());
        }
    }

    if let Some(ref assembled_by) = payload.assembled_by {
        sets.push(format!("assembled_by = ?{}", param_idx));
        params_vec.push(Box::new(assembled_by.clone()));
        param_idx += 1;
    }

    if let Some(ref checked_by) = payload.checked_by {
        sets.push(format!("checked_by = ?{}", param_idx));
        params_vec.push(Box::new(checked_by.clone()));
        param_idx += 1;
    }

    if let Some(ref observations) = payload.observations {
        sets.push(format!("observations = ?{}", param_idx));
        params_vec.push(Box::new(observations.clone()));
        param_idx += 1;
    }

    if let Some(erp_launched) = payload.erp_launched {
        sets.push(format!("erp_launched = ?{}", param_idx));
        params_vec.push(Box::new(erp_launched));
        param_idx += 1;
    }

    if let Some(quantity_assembled) = payload.quantity_assembled {
        sets.push(format!("quantity_assembled = ?{}", param_idx));
        params_vec.push(Box::new(quantity_assembled));
        param_idx += 1;
    }

    if sets.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Nenhum campo para atualizar" }))).into_response();
    }

    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    match conn.execute(&query, rusqlite::params_from_iter(params_refs)) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de vira atualizada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao atualizar: {}", e) }))).into_response(),
    }
}

pub async fn delete_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    match conn.execute("DELETE FROM vira_ordens WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de vira excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn get_next_vira_order_number(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let last_order: Option<String> = conn.query_row(
        "SELECT order_number FROM vira_ordens ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0)
    ).ok();

    let next_order = match last_order {
        Some(last) => {
            let mut prefix = String::new();
            let mut num_str = String::new();
            
            for c in last.chars() {
                if c.is_ascii_digit() {
                    num_str.push(c);
                } else {
                    if !num_str.is_empty() {
                        prefix.push_str(&num_str);
                        num_str.clear();
                    }
                    prefix.push(c);
                }
            }

            if let Ok(num) = num_str.parse::<i64>() {
                let formatted_num = format!("{:0width$}", num + 1, width = num_str.len());
                format!("{}{}", prefix, formatted_num)
            } else {
                format!("{}-1", last)
            }
        }
        None => "V-1001".to_string(),
    };

    (StatusCode::OK, Json(serde_json::json!({ "nextOrderNumber": next_order }))).into_response()
}

// GET /api/administrativo/acompanhamento-producao
pub async fn get_acompanhamento_producao(
    State(state): State<Arc<AppState>>,
    Query(params): Query<crate::models::AcompanhamentoQueryParams>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    };

    let mut query = "
        SELECT 
            m.document_number,
            m.item_code,
            COALESCE(p.descricao, ''),
            m.quantity,
            m.date,
            COALESCE(m.details, ''),
            cs.custom_status,
            cs.category,
            cs.updated_by,
            cs.updated_at,
            cs.notes
        FROM stock_movements m
        LEFT JOIN produtos p ON m.item_code = p.codigo
        LEFT JOIN lote_custom_status cs ON m.document_number = cs.lote_number
        WHERE m.item_type = 'produto' AND m.movement_type = 'entrada'
    ".to_string();

    let mut args: Vec<String> = Vec::new();

    if let Some(ref start_date) = params.start_date {
        if !start_date.trim().is_empty() {
            query.push_str(" AND m.date >= ?");
            args.push(start_date.trim().to_string());
        }
    }

    if let Some(ref end_date) = params.end_date {
        if !end_date.trim().is_empty() {
            query.push_str(" AND m.date <= ?");
            args.push(end_date.trim().to_string());
        }
    }

    if let Some(ref erp_st) = params.erp_status {
        if !erp_st.trim().is_empty() && erp_st != "ALL" {
            query.push_str(" AND m.details LIKE ?");
            args.push(format!("%Status: {}%", erp_st.trim()));
        }
    }

    if let Some(ref custom_st) = params.custom_status {
        if !custom_st.trim().is_empty() && custom_st != "ALL" {
            if custom_st == "NONE" || custom_st == "SEM_STATUS" {
                query.push_str(" AND (cs.custom_status IS NULL OR cs.custom_status = '')");
            } else {
                query.push_str(" AND cs.custom_status = ?");
                args.push(custom_st.trim().to_string());
            }
        }
    }

    if let Some(ref cat) = params.category {
        if !cat.trim().is_empty() && cat != "ALL" {
            query.push_str(" AND cs.category = ?");
            args.push(cat.trim().to_string());
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let term = search.trim();
            query.push_str(" AND (m.document_number LIKE ? OR m.item_code LIKE ? OR p.descricao LIKE ? OR cs.updated_by LIKE ? OR cs.notes LIKE ?)");
            let like_arg = format!("%{}%", term);
            for _ in 0..5 {
                args.push(like_arg.clone());
            }
        }
    }

    query.push_str(" ORDER BY m.date DESC, m.document_number DESC");

    let limit_val = params.limit.unwrap_or(10000);
    query.push_str(&format!(" LIMIT {}", limit_val));

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    };

    let params_converted = rusqlite::params_from_iter(args.iter());

    struct RawRow {
        lote_number: String,
        item_code: String,
        description: String,
        quantity: f64,
        date: String,
        details: String,
        custom_status: Option<String>,
        category: Option<String>,
        updated_by: Option<String>,
        updated_at: Option<String>,
        notes: Option<String>,
    }

    let rows_res = stmt.query_map(params_converted, |row| {
        Ok(RawRow {
            lote_number: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            item_code: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            quantity: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            date: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            details: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            custom_status: row.get(6)?,
            category: row.get(7)?,
            updated_by: row.get(8)?,
            updated_at: row.get(9)?,
            notes: row.get(10)?,
        })
    });

    let raw_list: Vec<RawRow> = match rows_res {
        Ok(iter) => iter.flatten().collect(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    };

    // Group by lote_number
    let mut map_indices = std::collections::HashMap::new();
    let mut grouped_items: Vec<crate::models::AcompanhamentoLoteItem> = Vec::new();

    for r in raw_list {
        if r.lote_number.is_empty() {
            continue;
        }

        let mut erp_status = String::new();
        for part in r.details.split('|') {
            let part = part.trim();
            if part.starts_with("Status:") {
                erp_status = part.trim_start_matches("Status:").trim().to_string();
                break;
            }
        }

        let erp_status_label = match erp_status.to_uppercase().as_str() {
            "EA" => "Estoque Atualizado",
            "PG" => "Em Pesagem",
            "PP" => "Pré-Produção",
            "PR" => "Em Produção",
            "EN" => "Em Envase",
            "CF" => "Conferido",
            "CA" => "Cancelado",
            "FP" => "Finalizado",
            "" => "Sem Status",
            other => other,
        }.to_string();

        if let Some(&idx) = map_indices.get(&r.lote_number) {
            let item: &mut crate::models::AcompanhamentoLoteItem = &mut grouped_items[idx];
            if !item.product_code.contains(&r.item_code) && !r.item_code.is_empty() {
                item.product_code = format!("{} / {}", item.product_code, r.item_code);
                item.product_description = format!("{} / {}", item.product_description, r.description);
            }
            item.quantity += r.quantity;
        } else {
            let new_item = crate::models::AcompanhamentoLoteItem {
                lote_number: r.lote_number.clone(),
                product_code: r.item_code,
                product_description: r.description,
                quantity: r.quantity,
                date: r.date,
                erp_status: if erp_status.is_empty() { "-".to_string() } else { erp_status },
                erp_status_label,
                custom_status: r.custom_status,
                category: r.category,
                updated_by: r.updated_by,
                updated_at: r.updated_at,
                notes: r.notes,
            };
            map_indices.insert(r.lote_number, grouped_items.len());
            grouped_items.push(new_item);
        }
    }

    (StatusCode::OK, Json(grouped_items)).into_response()
}

// POST /api/administrativo/lote-status
pub async fn save_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::SaveLoteCustomStatusPayload>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    };

    let lote_number = payload.lote_number.trim();
    if lote_number.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Número do lote obrigatório" }))).into_response();
    }

    let status = payload.custom_status.trim();
    let category = match payload.category {
        Some(ref c) if !c.trim().is_empty() => c.trim().to_string(),
        _ => {
            // Auto-infer category if not provided
            match status.to_lowercase().as_str() {
                "pesagem" | "produção" | "producao" => "Pesagem e Produção".to_string(),
                "rotulagem" | "envase" | "finalizada" | "finalizado" => "Embalagem".to_string(),
                _ => "Geral".to_string(),
            }
        }
    };

    let updated_by = payload.updated_by.unwrap_or_else(|| "Administrador".to_string());
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let res = conn.execute(
        "INSERT INTO lote_custom_status (lote_number, custom_status, category, updated_by, updated_at, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(lote_number) DO UPDATE SET
            custom_status = excluded.custom_status,
            category = excluded.category,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at,
            notes = COALESCE(excluded.notes, lote_custom_status.notes)",
        rusqlite::params![lote_number, status, category, updated_by, now, payload.notes],
    );

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({
            "message": "Status atualizado com sucesso",
            "loteNumber": lote_number,
            "customStatus": status,
            "category": category,
            "updatedBy": updated_by,
            "updatedAt": now
        }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/administrativo/lote-status/:number
pub async fn delete_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    };

    let res = conn.execute(
        "DELETE FROM lote_custom_status WHERE lote_number = ?1",
        rusqlite::params![lote_number.trim()],
    );

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Status removido com sucesso" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

