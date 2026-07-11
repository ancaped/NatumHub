use tauri::State;
use rusqlite::{params, Connection};
use crate::{
    DbState, Product, Report, FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis,
};

pub fn get_microbio_config_conn(conn: &Connection) -> Result<Option<serde_json::Value>, String> {
    let mut stmt = conn.prepare("SELECT value FROM config WHERE key = 'microbio_main'").map_err(|e| e.to_string())?;
    let res = stmt.query_row([], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    });

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string())
    }
}

#[tauri::command]
pub fn get_microbio_config(state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    get_microbio_config_conn(&conn)
}

pub fn save_config_microbio_conn(conn: &Connection, config: &serde_json::Value) -> Result<(), String> {
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('microbio_main', ?1)",
        params![val],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_config_microbio(state: State<DbState>, config: serde_json::Value) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_config_microbio_conn(&conn, &config)
}

pub fn get_products_conn(conn: &Connection) -> Result<Vec<Product>, String> {
    let mut stmt = conn.prepare("SELECT code, name, packaging, validity FROM products").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Product {
            code: row.get(0)?,
            name: row.get(1)?,
            packaging: row.get(2)?,
            validity: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut products = Vec::new();
    for row in rows {
        products.push(row.map_err(|e| e.to_string())?);
    }
    Ok(products)
}

#[tauri::command]
pub fn get_products(state: State<DbState>) -> Result<Vec<Product>, String> {
    let conn = state.0.lock().unwrap();
    get_products_conn(&conn)
}

pub fn save_product_conn(conn: &Connection, product: &Product) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO products (code, name, packaging, validity) VALUES (?1, ?2, ?3, ?4)",
        params![product.code, product.name, product.packaging, product.validity],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_product(state: State<DbState>, product: Product) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_product_conn(&conn, &product)
}

pub fn delete_product_conn(conn: &Connection, code: &str) -> Result<(), String> {
    conn.execute("DELETE FROM products WHERE code = ?1", params![code]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_product(state: State<DbState>, code: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_product_conn(&conn, &code)
}

pub fn get_reports_conn(conn: &Connection) -> Result<Vec<Report>, String> {
    let mut stmt = conn.prepare("SELECT id, reportId, reportRawNum, productCode, productName, batch, collectionDate, technician, createdAt FROM reports ORDER BY reportRawNum DESC LIMIT 1000").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Report {
            id: row.get(0)?,
            report_id: row.get(1)?,
            report_raw_num: row.get(2)?,
            product_code: row.get(3)?,
            product_name: row.get(4)?,
            batch: row.get(5)?,
            collection_date: row.get(6)?,
            technician: row.get(7)?,
            created_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut reports = Vec::new();
    for row in rows {
        reports.push(row.map_err(|e| e.to_string())?);
    }
    Ok(reports)
}

#[tauri::command]
pub fn get_reports(state: State<DbState>) -> Result<Vec<Report>, String> {
    let conn = state.0.lock().unwrap();
    get_reports_conn(&conn)
}

pub fn save_reports_conn(conn: &mut Connection, reports: &[Report]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT OR REPLACE INTO reports (id, reportId, reportRawNum, productCode, productName, batch, collectionDate, technician, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)").map_err(|e| e.to_string())?;
        for report in reports {
            stmt.execute(params![
                report.id, report.report_id, report.report_raw_num,
                report.product_code, report.product_name, report.batch,
                report.collection_date, report.technician
            ]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_reports(state: State<DbState>, reports: Vec<Report>) -> Result<(), String> {
    let mut conn = state.0.lock().unwrap();
    save_reports_conn(&mut conn, &reports)
}

pub fn delete_report_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_report(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_report_conn(&conn, &id)
}

pub fn delete_all_products_conn(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM products", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_all_products(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_all_products_conn(&conn)
}

pub fn get_fisco_quimica_patterns_conn(conn: &Connection) -> Result<Vec<FiscoQuimicaPattern>, String> {
    let mut stmt = conn.prepare("SELECT product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit FROM fisco_quimica_patterns").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let p_code: String = row.get(0)?;
        Ok(FiscoQuimicaPattern {
            product_code: p_code,
            ph_min: row.get(1)?,
            ph_max: row.get(2)?,
            viscosity_min: row.get(3)?,
            viscosity_max: row.get(4)?,
            density_target: row.get(5)?,
            density_tolerance: row.get(6)?,
            package_volume: row.get(7)?,
            package_unit: row.get(8)?,
            allowed_agents: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut patterns = Vec::new();
    for row in rows {
        let mut pat = row.map_err(|e| e.to_string())?;
        
        let mut agent_stmt = conn.prepare("SELECT agent_id FROM fisco_quimica_product_agents WHERE product_code = ?1").map_err(|e| e.to_string())?;
        let agent_rows = agent_stmt.query_map(params![pat.product_code], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        
        let mut allowed_agents = Vec::new();
        for agent_row in agent_rows {
            allowed_agents.push(agent_row.map_err(|e| e.to_string())?);
        }
        
        pat.allowed_agents = Some(allowed_agents);
        patterns.push(pat);
    }
    Ok(patterns)
}

#[tauri::command]
pub fn get_fisco_quimica_patterns(state: State<DbState>) -> Result<Vec<FiscoQuimicaPattern>, String> {
    let conn = state.0.lock().unwrap();
    get_fisco_quimica_patterns_conn(&conn)
}

pub fn save_fisco_quimica_pattern_conn(conn: &Connection, pattern: &FiscoQuimicaPattern) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_patterns (product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            pattern.product_code,
            pattern.ph_min,
            pattern.ph_max,
            pattern.viscosity_min,
            pattern.viscosity_max,
            pattern.density_target,
            pattern.density_tolerance,
            pattern.package_volume,
            pattern.package_unit
        ],
    ).map_err(|e| e.to_string())?;

    if let Some(ref agents) = pattern.allowed_agents {
        conn.execute("DELETE FROM fisco_quimica_product_agents WHERE product_code = ?1", params![pattern.product_code]).map_err(|e| e.to_string())?;
        for agent_id in agents {
            conn.execute("INSERT OR IGNORE INTO fisco_quimica_product_agents (product_code, agent_id) VALUES (?1, ?2)", params![pattern.product_code, agent_id]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_fisco_quimica_pattern(state: State<DbState>, pattern: FiscoQuimicaPattern) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_fisco_quimica_pattern_conn(&conn, &pattern)
}

pub fn delete_fisco_quimica_pattern_conn(conn: &Connection, code: &str) -> Result<(), String> {
    conn.execute("DELETE FROM fisco_quimica_product_agents WHERE product_code = ?1", params![code]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM fisco_quimica_patterns WHERE product_code = ?1", params![code]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_fisco_quimica_pattern(state: State<DbState>, code: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_fisco_quimica_pattern_conn(&conn, &code)
}

pub fn get_fisco_quimica_agents_conn(conn: &Connection) -> Result<Vec<FiscoQuimicaAgent>, String> {
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM fisco_quimica_corrective_agents ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(FiscoQuimicaAgent {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut agents = Vec::new();
    for row in rows {
        agents.push(row.map_err(|e| e.to_string())?);
    }
    Ok(agents)
}

#[tauri::command]
pub fn get_fisco_quimica_agents(state: State<DbState>) -> Result<Vec<FiscoQuimicaAgent>, String> {
    let conn = state.0.lock().unwrap();
    get_fisco_quimica_agents_conn(&conn)
}

pub fn save_fisco_quimica_agent_conn(conn: &Connection, agent: &FiscoQuimicaAgent) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_corrective_agents (id, name) VALUES (?1, ?2)",
        params![agent.id, agent.name],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_fisco_quimica_agent(state: State<DbState>, agent: FiscoQuimicaAgent) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_fisco_quimica_agent_conn(&conn, &agent)
}

pub fn delete_fisco_quimica_agent_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM fisco_quimica_corrective_agents WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_fisco_quimica_agent(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_fisco_quimica_agent_conn(&conn, &id)
}

pub fn get_fisco_quimica_analyses_conn(conn: &Connection) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
    let mut stmt = conn.prepare("SELECT id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes, created_at FROM fisco_quimica_analyses ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let has_adj_int: i32 = row.get(12)?;
        Ok(FiscoQuimicaAnalysis {
            id: row.get(0)?,
            product_code: row.get(1)?,
            product_name: row.get(2)?,
            batch: row.get(3)?,
            analysis_date: row.get(4)?,
            technician: row.get(5)?,
            ph_measured: row.get(6)?,
            viscosity_measured: row.get(7)?,
            density_measured: row.get(8)?,
            fraction_weight: row.get(9)?,
            envase_target_weight: row.get(10)?,
            envase_target_unit: row.get(11)?,
            has_adjustment: has_adj_int == 1,
            corrective_agent_id: row.get(13)?,
            initial_viscosity: row.get(14)?,
            trial_agent_qty: row.get(15)?,
            trial_viscosity: row.get(16)?,
            agent_qty_per_liter: row.get(17)?,
            batch_size: row.get(18)?,
            total_agent_required: row.get(19)?,
            notes: row.get(20)?,
            created_at: row.get(21)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut analyses = Vec::new();
    for row in rows {
        analyses.push(row.map_err(|e| e.to_string())?);
    }
    Ok(analyses)
}

#[tauri::command]
pub fn get_fisco_quimica_analyses(state: State<DbState>) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
    let conn = state.0.lock().unwrap();
    get_fisco_quimica_analyses_conn(&conn)
}

pub fn save_fisco_quimica_analysis_conn(conn: &Connection, analysis: &FiscoQuimicaAnalysis) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO fisco_quimica_analyses (id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            analysis.id,
            analysis.product_code,
            analysis.product_name,
            analysis.batch,
            analysis.analysis_date,
            analysis.technician,
            analysis.ph_measured,
            analysis.viscosity_measured,
            analysis.density_measured,
            analysis.fraction_weight,
            analysis.envase_target_weight,
            analysis.envase_target_unit,
            if analysis.has_adjustment { 1 } else { 0 },
            analysis.corrective_agent_id,
            analysis.initial_viscosity,
            analysis.trial_agent_qty,
            analysis.trial_viscosity,
            analysis.agent_qty_per_liter,
            analysis.batch_size,
            analysis.total_agent_required,
            analysis.notes
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_fisco_quimica_analysis(state: State<DbState>, analysis: FiscoQuimicaAnalysis) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_fisco_quimica_analysis_conn(&conn, &analysis)
}

pub fn delete_fisco_quimica_analysis_conn(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM fisco_quimica_analyses WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_fisco_quimica_analysis(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    delete_fisco_quimica_analysis_conn(&conn, &id)
}

#[tauri::command]
pub fn open_external_browser(url: String) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", &url])
        .spawn();

    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg(&url)
        .spawn();

    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn();
}
