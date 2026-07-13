use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::json;
use sqlx::Row;

use crate::handlers::AppState;

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
    let pool = state.db.pool();

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac \
         FROM sales_orders WHERE 1=1",
    );

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let like_pattern = format!("%{}%", search.trim());
            qb.push(" AND (c_nome LIKE ");
            qb.push_bind(like_pattern.clone());
            qb.push(" OR CAST(n_pedido AS TEXT) LIKE ");
            qb.push_bind(like_pattern);
            qb.push(")");
        }
    }

    if let Some(ref status) = params.status {
        if !status.trim().is_empty() && status != "ALL" {
            if status == "ativos" {
                qb.push(" AND c_status NOT IN ('FT', 'CA')");
            } else if status == "concluidos" {
                qb.push(" AND c_status IN ('FT', 'CA')");
            } else {
                qb.push(" AND c_status = ");
                qb.push_bind(status.clone());
            }
        }
    }

    if let Some(days) = params.days {
        if days > 0 {
            qb.push(format!(
                " AND d_pedido::date >= (CURRENT_DATE - INTERVAL '{} days')",
                days
            ));
        }
    }

    qb.push(" ORDER BY d_pedido DESC, n_pedido DESC");

    let rows = match qb.build().fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut sales_orders = Vec::new();
    let mut order_keys: Vec<(i32, String)> = Vec::new();
    let mut order_meta = Vec::new();

    for row in rows {
        let n_pedido = crate::core::pg_row::pg_i32(&row, 0);
        let d_pedido: String = row.get(1);
        order_keys.push((n_pedido, d_pedido.clone()));
        order_meta.push((
            n_pedido,
            d_pedido,
            crate::core::pg_row::pg_opt_i32(&row, 2),
            row.get::<Option<String>, _>(3),
            row.get::<f64, _>(4),
            row.get::<Option<String>, _>(5),
            crate::core::pg_row::pg_i32(&row, 6),
            row.get::<Option<String>, _>(7),
            row.get::<Option<String>, _>(8),
            row.get::<Option<String>, _>(9),
        ));
    }

    let mut items_by_order: HashMap<(i32, String), Vec<crate::models::SalesOrderItem>> =
        HashMap::new();
    if !order_keys.is_empty() {
        let pedidos: Vec<i32> = order_keys.iter().map(|(p, _)| *p).collect();
        let datas: Vec<String> = order_keys.iter().map(|(_, d)| d.clone()).collect();
        if let Ok(item_rows) = sqlx::query(
            r#"
            SELECT i.id, i.n_pedido, i.d_pedido, i.n_registro, i.c_cod_prod, i.n_qtde, i.n_qtde_fat, i.n_preco, i.c_lote
            FROM sales_order_items i
            INNER JOIN UNNEST($1::int4[], $2::text[]) AS v(n_pedido, d_pedido)
              ON i.n_pedido = v.n_pedido AND i.d_pedido = v.d_pedido
            "#,
        )
        .bind(&pedidos)
        .bind(&datas)
        .fetch_all(pool)
        .await
        {
            for row_item in item_rows {
                let n_pedido = crate::core::pg_row::pg_i32(&row_item, 1);
                let d_pedido: String = row_item.get(2);
                items_by_order
                    .entry((n_pedido, d_pedido))
                    .or_default()
                    .push(crate::models::SalesOrderItem {
                        id: crate::core::pg_row::pg_i64(&row_item, 0),
                        n_pedido,
                        d_pedido: row_item.get(2),
                        n_registro: crate::core::pg_row::pg_opt_i32(&row_item, 3),
                        c_cod_prod: row_item.get(4),
                        n_qtde: crate::core::pg_row::pg_i32(&row_item, 5),
                        n_qtde_fat: crate::core::pg_row::pg_i32(&row_item, 6),
                        n_preco: crate::core::pg_row::pg_f64(&row_item, 7),
                        c_lote: row_item.get(8),
                    });
            }
        }
    }

    for (n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac) in order_meta
    {
        let items = items_by_order
            .remove(&(n_pedido, d_pedido.clone()))
            .unwrap_or_default();
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

    (StatusCode::OK, Json(sales_orders)).into_response()
}

// GET /api/vendas/faltas
pub async fn list_sales_faltas(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FaltasParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let days = params.days.unwrap_or(180);

    let mut stock_map: HashMap<String, (i64, i64)> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT codigo, estoque, producao FROM estoque_atual")
        .fetch_all(pool)
        .await
    {
        for row in rows {
            let code: String = row.get(0);
            let estoque: f64 = row.get(1);
            let producao: f64 = row.get(2);
            stock_map.insert(code, (estoque.round() as i64, producao.round() as i64));
        }
    }

    let mut purchase_transit_map: HashMap<String, i64> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT poi.c_referencia, SUM(poi.n_qtde - poi.n_chegou)
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
         GROUP BY poi.c_referencia",
    )
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let code: String = row.get(0);
            let qty: f64 = row.get(1);
            purchase_transit_map.insert(code, qty.round() as i64);
        }
    }

    let active_query = if days > 0 {
        format!(
            "SELECT soi.c_cod_prod, p.descricao,
                    COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                    soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                    soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao
             FROM sales_order_items soi
             JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
             LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
               AND so.d_pedido::date >= (CURRENT_DATE - INTERVAL '{} days')
             ORDER BY soi.c_cod_prod, soi.d_pedido DESC",
            days
        )
    } else {
        "SELECT soi.c_cod_prod, p.descricao,
                COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
         LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
         WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
         ORDER BY soi.c_cod_prod, soi.d_pedido DESC"
            .to_string()
    };

    let active_rows = match sqlx::query(&active_query).fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut active_map: HashMap<String, (String, String, i32, Vec<crate::models::ProductFaltaItem>)> =
        HashMap::new();

    for row in active_rows {
        let code: String = row.get(0);
        let desc: String = row
            .get::<Option<String>, _>(1)
            .unwrap_or_else(|| "Produto Legado".to_string());
        let linha: String = row.get(2);
        let n_pedido = crate::core::pg_row::pg_i32(&row, 3);
        let d_pedido: String = row.get(4);
        let c_nome: Option<String> = row.get(5);
        let c_status: Option<String> = row.get(6);
        let n_qtde = crate::core::pg_row::pg_i32(&row, 7);
        let n_qtde_fat = crate::core::pg_row::pg_i32(&row, 8);
        let falta_qty = crate::core::pg_row::pg_i32(&row, 9);
        let d_previsao: Option<String> = row.get(10);

        let entry = active_map
            .entry(code.clone())
            .or_insert_with(|| (desc, linha, 0, Vec::new()));
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

    let mut active_groups: Vec<crate::models::ProductFaltaGroup> = active_map
        .into_iter()
        .map(|(code, (desc, linha, total, items))| {
            let (estoque, producao) = stock_map.get(&code).cloned().unwrap_or((0, 0));
            let transit = purchase_transit_map.get(&code).cloned().unwrap_or(0);
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
        format!(
            "SELECT soi.c_cod_prod, p.descricao,
                    COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                    soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                    soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao
             FROM sales_order_items soi
             JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
             LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE so.c_status IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
               AND so.d_pedido::date >= (CURRENT_DATE - INTERVAL '{} days')
             ORDER BY soi.c_cod_prod, soi.d_pedido DESC",
            days
        )
    } else {
        "SELECT soi.c_cod_prod, p.descricao,
                COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
         LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
         WHERE so.c_status IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
         ORDER BY soi.c_cod_prod, soi.d_pedido DESC"
            .to_string()
    };

    let hist_rows = match sqlx::query(&hist_query).fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut hist_map: HashMap<String, (String, String, i32, Vec<crate::models::ProductFaltaItem>)> =
        HashMap::new();

    for row in hist_rows {
        let code: String = row.get(0);
        let desc: String = row
            .get::<Option<String>, _>(1)
            .unwrap_or_else(|| "Produto Legado".to_string());
        let linha: String = row.get(2);
        let n_pedido = crate::core::pg_row::pg_i32(&row, 3);
        let d_pedido: String = row.get(4);
        let c_nome: Option<String> = row.get(5);
        let c_status: Option<String> = row.get(6);
        let n_qtde = crate::core::pg_row::pg_i32(&row, 7);
        let n_qtde_fat = crate::core::pg_row::pg_i32(&row, 8);
        let falta_qty = crate::core::pg_row::pg_i32(&row, 9);
        let d_previsao: Option<String> = row.get(10);

        let entry = hist_map
            .entry(code.clone())
            .or_insert_with(|| (desc, linha, 0, Vec::new()));
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

    (
        StatusCode::OK,
        Json(json!({
            "ativas": active_groups,
            "historicas": hist_groups,
        })),
    )
        .into_response()
}
