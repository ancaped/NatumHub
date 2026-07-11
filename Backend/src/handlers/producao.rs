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

use crate::core::db::Db;
use crate::models::{
    BulkOverrideRequest, KitComponentDetail, KitCalculationResult, LineConfig, Product, ProductCalculationResult, ProductOverride, QueryParams, Stock,
    NewProducaoEntry, HistoryQueryParams,
    WatchConfig, NewKitComposicao,
};
use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::handlers::AppState;

// Helper cross-imports
use crate::handlers::imports::clean_product_code;




#[derive(Debug, serde::Deserialize)]
pub struct ResolveLotePayload {
    pub observations: String,
    pub resolved_by: Option<String>,
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
pub struct EnvaseProductDetail {
    pub product_code: String,
    pub description: String,
    pub unit_weight_kg: f64,
    pub actual_units_envasadas: f64,
    pub packaging_items: Vec<EnvaseItemDetail>,
    pub has_packaging_formula: bool,
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

#[derive(Debug, serde::Deserialize)]
pub struct UpdateLotePayload {
    pub lote_erp: Option<String>,
}

// Helper to query all needed arrays for calculations
pub fn fetch_calculation_data(state: &Db) -> anyhow::Result<(
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

pub fn check_lote_errors(
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
