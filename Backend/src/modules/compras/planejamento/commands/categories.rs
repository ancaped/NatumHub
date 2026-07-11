use tauri::State;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use uuid::Uuid;

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

// Cross-module helper imports
use crate::modules::compras::planejamento::commands::{get_auto_ignored_ingredients, get_ignored_product_statuses};


pub fn get_categories_conn(conn: &Connection) -> Result<Vec<Category>, String> {
    let mut stmt = conn.prepare("SELECT id, name, parent_id FROM categories ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
pub fn get_categories(state: State<DbState>) -> Result<Vec<Category>, String> {
    let conn = state.0.lock().unwrap();
    get_categories_conn(&conn)
}

pub fn save_category_conn(conn: &Connection, category: &Category) -> Result<(), String> {
    conn.execute(
        "INSERT INTO categories (id, name, parent_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET name = ?2, parent_id = ?3",
        params![category.id, category.name, category.parent_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_category(state: State<DbState>, category: Category) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_category_conn(&conn, &category)
}

pub fn delete_category_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE items 
         SET category_id = CASE 
             WHEN code LIKE '9.15.%' THEN 'cat_mp' 
             WHEN code LIKE '08.%' THEN 'cat_mat'
             ELSE 'cat_emb' 
         END,
         manual_category = 0
         WHERE category_id = ?1",
        params![id]
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE overrides_produtos 
         SET categoria_produto = NULL
         WHERE categoria_produto = ?1",
        params![id]
    ).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_category(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_category_conn(&conn, &id)
}
