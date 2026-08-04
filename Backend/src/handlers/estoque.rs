use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::json;
use sqlx::Row;

use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::handlers::AppState;
use crate::handlers::producao::{check_lote_errors, fetch_calculation_data};

// GET /api/estoque/movimentacoes/:code
pub async fn get_stock_movements(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "SELECT id, item_code, item_type, movement_type, quantity, date, document_number, details, created_at
         FROM stock_movements WHERE item_code = $1 ORDER BY date DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let list: Vec<crate::models::StockMovement> = rows
                .iter()
                .map(|row| crate::models::StockMovement {
                    id: row.get(0),
                    item_code: row.get(1),
                    item_type: row.get(2),
                    movement_type: row.get(3),
                    quantity: row.get(4),
                    date: row.get(5),
                    document_number: row.get(6),
                    details: row.get(7),
                    created_at: row.get(8),
                })
                .collect();
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/produtos/formulacao/:code
pub async fn get_product_formulation(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "SELECT product_code, ingredient_code, description, quantity, percentage FROM formulations
         WHERE product_code = $1
            OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = $1)
            OR ($1 LIKE '0%' AND product_code = SUBSTR($1, 2))
         ORDER BY quantity DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let list: Vec<crate::models::FormulationLine> = rows
                .iter()
                .map(|row| crate::models::FormulationLine {
                    product_code: row.get(0),
                    ingredient_code: row.get(1),
                    description: row.get(2),
                    quantity: row.get(3),
                    percentage: row.get(4),
                })
                .collect();
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/produtos/semelhantes/:code
pub async fn get_similar_products(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let mut target_map = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT ingredient_code, quantity FROM formulations WHERE product_code = $1",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let ing: String = row.get(0);
            let qty: f64 = row.get(1);
            *target_map.entry(ing).or_insert(0.0) += qty;
        }
    }

    if target_map.is_empty() {
        return (
            StatusCode::OK,
            Json(Vec::<crate::models::SimilarProductResult>::new()),
        )
            .into_response();
    }

    let mut product_ingredients: HashMap<String, HashMap<String, f64>> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT product_code, ingredient_code, quantity FROM formulations WHERE product_code != $1",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let p_code: String = row.get(0);
            let ing_code: String = row.get(1);
            let qty: f64 = row.get(2);
            *product_ingredients
                .entry(p_code)
                .or_default()
                .entry(ing_code)
                .or_insert(0.0) += qty;
        }
    }

    let total_target_qty: f64 = target_map.values().sum();
    let mut match_map = HashMap::new();

    if total_target_qty > 0.0 {
        for (other_code, ingredients) in &product_ingredients {
            if ingredients.len() != target_map.len() {
                continue;
            }
            let total_other_qty: f64 = ingredients.values().sum();
            if total_other_qty <= 0.0 {
                continue;
            }
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
                match_map.insert(other_code.clone(), 1.0);
            }
        }
    }

    let (products, stocks, fat_map, configs, overrides, _) =
        match fetch_calculation_data(&state.db).await {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        };
    let computed = calculate_products(&products, &stocks, &fat_map, &configs, &overrides);

    let mut formulations_map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT product_code, ingredient_code, description, quantity FROM formulations",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let p_code: String = row.get(0);
            let ing_code: String = row.get(1);
            let desc: String = row.get::<Option<String>, _>(2).unwrap_or_default();
            let qty: f64 = row.get(3);
            let ingredients = formulations_map.entry(p_code).or_default();
            if let Some(existing) = ingredients.iter_mut().find(|(c, _, _)| c == &ing_code) {
                existing.2 += qty;
            } else {
                ingredients.push((ing_code, desc, qty));
            }
        }
    }

    let mut item_stock_map: HashMap<String, f64> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT item_code, stock_qty
         FROM stock_snapshots ss
         WHERE ss.id = (
             SELECT id FROM stock_snapshots ss2
             WHERE ss2.item_code = ss.item_code
             ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
         )",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            item_stock_map.insert(row.get(0), row.get(1));
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
    similar_results.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    (StatusCode::OK, Json(similar_results)).into_response()
}

// GET /api/produtos/:code/detalhes
pub async fn get_product_detalhes(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let product_row = sqlx::query(
        "SELECT p.codigo, p.descricao, COALESCE(i.unit, 'UN') as unidade, COALESCE(e.estoque, 0.0)
         FROM produtos p
         LEFT JOIN items i ON p.codigo = i.code
         LEFT JOIN estoque_atual e ON p.codigo = e.codigo
         WHERE p.codigo = $1",
    )
    .bind(&code)
    .fetch_optional(pool)
    .await;

    let (prod_code, description, unit, current_stock) = match product_row {
        Ok(Some(row)) => (
            row.get::<String, _>(0),
            row.get::<String, _>(1),
            row.get::<String, _>(2),
            crate::core::pg_row::pg_f64(&row, 3),
        ),
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Produto não encontrado" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut category_parent_map: HashMap<String, String> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT id, parent_id FROM categories")
        .fetch_all(pool)
        .await
    {
        for row in rows {
            if let Some(p_id) = row.get::<Option<String>, _>(1) {
                category_parent_map.insert(row.get(0), p_id);
            }
        }
    }

    let resolve_root_category =
        |cat_id: &str, parent_map: &HashMap<String, String>| -> String {
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

    let mut formulation = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT f.product_code, f.ingredient_code, f.description, f.quantity, f.percentage,
                COALESCE(s.stock_qty, 0.0) as ingredient_stock, i.category_id
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
         WHERE f.product_code = $1
         ORDER BY f.quantity DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let cat_id: Option<String> = row.get(6);
            let root_cat = cat_id.map(|cid| resolve_root_category(&cid, &category_parent_map));
            formulation.push(crate::models::ProductFormulationLine {
                product_code: row.get(0),
                ingredient_code: row.get(1),
                description: row.get::<Option<String>, _>(2).unwrap_or_default(),
                quantity: row.get(3),
                percentage: row.get(4),
                current_stock: row.get(5),
                category_id: root_cat,
            });
        }
    }

    let mut sales_yoy = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT EXTRACT(YEAR FROM date::timestamp)::integer as year,
                SUM(quantity) as total_qty, SUM(quantity) / 12.0 as monthly_avg
         FROM stock_movements
         WHERE item_code = $1 AND item_type = 'produto' AND movement_type = 'saida' AND date::timestamp <= NOW()
         GROUP BY year ORDER BY year DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            sales_yoy.push(crate::models::SalesYoYItem {
                year: row.get(0),
                total_qty: row.get(1),
                monthly_avg: row.get(2),
            });
        }
    }

    let mut monthly_sales = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT TO_CHAR(date::timestamp, 'YYYY-MM') as year_month, SUM(quantity) as qty
         FROM stock_movements
         WHERE item_code = $1 AND item_type = 'produto' AND movement_type = 'saida' AND date::timestamp <= NOW()
         GROUP BY year_month ORDER BY year_month ASC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            monthly_sales.push(crate::models::MonthlySalesItem {
                month: row.get(0),
                qty: row.get(1),
            });
        }
    }

    let mut recent_invoices = Vec::new();
    let code_clean = code.replace('.', "");
    if let Ok(rows) = sqlx::query(
        "SELECT invoice_number, quantity, unit_price, total_value, supplier_name, invoice_date,
                cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments
         FROM invoices
         WHERE (item_code = $1 OR item_code = $2) AND invoice_date::timestamp <= NOW()
         ORDER BY invoice_date DESC LIMIT 15",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            recent_invoices.push(crate::models::InsumoInvoiceItem {
                invoice_number: row.get(0),
                quantity: row.get(1),
                unit_price: row.get(2),
                total_value: row.get(3),
                supplier_name: row.get(4),
                invoice_date: row.get(5),
                cfop: row.get(6),
                icms_value: row.get(7),
                ipi_value: row.get(8),
                freight_value: row.get(9),
                entry_date: row.get(10),
                carrier_name: row.get(11),
                supplier_cnpj: row.get(12),
                payment_installments: row.get(13),
            });
        }
    }

    let mut last_production_date: Option<String> = None;
    let mut last_production_qty: Option<f64> = None;
    let mut last_lots: Vec<crate::models::ProductionLote> = Vec::new();

    if let Ok(rows) = sqlx::query(
        "SELECT m.id, m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details
         FROM stock_movements m
         LEFT JOIN produtos p ON m.item_code = p.codigo
         WHERE m.item_code = $1 AND m.item_type = 'produto' AND m.movement_type = 'entrada' AND m.date::timestamp <= NOW()
         ORDER BY m.date DESC LIMIT 15",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for (index, row) in rows.iter().enumerate() {
            let id: String = row.get(0);
            let lote_number: String = row.get::<Option<String>, _>(1).unwrap_or_default();
            let product_code: String = row.get(2);
            let product_description: String = row.get::<Option<String>, _>(3).unwrap_or_default();
            let quantity: f64 = row.get(4);
            let date: String = row.get(5);
            let details: String = row.get::<Option<String>, _>(6).unwrap_or_default();

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
                let ing_exit_sum: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(quantity), 0.0) FROM stock_movements
                     WHERE document_number = $1 AND item_type = 'insumo' AND movement_type = 'saida'",
                )
                .bind(&new_lote.lote_number)
                .fetch_one(pool)
                .await
                .unwrap_or(0.0);

                let form_sum: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(quantity), 1.0) FROM formulations WHERE product_code = $1",
                )
                .bind(&new_lote.product_code)
                .fetch_one(pool)
                .await
                .unwrap_or(1.0);

                let total_expected_weight = new_lote.quantity * form_sum;
                if ing_exit_sum > 0.0 && total_expected_weight > 0.0 {
                    let diff = (ing_exit_sum - total_expected_weight).abs() / total_expected_weight;
                    new_lote.yield_error = Some(diff > 0.10);
                }

                let (pe, ee, ce) = check_lote_errors(
                    pool,
                    &new_lote.lote_number,
                    &new_lote.product_code,
                    new_lote.quantity,
                    &details,
                    &new_lote.product_description,
                )
                .await;
                new_lote.pesagem_error = Some(pe);
                new_lote.envase_error = Some(ee);
                new_lote.conferencia_error = Some(ce);
            }

            last_lots.push(new_lote);
        }
    }

    (
        StatusCode::OK,
        Json(crate::models::ProductDetalhesResponse {
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
        }),
    )
        .into_response()
}

// GET /api/produtos/:code/pedidos-pendentes
pub async fn get_product_pending_orders(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let sales_faltas_days = crate::core::sales_open::resolve_faltas_days(&state.db).await;
    let date_filter = crate::core::sales_open::days_filter_sql(sales_faltas_days);
    let open_st = crate::core::sales_open::OPEN_STATUS_SQL;
    let query_sales = format!(
        "SELECT soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status, soi.n_qtde, soi.n_qtde_fat,
                (soi.n_qtde - soi.n_qtde_fat) as falta, so.d_previsao, so.n_codigo
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         WHERE soi.c_cod_prod = $1 AND {open_st}
           AND (soi.n_qtde > soi.n_qtde_fat)
           {date_filter}
         ORDER BY soi.d_pedido DESC"
    );

    let mut pending_sales_orders = Vec::new();
    if let Ok(rows) = sqlx::query(&query_sales).bind(&code).fetch_all(pool).await {
        for row in rows {
            pending_sales_orders.push(crate::models::ProductFaltaItem {
                n_pedido: crate::core::pg_row::pg_i32(&row, 0),
                d_pedido: row.get(1),
                c_nome: row.get(2),
                c_status: row.get(3),
                n_qtde: crate::core::pg_row::pg_i32(&row, 4),
                n_qtde_fat: crate::core::pg_row::pg_i32(&row, 5),
                falta: crate::core::pg_row::pg_i32(&row, 6),
                d_previsao: row.get(7),
                n_codigo: crate::core::pg_row::pg_opt_i32(&row, 8),
            });
        }
    }

    let mut in_transit_purchase_orders = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT po.n_pedido, po.c_nome_f, po.d_previsao, poi.n_qtde, poi.n_chegou,
                (poi.n_qtde - poi.n_chegou) as n_pendente
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE poi.c_referencia = $1 AND po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
         ORDER BY po.d_pedido DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            in_transit_purchase_orders.push(crate::models::PendingPurchaseOrderItem {
                n_pedido: crate::core::pg_row::pg_i32(&row, 0),
                c_nome_f: row.get(1),
                d_previsao: row.get(2),
                n_qtde: crate::core::pg_row::pg_f64(&row, 3),
                n_chegou: crate::core::pg_row::pg_f64(&row, 4),
                n_pendente: crate::core::pg_row::pg_f64(&row, 5),
            });
        }
    }

    (
        StatusCode::OK,
        Json(crate::models::PendingOrdersResponse {
            pending_sales_orders,
            in_transit_purchase_orders,
        }),
    )
        .into_response()
}
