use tauri::State;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use uuid::Uuid;

use crate::DbState;
use crate::modules::compras::planejamento::models::*;

// Cross-module helper imports
use crate::modules::compras::planejamento::commands::{get_auto_ignored_ingredients, get_ignored_product_statuses};


fn get_item_std_dev(conn: &Connection, item_code: &str) -> f64 {
    let query = "SELECT strftime('%Y-%m', date) as yr_mo, SUM(quantity) 
                 FROM stock_movements 
                 WHERE item_code = ?1 AND movement_type = 'saida' AND date >= date('now', '-12 months') 
                 GROUP BY yr_mo";
    
    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(_) => return 0.0,
    };
    
    let rows = stmt.query_map(params![item_code], |row| row.get::<_, f64>(1));
    let mut monthly_quantities = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(qty) = r {
                monthly_quantities.push(qty);
            }
        }
    }
    
    if monthly_quantities.is_empty() {
        return 0.0;
    }
    
    while monthly_quantities.len() < 12 {
        monthly_quantities.push(0.0);
    }
    
    let count = monthly_quantities.len() as f64;
    let sum: f64 = monthly_quantities.iter().sum();
    let mean = sum / count;
    
    let variance: f64 = monthly_quantities.iter()
        .map(|&x| {
            let diff = x - mean;
            diff * diff
        })
        .sum::<f64>() / count;
        
    variance.sqrt()
}

#[derive(Clone, Debug)]
struct TempConfig {
    level: String,
    target_id: String,
    dias_start: Option<i32>,
    dias_target: Option<i32>,
    use_lead_time: bool,
    safety_days: i32,
    objetivo_tipo: String,
    objetivo_valor: f64,
    periodo_media: Option<i32>,
}

fn global_config_key_for_category(cat_id: Option<&str>, cat_parent_map: &HashMap<String, String>) -> &'static str {
    let mut current = cat_id.map(|s| s.to_string());
    for _ in 0..5 {
        let Some(ref cid) = current else { break };
        if cid == "cat_coloracao" {
            return "compras_coloracao";
        }
        if cid == "cat_apoio" {
            return "compras_apoio";
        }
        if cid == "cat_mp" || cid == "cat_emb" {
            return "compras_main";
        }
        current = cat_parent_map.get(cid).cloned();
    }
    "compras_main"
}

fn resolve_periodo_media(
    code: &str,
    cat_id: Option<&str>,
    item_configs: &HashMap<String, TempConfig>,
    subcat_configs: &HashMap<String, TempConfig>,
    cat_parent_map: &HashMap<String, String>,
    conn: &Connection,
) -> i32 {
    if let Some(cfg) = item_configs.get(code) {
        if let Some(p) = cfg.periodo_media {
            return p;
        }
    }
    if let Some(cid) = cat_id {
        if let Some(cfg) = subcat_configs.get(cid) {
            if let Some(p) = cfg.periodo_media {
                return p;
            }
        }
        if let Some(parent_id) = cat_parent_map.get(cid) {
            if let Some(cfg) = subcat_configs.get(parent_id) {
                if let Some(p) = cfg.periodo_media {
                    return p;
                }
            }
        }
    }
    let cfg_key = global_config_key_for_category(cat_id, cat_parent_map);
    let query = "SELECT CAST(json_extract(value, '$.averagePeriodMonths') AS INTEGER) FROM config WHERE key = ?1";
    if let Ok(val) = conn.query_row(query, params![cfg_key], |row| row.get::<_, Option<i32>>(0)) {
        if let Some(p) = val {
            if p > 0 {
                return p;
            }
        }
    }
    12
}

fn avg_from_faturamento(conn: &Connection, code: &str, months: i32) -> Option<f64> {
    use chrono::Datelike;
    let months = months.clamp(1, 12);
    let mut month_qty = [0i64; 12];
    let mut stmt = conn
        .prepare("SELECT mes, quantidade FROM historico_faturamento WHERE codigo = ?1")
        .ok()?;
    let rows = stmt
        .query_map(params![code], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?))
        })
        .ok()?;
    for r in rows.flatten() {
        let (mes, qty) = r;
        if (1..=12).contains(&mes) {
            month_qty[(mes - 1) as usize] = qty;
        }
    }
    let current_mes = chrono::Local::now().date_naive().month() as i32;
    let mut sum = 0i64;
    for i in 0..months {
        let idx = ((current_mes - 1 - i).rem_euclid(12)) as usize;
        sum += month_qty[idx];
    }
    if sum > 0 {
        Some(sum as f64 / months as f64)
    } else {
        None
    }
}

fn last_n_year_month_keys(n: i32) -> Vec<String> {
    use chrono::Datelike;
    let today = chrono::Local::now().date_naive();
    let mut y = today.year();
    let mut m = today.month() as i32;
    let mut out = Vec::with_capacity(n as usize);
    for _ in 0..n.max(1) {
        out.push(format!("{:04}-{:02}", y, m));
        m -= 1;
        if m == 0 {
            m = 12;
            y -= 1;
        }
    }
    out
}

fn sum_movements_for_period(
    monthly: &HashMap<String, HashMap<String, f64>>,
    code: &str,
    period_months: i32,
) -> f64 {
    let clean = code.replace('.', "");
    let months_map = monthly
        .get(&clean)
        .or_else(|| monthly.get(code));
    let Some(months_map) = months_map else {
        return 0.0;
    };
    last_n_year_month_keys(period_months)
        .iter()
        .filter_map(|k| months_map.get(k).copied())
        .sum()
}

fn get_item_lead_time(conn: &Connection, item_code: &str) -> i32 {
    let query = "SELECT qp.delivery_days 
                 FROM quotation_prices qp 
                 JOIN quotation_items qi ON qp.quotation_item_id = qi.id 
                 WHERE qi.item_code = ?1 AND qp.is_selected = 1 
                 ORDER BY qp.id DESC LIMIT 1";
    
    if let Ok(val) = conn.query_row(query, params![item_code], |row| row.get::<_, Option<i32>>(0)) {
        if let Some(days) = val {
            return days;
        }
    }
    15 // default fallback lead time
}

pub fn get_demands_conn(conn: &Connection, category_id: Option<String>, target_days: i32) -> Result<Vec<DemandResult>, String> {
    // A0. Load custom purchase configs
    let mut custom_configs: Vec<TempConfig> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor, periodo_media 
         FROM compras_config_personalizado"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(TempConfig {
                level: row.get(0)?,
                target_id: row.get(1)?,
                dias_start: row.get(2)?,
                dias_target: row.get(3)?,
                use_lead_time: row.get::<_, i32>(4)? != 0,
                safety_days: row.get(5)?,
                objetivo_tipo: row.get(6)?,
                objetivo_valor: row.get(7)?,
                periodo_media: row.get(8)?,
            })
        }) {
            for r in rows {
                if let Ok(cfg) = r {
                    custom_configs.push(cfg);
                }
            }
        }
    }

    let mut item_configs: HashMap<String, TempConfig> = HashMap::new();
    let mut subcat_configs: HashMap<String, TempConfig> = HashMap::new();
    for cfg in custom_configs {
        if cfg.level == "item" {
            item_configs.insert(cfg.target_id.clone(), cfg);
        } else if cfg.level == "subcategoria" {
            subcat_configs.insert(cfg.target_id.clone(), cfg);
        }
    }

    // Build category parent map
    let mut cat_parent_map: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, parent_id FROM categories") {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        }) {
            for r in rows {
                if let Ok((id, Some(parent_id))) = r {
                    cat_parent_map.insert(id, parent_id);
                }
            }
        }
    }

    // A. Query all open production lotes (entradas of products)
    let mut open_lotes = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT document_number, item_code, quantity, details 
         FROM stock_movements 
         WHERE item_type = 'produto' AND movement_type = 'entrada'"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            ))
        }) {
            for r in rows {
                if let Ok((doc_num, item_code, qty, details)) = r {
                    if !doc_num.is_empty() {
                        let mut status = String::new();
                        let mut d_pesado = String::new();
                        for part in details.split('|') {
                            let part = part.trim();
                            if part.starts_with("Status:") {
                                status = part.trim_start_matches("Status:").trim().to_string();
                            } else if part.starts_with("dPesado:") {
                                d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                            }
                        }
                        let is_closed = status == "EA" || status == "CF" || status == "FP" || status == "CA" || status == "FI";
                        if !is_closed {
                            open_lotes.push((doc_num, item_code, qty, d_pesado));
                        }
                    }
                }
            }
        }
    }

    // B. Query all formulations
    struct FormEntry {
        ingredient_code: String,
        quantity: f64,
        percentage: f64,
        unit: String,
    }
    let mut formulations_map: std::collections::HashMap<String, Vec<FormEntry>> = std::collections::HashMap::new();
    let mut formulation_bulk_sums: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut formulation_total_sums: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    if let Ok(mut stmt) = conn.prepare("
        SELECT f.product_code, f.ingredient_code, f.quantity, IFNULL(f.percentage, 0.0), IFNULL(i.unit, 'UN')
        FROM formulations f
        LEFT JOIN items i ON f.ingredient_code = i.code
    ") {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, String>(4)?,
            ))
        }) {
            for r in rows {
                if let Ok((prod_code, ing_code, qty, pct, unit)) = r {
                    let norm_prod = prod_code.strip_prefix('0').unwrap_or(&prod_code).to_string();
                    let unit_upper = unit.trim().to_uppercase();
                    formulations_map.entry(norm_prod.clone()).or_default().push(FormEntry {
                        ingredient_code: ing_code,
                        quantity: qty,
                        percentage: pct,
                        unit: unit_upper.clone(),
                    });
                    if unit_upper != "UN" {
                        *formulation_bulk_sums.entry(norm_prod.clone()).or_insert(0.0) += qty;
                    }
                    *formulation_total_sums.entry(norm_prod).or_insert(0.0) += qty;
                }
            }
        }
    }

    // C. Query all exits (weighed quantities) for these open lotes
    let mut exits_map: std::collections::HashMap<(String, String), f64> = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT document_number, item_code, SUM(quantity) 
         FROM stock_movements 
         WHERE item_type = 'insumo' AND movement_type = 'saida'
         GROUP BY document_number, item_code"
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?
            ))
        }) {
            for r in rows {
                if let Ok((doc_num, item_code, qty)) = r {
                    exits_map.insert((doc_num, item_code), qty);
                }
            }
        }
    }

    // D. Compute dynamic reserved quantity per insumo
    let mut lotes_baixas_map: std::collections::HashMap<(i64, String), Vec<f64>> = std::collections::HashMap::new();
    
    // Extract valid integer lote numbers for the IN clause
    let lote_ids: Vec<i64> = open_lotes.iter()
        .filter_map(|(doc_num, _, _, _)| doc_num.parse::<i64>().ok())
        .collect();

    if !lote_ids.is_empty() {
        let ids_str = lote_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT nLote, cReferencia, nQtdeRef FROM lotes_baixas WHERE nLote IN ({}) ORDER BY Registro ASC",
            ids_str
        );
        if let Ok(mut stmt) = conn.prepare(&query) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?
                ))
            }) {
                for r in rows {
                    if let Ok((n_lote, c_ref, n_qtde_ref)) = r {
                        lotes_baixas_map.entry((n_lote, c_ref)).or_default().push(n_qtde_ref);
                    }
                }
            }
        }
    }

    let mut total_reserved_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut remaining_reserved_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for (lote_number, product_code, quantity, d_pesado) in open_lotes {
        let norm_prod = product_code.strip_prefix('0').unwrap_or(&product_code).to_string();
        if let Some(ingredients) = formulations_map.get(&norm_prod) {
            let bulk_sum = formulation_bulk_sums.get(&norm_prod).copied().unwrap_or(0.0);
            let total_sum = formulation_total_sums.get(&norm_prod).copied().unwrap_or(0.0);
            let lote_int = lote_number.parse::<i64>().unwrap_or(-1);

            for ing in ingredients {
                let factor = if ing.percentage > 0.0 {
                    ing.percentage / 100.0
                } else if ing.unit == "UN" {
                    if bulk_sum > 0.0 {
                        ing.quantity / bulk_sum
                    } else if total_sum > 0.0 {
                        ing.quantity / total_sum
                    } else {
                        ing.quantity
                    }
                } else {
                    if bulk_sum > 0.0 {
                        ing.quantity / bulk_sum
                    } else if total_sum > 0.0 {
                        ing.quantity / total_sum
                    } else {
                        0.0
                    }
                };
                let fallback_expected = quantity * factor;

                let mut expected = fallback_expected;
                if lote_int != -1 {
                    if let Some(queue) = lotes_baixas_map.get_mut(&(lote_int, ing.ingredient_code.clone())) {
                        if !queue.is_empty() {
                            expected = queue.remove(0);
                        }
                    }
                }

                let exited_qty = exits_map.get(&(lote_number.clone(), ing.ingredient_code.clone())).copied().unwrap_or(0.0);
                let mut remaining = (expected - exited_qty).max(0.0);

                if !d_pesado.is_empty() {
                    remaining = 0.0;
                }

                if fallback_expected > 0.0 {
                    *total_reserved_map.entry(ing.ingredient_code.clone()).or_insert(0.0) += fallback_expected;
                }
                if remaining > 0.0 {
                    *remaining_reserved_map.entry(ing.ingredient_code.clone()).or_insert(0.0) += remaining;
                }
            }
        }
    }

    let mut sql = String::from(
        "SELECT code, description, unit, category_id, category_name,
                stock_qty, reserved_qty, in_production, in_orders,
                monthly_avg_2024, monthly_avg_2025, monthly_avg_2026,
                notes
         FROM (
             SELECT 
                 i.code, i.description, i.unit, i.category_id, IFNULL(c.name, 'Sem Categoria') as category_name,
                 IFNULL(s.stock_qty, 0) as stock_qty, IFNULL(s.reserved_qty, 0) as reserved_qty, 
                 IFNULL(s.in_production, 0) as in_production, IFNULL(s.in_orders, 0) as in_orders,
                 IFNULL(c2024.monthly_avg, 0) as monthly_avg_2024, 
                 IFNULL(c2025.monthly_avg, 0) as monthly_avg_2025, 
                 IFNULL(c2026.monthly_avg, 0) as monthly_avg_2026,
                 i.notes
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN (
                 SELECT item_code, stock_qty, reserved_qty, in_production, in_orders
                 FROM stock_snapshots ss
                 WHERE ss.id = (
                     SELECT id FROM stock_snapshots ss2 
                     WHERE ss2.item_code = ss.item_code 
                     ORDER BY ss2.snapshot_date DESC, ss2.id DESC LIMIT 1
                 )
             ) s ON i.code = s.item_code
             LEFT JOIN consumption c2024 ON i.code = c2024.item_code AND c2024.year = 2024
             LEFT JOIN consumption c2025 ON i.code = c2025.item_code AND c2025.year = 2025
             LEFT JOIN consumption c2026 ON i.code = c2026.item_code AND c2026.year = 2026
             WHERE i.is_ignored = 0 
               AND (i.code NOT IN (SELECT codigo FROM produtos) AND (i.code LIKE '9.%' OR i.code LIKE '08.%'))
             
             UNION ALL
             
             SELECT 
                 p.codigo as code, p.descricao as description, 'UN' as unit, 
                 IFNULL(o.categoria_produto, CASE WHEN p.codigo LIKE '1.34.%' THEN 'cat_coloracao' WHEN p.codigo LIKE '1.30.%' THEN 'cat_apoio' ELSE '' END) as category_id,
                 CASE WHEN p.codigo LIKE '1.34.%' THEN 'Coloração' WHEN p.codigo LIKE '1.30.%' THEN 'Material de Apoio' ELSE 'Sem Categoria' END as category_name,
                 IFNULL(e.estoque, 0) as stock_qty, 0 as reserved_qty, IFNULL(e.producao, 0) as in_production, 
                 (
                     IFNULL((
                         SELECT SUM(poi.n_qtde - poi.n_chegou)
                         FROM purchase_order_items poi
                         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
                         WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
                           AND poi.c_referencia = p.codigo
                     ), 0.0)
                     -
                     IFNULL(o.pedidos_manual, IFNULL((
                         SELECT SUM(soi.n_qtde - soi.n_qtde_fat)
                         FROM sales_order_items soi
                         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
                         WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
                           AND soi.c_cod_prod = p.codigo
                           AND (
                                CAST(COALESCE((SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'), '180') AS INTEGER) = 0 
                                OR so.d_pedido >= date('now', '-' || CAST(COALESCE((SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'), '180') AS INTEGER) || ' days')
                           )
                     ), 0.0))
                 ) as in_orders,
                 IFNULL(o.media_manual, p.media_levantamento) as monthly_avg_2024, 
                 IFNULL(o.media_manual, p.media_levantamento) as monthly_avg_2025, 
                 IFNULL(o.media_manual, p.media_levantamento) as monthly_avg_2026,
                 IFNULL(o.observacao, '') as notes
             FROM produtos p
             LEFT JOIN overrides_produtos o ON p.codigo = o.codigo
             LEFT JOIN estoque_atual e ON p.codigo = e.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE (p.codigo LIKE '1.34.%' OR p.codigo LIKE '1.30.%' OR o.categoria_produto = 'cat_coloracao' OR o.categoria_produto = 'cat_apoio')
               AND IFNULL(cl.visivel, 1) <> 0
         ) t
         WHERE 1=1"
    );

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ref cat_id) = category_id {
        sql.push_str(" AND t.category_id = ?1");
        params_vec.push(Box::new(cat_id.clone()));
    }
    sql.push_str(" ORDER BY t.description");

    let mut monthly_movements: HashMap<String, HashMap<String, f64>> = HashMap::new();
    if let Ok(mut mv_stmt) = conn.prepare(
        "SELECT item_code, strftime('%Y-%m', date) as ym, SUM(quantity) as sum_qty
         FROM stock_movements
         WHERE movement_type = 'saida'
           AND item_type IN ('insumo', 'produto')
           AND date >= date('now', '-12 months', 'localtime')
         GROUP BY item_code, ym",
    ) {
        let mv_rows = mv_stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        });
        if let Ok(iter) = mv_rows {
            for r in iter.flatten() {
                let (code, ym, qty) = r;
                let clean = code.replace('.', "");
                for key in [clean.clone(), code.clone()] {
                    monthly_movements
                        .entry(key)
                        .or_default()
                        .insert(ym.clone(), qty);
                }
            }
        }
    }
    // E. Fetch latest invoice supplier name in bulk
    let mut last_supplier_invoice_map = std::collections::HashMap::new();
    if let Ok(mut stmt_inv) = conn.prepare(
        "SELECT ss.item_code, ss.supplier_name 
         FROM invoices ss
         WHERE ss.id = (
             SELECT id FROM invoices ss2 
             WHERE ss2.item_code = ss.item_code 
             ORDER BY ss2.invoice_date DESC, ss2.id DESC LIMIT 1
         )"
    ) {
        if let Ok(rows_inv) = stmt_inv.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        }) {
            for r in rows_inv {
                if let Ok((code, supplier)) = r {
                    if let Some(s) = supplier {
                        last_supplier_invoice_map.insert(code, s);
                    }
                }
            }
        }
    }

    // F. Fetch latest purchase order supplier name in bulk
    let mut last_supplier_order_map = std::collections::HashMap::new();
    if let Ok(mut stmt_ord) = conn.prepare(
        "SELECT poi.c_referencia, po.c_nome_f
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE poi.id = (
             SELECT poi2.id FROM purchase_order_items poi2
             JOIN purchase_orders po2 ON poi2.n_pedido_registro = po2.n_registro
             WHERE poi2.c_referencia = poi.c_referencia
             ORDER BY po2.d_pedido DESC, poi2.id DESC LIMIT 1
         )"
    ) {
        if let Ok(rows_ord) = stmt_ord.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        }) {
            for r in rows_ord {
                if let Ok((code, supplier)) = r {
                    if let Some(s) = supplier {
                        last_supplier_order_map.insert(code, s);
                    }
                }
            }
        }
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| &**p).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let code: String = row.get(0)?;
        let desc: String = row.get(1)?;
        let unit: String = row.get(2)?;
        let cat_id: Option<String> = row.get(3)?;
        let cat_name: String = row.get(4)?;
        let current_stock: f64 = row.get(5)?;
        let _reserved_qty_imported: f64 = row.get(6)?;
        let in_production: f64 = row.get(7)?;
        let in_orders: f64 = row.get::<_, f64>(8)?.max(0.0);
        let avg24: f64 = row.get(9)?;
        let avg25: f64 = row.get(10)?;
        let avg26: f64 = row.get(11)?;
        let notes: Option<String> = row.get(12)?;

        let total_reserved = total_reserved_map.get(&code).copied().unwrap_or(0.0);
        let remaining_reserved = remaining_reserved_map.get(&code).copied().unwrap_or(0.0);

        use chrono::Datelike;
        let now = chrono::Local::now();
        let current_year = now.year();
        let day_of_year = (now.ordinal() as f64).max(1.0);
        let elapsed_months = day_of_year / 30.0;

        let avg24_corrected = if current_year == 2024 {
            if avg24 > 0.0 { (avg24 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg24
        };

        let avg25_corrected = if current_year == 2025 {
            if avg25 > 0.0 { (avg25 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg25
        };

        let avg26_corrected = if current_year == 2026 {
            if avg26 > 0.0 { (avg26 * 12.0) / elapsed_months } else { 0.0 }
        } else {
            avg26
        };

        let mut avgs = Vec::new();
        if avg24_corrected > 0.1 { avgs.push(avg24_corrected); }
        if avg25_corrected > 0.1 { avgs.push(avg25_corrected); }
        if avg26_corrected > 0.1 { avgs.push(avg26_corrected); }
        
        let median_monthly = if avgs.is_empty() {
            0.0
        } else {
            avgs.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let len = avgs.len();
            if len == 1 { 
                avgs[0] 
            } else if len == 2 { 
                (avgs[0] + avgs[1]) / 2.0 
            } else { 
                avgs[1] 
            }
        };
        
        let cat_id_ref = cat_id.as_deref();
        let resolved_period = resolve_periodo_media(
            &code,
            cat_id_ref,
            &item_configs,
            &subcat_configs,
            &cat_parent_map,
            conn,
        );
        let (sum_qty, _mv_period) = (
            sum_movements_for_period(&monthly_movements, &code, resolved_period),
            resolved_period,
        );

        let overall_avg = if sum_qty > 0.0 {
            sum_qty / (resolved_period as f64)
        } else if let Some(fat_avg) = avg_from_faturamento(conn, &code, resolved_period) {
            fat_avg
        } else {
            median_monthly
        };
        let daily_avg = overall_avg / 30.0;

        let future_stock_forecast = current_stock - remaining_reserved + in_orders + in_production;
        let max_forecast = if future_stock_forecast > 0.0 { future_stock_forecast } else { 0.0 };

        let estimated_duration_days = if daily_avg > 0.0 {
            (max_forecast / daily_avg).round()
        } else {
            9999.0
        };

        // 1. Resolve configuration based on precedence
        let mut active_config = None;
        let mut config_level = "default".to_string();
        
        if let Some(cfg) = item_configs.get(&code) {
            active_config = Some(cfg);
            config_level = "item".to_string();
        } else if let Some(ref cid) = cat_id {
            if let Some(cfg) = subcat_configs.get(cid) {
                active_config = Some(cfg);
                config_level = "subcategoria".to_string();
            } else if let Some(parent_id) = cat_parent_map.get(cid) {
                if let Some(cfg) = subcat_configs.get(parent_id) {
                    active_config = Some(cfg);
                    config_level = "subcategoria".to_string();
                }
            }
        }

        // 2. Calculate target days
        let target_days_val = active_config
            .and_then(|cfg| cfg.dias_target)
            .unwrap_or(target_days);

        // 3. Calculate trigger days
        let mut trigger_days = target_days_val;
        let mut use_lead_time_val = false;
        let mut safety_days_val = 0;
        if let Some(cfg) = active_config {
            if cfg.use_lead_time {
                use_lead_time_val = true;
                safety_days_val = cfg.safety_days;
                let lead_time = get_item_lead_time(&conn, &code);
                trigger_days = lead_time + safety_days_val;
            } else if let Some(ds) = cfg.dias_start {
                trigger_days = ds;
            }
        }
        
        // 4. Calculate trigger point
        let trigger_point = (trigger_days as f64) * daily_avg;

        // 5. Calculate target stock
        let target_stock_base = (target_days_val as f64) * daily_avg;
        let mut target_stock = target_stock_base;
        if let Some(cfg) = active_config {
            match cfg.objetivo_tipo.as_str() {
                "porcentagem" => {
                    target_stock = target_stock_base * (1.0 + cfg.objetivo_valor / 100.0);
                }
                "desvio_padrao" => {
                    let std_dev = get_item_std_dev(&conn, &code);
                    target_stock = target_stock_base + std_dev;
                }
                "multiplicador" => {
                    let std_dev = get_item_std_dev(&conn, &code);
                    target_stock = target_stock_base + cfg.objetivo_valor * std_dev;
                }
                _ => {}
            }
        }

        // 5. Recommended quantity — comprar o suficiente para atingir a meta (objetivo),
        // quando a cobertura atual está abaixo do target. Disparo controla urgência, não zera a sugestão.
        let recommended_qty = if daily_avg <= 0.0 {
            0.0
        } else if estimated_duration_days >= (target_days_val as f64) {
            0.0
        } else {
            let raw_rec = target_stock - max_forecast;
            if raw_rec > 0.0 {
                raw_rec.round()
            } else {
                0.0
            }
        };

        let urgency = if estimated_duration_days < (trigger_days as f64) {
            "critical".to_string()
        } else if estimated_duration_days < ((trigger_days + 30) as f64) {
            "warning".to_string()
        } else {
            "ok".to_string()
        };

        let last_supplier_invoice = last_supplier_invoice_map.get(&code).cloned();
        let last_supplier_order = last_supplier_order_map.get(&code).cloned();

        Ok(DemandResult {
            item_code: code,
            description: desc,
            unit,
            category_id: cat_id,
            category_name: cat_name,
            current_stock,
            reserved_qty: total_reserved,
            in_production,
            in_orders,
            avg2024: avg24_corrected,
            avg2025: avg25_corrected,
            avg2026: avg26_corrected,
            overall_avg,
            future_stock_forecast,
            estimated_duration_days,
            recommended_qty,
            urgency,
            notes,
            last_supplier_invoice,
            last_supplier_order,
            trigger_point,
            target_stock,
            trigger_days,
            target_days: target_days_val,
            config_level,
        })

    }).map_err(|e| e.to_string())?;

    let auto_ignored = get_auto_ignored_ingredients(&conn);

    let mut results = Vec::new();
    for row in rows {
        let item = row.map_err(|e| e.to_string())?;
        if !auto_ignored.contains_key(&item.item_code) {
            results.push(item);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn get_demands(state: State<DbState>, category_id: Option<String>, target_days: i32) -> Result<Vec<DemandResult>, String> {
    let conn = state.0.lock().unwrap();
    get_demands_conn(&conn, category_id, target_days)
}
