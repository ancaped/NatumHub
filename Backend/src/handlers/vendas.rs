use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, put},
    Extension, Json, Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::json;
use sqlx::Row;

use crate::core::acao::{corpo_acao, Confirmar, ErroApi};
use crate::core::catalogo::{param, Acao};
use crate::core::sales_open::{pedido_aberto, pedido_atrasado, resumir_pedidos};
use crate::handlers::AppState;
use crate::modules::estoque::escrita::{gravar_auditado, Resp};
use crate::modules::geral::auth::models::AuthContext;

/// Rotas HTTP de Vendas (mesmos caminhos de sempre).
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/vendas/pedidos", get(list_sales_orders))
        .route("/api/vendas/pedidos/resumo", get(resumo_sales_orders))
        .route("/api/vendas/pedidos/detalhe", get(get_sales_order_detail))
        .route("/api/vendas/faltas", get(list_sales_faltas))
        .route("/api/vendas/clientes", get(list_sales_clientes))
        .route("/api/vendas/clientes/:codigo/pedidos", get(list_cliente_sales_orders))
        .route("/api/vendas/janela-faltas", put(alterar_janela_faltas))
}

#[derive(Debug, serde::Deserialize)]
pub struct FaltasParams {
    pub days: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SalesOrdersQueryParams {
    pub search: Option<String>,
    pub status: Option<String>,
    pub days: Option<i32>,
    /// Paginação opcional (só em `GET /api/vendas/pedidos`).
    pub limite: Option<i64>,
    pub pagina: Option<i64>,
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

/// Paginação opcional de `GET /api/vendas/pedidos`: sem `limite` nem `pagina` devolve tudo (comportamento antigo).
/// Devolve `(limite, offset)`; `limite` fica entre 1 e 1000 (padrão 100 quando só vier `pagina`) e `pagina` começa em 1.
fn paginacao(limite: Option<i64>, pagina: Option<i64>) -> Option<(i64, i64)> {
    if limite.is_none() && pagina.is_none() {
        return None;
    }
    let limite = limite.unwrap_or(100).clamp(1, 1000);
    let pagina = pagina.unwrap_or(1).max(1);
    Some((limite, (pagina - 1) * limite))
}

fn residual_from_items(items: &[crate::models::SalesOrderItem]) -> i32 {
    items
        .iter()
        .map(|i| (i.n_qtde - i.n_qtde_fat).max(0))
        .sum()
}

/// Busca (cliente ou nº do pedido) e janela em dias sobre `sales_orders`, iguais para a lista e o resumo.
fn aplicar_busca_e_janela(
    qb: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>,
    search: Option<&str>,
    days: Option<i32>,
) {
    if let Some(search) = search.map(str::trim).filter(|s| !s.is_empty()) {
        let like_pattern = format!("%{search}%");
        qb.push(" AND (c_nome LIKE ");
        qb.push_bind(like_pattern.clone());
        qb.push(" OR CAST(n_pedido AS TEXT) LIKE ");
        qb.push_bind(like_pattern);
        qb.push(")");
    }
    if let Some(days) = days.filter(|d| *d > 0) {
        qb.push(format!(
            " AND d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')"
        ));
    }
}

fn hoje() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
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

    apply_status_filter(&mut qb, params.status.as_deref());
    aplicar_busca_e_janela(&mut qb, params.search.as_deref(), params.days);

    qb.push(" ORDER BY d_pedido DESC, n_pedido DESC");

    if let Some((limite, offset)) = paginacao(params.limite, params.pagina) {
        qb.push(" LIMIT ");
        qb.push_bind(limite);
        qb.push(" OFFSET ");
        qb.push_bind(offset);
    }

    match fetch_sales_orders_with_items(pool, qb).await {
        Ok(sales_orders) => (StatusCode::OK, Json(sales_orders)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /api/vendas/pedidos/resumo?search=&days= — contagens (abertos, atrasados, total) e residual dos abertos.
pub async fn resumo_sales_orders(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SalesOrdersQueryParams>,
) -> Result<Json<crate::core::sales_open::ResumoPedidos>, ErroApi> {
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT c_status, d_previsao, \
                COALESCE((SELECT SUM(GREATEST(i.n_qtde - i.n_qtde_fat, 0)) FROM sales_order_items i \
                          WHERE i.n_pedido = sales_orders.n_pedido AND i.d_pedido = sales_orders.d_pedido), 0)::bigint \
         FROM sales_orders WHERE 1=1",
    );
    aplicar_busca_e_janela(&mut qb, params.search.as_deref(), params.days);
    let rows = qb.build().fetch_all(state.db.pool()).await?;
    let linhas: Vec<(Option<String>, Option<String>, i64)> = rows
        .iter()
        .map(|r| {
            (
                r.get::<Option<String>, _>(0),
                r.get::<Option<String>, _>(1),
                crate::core::pg_row::pg_i64(r, 2),
            )
        })
        .collect();
    Ok(Json(resumir_pedidos(&linhas, hoje())))
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
                    descricao: None,
                    estoque: None,
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
        let aberto = pedido_aberto(c_status.as_deref());
        let atrasado = pedido_atrasado(aberto, residual_un as i64, d_previsao.as_deref(), hoje());
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
            aberto,
            atrasado,
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
        SELECT soi.id, soi.n_pedido, soi.d_pedido, soi.n_registro, soi.c_cod_prod, soi.n_qtde,
               soi.n_qtde_fat, soi.n_preco, soi.c_lote, p.descricao, ea.estoque::float8
        FROM sales_order_items soi
        LEFT JOIN produtos p ON p.codigo = soi.c_cod_prod
        LEFT JOIN estoque_atual ea ON ea.codigo = soi.c_cod_prod
        WHERE soi.n_pedido = $1 AND soi.d_pedido = $2
        ORDER BY soi.n_registro NULLS LAST, soi.c_cod_prod
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
            descricao: row_item.get(9),
            estoque: row_item.get(10),
        })
        .collect();

    let residual_un = residual_from_items(&items);
    let c_status: Option<String> = row.get(5);
    let d_previsao: Option<String> = row.get(7);
    let aberto = pedido_aberto(c_status.as_deref());
    let atrasado = pedido_atrasado(aberto, residual_un as i64, d_previsao.as_deref(), hoje());
    let order = crate::models::SalesOrder {
        n_pedido,
        d_pedido,
        n_codigo: crate::core::pg_row::pg_opt_i32(&row, 2),
        c_nome: row.get(3),
        n_valor_tot: row.get(4),
        c_status,
        n_nota_fiscal: crate::core::pg_row::pg_i32(&row, 6),
        d_previsao,
        d_entrega: row.get(8),
        m_observac: row.get(9),
        items,
        residual_un,
        aberto,
        atrasado,
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
    let join_linha = crate::core::regras_produto::JOIN_LINHA_EFETIVA_SQL;
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
             {join_linha}
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
             {join_linha}
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
             {join_linha}
             WHERE so.c_status IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
               AND so.d_pedido::date >= (CURRENT_DATE - INTERVAL '{} days')
             ORDER BY soi.c_cod_prod, soi.d_pedido DESC",
            days
        )
    } else {
        format!("SELECT soi.c_cod_prod, p.descricao,
                COALESCE(cl.nome_linha, 'Outros/Geral') as nome_linha,
                soi.n_pedido, soi.d_pedido, so.c_nome, so.c_status,
                soi.n_qtde, soi.n_qtde_fat, (soi.n_qtde - soi.n_qtde_fat) as falta_qty, so.d_previsao
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         LEFT JOIN produtos p ON soi.c_cod_prod = p.codigo
         {join_linha}
         WHERE so.c_status IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
         ORDER BY soi.c_cod_prod, soi.d_pedido DESC")
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

#[derive(Debug, serde::Deserialize)]
pub struct JanelaFaltasCorpo {
    /// Janela em dias dos pedidos considerados (1 a 365; 0 = sem limite).
    pub dias: i32,
}

/// Janela (dias) usada por Faltas, Pedidos e Clientes: grava a setting `sales_faltas_days_limit`.
/// Escrita em 2 passos, auditada. Devolve `{ antes, depois }`.
pub async fn definir_janela_faltas(
    pool: &sqlx::PgPool,
    dias: i32,
    autor: &str,
    confirmar: bool,
) -> Resp {
    if !(0..=365).contains(&dias) {
        return Err(ErroApi::invalido("A janela deve ter de 1 a 365 dias (0 = sem limite)."));
    }
    gravar_auditado(
        pool,
        "alterar_janela_faltas_venda",
        autor,
        "sales_faltas_days_limit",
        json!({ "dias": dias }),
        confirmar,
        move |c| {
            Box::pin(async move {
                let antes: Option<String> =
                    sqlx::query_scalar("SELECT value FROM settings WHERE key = 'sales_faltas_days_limit' FOR UPDATE")
                        .fetch_optional(&mut *c)
                        .await?;
                sqlx::query(
                    "INSERT INTO settings (key, value) VALUES ('sales_faltas_days_limit', $1)
                     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                )
                .bind(dias.to_string())
                .execute(&mut *c)
                .await?;
                let antes = crate::core::sales_open::parse_faltas_days(antes.as_deref());
                Ok(json!({ "antes": antes, "depois": dias }))
            })
        },
    )
    .await
}

/// PUT /api/vendas/janela-faltas?confirmar= — corpo `{ "dias": N }`.
pub async fn alterar_janela_faltas(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<JanelaFaltasCorpo>,
) -> Result<Response, ErroApi> {
    let autor = if ctx.display_name.trim().is_empty() { "Operador" } else { ctx.display_name.trim() };
    let r = definir_janela_faltas(state.db.pool(), corpo.dias, autor, c.confirmar).await?;
    Ok((StatusCode::OK, Json(corpo_acao(&r))).into_response())
}

/// Ações de Vendas descritas para agentes (ver `core::catalogo`).
pub fn acoes_vendas() -> Vec<Acao> {
    const M: &str = "vendas";
    vec![
        Acao::leitura(
            "listar_pedidos_venda",
            M,
            "Lista pedidos de venda com itens, do mais novo ao mais antigo. A base tem dezenas de milhares de pedidos: prefira `days`/`status` e use `limite`+`pagina`. Sem `limite` nem `pagina` devolve tudo.",
            "/api/vendas/pedidos",
            vec![
                param("search", "query", "texto", false, "Parte do nome do cliente ou do número do pedido."),
                param("status", "query", "texto", false, "ativos, concluidos, ALL ou o código do status do ERP."),
                param("days", "query", "inteiro", false, "Só pedidos dos últimos N dias."),
                param("limite", "query", "inteiro", false, "Pedidos por página (1 a 1000; 100 se só `pagina` for informada)."),
                param("pagina", "query", "inteiro", false, "Número da página, a partir de 1 (usa `limite`)."),
            ],
        ),
        Acao::leitura(
            "resumir_pedidos_venda",
            M,
            "Contagens da lista de pedidos de venda: abertos, atrasados (aberto, com residual e previsão vencida), total e residual somado dos abertos.",
            "/api/vendas/pedidos/resumo",
            vec![
                param("search", "query", "texto", false, "Parte do nome do cliente ou do número do pedido."),
                param("days", "query", "inteiro", false, "Só pedidos dos últimos N dias."),
            ],
        ),
        Acao::leitura(
            "detalhar_pedido_venda",
            M,
            "Detalhe de um pedido de venda (cabeçalho, itens e residual).",
            "/api/vendas/pedidos/detalhe",
            vec![
                param("n_pedido", "query", "inteiro", true, "Número do pedido."),
                param("d_pedido", "query", "data", true, "Data do pedido (AAAA-MM-DD)."),
            ],
        ),
        Acao::leitura(
            "listar_clientes_venda",
            M,
            "Lista clientes com pedidos em aberto no período.",
            "/api/vendas/clientes",
            vec![
                param("search", "query", "texto", false, "Parte do nome do cliente."),
                param("days", "query", "inteiro", false, "Janela em dias dos pedidos considerados."),
            ],
        ),
        Acao::leitura(
            "listar_pedidos_do_cliente",
            M,
            "Pedidos de um cliente, com itens.",
            "/api/vendas/clientes/:codigo/pedidos",
            vec![
                param("codigo", "caminho", "inteiro", true, "Código do cliente no ERP."),
                param("status", "query", "texto", false, "ativos, concluidos, ALL ou o código do status do ERP."),
                param("days", "query", "inteiro", false, "Só pedidos dos últimos N dias."),
            ],
        ),
        Acao::leitura(
            "listar_faltas_venda",
            M,
            "Produtos com falta nos pedidos em aberto (ativas e históricas), com estoque, produção e compras em trânsito.",
            "/api/vendas/faltas",
            vec![param("days", "query", "inteiro", false, "Janela em dias dos pedidos considerados.")],
        ),
        Acao::gravacao(
            "alterar_janela_faltas_venda",
            M,
            "Altera a janela padrão (dias) das telas de Vendas (Pedidos, Faltas, Clientes). A prévia mostra o valor de antes e o de depois.",
            "PUT",
            "/api/vendas/janela-faltas",
            true,
            vec![
                param("dias", "corpo", "inteiro", true, "Janela em dias (1 a 365; 0 = sem limite)."),
                param("confirmar", "query", "booleano", false, "true grava; sem ele só a prévia."),
            ],
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::paginacao;

    #[test]
    fn sem_parametros_nao_pagina() {
        assert_eq!(paginacao(None, None), None);
    }

    #[test]
    fn calcula_limite_e_offset() {
        assert_eq!(paginacao(Some(50), Some(1)), Some((50, 0)));
        assert_eq!(paginacao(Some(50), Some(3)), Some((50, 100)));
        assert_eq!(paginacao(Some(50), None), Some((50, 0)));
        assert_eq!(paginacao(None, Some(2)), Some((100, 100)));
    }

    #[test]
    fn limites_fora_da_faixa_sao_ajustados() {
        assert_eq!(paginacao(Some(0), Some(0)), Some((1, 0)));
        assert_eq!(paginacao(Some(99999), Some(-4)), Some((1000, 0)));
    }
}
