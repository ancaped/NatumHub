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
use crate::handlers::producao::fetch_calculation_data;
use crate::handlers::producao::check_lote_errors;


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
