use axum::{
    extract::{State, Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;
use sqlx::Row;
use crate::handlers::AppState;
use super::models::Invoice;

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

use crate::models::PendingPurchaseOrderInfo;

// GET /api/compras/pedidos
pub async fn list_purchase_orders(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PedidosQueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool().clone();

    let mut query = "SELECT n_registro, n_pedido, d_pedido, n_cod_fornec, c_nome_f, c_usuario, c_status, c_prazo_pgto, c_prev_entrega, n_valor, d_previsao, c_email, m_observac FROM purchase_orders WHERE 1=1".to_string();
    let mut args: Vec<String> = Vec::new();
    let mut idx = 1;

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
                    query.push_str(&format!(" AND c_status = ${}", idx));
                    args.push(status.clone());
                    idx += 1;
                }
            }
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            query.push_str(&format!(
                " AND (c_nome_f LIKE ${} OR CAST(n_pedido AS TEXT) LIKE ${})",
                idx,
                idx + 1
            ));
            let like_arg = format!("%{}%", search.trim());
            args.push(like_arg.clone());
            args.push(like_arg);
        }
    }

    query.push_str(" ORDER BY d_pedido DESC, n_pedido DESC");

    let mut q = sqlx::query(&query);
    for arg in &args {
        q = q.bind(arg);
    }

    match q.fetch_all(&pool).await {
        Ok(rows) => {
            let list: Vec<PurchaseOrderResponse> = rows
                .iter()
                .map(|row| PurchaseOrderResponse {
                    n_registro: row.get(0),
                    n_pedido: row.get(1),
                    d_pedido: row.get(2),
                    n_cod_fornec: row.get(3),
                    c_nome_f: row.get(4),
                    c_usuario: row.get(5),
                    c_status: row.get(6),
                    c_prazo_pgto: row.get(7),
                    c_prev_entrega: row.get(8),
                    n_valor: row.get(9),
                    d_previsao: row.get(10),
                    c_email: row.get(11),
                    m_observac: row.get(12),
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

// GET /api/compras/pedidos/:id
pub async fn get_purchase_order_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> impl IntoResponse {
    let pool = state.db.pool().clone();

    let header_res = sqlx::query(
        "SELECT n_registro, n_pedido, d_pedido, n_cod_fornec, c_nome_f, c_usuario, c_status, c_prazo_pgto, c_prev_entrega, n_valor, d_previsao, c_email, m_observac FROM purchase_orders WHERE n_registro = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    let header = match header_res {
        Ok(Some(row)) => PurchaseOrderResponse {
            n_registro: row.get(0),
            n_pedido: row.get(1),
            d_pedido: row.get(2),
            n_cod_fornec: row.get(3),
            c_nome_f: row.get(4),
            c_usuario: row.get(5),
            c_status: row.get(6),
            c_prazo_pgto: row.get(7),
            c_prev_entrega: row.get(8),
            n_valor: row.get(9),
            d_previsao: row.get(10),
            c_email: row.get(11),
            m_observac: row.get(12),
        },
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

    let items = match sqlx::query(
        "SELECT id, n_pedido_registro, n_pedido, c_referencia, n_qtde, n_preco, n_chegou, c_descricao, c_unidade, n_valor_total, n_registro, c_chegada FROM purchase_order_items WHERE n_pedido_registro = $1 ORDER BY id ASC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    {
        Ok(rows) => rows
            .iter()
            .map(|row| PurchaseOrderItemResponse {
                id: row.get(0),
                n_pedido_registro: row.get(1),
                n_pedido: row.get(2),
                c_referencia: row.get(3),
                n_qtde: row.get(4),
                n_preco: row.get(5),
                n_chegou: row.get(6),
                c_descricao: row.get(7),
                c_unidade: row.get(8),
                n_valor_total: row.get(9),
                n_registro: row.get(10),
                c_chegada: row.get(11),
            })
            .collect(),
        Err(_) => Vec::new(),
    };

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
    pub items: Vec<Invoice>,
    pub cfop: Option<String>,
    pub icms_value: f64,
    pub ipi_value: f64,
    pub freight_value: f64,
    pub entry_date: Option<String>,
    pub carrier_name: Option<String>,
    pub supplier_cnpj: Option<String>,
    pub payment_installments: Option<String>,
    pub fte_number: Option<String>,
    pub fte_value: f64,
    pub fte_carrier_name: Option<String>,
    pub fte_carrier_cnpj: Option<String>,
    pub fte_issue_date: Option<String>,
    pub fte_entry_date: Option<String>,
    pub fte_cif_fob: Option<String>,
    pub fte_serie: Option<String>,
    pub fte_cfop: Option<String>,
    pub fte_natureza: Option<String>,
    pub fte_icms_value: f64,
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
    let pool = state.db.pool().clone();

    let mut query = "
        SELECT invoice_number, invoice_date, supplier_id, supplier_name, SUM(total_value) as total_val, COUNT(*) as items_count 
        FROM invoices 
        WHERE 1=1
    "
    .to_string();

    let mut args: Vec<String> = Vec::new();
    let mut idx = 1;

    if let Some(ref supplier_id) = params.supplier_id {
        if !supplier_id.is_empty() {
            query.push_str(&format!(" AND supplier_id = ${}", idx));
            args.push(supplier_id.clone());
            idx += 1;
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            query.push_str(&format!(
                " AND (supplier_name LIKE ${} OR invoice_number LIKE ${})",
                idx,
                idx + 1
            ));
            let like_arg = format!("%{}%", search.trim());
            args.push(like_arg.clone());
            args.push(like_arg);
        }
    }

    query.push_str(" GROUP BY invoice_number, supplier_id, supplier_name, invoice_date ORDER BY invoice_date DESC, invoice_number DESC");

    let mut q = sqlx::query(&query);
    for arg in &args {
        q = q.bind(arg);
    }

    match q.fetch_all(&pool).await {
        Ok(rows) => {
            let list: Vec<InvoiceHeaderResponse> = rows
                .iter()
                .map(|row| InvoiceHeaderResponse {
                    invoice_number: row.get(0),
                    invoice_date: row.get(1),
                    supplier_id: row.get(2),
                    supplier_name: row.get(3),
                    total_value: row.get(4),
                    items_count: crate::core::pg_row::pg_i32(row, 5),
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

// GET /api/compras/notas/:number
pub async fn get_invoice_detail(
    State(state): State<Arc<AppState>>,
    Path(number): Path<String>,
    Query(params): Query<InvoiceDetailQueryParams>,
) -> impl IntoResponse {
    let pool = state.db.pool().clone();

    let mut query = "
        SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date,
               cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments,
               fte_number, COALESCE(fte_value, 0.0), fte_carrier_name, fte_carrier_cnpj, fte_issue_date, fte_entry_date, fte_cif_fob,
               fte_serie, fte_cfop, fte_natureza, COALESCE(fte_icms_value, 0.0)
        FROM invoices 
        WHERE invoice_number = $1
    "
    .to_string();

    let mut args: Vec<String> = vec![number.clone()];
    if let Some(ref supplier_id) = params.supplier_id {
        if !supplier_id.is_empty() {
            query.push_str(" AND supplier_id = $2");
            args.push(supplier_id.clone());
        }
    }

    let mut q = sqlx::query(&query);
    for arg in &args {
        q = q.bind(arg);
    }

    let items: Vec<Invoice> = match q.fetch_all(&pool).await {
        Ok(rows) => rows
            .iter()
            .map(|row| Invoice {
                id: row.get(0),
                invoice_number: row.get(1),
                item_code: row.get(2),
                description: row.get(3),
                unit: row.get(4),
                quantity: row.get(5),
                unit_price: row.get(6),
                total_value: row.get(7),
                supplier_name: row.get(8),
                supplier_id: row.get(9),
                invoice_date: row.get(10),
                cfop: row.get(11),
                icms_value: row.get(12),
                ipi_value: row.get(13),
                freight_value: row.get(14),
                entry_date: row.get(15),
                carrier_name: row.get(16),
                supplier_cnpj: row.get(17),
                payment_installments: row.get(18),
                fte_number: row.get(19),
                fte_value: row.get(20),
                fte_carrier_name: row.get(21),
                fte_carrier_cnpj: row.get(22),
                fte_issue_date: row.get(23),
                fte_entry_date: row.get(24),
                fte_cif_fob: row.get(25),
                fte_serie: row.get(26),
                fte_cfop: row.get(27),
                fte_natureza: row.get(28),
                fte_icms_value: row.get(29),
            })
            .collect(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if items.is_empty() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Nota fiscal não encontrada" })),
        )
            .into_response();
    }

    let first = items[0].clone();
    let total_value: f64 = items.iter().map(|it| it.total_value).sum();
    let icms_value: f64 = items.iter().map(|it| it.icms_value).sum();
    let ipi_value: f64 = items.iter().map(|it| it.ipi_value).sum();

    let detail = InvoiceDetailResponse {
        invoice_number: first.invoice_number.clone(),
        invoice_date: first.invoice_date.clone(),
        supplier_id: first.supplier_id.clone(),
        supplier_name: first.supplier_name.clone(),
        total_value,
        items,
        cfop: first.cfop.clone(),
        icms_value,
        ipi_value,
        freight_value: first.freight_value,
        entry_date: first.entry_date.clone(),
        carrier_name: first.carrier_name.clone(),
        supplier_cnpj: first.supplier_cnpj.clone(),
        payment_installments: first.payment_installments.clone(),
        fte_number: first.fte_number.clone(),
        fte_value: first.fte_value,
        fte_carrier_name: first.fte_carrier_name.clone(),
        fte_carrier_cnpj: first.fte_carrier_cnpj.clone(),
        fte_issue_date: first.fte_issue_date.clone(),
        fte_entry_date: first.fte_entry_date.clone(),
        fte_cif_fob: first.fte_cif_fob.clone(),
        fte_serie: first.fte_serie.clone(),
        fte_cfop: first.fte_cfop.clone(),
        fte_natureza: first.fte_natureza.clone(),
        fte_icms_value: first.fte_icms_value,
    };

    (StatusCode::OK, Json(detail)).into_response()
}

// GET /api/estoque/item-info/:code
pub async fn get_item_extra_info(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool().clone();
    let code_clean = code.replace(".", "");

    let mut invoices = Vec::new();
    let mut pending_orders = Vec::new();
    let mut formulation = Vec::new();
    let mut lotes = Vec::new();

    if let Ok(rows) = sqlx::query(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date,
                cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments
         FROM invoices WHERE item_code = $1 OR item_code = $2 ORDER BY invoice_date DESC LIMIT 10",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        invoices = rows
            .iter()
            .map(|row| Invoice {
                id: row.get(0),
                invoice_number: row.get(1),
                item_code: row.get(2),
                description: row.get(3),
                unit: row.get(4),
                quantity: row.get(5),
                unit_price: row.get(6),
                total_value: row.get(7),
                supplier_name: row.get(8),
                supplier_id: row.get(9),
                invoice_date: row.get(10),
                cfop: row.get(11),
                icms_value: row.get(12),
                ipi_value: row.get(13),
                freight_value: row.get(14),
                entry_date: row.get(15),
                carrier_name: row.get(16),
                supplier_cnpj: row.get(17),
                payment_installments: row.get(18),
                ..Default::default()
            })
            .collect();
    }

    if let Ok(rows) = sqlx::query(
        "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, poi.n_preco 
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE (poi.c_referencia = $1 OR poi.c_referencia = $2)
           AND po.c_status <> 'T'
           AND poi.n_chegou < poi.n_qtde
         ORDER BY po.d_pedido DESC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        pending_orders = rows
            .iter()
            .map(|row| PendingPurchaseOrderInfo {
                n_pedido: row.get(0),
                d_pedido: row.get(1),
                c_nome_f: row.get(2),
                n_qtde: row.get(3),
                n_chegou: row.get(4),
                n_preco: row.get(5),
            })
            .collect();
    }

    if let Ok(rows) = sqlx::query(
        "SELECT product_code, ingredient_code, description, quantity, percentage FROM formulations 
         WHERE product_code = $1 OR product_code = $2 OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = $1) OR ($1 LIKE '0%' AND product_code = SUBSTR($1, 2))
         ORDER BY quantity DESC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        formulation = rows
            .iter()
            .map(|row| crate::models::FormulationLine {
                product_code: row.get(0),
                ingredient_code: row.get(1),
                description: row.get(2),
                quantity: row.get(3),
                percentage: row.get(4),
            })
            .collect();
    }

    let mut used_in = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT f.product_code, f.ingredient_code, p.descricao, f.quantity, f.percentage 
         FROM formulations f 
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         WHERE f.ingredient_code = $1 OR f.ingredient_code = $2
         ORDER BY p.descricao ASC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        used_in = rows
            .iter()
            .map(|row| crate::models::FormulationLine {
                product_code: row.get(0),
                ingredient_code: row.get(1),
                description: row.get(2),
                quantity: row.get(3),
                percentage: row.get(4),
            })
            .collect();
    }

    if formulation.is_empty() {
        formulation = used_in.clone();
    }

    if let Ok(rows) = sqlx::query(
        "SELECT id, quantity, date, document_number, details 
         FROM stock_movements 
         WHERE (item_code = $1 OR item_code = $2) AND item_type = 'produto' AND movement_type = 'entrada'
         ORDER BY date DESC LIMIT 15",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        lotes = rows
            .iter()
            .map(|row| ProductLoteInfo {
                id: row.get(0),
                quantity: row.get(1),
                date: row.get(2),
                document_number: row.get(3),
                details: row.get(4),
            })
            .collect();
    }

    (
        StatusCode::OK,
        Json(json!({
            "invoices": invoices,
            "pendingOrders": pending_orders,
            "formulation": formulation,
            "usedIn": used_in,
            "lotes": lotes,
        })),
    )
        .into_response()
}

// GET /api/compras/insumos/:code/detalhes
pub async fn get_insumo_detalhes(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool().clone();

    let item_res = sqlx::query(
        "SELECT i.code, i.description, i.unit, i.notes, i.category_id, c.name, COALESCE(i.is_ignored, 0)
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.code = $1",
    )
    .bind(&code)
    .fetch_optional(&pool)
    .await;

    let (item_code, description, unit, notes, category_id, category_name, is_ignored) = match item_res {
        Ok(Some(row)) => (
            row.get::<String, _>(0),
            row.get::<String, _>(1),
            row.get::<String, _>(2),
            row.get::<Option<String>, _>(3),
            row.get::<Option<String>, _>(4),
            row.get::<Option<String>, _>(5),
            row.get::<i32, _>(6) != 0,
        ),
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Item não encontrado" })),
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

    let current_stock: f64 = sqlx::query_scalar(
        "SELECT stock_qty FROM stock_snapshots WHERE TRIM(item_code) = TRIM($1) ORDER BY snapshot_date DESC, id DESC LIMIT 1",
    )
    .bind(&code)
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(0.0);

    let (reserved_qty, in_production, in_orders) = match sqlx::query(
        "SELECT reserved_qty, in_production, in_orders FROM stock_snapshots WHERE TRIM(item_code) = TRIM($1) ORDER BY snapshot_date DESC, id DESC LIMIT 1",
    )
    .bind(&code)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(row)) => (
            row.get::<f64, _>(0),
            row.get::<f64, _>(1),
            row.get::<f64, _>(2),
        ),
        _ => (0.0, 0.0, 0.0),
    };
    let available_qty = current_stock - reserved_qty;

    let mut consumption_yoy = Vec::new();
    let code_clean = code.replace(".", "");
    if let Ok(rows) = sqlx::query(
        "SELECT year, SUM(total_qty), SUM(total_qty) / 12.0 FROM consumption WHERE item_code = $1 OR item_code = $2 GROUP BY year ORDER BY year DESC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        consumption_yoy = rows
            .iter()
            .map(|row| crate::models::ConsumptionYoYItem {
                year: row.get(0),
                total_qty: row.get(1),
                monthly_avg: row.get(2),
            })
            .collect();
    }

    let mut monthly_purchases = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT to_char(invoice_date::date, 'YYYY-MM') as year_month, SUM(quantity) 
         FROM invoices 
         WHERE (item_code = $1 OR item_code = $2) AND invoice_date::date <= CURRENT_DATE
         GROUP BY year_month 
         ORDER BY year_month ASC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        monthly_purchases = rows
            .iter()
            .map(|row| crate::models::MonthlyPurchaseItem {
                month: row.get::<String, _>(0),
                qty: row.get::<f64, _>(1),
            })
            .collect();
    }

    let mut monthly_consumption = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT to_char(date::date, 'YYYY-MM') as year_month, SUM(quantity) 
         FROM stock_movements 
         WHERE (item_code = $1 OR item_code = $2) AND movement_type = 'saida' AND item_type = 'insumo' AND date::date <= CURRENT_DATE
         GROUP BY year_month 
         ORDER BY year_month ASC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        monthly_consumption = rows
            .iter()
            .map(|row| crate::models::MonthlyConsumptionItem {
                month: row.get::<String, _>(0),
                qty: row.get::<f64, _>(1),
            })
            .collect();
    }

    let mut recent_invoices = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT invoice_number, quantity, unit_price, total_value, supplier_name, invoice_date,
                cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments
         FROM invoices 
         WHERE (item_code = $1 OR item_code = $2) AND invoice_date::date <= CURRENT_DATE
         ORDER BY invoice_date DESC LIMIT 15",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        recent_invoices = rows
            .iter()
            .map(|row| crate::models::InsumoInvoiceItem {
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
            })
            .collect();
    }

    let last_used: Option<(String, String)> = match sqlx::query(
        "SELECT date, document_number FROM stock_movements 
         WHERE (item_code = $1 OR item_code = $2) AND item_type = 'insumo' AND movement_type = 'saida' AND date::date <= CURRENT_DATE
         ORDER BY date DESC LIMIT 1",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(row)) => Some((
            row.get::<String, _>(0),
            row.get::<Option<String>, _>(1).unwrap_or_default(),
        )),
        _ => None,
    };

    let (last_used_date, last_used_lote) = match last_used {
        Some((date, lote)) => (Some(date), Some(lote)),
        None => (None, None),
    };

    let last_received: Option<(String, String)> = match sqlx::query(
        "SELECT invoice_date, invoice_number FROM invoices 
         WHERE (item_code = $1 OR item_code = $2) AND invoice_date::date <= CURRENT_DATE
         ORDER BY invoice_date DESC LIMIT 1",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(row)) => Some((row.get::<String, _>(0), row.get::<String, _>(1))),
        _ => None,
    };

    let (last_received_date, last_received_doc) = match last_received {
        Some((date, doc)) => (Some(date), Some(doc)),
        None => (None, None),
    };

    let mut consumed_since_last_received = None;
    let mut days_since_last_received = None;
    let mut avg_monthly_since_last_received = None;

    if let Some(ref lr_date) = last_received_date {
        let sum_qty: Option<f64> = sqlx::query_scalar::<_, Option<f64>>(
            "SELECT SUM(quantity) FROM stock_movements 
             WHERE (item_code = $1 OR item_code = $2) 
               AND movement_type = 'saida' 
               AND item_type = 'insumo' 
               AND date >= $3",
        )
        .bind(&code)
        .bind(&code_clean)
        .bind(lr_date)
        .fetch_one(&pool)
        .await
        .ok()
        .flatten();

        if let Some(val) = sum_qty {
            consumed_since_last_received = Some(val);
            let date_part = lr_date.split(' ').next().unwrap_or("");
            if let Ok(lr_naive) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                let today = chrono::Local::now().naive_local().date();
                let duration = today.signed_duration_since(lr_naive);
                let days = duration.num_days().max(0);
                days_since_last_received = Some(days);
                if days > 0 {
                    avg_monthly_since_last_received = Some((val / (days as f64)) * 30.0);
                } else {
                    avg_monthly_since_last_received = Some(val);
                }
            }
        }
    }

    let mut products_used_in: Vec<crate::models::InsumoUsedInProductItem> = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT f.product_code, p.descricao, f.quantity 
         FROM formulations f
         LEFT JOIN produtos p ON (
             f.product_code = p.codigo OR
             (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = p.codigo) OR
             (p.codigo LIKE '0%' AND f.product_code = SUBSTR(p.codigo, 2))
         )
         WHERE f.ingredient_code = $1
         ORDER BY f.product_code ASC",
    )
    .bind(&code)
    .fetch_all(&pool)
    .await
    {
        for row in &rows {
            let item = crate::models::InsumoUsedInProductItem {
                product_code: row.get(0),
                description: row.get::<Option<String>, _>(1).unwrap_or_default(),
                quantity: row.get(2),
            };
            if let Some(existing) = products_used_in
                .iter_mut()
                .find(|x| x.product_code == item.product_code)
            {
                existing.quantity += item.quantity;
            } else {
                products_used_in.push(item);
            }
        }
    }

    let mut pending_orders = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, poi.n_preco 
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE (poi.c_referencia = $1 OR poi.c_referencia = $2)
           AND po.c_status <> 'T'
           AND poi.n_chegou < poi.n_qtde
         ORDER BY po.d_pedido DESC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        pending_orders = rows
            .iter()
            .map(|row| PendingPurchaseOrderInfo {
                n_pedido: row.get(0),
                d_pedido: row.get(1),
                c_nome_f: row.get(2),
                n_qtde: row.get(3),
                n_chegou: row.get(4),
                n_preco: row.get(5),
            })
            .collect();
    }

    let mut all_orders = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT po.n_pedido, po.d_pedido, po.c_nome_f, poi.n_qtde, poi.n_chegou, poi.n_preco 
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE (poi.c_referencia = $1 OR poi.c_referencia = $2)
         ORDER BY po.d_pedido DESC LIMIT 100",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        all_orders = rows
            .iter()
            .map(|row| PendingPurchaseOrderInfo {
                n_pedido: row.get(0),
                d_pedido: row.get(1),
                c_nome_f: row.get(2),
                n_qtde: row.get(3),
                n_chegou: row.get(4),
                n_preco: row.get(5),
            })
            .collect();
    }

    let mut quotations = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT q.id, q.title, q.status, qi.recommended_qty, qi.approved_qty, qi.final_qty, q.created_at
         FROM quotation_items qi
         INNER JOIN quotations q ON qi.quotation_id = q.id
         WHERE qi.item_code = $1 OR qi.item_code = $2
         ORDER BY q.created_at DESC",
    )
    .bind(&code)
    .bind(&code_clean)
    .fetch_all(&pool)
    .await
    {
        quotations = rows
            .iter()
            .map(|row| crate::models::InsumoQuotationItem {
                id: row.get(0),
                title: row.get(1),
                status: row.get(2),
                recommended_qty: row.get(3),
                approved_qty: row.get(4),
                final_qty: row.get(5),
                created_at: row.get(6),
            })
            .collect();
    }

    let mut open_production_orders = Vec::new();
    // Mesmo critério de lote aberto que demands.rs (remaining_reserved).
    if let Ok(rows) = sqlx::query(
        "SELECT m.document_number, m.item_code, p.descricao, m.quantity, m.date, m.details
          FROM stock_movements m
          LEFT JOIN produtos p ON p.codigo = m.item_code
          WHERE m.item_type = 'produto' AND m.movement_type = 'entrada'
          AND COALESCE(m.document_number, '') <> ''
          AND m.details IS NOT NULL
          AND COALESCE(m.details, '') NOT LIKE '%Status: EA%'
          AND COALESCE(m.details, '') NOT LIKE '%Status: CF%'
          AND COALESCE(m.details, '') NOT LIKE '%Status: FP%'
          AND COALESCE(m.details, '') NOT LIKE '%Status: CA%'
          AND COALESCE(m.details, '') NOT LIKE '%Status: FI%'
          AND EXISTS (
              SELECT 1 FROM formulations f
              WHERE (f.product_code = m.item_code 
                 OR (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = m.item_code) 
                 OR (m.item_code LIKE '0%' AND f.product_code = SUBSTR(m.item_code, 2)))
              AND f.ingredient_code = $1
          )
          ORDER BY m.date DESC
          LIMIT 200",
    )
    .bind(&code)
    .fetch_all(&pool)
    .await
    {
        struct RawOpenOP {
            lote_number: String,
            product_code: String,
            product_description: String,
            quantity_produced: f64,
            production_date: String,
            details: String,
        }

        for row in rows {
            let raw_op = RawOpenOP {
                lote_number: row
                    .get::<Option<String>, _>(0)
                    .unwrap_or_default(),
                product_code: row.get(1),
                product_description: row
                    .get::<Option<String>, _>(2)
                    .unwrap_or_default(),
                quantity_produced: row.get(3),
                production_date: row.get(4),
                details: row.get::<Option<String>, _>(5).unwrap_or_default(),
            };

            let mut status = String::new();
            let mut d_pesado = String::new();
            let mut unidades = 0.0;
            for part in raw_op.details.split('|') {
                let part = part.trim();
                if part.starts_with("Status:") {
                    status = part.trim_start_matches("Status:").trim().to_string();
                } else if part.starts_with("dPesado:") {
                    d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                } else if part.starts_with("Unidades:") {
                    unidades = part
                        .trim_start_matches("Unidades:")
                        .trim()
                        .replace(',', ".")
                        .parse::<f64>()
                        .unwrap_or(0.0);
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
            }
            .to_string();

            let mut insumo_qty_per_unit = 0.0;
            let mut is_un_packaging = false;
            if let Ok(Some(row_form)) = sqlx::query(
                "SELECT f.quantity, COALESCE(f.percentage, 0.0), COALESCE(i.unit, 'UN')
                 FROM formulations f
                 LEFT JOIN items i ON i.code = f.ingredient_code
                 WHERE (f.product_code = $1 
                    OR (f.product_code LIKE '0%' AND SUBSTR(f.product_code, 2) = $1) 
                    OR ($1 LIKE '0%' AND f.product_code = SUBSTR($1, 2)))
                 AND f.ingredient_code = $2",
            )
            .bind(&raw_op.product_code)
            .bind(&code)
            .fetch_optional(&pool)
            .await
            {
                let qty: f64 = row_form.get(0);
                let pct: f64 = row_form.get(1);
                let unit: String = row_form.get::<String, _>(2).trim().to_uppercase();
                is_un_packaging = unit == "UN";
                if pct > 0.0 {
                    insumo_qty_per_unit = pct / 100.0;
                } else if is_un_packaging {
                    insumo_qty_per_unit = qty;
                } else {
                    let sum: f64 = sqlx::query_scalar(
                        "SELECT SUM(quantity) FROM formulations 
                         WHERE (product_code = $1 
                            OR (product_code LIKE '0%' AND SUBSTR(product_code, 2) = $1) 
                            OR ($1 LIKE '0%' AND product_code = SUBSTR($1, 2)))
                           AND COALESCE((SELECT unit FROM items WHERE code = formulations.ingredient_code), '') <> 'UN'",
                    )
                    .bind(&raw_op.product_code)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0.0);
                    if sum > 0.0 {
                        insumo_qty_per_unit = qty / sum;
                    }
                }
            }

            let batch_basis = if is_un_packaging && unidades > 0.0 {
                unidades
            } else {
                raw_op.quantity_produced
            };
            let fallback_qty_needed = batch_basis * insumo_qty_per_unit;

            let insumo_qty_needed = crate::core::production_reserve::insumo_qty_needed_for_lote(
                &pool,
                &raw_op.lote_number,
                &code,
                fallback_qty_needed,
            )
            .await;

            let insumo_qty_weighed: f64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(quantity), 0.0) FROM stock_movements
                 WHERE document_number = $1 AND item_code = $2 AND movement_type = 'saida'",
            )
            .bind(&raw_op.lote_number)
            .bind(&code)
            .fetch_one(&pool)
            .await
            .unwrap_or(0.0);

            let pesagem_completed = !d_pesado.is_empty();

            let is_closed_status = status == "EA"
                || status == "CF"
                || status == "FP"
                || status == "CA"
                || status == "FI";

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

    let simulation = crate::modules::compras::planejamento::commands::get_insumo_simulation_breakdown(
        &pool, &code,
    )
    .await;

    let response = crate::models::InsumoDetalhesResponse {
        code: item_code,
        description,
        unit,
        notes,
        category_id,
        category_name,
        is_ignored,
        current_stock,
        reserved_qty,
        in_production,
        in_orders,
        available_qty,
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
        all_orders,
        quotations,
        open_production_orders,
        consumed_since_last_received,
        days_since_last_received,
        avg_monthly_since_last_received,
        simulation,
    };

    (StatusCode::OK, Json(response)).into_response()
}
