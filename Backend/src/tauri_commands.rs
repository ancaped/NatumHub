use sqlx::{PgPool, Row};
use crate::{
    Product, Report, FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis,
};

pub async fn get_microbio_config_query(pool: PgPool) -> Result<Option<serde_json::Value>, String> {
    let res: Result<String, sqlx::Error> =
        sqlx::query_scalar("SELECT value FROM config WHERE key = 'microbio_main'")
            .fetch_one(&pool)
            .await;

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(sqlx::Error::RowNotFound) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn save_config_microbio_query(pool: PgPool, config: &serde_json::Value) -> Result<(), String> {
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO config (key, value) VALUES ('microbio_main', $1)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(val)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_config_query(pool: PgPool) -> Result<Option<serde_json::Value>, String> {
    let res: Result<String, sqlx::Error> =
        sqlx::query_scalar("SELECT value FROM config WHERE key = 'fisco_main'")
            .fetch_one(&pool)
            .await;

    match res {
        Ok(val) => {
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(sqlx::Error::RowNotFound) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn save_config_fisco_query(pool: PgPool, config: &serde_json::Value) -> Result<(), String> {
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO config (key, value) VALUES ('fisco_main', $1)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(val)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_products_query(pool: PgPool) -> Result<Vec<Product>, String> {
    let rows = sqlx::query("SELECT code, name, packaging, validity FROM products")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Product {
            code: row.get(0),
            name: row.get(1),
            packaging: row.get(2),
            validity: row.get(3),
        })
        .collect())
}

pub async fn save_product_query(pool: PgPool, product: &Product) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO products (code, name, packaging, validity) VALUES ($1, $2, $3, $4)
         ON CONFLICT(code) DO UPDATE SET name = EXCLUDED.name, packaging = EXCLUDED.packaging, validity = EXCLUDED.validity",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(&product.packaging)
    .bind(&product.validity)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_product_query(pool: PgPool, code: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM products WHERE code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_reports_query(pool: PgPool) -> Result<Vec<Report>, String> {
    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT"#)
        .execute(&pool)
        .await;

    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT, ADD COLUMN IF NOT EXISTS printed BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS "printedAt" TEXT"#)
        .execute(&pool)
        .await;

    let rows = sqlx::query(
        r#"SELECT id, "reportId", "reportRawNum", "productCode", "productName", batch, "collectionDate", technician, "createdAt", "manufacturingDate", printed, "printedAt"
           FROM reports ORDER BY "reportRawNum" DESC LIMIT 5000"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Report {
            id: row.get(0),
            report_id: row.get(1),
            report_raw_num: crate::core::pg_row::pg_i32(&row, 2),
            product_code: row.get(3),
            product_name: row.get(4),
            batch: row.get(5),
            collection_date: row.get(6),
            technician: row.get(7),
            created_at: row.get(8),
            manufacturing_date: row.try_get(9).ok(),
            printed: row.try_get(10).ok(),
            printed_at: row.try_get(11).ok(),
        })
        .collect())
}

pub async fn save_reports_query(pool: PgPool, reports: &[Report]) -> Result<(), String> {
    let _ = sqlx::query(r#"ALTER TABLE reports ADD COLUMN IF NOT EXISTS "manufacturingDate" TEXT, ADD COLUMN IF NOT EXISTS printed BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS "printedAt" TEXT"#)
        .execute(&pool)
        .await;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for report in reports {
        let is_printed = report.printed.unwrap_or(false);
        sqlx::query(
            r#"INSERT INTO reports (id, "reportId", "reportRawNum", "productCode", "productName", batch, "collectionDate", technician, "createdAt", "manufacturingDate", printed, "printedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP::TEXT, $9, $10, $11)
             ON CONFLICT(id) DO UPDATE SET
                "reportId" = EXCLUDED."reportId",
                "reportRawNum" = EXCLUDED."reportRawNum",
                "productCode" = EXCLUDED."productCode",
                "productName" = EXCLUDED."productName",
                batch = EXCLUDED.batch,
                "collectionDate" = EXCLUDED."collectionDate",
                technician = EXCLUDED.technician,
                "createdAt" = CURRENT_TIMESTAMP::TEXT,
                "manufacturingDate" = EXCLUDED."manufacturingDate",
                printed = EXCLUDED.printed,
                "printedAt" = EXCLUDED."printedAt""#,
        )
        .bind(&report.id)
        .bind(&report.report_id)
        .bind(report.report_raw_num)
        .bind(&report.product_code)
        .bind(&report.product_name)
        .bind(&report.batch)
        .bind(&report.collection_date)
        .bind(&report.technician)
        .bind(&report.manufacturing_date)
        .bind(is_printed)
        .bind(&report.printed_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_reports_printed_query(
    pool: PgPool,
    report_ids: &[String],
    printed: bool,
) -> Result<(), String> {
    let now = chrono::Local::now().to_rfc3339();
    let printed_at = if printed { Some(now) } else { None };

    sqlx::query(
        r#"UPDATE reports 
           SET printed = $1, "printedAt" = $2 
           WHERE id = ANY($3)"#,
    )
    .bind(printed)
    .bind(printed_at)
    .bind(report_ids)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn delete_report_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM reports WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_all_products_query(pool: PgPool) -> Result<(), String> {
    sqlx::query("DELETE FROM products")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_quimica_patterns_query(pool: PgPool) -> Result<Vec<FiscoQuimicaPattern>, String> {
    let rows = sqlx::query(
        "SELECT product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit FROM fisco_quimica_patterns",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut patterns = Vec::new();
    for row in rows {
        let p_code: String = row.get(0);
        let agent_rows = sqlx::query(
            "SELECT agent_id FROM fisco_quimica_product_agents WHERE product_code = $1",
        )
        .bind(&p_code)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let allowed_agents: Vec<String> = agent_rows.into_iter().map(|r| r.get(0)).collect();

        patterns.push(FiscoQuimicaPattern {
            product_code: p_code,
            ph_min: row.get(1),
            ph_max: row.get(2),
            viscosity_min: row.get(3),
            viscosity_max: row.get(4),
            density_target: row.get(5),
            density_tolerance: row.get(6),
            package_volume: row.get(7),
            package_unit: row.get(8),
            allowed_agents: Some(allowed_agents),
        });
    }
    Ok(patterns)
}

pub async fn save_fisco_quimica_pattern_query(pool: PgPool, pattern: &FiscoQuimicaPattern) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO fisco_quimica_patterns (product_code, ph_min, ph_max, viscosity_min, viscosity_max, density_target, density_tolerance, package_volume, package_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(product_code) DO UPDATE SET
            ph_min = EXCLUDED.ph_min,
            ph_max = EXCLUDED.ph_max,
            viscosity_min = EXCLUDED.viscosity_min,
            viscosity_max = EXCLUDED.viscosity_max,
            density_target = EXCLUDED.density_target,
            density_tolerance = EXCLUDED.density_tolerance,
            package_volume = EXCLUDED.package_volume,
            package_unit = EXCLUDED.package_unit",
    )
    .bind(&pattern.product_code)
    .bind(pattern.ph_min)
    .bind(pattern.ph_max)
    .bind(pattern.viscosity_min)
    .bind(pattern.viscosity_max)
    .bind(pattern.density_target)
    .bind(pattern.density_tolerance)
    .bind(pattern.package_volume)
    .bind(&pattern.package_unit)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref agents) = pattern.allowed_agents {
        sqlx::query("DELETE FROM fisco_quimica_product_agents WHERE product_code = $1")
            .bind(&pattern.product_code)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        for agent_id in agents {
            sqlx::query(
                "INSERT INTO fisco_quimica_product_agents (product_code, agent_id) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING",
            )
            .bind(&pattern.product_code)
            .bind(agent_id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn delete_fisco_quimica_pattern_query(pool: PgPool, code: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_product_agents WHERE product_code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM fisco_quimica_patterns WHERE product_code = $1")
        .bind(code)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_quimica_agents_query(pool: PgPool) -> Result<Vec<FiscoQuimicaAgent>, String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_corrective_agents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'VISCOSIDADE'")
        .execute(&pool)
        .await;

    let rows = sqlx::query(
        "SELECT id, name, category, created_at FROM fisco_quimica_corrective_agents ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| FiscoQuimicaAgent {
            id: row.get(0),
            name: row.get(1),
            category: row.get(2),
            created_at: row.get(3),
        })
        .collect())
}

pub async fn save_fisco_quimica_agent_query(pool: PgPool, agent: &FiscoQuimicaAgent) -> Result<(), String> {
    let _ = sqlx::query("ALTER TABLE fisco_quimica_corrective_agents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'VISCOSIDADE'")
        .execute(&pool)
        .await;

    let cat = agent.category.as_deref().unwrap_or("VISCOSIDADE");

    sqlx::query(
        "INSERT INTO fisco_quimica_corrective_agents (id, name, category) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category",
    )
    .bind(&agent.id)
    .bind(&agent.name)
    .bind(cat)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_fisco_quimica_agent_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_corrective_agents WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_fisco_quimica_analyses_query(pool: PgPool) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
    let rows = sqlx::query(
        "SELECT id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes, created_at FROM fisco_quimica_analyses ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let has_adj_int: i32 = row.get(12);
            FiscoQuimicaAnalysis {
                id: row.get(0),
                product_code: row.get(1),
                product_name: row.get(2),
                batch: row.get(3),
                analysis_date: row.get(4),
                technician: row.get(5),
                ph_measured: row.get(6),
                viscosity_measured: row.get(7),
                density_measured: row.get(8),
                fraction_weight: row.get(9),
                envase_target_weight: row.get(10),
                envase_target_unit: row.get(11),
                has_adjustment: has_adj_int == 1,
                corrective_agent_id: row.get(13),
                initial_viscosity: row.get(14),
                trial_agent_qty: row.get(15),
                trial_viscosity: row.get(16),
                agent_qty_per_liter: row.get(17),
                batch_size: row.get(18),
                total_agent_required: row.get(19),
                notes: row.get(20),
                created_at: row.get(21),
            }
        })
        .collect())
}

pub async fn save_fisco_quimica_analysis_query(
    pool: PgPool,
    analysis: &FiscoQuimicaAnalysis,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO fisco_quimica_analyses (id, product_code, product_name, batch, analysis_date, technician, ph_measured, viscosity_measured, density_measured, fraction_weight, envase_target_weight, envase_target_unit, has_adjustment, corrective_agent_id, initial_viscosity, trial_agent_qty, trial_viscosity, agent_qty_per_liter, batch_size, total_agent_required, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT(id) DO UPDATE SET
            product_code = EXCLUDED.product_code,
            product_name = EXCLUDED.product_name,
            batch = EXCLUDED.batch,
            analysis_date = EXCLUDED.analysis_date,
            technician = EXCLUDED.technician,
            ph_measured = EXCLUDED.ph_measured,
            viscosity_measured = EXCLUDED.viscosity_measured,
            density_measured = EXCLUDED.density_measured,
            fraction_weight = EXCLUDED.fraction_weight,
            envase_target_weight = EXCLUDED.envase_target_weight,
            envase_target_unit = EXCLUDED.envase_target_unit,
            has_adjustment = EXCLUDED.has_adjustment,
            corrective_agent_id = EXCLUDED.corrective_agent_id,
            initial_viscosity = EXCLUDED.initial_viscosity,
            trial_agent_qty = EXCLUDED.trial_agent_qty,
            trial_viscosity = EXCLUDED.trial_viscosity,
            agent_qty_per_liter = EXCLUDED.agent_qty_per_liter,
            batch_size = EXCLUDED.batch_size,
            total_agent_required = EXCLUDED.total_agent_required,
            notes = EXCLUDED.notes",
    )
    .bind(&analysis.id)
    .bind(&analysis.product_code)
    .bind(&analysis.product_name)
    .bind(&analysis.batch)
    .bind(&analysis.analysis_date)
    .bind(&analysis.technician)
    .bind(analysis.ph_measured)
    .bind(analysis.viscosity_measured)
    .bind(analysis.density_measured)
    .bind(analysis.fraction_weight)
    .bind(analysis.envase_target_weight)
    .bind(&analysis.envase_target_unit)
    .bind(if analysis.has_adjustment { 1 } else { 0 })
    .bind(&analysis.corrective_agent_id)
    .bind(analysis.initial_viscosity)
    .bind(analysis.trial_agent_qty)
    .bind(analysis.trial_viscosity)
    .bind(analysis.agent_qty_per_liter)
    .bind(analysis.batch_size)
    .bind(analysis.total_agent_required)
    .bind(&analysis.notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_fisco_quimica_analysis_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM fisco_quimica_analyses WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "desktop")]
#[allow(dead_code)]
mod _tauri_stubs {
    use super::*;
    use tauri::State;
    use crate::DbState;
    #[tauri::command]
    pub fn get_microbio_config(_state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
        Err("Use a API REST (/api/hub/microbio/config)".into())
    }

    #[tauri::command]
    pub fn save_config_microbio(_state: State<DbState>, _config: serde_json::Value) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/config)".into())
    }

    #[tauri::command]
    pub fn get_products(_state: State<DbState>) -> Result<Vec<Product>, String> {
        Err("Use a API REST (/api/hub/microbio/products)".into())
    }

    #[tauri::command]
    pub fn save_product(_state: State<DbState>, _product: Product) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/products)".into())
    }

    #[tauri::command]
    pub fn delete_product(_state: State<DbState>, _code: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/products/:code)".into())
    }

    #[tauri::command]
    pub fn get_reports(_state: State<DbState>) -> Result<Vec<Report>, String> {
        Err("Use a API REST (/api/hub/microbio/reports)".into())
    }

    #[tauri::command]
    pub fn save_reports(_state: State<DbState>, _reports: Vec<Report>) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/reports)".into())
    }

    #[tauri::command]
    pub fn delete_report(_state: State<DbState>, _id: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/reports/:id)".into())
    }

    #[tauri::command]
    pub fn delete_all_products(_state: State<DbState>) -> Result<(), String> {
        Err("Use a API REST (/api/hub/microbio/products)".into())
    }

    #[tauri::command]
    pub fn get_fisco_quimica_patterns(_state: State<DbState>) -> Result<Vec<FiscoQuimicaPattern>, String> {
        Err("Use a API REST (/api/hub/fisco/patterns)".into())
    }

    #[tauri::command]
    pub fn save_fisco_quimica_pattern(_state: State<DbState>, _pattern: FiscoQuimicaPattern) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/patterns)".into())
    }

    #[tauri::command]
    pub fn delete_fisco_quimica_pattern(_state: State<DbState>, _code: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/patterns/:code)".into())
    }

    #[tauri::command]
    pub fn get_fisco_quimica_agents(_state: State<DbState>) -> Result<Vec<FiscoQuimicaAgent>, String> {
        Err("Use a API REST (/api/hub/fisco/agents)".into())
    }

    #[tauri::command]
    pub fn save_fisco_quimica_agent(_state: State<DbState>, _agent: FiscoQuimicaAgent) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/agents)".into())
    }

    #[tauri::command]
    pub fn delete_fisco_quimica_agent(_state: State<DbState>, _id: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/agents/:id)".into())
    }

    #[tauri::command]
    pub fn get_fisco_quimica_analyses(_state: State<DbState>) -> Result<Vec<FiscoQuimicaAnalysis>, String> {
        Err("Use a API REST (/api/hub/fisco/analyses)".into())
    }

    #[tauri::command]
    pub fn save_fisco_quimica_analysis(_state: State<DbState>, _analysis: FiscoQuimicaAnalysis) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/analyses)".into())
    }

    #[tauri::command]
    pub fn delete_fisco_quimica_analysis(_state: State<DbState>, _id: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/fisco/analyses/:id)".into())
    }

}

#[cfg_attr(feature = "desktop", tauri::command)]
pub fn open_external_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
