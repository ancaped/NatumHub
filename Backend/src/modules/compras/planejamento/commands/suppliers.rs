use sqlx::{PgPool, Row};

use crate::modules::compras::planejamento::models::*;

pub async fn get_suppliers_query(
    pool: PgPool,
    parent_category_id: Option<String>,
) -> Result<Vec<Supplier>, String> {
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes
                 FROM suppliers s
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                     WHERE (
                         op.categoria_produto = '{parent_id}'
                         OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                         OR (op.categoria_produto IS NULL AND {prefix_cond})
                     )
                 ) ORDER BY s.name"
            )
        } else {
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes
                 FROM suppliers s
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}'
                 ) OR s.id IN (
                     SELECT DISTINCT qp.supplier_id FROM quotation_prices qp
                     INNER JOIN quotation_items qi ON qp.quotation_item_id = qi.id
                     INNER JOIN items i ON qi.item_code = i.code
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}'
                 ) ORDER BY s.name"
            )
        }
    } else {
        "SELECT id, name, contact, email, notes FROM suppliers ORDER BY name".to_string()
    };

    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Supplier {
            id: row.get(0),
            name: row.get(1),
            contact: row.get(2),
            email: row.get(3),
            notes: row.get(4),
        })
        .collect())
}

pub async fn save_supplier_query(pool: PgPool, supplier: &Supplier) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO suppliers (id, name, contact, email, notes) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, contact = EXCLUDED.contact, email = EXCLUDED.email, notes = EXCLUDED.notes",
    )
    .bind(&supplier.id)
    .bind(&supplier.name)
    .bind(&supplier.contact)
    .bind(&supplier.email)
    .bind(&supplier.notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_supplier_history_query(pool: PgPool, id: &str) -> Result<serde_json::Value, String> {
    let inv_rows = sqlx::query(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date,
                cfop, COALESCE(icms_value, 0.0), COALESCE(ipi_value, 0.0), COALESCE(freight_value, 0.0), entry_date, carrier_name, supplier_cnpj, payment_installments
         FROM invoices WHERE supplier_id = $1 ORDER BY invoice_date DESC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let invoices: Vec<Invoice> = inv_rows
        .into_iter()
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

    let pp_rows = sqlx::query(
        "SELECT invoice_date, unit_price, supplier_name, invoice_number
         FROM invoices WHERE supplier_id = $1 AND unit_price > 0 ORDER BY invoice_date",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let price_points: Vec<PricePoint> = pp_rows
        .into_iter()
        .map(|row| PricePoint {
            date: row.get(0),
            unit_price: row.get(1),
            supplier_name: row.get(2),
            invoice_number: row.get(3),
        })
        .collect();

    Ok(serde_json::json!({
        "invoices": invoices,
        "pricePoints": price_points
    }))
}

pub async fn get_price_evolution_query(pool: PgPool, item_code: &str) -> Result<Vec<PricePoint>, String> {
    let rows = sqlx::query(
        "SELECT invoice_date, unit_price, COALESCE(supplier_name,''), invoice_number
         FROM invoices WHERE item_code = $1 AND unit_price > 0
         ORDER BY invoice_date",
    )
    .bind(item_code)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| PricePoint {
            date: row.get(0),
            unit_price: row.get(1),
            supplier_name: row.get(2),
            invoice_number: row.get(3),
        })
        .collect())
}

pub async fn get_spending_by_supplier_query(
    pool: PgPool,
    start: &str,
    end: &str,
    parent_category_id: Option<String>,
) -> Result<Vec<SupplierSpend>, String> {
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT COALESCE(inv.supplier_id,'unknown'), COALESCE(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC"
            )
        } else {
            format!(
                "SELECT COALESCE(inv.supplier_id,'unknown'), COALESCE(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND COALESCE(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}')
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC"
            )
        }
    } else {
        "SELECT COALESCE(inv.supplier_id,'unknown'), COALESCE(inv.supplier_name,'Desconhecido'),
                SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2 AND COALESCE(i.is_ignored, 0) = 0
         GROUP BY inv.supplier_id, inv.supplier_name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let rows = sqlx::query(&sql)
        .bind(start)
        .bind(end)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| SupplierSpend {
            supplier_id: row.get(0),
            supplier_name: row.get(1),
            total_value: row.get(2),
            invoice_count: row.get(3),
        })
        .collect())
}

pub async fn get_spending_by_category_query(
    pool: PgPool,
    start: &str,
    end: &str,
    parent_category_id: Option<String>,
) -> Result<Vec<CategorySpend>, String> {
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "p.codigo LIKE '1.34.%'"
            } else {
                "p.codigo LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" {
                "cat_coloracao"
            } else {
                "cat_apoio"
            };
            format!(
                "SELECT COALESCE(p.linha_prefix,'unknown'), COALESCE(cl.nome_linha,'Sem Linha'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN produtos p ON inv.item_code = p.codigo
                 LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
                 LEFT JOIN overrides_produtos op ON op.codigo = p.codigo
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY p.linha_prefix, cl.nome_linha
                 ORDER BY SUM(inv.total_value) DESC"
            )
        } else {
            format!(
                "SELECT COALESCE(i.category_id,'uncategorized'), COALESCE(c.name,'Sem Categoria'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2
                   AND COALESCE(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent_cat}' OR c.id = '{parent_cat}')
                 GROUP BY i.category_id, c.name
                 ORDER BY SUM(inv.total_value) DESC"
            )
        }
    } else {
        "SELECT COALESCE(i.category_id,'uncategorized'), COALESCE(c.name,'Sem Categoria'),
                SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2 AND COALESCE(i.is_ignored, 0) = 0
         GROUP BY i.category_id, c.name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let rows = sqlx::query(&sql)
        .bind(start)
        .bind(end)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| CategorySpend {
            category_id: row.get(0),
            category_name: row.get(1),
            total_value: row.get(2),
            item_count: crate::core::pg_row::pg_i32(&row, 3),
        })
        .collect())
}

use tauri::State;
use crate::DbState;

#[tauri::command]
pub fn get_suppliers(_state: State<DbState>, _parent_category_id: Option<String>) -> Result<Vec<Supplier>, String> {
    Err("Use a API REST (/api/hub/compras/suppliers)".into())
}

#[tauri::command]
pub fn save_supplier(_state: State<DbState>, _supplier: Supplier) -> Result<(), String> {
    Err("Use a API REST (/api/hub/compras/suppliers)".into())
}

#[tauri::command]
pub fn get_supplier_history(_state: State<DbState>, _id: String) -> Result<serde_json::Value, String> {
    Err("Use a API REST (/api/hub/compras/suppliers/:id/history)".into())
}

#[tauri::command]
pub fn get_price_evolution(_state: State<DbState>, _item_code: String) -> Result<Vec<PricePoint>, String> {
    Err("Use a API REST (/api/hub/compras/price-evolution)".into())
}

#[tauri::command]
pub fn get_spending_by_supplier(
    _state: State<DbState>,
    _start: String,
    _end: String,
    _parent_category_id: Option<String>,
) -> Result<Vec<SupplierSpend>, String> {
    Err("Use a API REST (/api/hub/compras/spending/supplier)".into())
}

#[tauri::command]
pub fn get_spending_by_category(
    _state: State<DbState>,
    _start: String,
    _end: String,
    _parent_category_id: Option<String>,
) -> Result<Vec<CategorySpend>, String> {
    Err("Use a API REST (/api/hub/compras/spending/category)".into())
}
