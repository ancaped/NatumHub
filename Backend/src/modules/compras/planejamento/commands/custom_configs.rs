use tauri::State;
use rusqlite::{params, Connection};
use crate::DbState;
use crate::modules::compras::planejamento::models::CustomPurchaseConfigRow;

pub fn get_custom_purchase_configs_conn(conn: &Connection) -> Result<Vec<CustomPurchaseConfigRow>, String> {
    let mut stmt = conn.prepare(
        "SELECT level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor,
                CASE 
                    WHEN level = 'subcategoria' THEN (SELECT name FROM categories WHERE id = target_id)
                    WHEN level = 'item' THEN COALESCE((SELECT description FROM items WHERE code = target_id), (SELECT descricao FROM produtos WHERE codigo = target_id))
                    ELSE 'Configuração Geral'
                END as target_name,
                periodo_media
         FROM compras_config_personalizado"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(CustomPurchaseConfigRow {
            level: row.get(0)?,
            target_id: row.get(1)?,
            dias_start: row.get(2)?,
            dias_target: row.get(3)?,
            use_lead_time: row.get(4)?,
            safety_days: row.get(5)?,
            objetivo_tipo: row.get(6)?,
            objetivo_valor: row.get(7)?,
            target_name: row.get(8)?,
            periodo_media: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_custom_purchase_configs(state: State<DbState>) -> Result<Vec<CustomPurchaseConfigRow>, String> {
    let conn = state.0.lock().unwrap();
    get_custom_purchase_configs_conn(&conn)
}

pub fn save_custom_purchase_config_conn(conn: &Connection, row: &CustomPurchaseConfigRow) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO compras_config_personalizado 
         (level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor, periodo_media) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            row.level,
            row.target_id,
            row.dias_start,
            row.dias_target,
            row.use_lead_time,
            row.safety_days,
            row.objetivo_tipo,
            row.objetivo_valor,
            row.periodo_media,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_custom_purchase_config(state: State<DbState>, row: CustomPurchaseConfigRow) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_custom_purchase_config_conn(&conn, &row)
}

pub fn delete_custom_purchase_config_conn(conn: &Connection, level: &str, target_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM compras_config_personalizado WHERE level = ?1 AND target_id = ?2",
        params![level, target_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_custom_purchase_config(state: State<DbState>, level: String, target_id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_custom_purchase_config_conn(&conn, &level, &target_id)
}
