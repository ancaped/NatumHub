use tauri::State;
use rusqlite::{params, Connection};

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

pub fn get_suppliers_conn(conn: &Connection, parent_category_id: Option<String>) -> Result<Vec<Supplier>, String> {
    let sql = if let Some(ref parent_cat) = parent_category_id {
        if parent_cat == "coloracao" || parent_cat == "apoio" {
            let prefix_cond = if parent_cat == "coloracao" {
                "inv.item_code LIKE '1.34.%'"
            } else {
                "inv.item_code LIKE '1.30.%'"
            };
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
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
                 ) ORDER BY s.name",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT DISTINCT s.id, s.name, s.contact, s.email, s.notes 
                 FROM suppliers s
                 WHERE s.id IN (
                     SELECT DISTINCT inv.supplier_id FROM invoices inv
                     INNER JOIN items i ON inv.item_code = i.code OR replace(inv.item_code, '.', '') = replace(i.code, '.', '')
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent}' OR c.id = '{parent}'
                 ) OR s.id IN (
                     SELECT DISTINCT qp.supplier_id FROM quotation_prices qp
                     INNER JOIN quotation_items qi ON qp.quotation_item_id = qi.id
                     INNER JOIN items i ON qi.item_code = i.code
                     INNER JOIN categories c ON i.category_id = c.id
                     WHERE c.parent_id = '{parent}' OR c.id = '{parent}'
                 ) ORDER BY s.name",
                parent = parent_cat
            )
        }
    } else {
        "SELECT id, name, contact, email, notes FROM suppliers ORDER BY name".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            name: row.get(1)?,
            contact: row.get(2)?,
            email: row.get(3)?,
            notes: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_suppliers(state: State<DbState>, parent_category_id: Option<String>) -> Result<Vec<Supplier>, String> {
    let conn = state.0.lock().unwrap();
    get_suppliers_conn(&conn, parent_category_id)
}

pub fn save_supplier_conn(conn: &Connection, supplier: &Supplier) -> Result<(), String> {
    conn.execute(
        "INSERT INTO suppliers (id, name, contact, email, notes) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?2, contact = ?3, email = ?4, notes = ?5",
        params![supplier.id, supplier.name, supplier.contact, supplier.email, supplier.notes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_supplier_conn(&conn, &supplier)
}

pub fn get_supplier_history_conn(conn: &Connection, id: &str) -> Result<serde_json::Value, String> {
    let mut inv_stmt = conn.prepare(
        "SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date
         FROM invoices WHERE supplier_id = ?1 ORDER BY invoice_date DESC"
    ).map_err(|e| e.to_string())?;
    let inv_rows = inv_stmt.query_map(params![id], |row| {
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
    }).map_err(|e| e.to_string())?;
    let mut invoices = Vec::new();
    for row in inv_rows {
        invoices.push(row.map_err(|e| e.to_string())?);
    }

    let mut pp_stmt = conn.prepare(
        "SELECT invoice_date, unit_price, supplier_name, invoice_number
         FROM invoices WHERE supplier_id = ?1 AND unit_price > 0 ORDER BY invoice_date"
    ).map_err(|e| e.to_string())?;
    let pp_rows = pp_stmt.query_map(params![id], |row| {
        Ok(PricePoint {
            date: row.get(0)?,
            unit_price: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut price_points = Vec::new();
    for row in pp_rows {
        price_points.push(row.map_err(|e| e.to_string())?);
    }

    Ok(serde_json::json!({
        "invoices": invoices,
        "pricePoints": price_points
    }))
}

#[tauri::command]
pub fn get_supplier_history(state: State<DbState>, id: String) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().unwrap();
    get_supplier_history_conn(&conn, &id)
}

pub fn get_price_evolution_conn(conn: &Connection, item_code: &str) -> Result<Vec<PricePoint>, String> {
    let mut stmt = conn.prepare(
        "SELECT invoice_date, unit_price, IFNULL(supplier_name,''), invoice_number
         FROM invoices WHERE item_code = ?1 AND unit_price > 0
         ORDER BY invoice_date"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![item_code], |row| {
        Ok(PricePoint {
            date: row.get(0)?,
            unit_price: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| e.to_string())?);
    }
    Ok(points)
}

#[tauri::command]
pub fn get_price_evolution(state: State<DbState>, item_code: String) -> Result<Vec<PricePoint>, String> {
    let conn = state.0.lock().unwrap();
    get_price_evolution_conn(&conn, &item_code)
}

pub fn get_spending_by_supplier_conn(
    conn: &Connection,
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
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
            format!(
                "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 LEFT JOIN overrides_produtos op ON op.codigo = inv.item_code
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND IFNULL(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent}' OR c.id = '{parent}')
                 GROUP BY inv.supplier_id, inv.supplier_name
                 ORDER BY SUM(inv.total_value) DESC",
                parent = parent_cat
            )
        }
    } else {
        "SELECT IFNULL(inv.supplier_id,'unknown'), IFNULL(inv.supplier_name,'Desconhecido'),
                SUM(inv.total_value), COUNT(DISTINCT inv.invoice_number)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 AND IFNULL(i.is_ignored, 0) = 0
         GROUP BY inv.supplier_id, inv.supplier_name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok(SupplierSpend {
            supplier_id: row.get(0)?,
            supplier_name: row.get(1)?,
            total_value: row.get(2)?,
            invoice_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_spending_by_supplier(
    state: State<DbState>,
    start: String,
    end: String,
    parent_category_id: Option<String>,
) -> Result<Vec<SupplierSpend>, String> {
    let conn = state.0.lock().unwrap();
    get_spending_by_supplier_conn(&conn, &start, &end, parent_category_id)
}

pub fn get_spending_by_category_conn(
    conn: &Connection,
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
            let parent_id = if parent_cat == "coloracao" { "cat_coloracao" } else { "cat_apoio" };
            format!(
                "SELECT IFNULL(p.linha_prefix,'unknown'), IFNULL(cl.nome_linha,'Sem Linha'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN produtos p ON inv.item_code = p.codigo
                 LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
                 LEFT JOIN overrides_produtos op ON op.codigo = p.codigo
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND (
                       op.categoria_produto = '{parent_id}'
                       OR op.categoria_produto IN (SELECT id FROM categories WHERE parent_id = '{parent_id}')
                       OR (op.categoria_produto IS NULL AND {prefix_cond})
                   )
                 GROUP BY p.linha_prefix, cl.nome_linha
                 ORDER BY SUM(inv.total_value) DESC",
                parent_id = parent_id,
                prefix_cond = prefix_cond
            )
        } else {
            format!(
                "SELECT IFNULL(i.category_id,'uncategorized'), IFNULL(c.name,'Sem Categoria'),
                        SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
                 FROM invoices inv
                 JOIN items i ON i.code = inv.item_code
                 LEFT JOIN categories c ON c.id = i.category_id
                 WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 
                   AND IFNULL(i.is_ignored, 0) = 0
                   AND (c.parent_id = '{parent}' OR c.id = '{parent}')
                 GROUP BY i.category_id, c.name
                 ORDER BY SUM(inv.total_value) DESC",
                parent = parent_cat
            )
        }
    } else {
        "SELECT IFNULL(i.category_id,'uncategorized'), IFNULL(c.name,'Sem Categoria'),
                SUM(inv.total_value), COUNT(DISTINCT inv.item_code)
         FROM invoices inv
         JOIN items i ON i.code = inv.item_code
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE inv.invoice_date >= ?1 AND inv.invoice_date <= ?2 AND IFNULL(i.is_ignored, 0) = 0
         GROUP BY i.category_id, c.name
         ORDER BY SUM(inv.total_value) DESC".to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![start, end], |row| {
        Ok(CategorySpend {
            category_id: row.get(0)?,
            category_name: row.get(1)?,
            total_value: row.get(2)?,
            item_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_spending_by_category(
    state: State<DbState>,
    start: String,
    end: String,
    parent_category_id: Option<String>,
) -> Result<Vec<CategorySpend>, String> {
    let conn = state.0.lock().unwrap();
    get_spending_by_category_conn(&conn, &start, &end, parent_category_id)
}
