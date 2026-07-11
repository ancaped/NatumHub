use tauri::State;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use uuid::Uuid;

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

// Cross-module helper imports



pub fn get_compras_config_conn(conn: &Connection, key: Option<String>) -> Result<Option<serde_json::Value>, String> {
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let mut stmt = conn.prepare("SELECT value FROM config WHERE key = ?1").map_err(|e| e.to_string())?;
    let res = stmt.query_row(params![config_key], |row| {
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
pub fn get_compras_config(state: State<DbState>, key: Option<String>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    get_compras_config_conn(&conn, key)
}

pub fn save_compras_config_conn(conn: &Connection, config: &serde_json::Value, key: Option<String>) -> Result<(), String> {
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let val = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
        params![config_key, val],
    ).map_err(|e| e.to_string())?;

    if config_key == "compras_main" {
        // Reset non-manual items to their default master category
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = CASE 
                 WHEN code LIKE '9.15.%' THEN 'cat_mp' 
                 WHEN code LIKE '08.%' THEN 'cat_mat'
                 ELSE 'cat_emb' 
             END 
             WHERE (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    } else if config_key == "compras_coloracao" {
        // Reset only raw materials
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = 'cat_mp'
             WHERE code LIKE '9.15.%' AND (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    } else if config_key == "compras_apoio" {
        // Reset only support materials
        let _ = conn.execute(
            "UPDATE items 
             SET category_id = 'cat_mat'
             WHERE code LIKE '08.%' AND (manual_category IS NULL OR manual_category = 0)",
            [],
        );
    }

    if config_key == "compras_main" || config_key == "compras_coloracao" || config_key == "compras_apoio" {
        // Apply automatic subcategory rules if configured
        if let Some(rules) = config.get("autoSubcategories").and_then(|r| r.as_array()) {
            for rule in rules {
                if let (Some(sub_id), Some(prefix)) = (
                    rule.get("subcategoryId").and_then(|s| s.as_str()),
                    rule.get("prefix").and_then(|p| p.as_str())
                ) {
                    // Find parent_id of the target subcategory to restrict scope
                    let parent_id: Option<String> = conn.query_row(
                        "SELECT parent_id FROM categories WHERE id = ?1",
                        params![sub_id],
                        |row| row.get(0)
                    ).ok();

                    if let Some(parent) = parent_id {
                        if parent == "cat_coloracao" || parent == "cat_apoio" {
                            let query = if parent == "cat_coloracao" {
                                "
                                INSERT INTO overrides_produtos (codigo, categoria_produto)
                                SELECT p.codigo, ?1 FROM produtos p
                                LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                WHERE (p.descricao LIKE ?2 OR p.codigo LIKE ?2)
                                  AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                  AND p.codigo LIKE '1.34.%'
                                ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto"
                            } else {
                                "
                                INSERT INTO overrides_produtos (codigo, categoria_produto)
                                SELECT p.codigo, ?1 FROM produtos p
                                LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                WHERE (p.descricao LIKE ?2 OR p.codigo LIKE ?2)
                                  AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                  AND p.codigo LIKE '1.30.%'
                                ON CONFLICT(codigo) DO UPDATE SET categoria_produto = excluded.categoria_produto"
                            };
                            let like_pattern = format!("{}%", prefix);
                            let _ = conn.execute(query, params![sub_id, like_pattern]);
                        } else {
                            let query = "UPDATE items SET category_id = ?1 
                                         WHERE description LIKE ?2 
                                           AND category_id = ?3 
                                           AND (manual_category IS NULL OR manual_category = 0)";
                            let like_pattern = format!("{}%", prefix);
                            let _ = conn.execute(query, params![sub_id, like_pattern, parent]);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn save_compras_config(state: State<DbState>, config: serde_json::Value, key: Option<String>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    save_compras_config_conn(&conn, &config, key)
}

pub fn import_stock_conn(conn: &mut Connection, rows: &[serde_json::Value], filename: &str) -> Result<ImportResult, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let import_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO stock_imports (id, filename, source) VALUES (?1, ?2, 'ERP')",
        params![import_id, filename],
    ).map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        if code.is_empty() { continue; }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let stock_qty = row["stockQty"].as_f64().unwrap_or(0.0);
        let reserved_qty = row["reservedQty"].as_f64().unwrap_or(0.0);
        let in_production = row["inProduction"].as_f64().unwrap_or(0.0);
        let in_orders = row["inOrders"].as_f64().unwrap_or(0.0);

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id) VALUES (?1, ?2, ?3, ?4)",
                params![code, desc, if unit.is_empty() { "UN" } else { unit }, cat_id]
            );
            new_items += 1;
        }

        let snap_id = Uuid::new_v4().to_string();
        let res = tx.execute(
            "INSERT INTO stock_snapshots (id, item_code, stock_qty, reserved_qty, in_production, in_orders, import_id) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![snap_id, code, stock_qty, reserved_qty, in_production, in_orders, import_id]
        );
        match res {
            Ok(_) => updated_items += 1,
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ffi::ErrorCode::ConstraintViolation => {
                skipped_duplicates += 1;
            },
            Err(e) => errors.push(format!("Error on snapshot for {}: {}", code, e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
pub fn import_stock(state: State<DbState>, rows: Vec<serde_json::Value>, filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    import_stock_conn(&mut conn, &rows, &filename)
}

pub fn import_consumption_conn(conn: &mut Connection, rows: &[serde_json::Value], _filename: &str) -> Result<ImportResult, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let year = row["year"].as_i64().unwrap_or(0) as i32;
        if code.is_empty() || year == 0 { continue; }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let total_qty = row["totalQty"].as_f64().unwrap_or(0.0);
        let monthly_avg = row["monthlyAvg"].as_f64().unwrap_or(0.0);

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id) VALUES (?1, ?2, ?3, ?4)",
                params![code, desc, if unit.is_empty() { "UN" } else { unit }, cat_id]
            );
            new_items += 1;
        }

        let res = tx.execute(
            "INSERT OR REPLACE INTO consumption (item_code, year, total_qty, monthly_avg) 
             VALUES (?1, ?2, ?3, ?4)",
            params![code, year, total_qty, monthly_avg]
        );
        match res {
            Ok(_) => updated_items += 1,
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ffi::ErrorCode::ConstraintViolation => {
                skipped_duplicates += 1;
            },
            Err(e) => errors.push(format!("Error on consumption for {}: {}", code, e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
pub fn import_consumption(state: State<DbState>, rows: Vec<serde_json::Value>, filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    import_consumption_conn(&mut conn, &rows, &filename)
}

pub fn import_invoices_conn(conn: &mut Connection, rows: &[serde_json::Value], _filename: &str) -> Result<ImportResult, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let inv_number = row["invoiceNumber"].as_str().unwrap_or("");
        if code.is_empty() || inv_number.is_empty() { continue; }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let inv_date = row["invoiceDate"].as_str().unwrap_or("");
        let qty = row["quantity"].as_f64().unwrap_or(0.0);
        let unit_price = row["unitPrice"].as_f64().unwrap_or(0.0);
        let total_val = row["totalValue"].as_f64().unwrap_or(0.0);
        let supplier_name = row["supplierName"].as_str().unwrap_or("");

        let item_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE code = ?1)", 
            params![code], 
            |r| r.get(0)
        ).unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let _ = tx.execute(
                "INSERT INTO items (code, description, unit, category_id) VALUES (?1, ?2, ?3, ?4)",
                params![code, desc, if unit.is_empty() { "UN" } else { unit }, cat_id]
            );
            new_items += 1;
        }

        let mut supplier_id = String::new();
        if !supplier_name.is_empty() {
            let sid: Result<String, _> = tx.query_row(
                "SELECT id FROM suppliers WHERE name = ?1", 
                params![supplier_name], 
                |r| r.get(0)
            );
            match sid {
                Ok(id) => supplier_id = id,
                Err(_) => {
                    supplier_id = Uuid::new_v4().to_string();
                    let _ = tx.execute(
                        "INSERT INTO suppliers (id, name) VALUES (?1, ?2)",
                        params![supplier_id, supplier_name]
                    );
                    new_items += 1;
                }
            }
        }

        let inv_id = Uuid::new_v4().to_string();
        let res = tx.execute(
            "INSERT INTO invoices (id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![inv_id, inv_number, code, desc, unit, qty, unit_price, total_val, supplier_name, if supplier_id.is_empty() { None } else { Some(supplier_id) }, inv_date]
        );
        match res {
            Ok(_) => updated_items += 1,
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ffi::ErrorCode::ConstraintViolation => {
                skipped_duplicates += 1;
            },
            Err(e) => errors.push(format!("Error on invoice {} for {}: {}", inv_number, code, e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

#[tauri::command]
pub fn import_invoices(state: State<DbState>, rows: Vec<serde_json::Value>, filename: String) -> Result<ImportResult, String> {
    let mut conn = state.0.lock().unwrap();
    import_invoices_conn(&mut conn, &rows, &filename)
}

pub fn get_import_history_conn(conn: &Connection) -> Result<Vec<StockImport>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, IFNULL(filename,''), IFNULL(source,'ERP'), IFNULL(imported_at,''), IFNULL(item_count,0)
         FROM stock_imports ORDER BY imported_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(StockImport {
            id: row.get(0)?,
            filename: row.get(1)?,
            source: row.get(2)?,
            imported_at: row.get(3)?,
            item_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut imports = Vec::new();
    for row in rows {
        imports.push(row.map_err(|e| e.to_string())?);
    }
    Ok(imports)
}

#[tauri::command]
pub fn get_import_history(state: State<DbState>) -> Result<Vec<StockImport>, String> {
    let conn = state.0.lock().unwrap();
    get_import_history_conn(&conn)
}

pub fn get_nf_import_control_conn(conn: &Connection) -> Result<Option<serde_json::Value>, String> {
    let res = conn.query_row(
        "SELECT last_period_end FROM nf_import_control ORDER BY imported_at DESC LIMIT 1",
        [],
        |row| {
            let end: String = row.get(0)?;
            Ok(end)
        }
    );
    match res {
        Ok(last_period_end) => Ok(Some(serde_json::json!({ "lastPeriodEnd": last_period_end }))),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_nf_import_control(state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
    let conn = state.0.lock().unwrap();
    get_nf_import_control_conn(&conn)
}

pub fn get_ignored_product_statuses(conn: &Connection) -> Vec<String> {
    let query = "SELECT value FROM settings WHERE key = 'ignored_product_statuses'";
    let res = conn.query_row(query, [], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    });
    match res {
        Ok(val) => {
            serde_json::from_str(&val).unwrap_or_else(|_| vec!["descontinuado".to_string(), "terceirizado".to_string()])
        }
        Err(_) => vec!["descontinuado".to_string(), "terceirizado".to_string()]
    }
}

pub fn get_auto_ignored_ingredients(conn: &Connection) -> std::collections::HashMap<String, String> {
    let ignored_statuses = get_ignored_product_statuses(conn);
    
    // Mapping of ingredient_code -> (categoriaPrincipal, estoque_atual)
    let mut item_info_map: std::collections::HashMap<String, (String, f64)> = std::collections::HashMap::new();
    let query_items = "SELECT code, categoriaPrincipal, estoque_atual FROM items";
    if let Ok(mut stmt) = conn.prepare(query_items) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        }) {
            for r in rows {
                if let Ok((code, cat, est)) = r {
                    item_info_map.insert(code, (cat, est));
                }
            }
        }
    }

    // Mapping of product_code -> Vec<(ingredient_code, ingredient_category, ingredient_stock)>
    let mut product_ingredients_map: std::collections::HashMap<String, Vec<(String, String, f64)>> = std::collections::HashMap::new();
    let query_form = "
        SELECT f.product_code, f.ingredient_code, i.categoriaPrincipal, i.estoque_atual
        FROM formulations f
        JOIN items i ON f.ingredient_code = i.code
    ";
    if let Ok(mut stmt) = conn.prepare(query_form) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        }) {
            for r in rows {
                if let Ok((prod_code, ing_code, cat, est)) = r {
                    product_ingredients_map.entry(prod_code).or_default().push((ing_code, cat, est));
                }
            }
        }
    }

    let mut item_products_map: std::collections::HashMap<String, Vec<(String, String, String)>> = std::collections::HashMap::new();
    let query = "
        SELECT f.ingredient_code, f.product_code, p.descricao, IFNULL(op.status_produto, 'ativo'), IFNULL(cl.visivel, 1)
        FROM formulations f
        JOIN produtos p ON f.product_code = p.codigo
        LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
        LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
    ";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i32>(4)?,
            ))
        }) {
            for r in rows {
                if let Ok((ing_code, prod_code, prod_desc, mut prod_status, line_visivel)) = r {
                    if line_visivel == 0 {
                        prod_status = "descontinuado".to_string();
                    }
                    item_products_map.entry(ing_code).or_default().push((prod_code, prod_desc, prod_status));
                }
            }
        }
    }

    let mut auto_ignored_map = std::collections::HashMap::new();
    for (ing_code, products_info) in item_products_map {
        if products_info.is_empty() {
            continue;
        }

        // An ingredient is candidate for ignore if ALL products using it are in ignored_statuses OR in 'saindo_de_linha'
        let all_ignored = products_info.iter().all(|(_, _, status)| {
            ignored_statuses.contains(status) || status == "saindo_de_linha"
        });

        if all_ignored {
            let has_saindo = products_info.iter().any(|(_, _, status)| status == "saindo_de_linha");
            let mut should_ignore = true;

            if has_saindo {
                // Fetch details for the current ingredient
                let (ing_cat, _) = item_info_map.get(&ing_code).cloned().unwrap_or(("Matéria Prima".to_string(), 0.0));
                
                if ing_cat == "Matéria Prima" {
                    // Check if there is still any exclusive packaging in stock for the saindo_de_linha products
                    let mut has_packaging_stock = false;
                    for (prod_code, _, prod_status) in &products_info {
                        if prod_status == "saindo_de_linha" {
                            if let Some(ingredients) = product_ingredients_map.get(prod_code) {
                                for (_, sub_cat, sub_est) in ingredients {
                                    // Check if it's packaging and has stock (threshold 0.1)
                                    if sub_cat != "Matéria Prima" && *sub_est > 0.1 {
                                        has_packaging_stock = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if has_packaging_stock {
                        // Do NOT ignore this raw material. Allow buying to consume the remaining packaging.
                        should_ignore = false;
                    }
                }
            }

            if should_ignore {
                let mut list_parts = Vec::new();
                for (_code, desc, status) in &products_info {
                    let status_label = match status.as_str() {
                        "descontinuado" => "Saiu de Linha",
                        "saindo_de_linha" => "Saindo de Linha",
                        "terceirizado" => "Terceirizado",
                        "coloracao" => "Coloração",
                        "apoio" => "Material de Apoio",
                        "bases" => "Bases",
                        s => s,
                    };
                    list_parts.push(format!("{} ({})", desc, status_label));
                }
                let reason = format!(
                    "Suspenso por Linha/Produto ({})",
                    list_parts.join(", ")
                );
                auto_ignored_map.insert(ing_code, reason);
            }
        }
    }

    auto_ignored_map
}
