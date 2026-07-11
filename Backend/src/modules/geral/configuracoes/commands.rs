use rusqlite::Connection;
use tauri::State;
use crate::DbState;

#[tauri::command]
pub fn reset_db(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute_batch("
        DROP TABLE IF EXISTS fisco_quimica_analyses;
        DROP TABLE IF EXISTS fisco_quimica_corrective_agents;
        DROP TABLE IF EXISTS fisco_quimica_patterns;
        DROP TABLE IF EXISTS quotation_prices;
        DROP TABLE IF EXISTS quotation_items;
        DROP TABLE IF EXISTS quotations;
        DROP TABLE IF EXISTS invoices;
        DROP TABLE IF EXISTS consumption;
        DROP TABLE IF EXISTS stock_snapshots;
        DROP TABLE IF EXISTS stock_imports;
        DROP TABLE IF EXISTS items;
        DROP TABLE IF EXISTS suppliers;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS products;
        DROP TABLE IF EXISTS reports;
        DROP TABLE IF EXISTS feedbacks;
        DROP TABLE IF EXISTS config;
        DROP TABLE IF EXISTS online_orders;
    ").map_err(|e| e.to_string())?;
    
    crate::initialize_hub_db(&conn).map_err(|e| e.to_string())?;
    Ok(())
}
