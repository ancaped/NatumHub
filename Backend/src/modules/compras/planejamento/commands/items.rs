use tauri::State;
use rusqlite::{params, Connection};

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

use crate::modules::compras::planejamento::commands::get_auto_ignored_ingredients;

pub fn get_items_conn(conn: &Connection, category_id: Option<String>) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients(conn);

    let mut sql = String::from(
        "SELECT code, description, unit, category_id, line, type, notes, is_ignored FROM items WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref cat_id) = category_id {
        sql.push_str(" AND category_id = ?1");
        params_vec.push(Box::new(cat_id.clone()));
    }
    sql.push_str(" ORDER BY description");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let line: Option<String> = row.get(4)?;
        let type_code: Option<String> = row.get(5)?;
        let notes: Option<String> = row.get(6)?;
        let is_manually_ignored = row.get::<_, i32>(7)? == 1;

        let is_auto_ignored = auto_ignored.contains_key(&code);
        let ignored_reason = auto_ignored.get(&code).cloned();
        let is_ignored = is_manually_ignored || is_auto_ignored;

        Ok(Item {
            code,
            description: desc,
            unit,
            category_id: cat_id,
            line,
            type_code,
            notes,
            is_ignored,
            is_auto_ignored: Some(is_auto_ignored),
            ignored_reason,
        })
    }).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
pub fn get_items(state: State<DbState>, category_id: Option<String>) -> Result<Vec<Item>, String> {
    let conn = state.0.lock().unwrap();
    get_items_conn(&conn, category_id)
}

pub fn get_similar_items_conn(conn: &Connection, code: &str) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients(conn);

    let mut stmt = conn.prepare(
        "SELECT code, description, unit, category_id, line, type, notes, is_ignored 
         FROM items 
         WHERE code IN (
             SELECT item_code_b FROM similar_items WHERE item_code_a = ?1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = ?1
         )
         ORDER BY description"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![code], |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let line: Option<String> = row.get(4)?;
        let type_code: Option<String> = row.get(5)?;
        let notes: Option<String> = row.get(6)?;
        let is_manually_ignored = row.get::<_, i32>(7)? == 1;

        let is_auto_ignored = auto_ignored.contains_key(&code);
        let ignored_reason = auto_ignored.get(&code).cloned();
        let is_ignored = is_manually_ignored || is_auto_ignored;

        Ok(Item {
            code,
            description: desc,
            unit,
            category_id: cat_id,
            line,
            type_code,
            notes,
            is_ignored,
            is_auto_ignored: Some(is_auto_ignored),
            ignored_reason,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
pub fn get_similar_items(state: State<DbState>, code: String) -> Result<Vec<Item>, String> {
    let conn = state.0.lock().unwrap();
    get_similar_items_conn(&conn, &code)
}

pub fn add_similar_item_conn(conn: &Connection, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b { (code_a, code_b) } else { (code_b, code_a) };
    conn.execute(
        "INSERT OR IGNORE INTO similar_items (item_code_a, item_code_b) VALUES (?1, ?2)",
        params![first, second],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_similar_item(state: State<DbState>, code_a: String, code_b: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    add_similar_item_conn(&conn, &code_a, &code_b)
}

pub fn remove_similar_item_conn(conn: &Connection, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b { (code_a, code_b) } else { (code_b, code_a) };
    conn.execute(
        "DELETE FROM similar_items WHERE item_code_a = ?1 AND item_code_b = ?2",
        params![first, second],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_similar_item(state: State<DbState>, code_a: String, code_b: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    remove_similar_item_conn(&conn, &code_a, &code_b)
}

pub fn update_item_details_conn(conn: &Connection, code: &str, notes: Option<String>, is_ignored: bool) -> Result<(), String> {
    let is_product: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = ?1)",
        params![code],
        |r| r.get(0)
    ).unwrap_or(false);

    if is_product {
        conn.execute(
            "INSERT INTO overrides_produtos (codigo, observacao, visivel)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(codigo) DO UPDATE SET 
                observacao = excluded.observacao,
                visivel = excluded.visivel",
            params![code, notes, if is_ignored { 0 } else { 1 }],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE items SET notes = ?2, is_ignored = ?3, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
            params![code, notes, if is_ignored { 1 } else { 0 }],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_item_details(state: State<DbState>, code: String, notes: Option<String>, is_ignored: bool) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    update_item_details_conn(&conn, &code, notes, is_ignored)
}

pub fn update_items_category_conn(conn: &mut Connection, codes: &[String], category_id: Option<String>) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for code in codes {
        let is_product: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = ?1)",
            params![code],
            |r| r.get(0)
        ).unwrap_or(false);

        if is_product {
            tx.execute(
                "INSERT INTO overrides_produtos (codigo, categoria_produto)
                 VALUES (?1, ?2)
                 ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto",
                params![code, category_id],
            ).map_err(|e| e.to_string())?;
        } else {
            let target_cat = match &category_id {
                Some(cat) => Some(cat.clone()),
                None => {
                    let default_cat = if code.starts_with("9.15.") {
                        "cat_mp"
                    } else if code.starts_with("08.") {
                        "cat_mat"
                    } else {
                        "cat_emb"
                    };
                    Some(default_cat.to_string())
                }
            };
            tx.execute(
                "UPDATE items SET category_id = ?2, manual_category = 1, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
                params![code, target_cat],
            ).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_items_category(state: State<DbState>, codes: Vec<String>, category_id: Option<String>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    update_items_category_conn(&mut conn, &codes, category_id)
}

pub fn import_item_observations_conn(conn: &mut Connection, observations: &[ObsInput]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for obs in observations {
        tx.execute(
            "UPDATE items SET notes = ?2, is_ignored = 1, updated_at = CURRENT_TIMESTAMP WHERE code = ?1",
            params![obs.code, obs.notes],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_item_observations(state: State<DbState>, observations: Vec<ObsInput>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    import_item_observations_conn(&mut conn, &observations)
}
