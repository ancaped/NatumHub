use sqlx::{PgPool, Row};
use std::collections::HashMap;
use uuid::Uuid;

use crate::modules::compras::planejamento::models::*;

fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(e) if e.code().as_deref() == Some("23505"))
}

const ITEM_CATEGORY_STOCK_SQL: &str = "
    SELECT i.code,
           COALESCE(pc.name, c.name, 'Matéria Prima') AS categoria_principal,
           COALESCE(e.estoque, 0) AS estoque_atual
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN estoque_atual e ON i.code = e.codigo
";

pub async fn get_compras_config_query(
    pool: PgPool,
    key: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let row = sqlx::query("SELECT value FROM config WHERE key = $1")
        .bind(&config_key)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    match row {
        Some(row) => {
            let val: String = row.get(0);
            let config: serde_json::Value = serde_json::from_str(&val).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        None => Ok(None),
    }
}

pub async fn save_compras_config_query(
    pool: PgPool,
    config: &serde_json::Value,
    key: Option<String>,
) -> Result<(), String> {
    let config_key = key.unwrap_or_else(|| "compras_main".to_string());
    let val = serde_json::to_string(config).map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(&config_key)
    .bind(&val)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if config_key == "compras_main" {
        let _ = sqlx::query(
            "UPDATE items
             SET category_id = CASE
                 WHEN code LIKE '9.15.%' THEN 'cat_mp'
                 WHEN code LIKE '08.%' THEN 'cat_mat'
                 ELSE 'cat_emb'
             END
             WHERE (manual_category IS NULL OR manual_category = 0)",
        )
        .execute(&pool)
        .await;
    } else if config_key == "compras_coloracao" {
        let _ = sqlx::query(
            "UPDATE items
             SET category_id = 'cat_mp'
             WHERE code LIKE '9.15.%' AND (manual_category IS NULL OR manual_category = 0)",
        )
        .execute(&pool)
        .await;
    } else if config_key == "compras_apoio" {
        let _ = sqlx::query(
            "UPDATE items
             SET category_id = 'cat_mat'
             WHERE code LIKE '08.%' AND (manual_category IS NULL OR manual_category = 0)",
        )
        .execute(&pool)
        .await;
    }

    if config_key == "compras_main" || config_key == "compras_coloracao" || config_key == "compras_apoio" {
        if let Some(rules) = config.get("autoSubcategories").and_then(|r| r.as_array()) {
            for rule in rules {
                if let (Some(sub_id), Some(prefix)) = (
                    rule.get("subcategoryId").and_then(|s| s.as_str()),
                    rule.get("prefix").and_then(|p| p.as_str()),
                ) {
                    let rule_type = rule.get("type").and_then(|t| t.as_str()).unwrap_or("description");
                    let parent_id: Option<String> = sqlx::query_scalar(
                        "SELECT parent_id FROM categories WHERE id = $1",
                    )
                    .bind(sub_id)
                    .fetch_optional(&pool)
                    .await
                    .ok()
                    .flatten();

                    if let Some(parent) = parent_id {
                        if parent == "cat_coloracao" || parent == "cat_apoio" {
                            let query = if parent == "cat_coloracao" {
                                if rule_type == "supplier" {
                                    "
                                    INSERT INTO overrides_produtos (codigo, categoria_produto)
                                    SELECT p.codigo, $1 FROM produtos p
                                    LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                    WHERE p.codigo IN (SELECT DISTINCT item_code FROM invoices WHERE supplier_name ILIKE $2)
                                      AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                      AND p.codigo LIKE '1.34.%'
                                    ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto"
                                } else {
                                    "
                                    INSERT INTO overrides_produtos (codigo, categoria_produto)
                                    SELECT p.codigo, $1 FROM produtos p
                                    LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                    WHERE (p.descricao LIKE $2 OR p.codigo LIKE $2)
                                      AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                      AND p.codigo LIKE '1.34.%'
                                    ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto"
                                }
                            } else {
                                if rule_type == "supplier" {
                                    "
                                    INSERT INTO overrides_produtos (codigo, categoria_produto)
                                    SELECT p.codigo, $1 FROM produtos p
                                    LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                    WHERE p.codigo IN (SELECT DISTINCT item_code FROM invoices WHERE supplier_name ILIKE $2)
                                      AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                      AND p.codigo LIKE '1.30.%'
                                    ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto"
                                } else {
                                    "
                                    INSERT INTO overrides_produtos (codigo, categoria_produto)
                                    SELECT p.codigo, $1 FROM produtos p
                                    LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
                                    WHERE (p.descricao LIKE $2 OR p.codigo LIKE $2)
                                      AND (op.categoria_produto IS NULL OR op.categoria_produto = 'cat_coloracao' OR op.categoria_produto = 'cat_apoio')
                                      AND p.codigo LIKE '1.30.%'
                                    ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto"
                                }
                            };
                            let like_pattern = if rule_type == "supplier" {
                                format!("%{}%", prefix)
                            } else {
                                format!("{}%", prefix)
                            };
                            let _ = sqlx::query(query)
                                .bind(sub_id)
                                .bind(&like_pattern)
                                .execute(&pool)
                                .await;
                        } else {
                            if rule_type == "supplier" {
                                let like_pattern = format!("%{}%", prefix);
                                let _ = sqlx::query(
                                    "UPDATE items SET category_id = $1
                                     WHERE code IN (
                                         SELECT DISTINCT item_code FROM invoices 
                                         WHERE supplier_name ILIKE $2
                                     )
                                     AND category_id = $3
                                     AND (manual_category IS NULL OR manual_category = 0)",
                                )
                                .bind(sub_id)
                                .bind(&like_pattern)
                                .bind(&parent)
                                .execute(&pool)
                                .await;
                            } else {
                                let like_pattern = format!("{}%", prefix);
                                let _ = sqlx::query(
                                    "UPDATE items SET category_id = $1
                                     WHERE description LIKE $2
                                       AND category_id = $3
                                       AND (manual_category IS NULL OR manual_category = 0)",
                                )
                                .bind(sub_id)
                                .bind(&like_pattern)
                                .bind(&parent)
                                .execute(&pool)
                                .await;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

pub async fn import_stock_query(
    pool: PgPool,
    rows: &[serde_json::Value],
    filename: &str,
) -> Result<ImportResult, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let import_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO stock_imports (id, filename, source) VALUES ($1, $2, 'ERP')")
        .bind(&import_id)
        .bind(filename)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        if code.is_empty() {
            continue;
        }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let stock_qty = row["stockQty"].as_f64().unwrap_or(0.0);
        let reserved_qty = row["reservedQty"].as_f64().unwrap_or(0.0);
        let in_production = row["inProduction"].as_f64().unwrap_or(0.0);
        let in_orders = row["inOrders"].as_f64().unwrap_or(0.0);

        let item_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1)")
            .bind(code)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let unit_val = if unit.is_empty() { "UN" } else { unit };
            let _ = sqlx::query(
                "INSERT INTO items (code, description, unit, category_id) VALUES ($1, $2, $3, $4)",
            )
            .bind(code)
            .bind(desc)
            .bind(unit_val)
            .bind(cat_id)
            .execute(&mut *tx)
            .await;
            new_items += 1;
        }

        let snap_id = Uuid::new_v4().to_string();
        let res = sqlx::query(
            "INSERT INTO stock_snapshots (id, item_code, stock_qty, reserved_qty, in_production, in_orders, import_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(&snap_id)
        .bind(code)
        .bind(stock_qty)
        .bind(reserved_qty)
        .bind(in_production)
        .bind(in_orders)
        .bind(&import_id)
        .execute(&mut *tx)
        .await;

        match res {
            Ok(_) => updated_items += 1,
            Err(e) if is_unique_violation(&e) => skipped_duplicates += 1,
            Err(e) => errors.push(format!("Error on snapshot for {}: {}", code, e)),
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

pub async fn import_consumption_query(
    pool: PgPool,
    rows: &[serde_json::Value],
    _filename: &str,
) -> Result<ImportResult, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let year = row["year"].as_i64().unwrap_or(0) as i32;
        if code.is_empty() || year == 0 {
            continue;
        }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let total_qty = row["totalQty"].as_f64().unwrap_or(0.0);
        let monthly_avg = row["monthlyAvg"].as_f64().unwrap_or(0.0);

        let item_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1)")
            .bind(code)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let unit_val = if unit.is_empty() { "UN" } else { unit };
            let _ = sqlx::query(
                "INSERT INTO items (code, description, unit, category_id) VALUES ($1, $2, $3, $4)",
            )
            .bind(code)
            .bind(desc)
            .bind(unit_val)
            .bind(cat_id)
            .execute(&mut *tx)
            .await;
            new_items += 1;
        }

        let consumption_id = Uuid::new_v4().to_string();
        let res = sqlx::query(
            "INSERT INTO consumption (id, item_code, year, total_qty, monthly_avg)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (item_code, year) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                monthly_avg = EXCLUDED.monthly_avg,
                imported_at = CURRENT_TIMESTAMP::TEXT",
        )
        .bind(&consumption_id)
        .bind(code)
        .bind(year)
        .bind(total_qty)
        .bind(monthly_avg)
        .execute(&mut *tx)
        .await;

        match res {
            Ok(_) => updated_items += 1,
            Err(e) if is_unique_violation(&e) => skipped_duplicates += 1,
            Err(e) => errors.push(format!("Error on consumption for {}: {}", code, e)),
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

pub async fn import_invoices_query(
    pool: PgPool,
    rows: &[serde_json::Value],
    _filename: &str,
) -> Result<ImportResult, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut new_items = 0;
    let mut updated_items = 0;
    let mut skipped_duplicates = 0;
    let mut errors = Vec::new();

    for row in rows {
        let code = row["itemCode"].as_str().unwrap_or("");
        let inv_number = row["invoiceNumber"].as_str().unwrap_or("");
        if code.is_empty() || inv_number.is_empty() {
            continue;
        }

        let desc = row["description"].as_str().unwrap_or("");
        let unit = row["unit"].as_str().unwrap_or("");
        let inv_date = row["invoiceDate"].as_str().unwrap_or("");
        let qty = row["quantity"].as_f64().unwrap_or(0.0);
        let unit_price = row["unitPrice"].as_f64().unwrap_or(0.0);
        let total_val = row["totalValue"].as_f64().unwrap_or(0.0);
        let supplier_name = row["supplierName"].as_str().unwrap_or("");

        let item_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM items WHERE code = $1)")
            .bind(code)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or(false);

        if !item_exists {
            let cat_id = if code.starts_with("9.15.") { "cat_mp" } else { "cat_emb" };
            let unit_val = if unit.is_empty() { "UN" } else { unit };
            let _ = sqlx::query(
                "INSERT INTO items (code, description, unit, category_id) VALUES ($1, $2, $3, $4)",
            )
            .bind(code)
            .bind(desc)
            .bind(unit_val)
            .bind(cat_id)
            .execute(&mut *tx)
            .await;
            new_items += 1;
        }

        let mut supplier_id = String::new();
        if !supplier_name.is_empty() {
            let sid: Option<String> = sqlx::query_scalar("SELECT id FROM suppliers WHERE name = $1")
                .bind(supplier_name)
                .fetch_optional(&mut *tx)
                .await
                .ok()
                .flatten();

            match sid {
                Some(id) => supplier_id = id,
                None => {
                    supplier_id = Uuid::new_v4().to_string();
                    let _ = sqlx::query("INSERT INTO suppliers (id, name) VALUES ($1, $2)")
                        .bind(&supplier_id)
                        .bind(supplier_name)
                        .execute(&mut *tx)
                        .await;
                    new_items += 1;
                }
            }
        }

        let inv_id = Uuid::new_v4().to_string();
        let supplier_id_opt = if supplier_id.is_empty() {
            None
        } else {
            Some(supplier_id.as_str())
        };
        let res = sqlx::query(
            "INSERT INTO invoices (
                id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id, invoice_date,
                cfop, icms_value, ipi_value, freight_value, entry_date, carrier_name, supplier_cnpj, payment_installments
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, 0.0, 0.0, 0.0, NULL, NULL, NULL, NULL)",
        )
        .bind(&inv_id)
        .bind(inv_number)
        .bind(code)
        .bind(desc)
        .bind(unit)
        .bind(qty)
        .bind(unit_price)
        .bind(total_val)
        .bind(supplier_name)
        .bind(supplier_id_opt)
        .bind(inv_date)
        .execute(&mut *tx)
        .await;

        match res {
            Ok(_) => updated_items += 1,
            Err(e) if is_unique_violation(&e) => skipped_duplicates += 1,
            Err(e) => errors.push(format!("Error on invoice {} for {}: {}", inv_number, code, e)),
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(ImportResult {
        total_rows: rows.len() as i32,
        new_items,
        updated_items,
        skipped_duplicates,
        errors,
    })
}

pub async fn get_import_history_query(pool: PgPool) -> Result<Vec<StockImport>, String> {
    let rows = sqlx::query(
        "SELECT id, COALESCE(filename, ''), COALESCE(source, 'ERP'), COALESCE(imported_at, ''), COALESCE(item_count, 0)
         FROM stock_imports ORDER BY imported_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| StockImport {
            id: row.get(0),
            filename: row.get(1),
            source: row.get(2),
            imported_at: row.get(3),
            item_count: crate::core::pg_row::pg_i32(&row, 4),
        })
        .collect())
}

pub async fn get_nf_import_control_query(pool: PgPool) -> Result<Option<serde_json::Value>, String> {
    let row = sqlx::query(
        "SELECT last_period_end FROM nf_import_control ORDER BY imported_at DESC LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    match row {
        Some(row) => {
            let last_period_end: String = row.get(0);
            Ok(Some(serde_json::json!({ "lastPeriodEnd": last_period_end })))
        }
        None => Ok(None),
    }
}

pub async fn get_ignored_product_statuses_query(pool: PgPool) -> Result<Vec<String>, String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = 'ignored_product_statuses'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    match row {
        Some(row) => {
            let val: String = row.get(0);
            Ok(serde_json::from_str(&val)
                .unwrap_or_else(|_| vec!["descontinuado".to_string(), "terceirizado".to_string()]))
        }
        None => Ok(vec!["descontinuado".to_string(), "terceirizado".to_string()]),
    }
}

pub async fn get_auto_ignored_ingredients_query(
    pool: PgPool,
) -> Result<HashMap<String, String>, String> {
    let ignored_statuses = get_ignored_product_statuses_query(pool.clone()).await?;

    let mut item_info_map: HashMap<String, (String, f64)> = HashMap::new();
    if let Ok(rows) = sqlx::query(ITEM_CATEGORY_STOCK_SQL).fetch_all(&pool).await {
        for row in rows {
            let code: String = row.get(0);
            let cat: String = row.get(1);
            let est: f64 = row.get(2);
            item_info_map.insert(code, (cat, est));
        }
    }

    let mut product_ingredients_map: HashMap<String, Vec<(String, String, f64)>> = HashMap::new();
    let query_form = "
        SELECT f.product_code, f.ingredient_code,
               COALESCE(pc.name, c.name, 'Matéria Prima'),
               COALESCE(e.estoque, 0)
        FROM formulations f
        JOIN items i ON f.ingredient_code = i.code
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        LEFT JOIN estoque_atual e ON i.code = e.codigo
    ";
    if let Ok(rows) = sqlx::query(query_form).fetch_all(&pool).await {
        for row in rows {
            let prod_code: String = row.get(0);
            let ing_code: String = row.get(1);
            let cat: String = row.get(2);
            let est: f64 = row.get(3);
            product_ingredients_map
                .entry(prod_code)
                .or_default()
                .push((ing_code, cat, est));
        }
    }

    let mut item_products_map: HashMap<String, Vec<(String, String, String)>> = HashMap::new();
    let query = "
        SELECT f.ingredient_code, f.product_code, p.descricao,
               COALESCE(op.status_produto, 'ativo'), COALESCE(cl.visivel, 1)
        FROM formulations f
        JOIN produtos p ON f.product_code = p.codigo
        LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
        LEFT JOIN overrides_produtos op ON p.codigo = op.codigo
    ";
    if let Ok(rows) = sqlx::query(query).fetch_all(&pool).await {
        for row in rows {
            let ing_code: String = row.get(0);
            let prod_code: String = row.get(1);
            let prod_desc: String = row.get(2);
            let mut prod_status: String = row.get(3);
            let line_visivel: i32 = row.get(4);
            if line_visivel == 0 {
                prod_status = "descontinuado".to_string();
            }
            item_products_map
                .entry(ing_code)
                .or_default()
                .push((prod_code, prod_desc, prod_status));
        }
    }

    let mut auto_ignored_map = HashMap::new();
    for (ing_code, products_info) in item_products_map {
        if products_info.is_empty() {
            continue;
        }

        let all_ignored = products_info.iter().all(|(_, _, status)| {
            ignored_statuses.contains(status) || status == "saindo_de_linha"
        });

        if all_ignored {
            let has_saindo = products_info
                .iter()
                .any(|(_, _, status)| status == "saindo_de_linha");
            let mut should_ignore = true;

            if has_saindo {
                let (ing_cat, _) = item_info_map
                    .get(&ing_code)
                    .cloned()
                    .unwrap_or(("Matéria Prima".to_string(), 0.0));

                if ing_cat == "Matéria Prima" {
                    let mut has_packaging_stock = false;
                    for (prod_code, _, prod_status) in &products_info {
                        if prod_status == "saindo_de_linha" {
                            if let Some(ingredients) = product_ingredients_map.get(prod_code) {
                                for (_, sub_cat, sub_est) in ingredients {
                                    if sub_cat != "Matéria Prima" && *sub_est > 0.1 {
                                        has_packaging_stock = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if has_packaging_stock {
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

    Ok(auto_ignored_map)
}

// Tauri stubs — use REST hub API
use tauri::State;
use crate::DbState;

#[tauri::command]
pub fn get_compras_config(_state: State<DbState>, _key: Option<String>) -> Result<Option<serde_json::Value>, String> {
    Err("Use a API REST (/api/hub/compras/config)".into())
}

#[tauri::command]
pub fn save_compras_config(
    _state: State<DbState>,
    _config: serde_json::Value,
    _key: Option<String>,
) -> Result<(), String> {
    Err("Use a API REST (/api/hub/compras/config)".into())
}

#[tauri::command]
pub fn import_stock(
    _state: State<DbState>,
    _rows: Vec<serde_json::Value>,
    _filename: String,
) -> Result<ImportResult, String> {
    Err("Use a API REST (/api/hub/compras/imports/stock)".into())
}

#[tauri::command]
pub fn import_consumption(
    _state: State<DbState>,
    _rows: Vec<serde_json::Value>,
    _filename: String,
) -> Result<ImportResult, String> {
    Err("Use a API REST (/api/hub/compras/imports/consumption)".into())
}

#[tauri::command]
pub fn import_invoices(
    _state: State<DbState>,
    _rows: Vec<serde_json::Value>,
    _filename: String,
) -> Result<ImportResult, String> {
    Err("Use a API REST (/api/hub/compras/imports/invoices)".into())
}

#[tauri::command]
pub fn get_import_history(_state: State<DbState>) -> Result<Vec<StockImport>, String> {
    Err("Use a API REST (/api/hub/compras/imports/history)".into())
}

#[tauri::command]
pub fn get_nf_import_control(_state: State<DbState>) -> Result<Option<serde_json::Value>, String> {
    Err("Use a API REST (/api/hub/compras/imports/nf-control)".into())
}
