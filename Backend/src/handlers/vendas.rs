use axum::{
    extract::{Path, Query, State},
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

#[derive(Debug, serde::Deserialize)]
pub struct SalesOrderDetailParams {
    pub n_pedido: i32,
    pub d_pedido: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ClientesQueryParams {
    pub search: Option<String>,
    pub days: Option<i32>,
}

fn apply_status_filter(qb: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>, status: Option<&str>) {
    let Some(status) = status else { return };
    if status.trim().is_empty() || status == "ALL" {
        return;
    }
    if status == "ativos" {
        qb.push(format!(
            " AND {}",
            crate::core::sales_open::OPEN_STATUS_SQL_BARE
        ));
    } else if status == "concluidos" {
        qb.push(" AND c_status IN ('FT', 'CA', 'FP')");
    } else {
        qb.push(" AND c_status = ");
        qb.push_bind(status.to_string());
    }
}

fn residual_from_items(items: &[crate::models::SalesOrderItem]) -> i32 {
    items
        .iter()
        .map(|i| (i.n_qtde - i.n_qtde_fat).max(0))
        .sum()
}

fn normalize_d_pedido(d: &str) -> String {
    let t = d.trim();
    if t.len() >= 10 {
        t[..10].to_string()
    } else {
        t.to_string()
    }
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

    apply_status_filter(&mut qb, params.status.as_deref());

    if let Some(days) = params.days {
        if days > 0 {
            qb.push(format!(
                " AND d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')"
            ));
        }
    }

    qb.push(" ORDER BY d_pedido DESC, n_pedido DESC");

    match fetch_sales_orders_with_items(pool, qb).await {
        Ok(sales_orders) => (StatusCode::OK, Json(sales_orders)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn fetch_sales_orders_with_items(
    pool: &sqlx::PgPool,
    mut qb: sqlx::QueryBuilder<'_, sqlx::Postgres>,
) -> Result<Vec<crate::models::SalesOrder>, sqlx::Error> {
    let rows = qb.build().fetch_all(pool).await?;

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
        let item_rows = sqlx::query(
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
        .await?;

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

    let mut sales_orders = Vec::with_capacity(order_meta.len());
    for (n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac) in order_meta
    {
        let items = items_by_order
            .remove(&(n_pedido, d_pedido.clone()))
            .unwrap_or_default();
        let residual_un = residual_from_items(&items);
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
            residual_un,
        });
    }

    Ok(sales_orders)
}

/// GET /api/vendas/pedidos/detalhe?n_pedido=&d_pedido=
pub async fn get_sales_order_detail(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SalesOrderDetailParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let d_ymd = normalize_d_pedido(&params.d_pedido);

    let row = match sqlx::query(
        r#"
        SELECT n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal,
               d_previsao, d_entrega, m_observac
        FROM sales_orders
        WHERE n_pedido = $1 AND d_pedido::date = $2::date
        "#,
    )
    .bind(params.n_pedido)
    .bind(&d_ymd)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pedido não encontrado" })),
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

    let n_pedido = crate::core::pg_row::pg_i32(&row, 0);
    let d_pedido: String = row.get(1);

    let item_rows = match sqlx::query(
        r#"
        SELECT id, n_pedido, d_pedido, n_registro, c_cod_prod, n_qtde, n_qtde_fat, n_preco, c_lote
        FROM sales_order_items
        WHERE n_pedido = $1 AND d_pedido = $2
        ORDER BY n_registro NULLS LAST, c_cod_prod
        "#,
    )
    .bind(n_pedido)
    .bind(&d_pedido)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let items: Vec<crate::models::SalesOrderItem> = item_rows
        .into_iter()
        .map(|row_item| crate::models::SalesOrderItem {
            id: crate::core::pg_row::pg_i64(&row_item, 0),
            n_pedido: crate::core::pg_row::pg_i32(&row_item, 1),
            d_pedido: row_item.get(2),
            n_registro: crate::core::pg_row::pg_opt_i32(&row_item, 3),
            c_cod_prod: row_item.get(4),
            n_qtde: crate::core::pg_row::pg_i32(&row_item, 5),
            n_qtde_fat: crate::core::pg_row::pg_i32(&row_item, 6),
            n_preco: crate::core::pg_row::pg_f64(&row_item, 7),
            c_lote: row_item.get(8),
        })
        .collect();

    let residual_un = residual_from_items(&items);
    let order = crate::models::SalesOrder {
        n_pedido,
        d_pedido,
        n_codigo: crate::core::pg_row::pg_opt_i32(&row, 2),
        c_nome: row.get(3),
        n_valor_tot: row.get(4),
        c_status: row.get(5),
        n_nota_fiscal: crate::core::pg_row::pg_i32(&row, 6),
        d_previsao: row.get(7),
        d_entrega: row.get(8),
        m_observac: row.get(9),
        items,
        residual_un,
    };

    (StatusCode::OK, Json(order)).into_response()
}

/// GET /api/vendas/clientes?search=&days=
pub async fn list_sales_clientes(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ClientesQueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let days = params
        .days
        .unwrap_or(crate::core::sales_open::DEFAULT_SALES_FALTAS_DAYS);
    let open_st = crate::core::sales_open::OPEN_STATUS_SQL_BARE;

    let date_filter = if days > 0 {
        format!(" AND d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')")
    } else {
        String::new()
    };

    let mut qb = sqlx::QueryBuilder::new(format!(
        "SELECT n_codigo,
                MAX(c_nome) AS c_nome,
                COUNT(*)::bigint AS pedidos_total,
                COUNT(*) FILTER (WHERE {open_st})::bigint AS pedidos_abertos,
                COALESCE(SUM(n_valor_tot) FILTER (WHERE {open_st}), 0)::float8 AS valor_abertos
         FROM sales_orders
         WHERE n_codigo IS NOT NULL {date_filter}"
    ));

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            let like_pattern = format!("%{}%", search.trim());
            qb.push(" AND (c_nome ILIKE ");
            qb.push_bind(like_pattern.clone());
            qb.push(" OR CAST(n_codigo AS TEXT) LIKE ");
            qb.push_bind(like_pattern);
            qb.push(")");
        }
    }

    qb.push(" GROUP BY n_codigo ORDER BY pedidos_abertos DESC, c_nome ASC NULLS LAST LIMIT 200");

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

    let clientes: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "n_codigo": crate::core::pg_row::pg_i32(&row, 0),
                "c_nome": row.get::<Option<String>, _>(1),
                "pedidos_total": crate::core::pg_row::pg_i64(&row, 2),
                "pedidos_abertos": crate::core::pg_row::pg_i64(&row, 3),
                "valor_abertos": crate::core::pg_row::pg_f64(&row, 4),
            })
        })
        .collect();

    (StatusCode::OK, Json(clientes)).into_response()
}

/// GET /api/vendas/clientes/:codigo/pedidos?status=&days=
pub async fn list_cliente_sales_orders(
    State(state): State<Arc<AppState>>,
    Path(codigo): Path<i32>,
    Query(params): Query<SalesOrdersQueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT n_pedido, d_pedido, n_codigo, c_nome, n_valor_tot, c_status, n_nota_fiscal, d_previsao, d_entrega, m_observac \
         FROM sales_orders WHERE n_codigo = ",
    );
    qb.push_bind(codigo);

    apply_status_filter(&mut qb, params.status.as_deref());

    if let Some(days) = params.days {
        if days > 0 {
            qb.push(format!(
                " AND d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')"
            ));
        }
    }

    qb.push(" ORDER BY d_pedido DESC, n_pedido DESC");

    match fetch_sales_orders_with_items(pool, qb).await {
        Ok(sales_orders) => (StatusCode::OK, Json(sales_orders)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// GET /api/vendas/faltas
pub async fn list_sales_faltas(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FaltasParams>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let days = params
        .days
        .unwrap_or(crate::core::sales_open::DEFAULT_SALES_FALTAS_DAYS);

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

    let open_st = crate::core::sales_open::OPEN_STATUS_SQL;
    let active_query = if days > 0 {
        format!(
            "SELECT soi.c_cod_prod, p.descricao,
                    COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                    soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                    soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao,
                    so.n_codigo
             FROM sales_order_items soi
             JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
             LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE {open_st} AND (soi.n_qtde > soi.n_qtde_fat)
               AND so.d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')
             ORDER BY soi.c_cod_prod, soi.d_pedido DESC"
        )
    } else {
        format!(
            "SELECT soi.c_cod_prod, p.descricao,
                    COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                    soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                    soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao,
                    so.n_codigo
             FROM sales_order_items soi
             JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
             LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE {open_st} AND (soi.n_qtde > soi.n_qtde_fat)
             ORDER BY soi.c_cod_prod, soi.d_pedido DESC"
        )
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
        let n_codigo = crate::core::pg_row::pg_opt_i32(&row, 11);

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
            n_codigo,
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
            n_codigo: None,
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
