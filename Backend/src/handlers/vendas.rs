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


#[derive(Debug, serde::Deserialize)]
pub struct FaltasParams {
    pub days: Option<i32>,
}

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
