use tauri::State;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

pub fn create_quotation_conn(conn: &mut Connection, title: &str, item_codes: &[String], recommended_qtys: &[f64]) -> Result<String, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let quotation_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO quotations (id, title) VALUES (?1, ?2)",
        params![quotation_id, title],
    ).map_err(|e| e.to_string())?;

    for i in 0..item_codes.len() {
        let q_item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO quotation_items (id, quotation_id, item_code, recommended_qty) VALUES (?1, ?2, ?3, ?4)",
            params![q_item_id, quotation_id, item_codes[i], recommended_qtys[i]],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(quotation_id)
}

#[tauri::command]
pub fn create_quotation(state: State<DbState>, title: String, item_codes: Vec<String>, recommended_qtys: Vec<f64>) -> Result<String, String> {
    let mut conn = state.0.lock().unwrap();
    create_quotation_conn(&mut conn, &title, &item_codes, &recommended_qtys)
}

pub fn get_quotations_conn(conn: &Connection, status: Option<String>) -> Result<Vec<Quotation>, String> {
    let mut category_parent_map = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, parent_id FROM categories") {
        let mut rows = stmt.query([]).ok();
        if let Some(ref mut r) = rows {
            while let Ok(Some(row)) = r.next() {
                if let (Ok(id), Ok(parent_id)) = (row.get::<_, String>(0), row.get::<_, Option<String>>(1)) {
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

    let mut sql = String::from("
        SELECT 
            q.id, q.title, q.status, q.target_days, q.notes, 
            q.director_demand_notes, q.director_final_notes, 
            q.created_at, q.demand_approved_at, q.final_approved_at, q.ordered_at,
            (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count,
            (
                SELECT SUM(qp.unit_price * IFNULL(qi.final_qty, IFNULL(qi.approved_qty, qi.recommended_qty)))
                FROM quotation_items qi
                JOIN quotation_prices qp ON qp.quotation_item_id = qi.id AND qp.is_selected = 1
                WHERE qi.quotation_id = q.id
            ) as total_value,
            (
                SELECT i.category_id 
                FROM quotation_items qi 
                LEFT JOIN items i ON qi.item_code = i.code 
                WHERE qi.quotation_id = q.id 
                LIMIT 1
            ) as first_item_cat_id
        FROM quotations q
        WHERE 1=1
    ");

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref st) = status {
        sql.push_str(" AND q.status = ?1");
        params_vec.push(Box::new(st.clone()));
    }
    sql.push_str(" ORDER BY q.created_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();
    
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let first_item_cat_id: Option<String> = row.get(13)?;
        let root_cat = first_item_cat_id.map(|cid| resolve_root_category(&cid, &category_parent_map));
        let quotation_type = match root_cat.as_deref() {
            Some("cat_mp") => Some("materia_prima".to_string()),
            Some("cat_emb") => Some("embalagens".to_string()),
            Some("cat_coloracao") => Some("coloracao".to_string()),
            Some("cat_apoio") => Some("apoio".to_string()),
            _ => Some("materia_prima".to_string()),
        };

        Ok(Quotation {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            target_days: row.get(3)?,
            notes: row.get(4)?,
            director_demand_notes: row.get(5)?,
            director_final_notes: row.get(6)?,
            created_at: row.get(7)?,
            demand_approved_at: row.get(8)?,
            final_approved_at: row.get(9)?,
            ordered_at: row.get(10)?,
            item_count: row.get(11)?,
            total_value: row.get(12)?,
            quotation_type,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_quotations(state: State<DbState>, status: Option<String>) -> Result<Vec<Quotation>, String> {
    let conn = state.0.lock().unwrap();
    get_quotations_conn(&conn, status)
}

pub fn get_quotation_detail_conn(conn: &Connection, id: &str) -> Result<serde_json::Value, String> {
    let mut category_parent_map = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, parent_id FROM categories") {
        let mut rows = stmt.query([]).ok();
        if let Some(ref mut r) = rows {
            while let Ok(Some(row)) = r.next() {
                if let (Ok(id), Ok(parent_id)) = (row.get::<_, String>(0), row.get::<_, Option<String>>(1)) {
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

    let q: Quotation = conn.query_row(
        "SELECT id, title, status, target_days, notes, director_demand_notes, director_final_notes, 
         created_at, demand_approved_at, final_approved_at, ordered_at,
         (
             SELECT i.category_id 
             FROM quotation_items qi 
             LEFT JOIN items i ON qi.item_code = i.code 
             WHERE qi.quotation_id = quotations.id 
             LIMIT 1
         ) as first_item_cat_id
         FROM quotations WHERE id = ?1",
        params![id],
        |row| {
            let first_item_cat_id: Option<String> = row.get(11)?;
            let root_cat = first_item_cat_id.map(|cid| resolve_root_category(&cid, &category_parent_map));
            let quotation_type = match root_cat.as_deref() {
                Some("cat_mp") => Some("materia_prima".to_string()),
                Some("cat_emb") => Some("embalagens".to_string()),
                Some("cat_coloracao") => Some("coloracao".to_string()),
                Some("cat_apoio") => Some("apoio".to_string()),
                _ => Some("materia_prima".to_string()),
            };

            Ok(Quotation {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                target_days: row.get(3)?,
                notes: row.get(4)?,
                director_demand_notes: row.get(5)?,
                director_final_notes: row.get(6)?,
                created_at: row.get(7)?,
                demand_approved_at: row.get(8)?,
                final_approved_at: row.get(9)?,
                ordered_at: row.get(10)?,
                item_count: None,
                total_value: None,
                quotation_type,
            })
        }
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("
        SELECT qi.id, qi.quotation_id, qi.item_code, i.description, i.unit, 
               qi.recommended_qty, qi.approved_qty, qi.final_qty, qi.notes
        FROM quotation_items qi
        JOIN items i ON i.code = qi.item_code
        WHERE qi.quotation_id = ?1
    ").map_err(|e| e.to_string())?;

    let item_rows = stmt.query_map(params![id], |row| {
        Ok(QuotationItemDetail {
            id: row.get(0)?,
            quotation_id: row.get(1)?,
            item_code: row.get(2)?,
            description: row.get(3)?,
            unit: row.get(4)?,
            recommended_qty: row.get(5)?,
            approved_qty: row.get(6)?,
            final_qty: row.get(7)?,
            notes: row.get(8)?,
            prices: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in item_rows {
        let mut item = row.map_err(|e| e.to_string())?;
        
        let mut price_stmt = conn.prepare("
            SELECT qp.id, qp.quotation_item_id, qp.supplier_id, s.name, 
                   qp.unit_price, qp.delivery_days, qp.min_qty, qp.payment_terms, qp.notes, qp.is_selected
            FROM quotation_prices qp
            JOIN suppliers s ON s.id = qp.supplier_id
            WHERE qp.quotation_item_id = ?1
        ").map_err(|e| e.to_string())?;

        let price_rows = price_stmt.query_map(params![item.id], |p_row| {
            Ok(QuotationPrice {
                id: p_row.get(0)?,
                quotation_item_id: p_row.get(1)?,
                supplier_id: p_row.get(2)?,
                supplier_name: p_row.get(3)?,
                unit_price: p_row.get(4)?,
                delivery_days: p_row.get(5)?,
                min_qty: p_row.get(6)?,
                payment_terms: p_row.get(7)?,
                notes: p_row.get(8)?,
                is_selected: p_row.get::<_, i32>(9)? == 1,
            })
        }).map_err(|e| e.to_string())?;

        for p in price_rows {
            item.prices.push(p.map_err(|e| e.to_string())?);
        }
        
        items.push(item);
    }

    Ok(serde_json::json!({
        "quotation": q,
        "items": items
    }))
}

#[tauri::command]
pub fn get_quotation_detail(state: State<DbState>, id: String) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().unwrap();
    get_quotation_detail_conn(&conn, &id)
}

pub fn update_quotation_status_conn(conn: &Connection, id: &str, status: &str, notes: Option<String>) -> Result<(), String> {
    match status {
        "quoting" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = ?2, director_demand_notes = ?3, demand_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = ?2, demand_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status],
                ).map_err(|e| e.to_string())?;
            }
        },
        "approved" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = ?2, director_final_notes = ?3, final_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = ?2, final_approved_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![id, status],
                ).map_err(|e| e.to_string())?;
            }
        },
        "renegotiate" => {
            if let Some(n) = notes {
                conn.execute(
                    "UPDATE quotations SET status = 'quoting', director_final_notes = ?2 WHERE id = ?1",
                    params![id, n],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE quotations SET status = 'quoting' WHERE id = ?1",
                    params![id],
                ).map_err(|e| e.to_string())?;
            }
        },
        "ordered" => {
            conn.execute(
                "UPDATE quotations SET status = ?2, ordered_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![id, status],
            ).map_err(|e| e.to_string())?;
        },
        _ => {
            conn.execute(
                "UPDATE quotations SET status = ?2 WHERE id = ?1",
                params![id, status],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_quotation_status(state: State<DbState>, id: String, status: String, notes: Option<String>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_quotation_status_conn(&conn, &id, &status, notes)
}

pub fn add_quotation_price_conn(conn: &Connection, price: &QuotationPriceInput) -> Result<(), String> {
    let price_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO quotation_prices (id, quotation_item_id, supplier_id, unit_price, delivery_days, min_qty, payment_terms, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![price_id, price.quotation_item_id, price.supplier_id, price.unit_price, price.delivery_days, price.min_qty, price.payment_terms, price.notes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_quotation_price(state: State<DbState>, price: QuotationPriceInput) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_quotation_price_conn(&conn, &price)
}

pub fn select_supplier_conn(conn: &mut Connection, quotation_item_id: &str, price_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "UPDATE quotation_prices SET is_selected = 0 WHERE quotation_item_id = ?1",
        params![quotation_item_id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE quotation_prices SET is_selected = 1 WHERE id = ?1",
        params![price_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn select_supplier(state: State<DbState>, quotation_item_id: String, price_id: String) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    select_supplier_conn(&mut conn, &quotation_item_id, &price_id)
}

pub fn delete_quotation_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM quotations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_quotation(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_quotation_conn(&conn, &id)
}

pub fn update_quotation_item_qty_conn(conn: &Connection, id: &str, field: &str, qty: f64) -> Result<(), String> {
    let query = match field {
        "approved" => "UPDATE quotation_items SET approved_qty = ?2 WHERE id = ?1",
        "final" => "UPDATE quotation_items SET final_qty = ?2 WHERE id = ?1",
        _ => return Err("Invalid field".to_string()),
    };
    conn.execute(query, params![id, qty]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_quotation_item_qty(state: State<DbState>, id: String, field: String, qty: f64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_quotation_item_qty_conn(&conn, &id, &field, qty)
}
