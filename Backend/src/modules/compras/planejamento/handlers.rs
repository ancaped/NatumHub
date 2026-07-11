use axum::{
    extract::{State, Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;
use rusqlite::params;
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
    pub items: Vec<Invoice>,
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
        Ok(Invoice {
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
            Ok(Invoice {
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
        "SELECT i.code, i.description, i.unit, i.notes, i.category_id, c.name, IFNULL(i.is_ignored, 0)
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
                row.get::<_, i32>(6)? != 0,
            ))
        }
    );

    let (item_code, description, unit, notes, category_id, category_name, is_ignored) = match item_res {
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

    let mut consumed_since_last_received = None;
    let mut days_since_last_received = None;
    let mut avg_monthly_since_last_received = None;

    if let Some(ref lr_date) = last_received_date {
        let sum_qty: Option<f64> = conn.query_row(
            "SELECT SUM(quantity) FROM stock_movements 
             WHERE (item_code = ?1 OR item_code = ?2) 
               AND movement_type = 'saida' 
               AND item_type = 'insumo' 
               AND date >= ?3",
            params![code, code_clean, lr_date],
            |row| row.get(0)
        ).unwrap_or(None);

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
        is_ignored,
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
        consumed_since_last_received,
        days_since_last_received,
        avg_monthly_since_last_received,
    };

    (StatusCode::OK, Json(response)).into_response()
}
