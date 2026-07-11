use rusqlite::{params, Connection};
use tauri::State;
use crate::DbState;
use super::models::{OnlineOrder, OnlineStore};

pub fn get_online_orders_conn(conn: &Connection) -> Result<Vec<OnlineOrder>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, created_at, is_return, return_deadline, return_status, return_notes FROM online_orders ORDER BY purchase_date DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(OnlineOrder {
            id: row.get(0)?,
            description: row.get(1)?,
            item_code: row.get(2)?,
            store_name: row.get(3)?,
            purchase_url: row.get(4)?,
            purchase_date: row.get(5)?,
            unit_price: row.get(6)?,
            quantity: row.get(7)?,
            shipping_cost: row.get(8)?,
            total_price: row.get(9)?,
            payment_method: row.get(10)?,
            tracking_code: row.get(11)?,
            tracking_url: row.get(12)?,
            status: row.get(13)?,
            estimated_delivery: row.get(14)?,
            receipt_path: row.get(15)?,
            notes: row.get(16)?,
            created_at: row.get(17)?,
            is_return: Some(row.get::<_, Option<i32>>(18)?.unwrap_or(0) != 0),
            return_deadline: row.get(19)?,
            return_status: row.get(20)?,
            return_notes: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for row in rows {
        orders.push(row.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}

#[tauri::command]
pub fn get_online_orders(state: State<DbState>) -> Result<Vec<OnlineOrder>, String> {
    let conn = state.0.lock().unwrap();
    get_online_orders_conn(&conn)
}

pub fn save_online_order_conn(conn: &Connection, order: &OnlineOrder) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO online_orders (id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, is_return, return_deadline, return_status, return_notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            order.id,
            order.description,
            order.item_code,
            order.store_name,
            order.purchase_url,
            order.purchase_date,
            order.unit_price,
            order.quantity,
            order.shipping_cost,
            order.total_price,
            order.payment_method,
            order.tracking_code,
            order.tracking_url,
            order.status,
            order.estimated_delivery,
            order.receipt_path,
            order.notes,
            order.is_return.unwrap_or(false) as i32,
            order.return_deadline,
            order.return_status,
            order.return_notes,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_online_order(state: State<DbState>, order: OnlineOrder) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_online_order_conn(&conn, &order)
}

pub fn delete_online_order_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM online_orders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_online_order(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_online_order_conn(&conn, &id)
}

pub fn get_online_stores_conn(conn: &Connection) -> Result<Vec<OnlineStore>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, url, notes, created_at FROM online_stores ORDER BY name ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(OnlineStore {
            id: row.get(0)?,
            name: row.get(1)?,
            url: row.get(2)?,
            notes: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut stores = Vec::new();
    for row in rows {
        stores.push(row.map_err(|e| e.to_string())?);
    }
    Ok(stores)
}

#[tauri::command]
pub fn get_online_stores(state: State<DbState>) -> Result<Vec<OnlineStore>, String> {
    let conn = state.0.lock().unwrap();
    get_online_stores_conn(&conn)
}

pub fn save_online_store_conn(conn: &Connection, store: &OnlineStore) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO online_stores (id, name, url, notes) VALUES (?1, ?2, ?3, ?4)",
        params![
            store.id,
            store.name,
            store.url,
            store.notes,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_online_store(state: State<DbState>, store: OnlineStore) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_online_store_conn(&conn, &store)
}

pub fn delete_online_store_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM online_stores WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_online_store(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_online_store_conn(&conn, &id)
}

#[tauri::command]
pub fn upload_order_receipt(id: String, filename: String, data: Vec<u8>) -> Result<String, String> {
    let receipts_dir = std::path::Path::new("../receipts");
    if !receipts_dir.exists() {
        std::fs::create_dir_all(receipts_dir).map_err(|e| e.to_string())?;
    }
    let clean_filename = filename.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_', "");
    let file_path = receipts_dir.join(format!("{}_{}", id, clean_filename));
    std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
    let abs_path = std::fs::canonicalize(&file_path).map_err(|e| e.to_string())?;
    Ok(abs_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_receipt_file(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(&["/C", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
