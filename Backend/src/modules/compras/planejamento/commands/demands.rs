use sqlx::{PgPool, Row};
use std::collections::HashMap;

use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::get_auto_ignored_ingredients_query;

fn std_dev_from_months(monthly_quantities: &[f64]) -> f64 {
    if monthly_quantities.is_empty() {
        return 0.0;
    }
    let mut vals: Vec<f64> = monthly_quantities.to_vec();
    while vals.len() < 12 {
        vals.push(0.0);
    }
    let count = vals.len() as f64;
    let mean = vals.iter().sum::<f64>() / count;
    let variance = vals.iter().map(|&x| {
        let d = x - mean;
        d * d
    }).sum::<f64>() / count;
    variance.sqrt()
}

fn std_dev_from_monthly_map(
    monthly: &HashMap<String, HashMap<String, f64>>,
    code: &str,
) -> f64 {
    let clean = code.replace('.', "");
    let Some(months_map) = monthly.get(&clean).or_else(|| monthly.get(code)) else {
        return 0.0;
    };
    let vals: Vec<f64> = last_n_year_month_keys(12)
        .iter()
        .map(|k| months_map.get(k).copied().unwrap_or(0.0))
        .collect();
    std_dev_from_months(&vals)
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
        let Some(ref cid) = current else {
            break;
        };
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
    period_by_config_key: &HashMap<String, i32>,
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
    if let Some(&p) = period_by_config_key.get(cfg_key) {
        if p > 0 {
            return p;
        }
    }
    12
}

fn avg_from_faturamento_map(
    fat_map: &HashMap<String, [i64; 12]>,
    code: &str,
    months: i32,
) -> Option<f64> {
    use chrono::Datelike;
    let months = months.clamp(1, 12);
    let month_qty = fat_map.get(code)?;
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
    let months_map = monthly.get(&clean).or_else(|| monthly.get(code));
    let Some(months_map) = months_map else {
        return 0.0;
    };
    last_n_year_month_keys(period_months)
        .iter()
        .filter_map(|k| months_map.get(k).copied())
        .sum()
}

const DEMANDS_SQL_ITEMS: &str = "
             SELECT 
                 i.code, i.description, i.unit, i.category_id, COALESCE(c.name, 'Sem Categoria') as category_name,
                 COALESCE(s.stock_qty, 0) as stock_qty, COALESCE(s.reserved_qty, 0) as reserved_qty, 
                 COALESCE(s.in_production, 0) as in_production, COALESCE(s.in_orders, 0) as in_orders,
                 COALESCE(c2024.monthly_avg, 0) as monthly_avg_2024, 
                 COALESCE(c2025.monthly_avg, 0) as monthly_avg_2025, 
                 COALESCE(c2026.monthly_avg, 0) as monthly_avg_2026,
                 i.notes
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN (
                 SELECT DISTINCT ON (item_code)
                    item_code, stock_qty, reserved_qty, in_production, in_orders
                 FROM stock_snapshots
                 ORDER BY item_code, snapshot_date DESC, id DESC
             ) s ON i.code = s.item_code
             LEFT JOIN consumption c2024 ON i.code = c2024.item_code AND c2024.year = 2024
             LEFT JOIN consumption c2025 ON i.code = c2025.item_code AND c2025.year = 2025
             LEFT JOIN consumption c2026 ON i.code = c2026.item_code AND c2026.year = 2026
             WHERE i.is_ignored = 0 
               AND (i.code NOT IN (SELECT codigo FROM produtos) AND (i.code LIKE '9.%' OR i.code LIKE '08.%'))
";

const DEMANDS_SQL_PRODUCTS: &str = "
             SELECT 
                 p.codigo as code, p.descricao as description, 'UN' as unit, 
                 COALESCE(o.categoria_produto, CASE WHEN p.codigo LIKE '1.34.%' THEN 'cat_coloracao' WHEN p.codigo LIKE '1.30.%' THEN 'cat_apoio' ELSE '' END) as category_id,
                 CASE WHEN p.codigo LIKE '1.34.%' THEN 'Coloração' WHEN p.codigo LIKE '1.30.%' THEN 'Material de Apoio' ELSE 'Sem Categoria' END as category_name,
                 COALESCE(e.estoque, 0) as stock_qty, 0 as reserved_qty, COALESCE(e.producao, 0) as in_production, 
                 (
                     COALESCE((
                         SELECT SUM(poi.n_qtde - poi.n_chegou)
                         FROM purchase_order_items poi
                         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
                         WHERE po.c_status <> 'T' AND (poi.n_qtde > poi.n_chegou)
                           AND poi.c_referencia = p.codigo
                     ), 0.0)
                     -
                     COALESCE(o.pedidos_manual, COALESCE((
                         SELECT SUM(soi.n_qtde - soi.n_qtde_fat)
                         FROM sales_order_items soi
                         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
                         WHERE so.c_status NOT IN ('FT', 'CA') AND (soi.n_qtde > soi.n_qtde_fat)
                           AND soi.c_cod_prod = p.codigo
                           AND (
                                CAST(COALESCE((SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'), '180') AS INTEGER) = 0 
                                OR so.d_pedido::date >= CURRENT_DATE - (COALESCE((SELECT value FROM settings WHERE key = 'sales_faltas_days_limit'), '180') || ' days')::interval
                           )
                     ), 0.0))
                 ) as in_orders,
                 COALESCE(o.media_manual, p.media_levantamento) as monthly_avg_2024, 
                 COALESCE(o.media_manual, p.media_levantamento) as monthly_avg_2025, 
                 COALESCE(o.media_manual, p.media_levantamento) as monthly_avg_2026,
                 COALESCE(o.observacao, '') as notes
             FROM produtos p
             LEFT JOIN overrides_produtos o ON p.codigo = o.codigo
             LEFT JOIN estoque_atual e ON p.codigo = e.codigo
             LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
             WHERE (p.codigo LIKE '1.34.%' OR p.codigo LIKE '1.30.%' OR o.categoria_produto = 'cat_coloracao' OR o.categoria_produto = 'cat_apoio')
               AND COALESCE(cl.visivel, 1) <> 0
";

fn build_demands_sql(include_products: bool) -> String {
    if include_products {
        format!(
            "SELECT code, description, unit, category_id, category_name,
                stock_qty, reserved_qty, in_production, in_orders,
                monthly_avg_2024, monthly_avg_2025, monthly_avg_2026,
                notes
         FROM (
             {DEMANDS_SQL_ITEMS}
             UNION ALL
             {DEMANDS_SQL_PRODUCTS}
         ) t
         WHERE 1=1"
        )
    } else {
        format!(
            "SELECT code, description, unit, category_id, category_name,
                stock_qty, reserved_qty, in_production, in_orders,
                monthly_avg_2024, monthly_avg_2025, monthly_avg_2026,
                notes
         FROM (
             {DEMANDS_SQL_ITEMS}
         ) t
         WHERE 1=1"
        )
    }
}

fn build_demand_result(
    row: sqlx::postgres::PgRow,
    target_days: i32,
    item_configs: &HashMap<String, TempConfig>,
    subcat_configs: &HashMap<String, TempConfig>,
    cat_parent_map: &HashMap<String, String>,
    monthly_movements: &HashMap<String, HashMap<String, f64>>,
    total_reserved_map: &HashMap<String, f64>,
    remaining_reserved_map: &HashMap<String, f64>,
    last_supplier_invoice_map: &HashMap<String, String>,
    last_supplier_order_map: &HashMap<String, String>,
    period_by_config_key: &HashMap<String, i32>,
    fat_map: &HashMap<String, [i64; 12]>,
    lead_time_map: &HashMap<String, i32>,
    override_period: Option<i32>,
) -> Result<DemandResult, String> {
    let code: String = row.get(0);
    let desc: String = row.get(1);
    let unit: String = row.get(2);
    let cat_id: Option<String> = row.get(3);
    let cat_name: String = row.get(4);
    let current_stock: f64 = row.get(5);
    let reserved_qty_imported: f64 = row.get(6);
    let in_production: f64 = row.get(7);
    let in_orders: f64 = row.get::<f64, _>(8).max(0.0);
    let avg24: f64 = row.get(9);
    let avg25: f64 = row.get(10);
    let avg26: f64 = row.get(11);
    let notes: Option<String> = row.get(12);

    let total_reserved = total_reserved_map.get(&code).copied().unwrap_or(0.0);
    let _remaining_reserved = remaining_reserved_map.get(&code).copied().unwrap_or(0.0);

    use chrono::Datelike;
    let now = chrono::Local::now();
    let current_year = now.year();
    let day_of_year = (now.ordinal() as f64).max(1.0);
    let elapsed_months = day_of_year / 30.0;

    let avg24_corrected = if current_year == 2024 {
        if avg24 > 0.0 {
            (avg24 * 12.0) / elapsed_months
        } else {
            0.0
        }
    } else {
        avg24
    };

    let avg25_corrected = if current_year == 2025 {
        if avg25 > 0.0 {
            (avg25 * 12.0) / elapsed_months
        } else {
            0.0
        }
    } else {
        avg25
    };

    let avg26_corrected = if current_year == 2026 {
        if avg26 > 0.0 {
            (avg26 * 12.0) / elapsed_months
        } else {
            0.0
        }
    } else {
        avg26
    };

    let mut avgs = Vec::new();
    if avg24_corrected > 0.1 {
        avgs.push(avg24_corrected);
    }
    if avg25_corrected > 0.1 {
        avgs.push(avg25_corrected);
    }
    if avg26_corrected > 0.1 {
        avgs.push(avg26_corrected);
    }

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
    let resolved_period = if let Some(op) = override_period {
        op
    } else {
        resolve_periodo_media(
            &code,
            cat_id_ref,
            item_configs,
            subcat_configs,
            cat_parent_map,
            period_by_config_key,
        )
    };
    let sum_qty = sum_movements_for_period(monthly_movements, &code, resolved_period);

    let overall_avg = if sum_qty > 0.0 {
        sum_qty / (resolved_period as f64)
    } else if let Some(fat_avg) = avg_from_faturamento_map(fat_map, &code, resolved_period) {
        fat_avg
    } else {
        median_monthly
    };
    let daily_avg = overall_avg / 30.0;

    // Estoque (nQtdeEstoqueA) já vem líquido da reserva no ERP — não descontar R/lotes de novo.
    // Prev. Futura = estoque + pedidos (produção ignorada nesta previsão).
    let future_stock_forecast = current_stock + in_orders;
    let max_forecast = if future_stock_forecast > 0.0 {
        future_stock_forecast
    } else {
        0.0
    };

    let reserved_display = if reserved_qty_imported > 0.0 {
        reserved_qty_imported
    } else {
        total_reserved
    };

    let estimated_duration_days = if daily_avg > 0.0 {
        (max_forecast / daily_avg).round()
    } else {
        9999.0
    };

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

    let target_days_val = active_config
        .and_then(|cfg| cfg.dias_target)
        .unwrap_or(target_days);

    let mut trigger_days = target_days_val;
    if let Some(cfg) = active_config {
        if cfg.use_lead_time {
            let lead_time = lead_time_map.get(&code).copied().unwrap_or(15);
            trigger_days = lead_time + cfg.safety_days;
        } else if let Some(ds) = cfg.dias_start {
            trigger_days = ds;
        }
    }

    let trigger_point = (trigger_days as f64) * daily_avg;

    let target_stock_base = (target_days_val as f64) * daily_avg;
    let mut target_stock = target_stock_base;
    if let Some(cfg) = active_config {
        match cfg.objetivo_tipo.as_str() {
            "porcentagem" => {
                target_stock = target_stock_base * (1.0 + cfg.objetivo_valor / 100.0);
            }
            "desvio_padrao" => {
                let std_dev = std_dev_from_monthly_map(monthly_movements, &code);
                target_stock = target_stock_base + std_dev;
            }
            "multiplicador" => {
                let std_dev = std_dev_from_monthly_map(monthly_movements, &code);
                target_stock = target_stock_base + cfg.objetivo_valor * std_dev;
            }
            _ => {}
        }
    }

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
    } else if estimated_duration_days < (target_days_val as f64) {
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
        reserved_qty: reserved_display,
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
}

pub async fn get_demands_query(
    pool: PgPool,
    category_id: Option<String>,
    target_days: i32,
    override_period: Option<i32>,
) -> Result<Vec<DemandResult>, String> {
    let mut custom_configs: Vec<TempConfig> = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor, periodo_media 
         FROM compras_config_personalizado",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (
                Ok(level),
                Ok(target_id),
                Ok(dias_start),
                Ok(dias_target),
                Ok(use_lead_time),
                Ok(safety_days),
                Ok(objetivo_tipo),
                Ok(objetivo_valor),
                Ok(periodo_media),
            ) = (
                row.try_get::<String, _>(0),
                row.try_get::<String, _>(1),
                row.try_get::<Option<i32>, _>(2),
                row.try_get::<Option<i32>, _>(3),
                row.try_get::<i32, _>(4),
                row.try_get::<i32, _>(5),
                row.try_get::<String, _>(6),
                row.try_get::<f64, _>(7),
                row.try_get::<Option<i32>, _>(8),
            ) {
                custom_configs.push(TempConfig {
                    level,
                    target_id,
                    dias_start,
                    dias_target,
                    use_lead_time: use_lead_time != 0,
                    safety_days,
                    objetivo_tipo,
                    objetivo_valor,
                    periodo_media,
                });
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

    let mut cat_parent_map: HashMap<String, String> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT id, parent_id FROM categories")
        .fetch_all(&pool)
        .await
    {
        for row in rows {
            if let (Ok(id), Ok(Some(parent_id))) = (
                row.try_get::<String, _>(0),
                row.try_get::<Option<String>, _>(1),
            ) {
                cat_parent_map.insert(id, parent_id);
            }
        }
    }

    let mut open_lotes = Vec::new();
    if let Ok(rows) = sqlx::query(
        "SELECT document_number, item_code, quantity, details 
         FROM stock_movements 
         WHERE item_type = 'produto' AND movement_type = 'entrada'
           AND COALESCE(document_number, '') <> ''
           AND details IS NOT NULL
           AND details NOT LIKE '%Status: EA%'
           AND details NOT LIKE '%Status: CF%'
           AND details NOT LIKE '%Status: FP%'
           AND details NOT LIKE '%Status: CA%'
           AND details NOT LIKE '%Status: FI%'",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (
                Ok(doc_num),
                Ok(item_code),
                Ok(qty),
                Ok(details),
            ) = (
                row.try_get::<Option<String>, _>(0),
                row.try_get::<String, _>(1),
                row.try_get::<f64, _>(2),
                row.try_get::<Option<String>, _>(3),
            ) {
                let doc_num = doc_num.unwrap_or_default();
                let details = details.unwrap_or_default();
                if !doc_num.is_empty() {
                    let mut d_pesado = String::new();
                    for part in details.split('|') {
                        let part = part.trim();
                        if part.starts_with("dPesado:") {
                            d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                        }
                    }
                    open_lotes.push((doc_num, item_code, qty, d_pesado));
                }
            }
        }
    }

    struct FormEntry {
        ingredient_code: String,
        quantity: f64,
        percentage: f64,
        unit: String,
    }
    let mut formulations_map: std::collections::HashMap<String, Vec<FormEntry>> =
        std::collections::HashMap::new();
    let mut formulation_bulk_sums: std::collections::HashMap<String, f64> =
        std::collections::HashMap::new();
    let mut formulation_total_sums: std::collections::HashMap<String, f64> =
        std::collections::HashMap::new();

    if let Ok(rows) = sqlx::query(
        "SELECT f.product_code, f.ingredient_code, f.quantity, COALESCE(f.percentage, 0.0), COALESCE(i.unit, 'UN')
        FROM formulations f
        LEFT JOIN items i ON f.ingredient_code = i.code",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (Ok(prod_code), Ok(ing_code), Ok(qty), Ok(pct), Ok(unit)) = (
                row.try_get::<String, _>(0),
                row.try_get::<String, _>(1),
                row.try_get::<f64, _>(2),
                row.try_get::<f64, _>(3),
                row.try_get::<String, _>(4),
            ) {
                let norm_prod = prod_code.strip_prefix('0').unwrap_or(&prod_code).to_string();
                let unit_upper = unit.trim().to_uppercase();
                formulations_map
                    .entry(norm_prod.clone())
                    .or_default()
                    .push(FormEntry {
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

    let mut exits_map: std::collections::HashMap<(String, String), f64> =
        std::collections::HashMap::new();
    let open_docs: Vec<String> = open_lotes.iter().map(|(d, _, _, _)| d.clone()).collect();
    if !open_docs.is_empty() {
        if let Ok(rows) = sqlx::query(
            "SELECT document_number, item_code, SUM(quantity) 
             FROM stock_movements 
             WHERE item_type = 'insumo' AND movement_type = 'saida'
               AND document_number = ANY($1)
             GROUP BY document_number, item_code",
        )
        .bind(&open_docs)
        .fetch_all(&pool)
        .await
        {
            for row in rows {
                if let (Ok(doc_num), Ok(item_code), Ok(qty)) = (
                    row.try_get::<Option<String>, _>(0),
                    row.try_get::<String, _>(1),
                    row.try_get::<f64, _>(2),
                ) {
                    exits_map.insert((doc_num.unwrap_or_default(), item_code), qty);
                }
            }
        }
    }

    let mut lotes_baixas_map: std::collections::HashMap<(i64, String), Vec<f64>> =
        std::collections::HashMap::new();

    let lote_ids: Vec<i64> = open_lotes
        .iter()
        .filter_map(|(doc_num, _, _, _)| doc_num.parse::<i64>().ok())
        .collect();

    if !lote_ids.is_empty() {
        if let Ok(rows) = sqlx::query(
            "SELECT nLote, cReferencia, nQtdeRef FROM lotes_baixas WHERE nLote = ANY($1) ORDER BY Registro ASC",
        )
        .bind(&lote_ids)
        .fetch_all(&pool)
        .await
        {
            for row in rows {
                let n_lote = crate::core::pg_row::pg_i64(&row, 0);
                if let (Ok(c_ref), Ok(n_qtde_ref)) = (
                    row.try_get::<String, _>(1),
                    row.try_get::<f64, _>(2),
                ) {
                    lotes_baixas_map
                        .entry((n_lote, c_ref))
                        .or_default()
                        .push(n_qtde_ref);
                }
            }
        }
    }

    let mut total_reserved_map: std::collections::HashMap<String, f64> =
        std::collections::HashMap::new();
    let mut remaining_reserved_map: std::collections::HashMap<String, f64> =
        std::collections::HashMap::new();
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
                } else if bulk_sum > 0.0 {
                    ing.quantity / bulk_sum
                } else if total_sum > 0.0 {
                    ing.quantity / total_sum
                } else {
                    0.0
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

                let exited_qty = exits_map
                    .get(&(lote_number.clone(), ing.ingredient_code.clone()))
                    .copied()
                    .unwrap_or(0.0);
                let mut remaining = (expected - exited_qty).max(0.0);

                if !d_pesado.is_empty() {
                    remaining = 0.0;
                }

                if fallback_expected > 0.0 {
                    *total_reserved_map
                        .entry(ing.ingredient_code.clone())
                        .or_insert(0.0) += fallback_expected;
                }
                if remaining > 0.0 {
                    *remaining_reserved_map
                        .entry(ing.ingredient_code.clone())
                        .or_insert(0.0) += remaining;
                }
            }
        }
    }

    let include_products = match category_id.as_deref() {
        Some("cat_mp") | Some("cat_emb") => false,
        _ => true,
    };
    let demands_base = build_demands_sql(include_products);
    let sql = if category_id.is_some() {
        format!(
            "{demands_base} AND (
                t.category_id = $1
                OR t.category_id IN (SELECT id FROM categories WHERE parent_id = $1)
             ) ORDER BY t.description"
        )
    } else {
        format!("{demands_base} ORDER BY t.description")
    };

    let mut monthly_movements: HashMap<String, HashMap<String, f64>> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT item_code, left(date, 7) as ym, SUM(quantity) as sum_qty
         FROM stock_movements
         WHERE movement_type = 'saida'
           AND item_type IN ('insumo', 'produto')
           AND date >= to_char(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
         GROUP BY item_code, ym",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (Ok(code), Ok(ym), Ok(qty)) = (
                row.try_get::<String, _>(0),
                row.try_get::<String, _>(1),
                row.try_get::<f64, _>(2),
            ) {
                let clean = code.replace('.', "");
                for key in [clean.clone(), code.clone()] {
                    monthly_movements.entry(key).or_default().insert(ym.clone(), qty);
                }
            }
        }
    }

    let mut last_supplier_invoice_map = std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT DISTINCT ON (item_code) item_code, invoice_number
         FROM invoices
         WHERE invoice_number IS NOT NULL AND invoice_number <> ''
         ORDER BY item_code, invoice_date DESC NULLS LAST, id DESC",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (Ok(code), Ok(invoice_number)) = (
                row.try_get::<String, _>(0),
                row.try_get::<String, _>(1),
            ) {
                if !invoice_number.is_empty() {
                    last_supplier_invoice_map.insert(code, invoice_number);
                }
            }
        }
    }

    let mut last_supplier_order_map = std::collections::HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT DISTINCT ON (poi.c_referencia) poi.c_referencia, CAST(po.n_pedido AS TEXT)
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
         WHERE po.n_pedido IS NOT NULL
         ORDER BY poi.c_referencia, po.d_pedido DESC NULLS LAST, poi.id DESC",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (Ok(code), Ok(n_pedido)) = (
                row.try_get::<String, _>(0),
                row.try_get::<String, _>(1),
            ) {
                if !n_pedido.is_empty() {
                    last_supplier_order_map.insert(code, n_pedido);
                }
            }
        }
    }

    let mut period_by_config_key: HashMap<String, i32> = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT key, CAST((value::json->>'averagePeriodMonths') AS INTEGER)
         FROM config
         WHERE key IN ('compras_main', 'compras_coloracao', 'compras_apoio')",
    )
    .fetch_all(&pool)
    .await
    {
        for row in rows {
            if let (Ok(key), Ok(Some(p))) = (
                row.try_get::<String, _>(0),
                row.try_get::<Option<i32>, _>(1),
            ) {
                if p > 0 {
                    period_by_config_key.insert(key, p);
                }
            }
        }
    }

    let mut fat_map: HashMap<String, [i64; 12]> = HashMap::new();
    if let Ok(rows) = sqlx::query("SELECT codigo, mes, quantidade::bigint FROM historico_faturamento")
        .fetch_all(&pool)
        .await
    {
        for row in rows {
            let code: String = row.get(0);
            let mes: i32 = row.get(1);
            let qty = crate::core::pg_row::pg_i64(&row, 2);
            if (1..=12).contains(&mes) {
                fat_map.entry(code).or_insert([0; 12])[(mes - 1) as usize] = qty;
            }
        }
    }

    let mut lead_time_map: HashMap<String, i32> = HashMap::new();
    if item_configs.values().any(|c| c.use_lead_time)
        || subcat_configs.values().any(|c| c.use_lead_time)
    {
        if let Ok(rows) = sqlx::query(
            "SELECT DISTINCT ON (qi.item_code) qi.item_code, qp.delivery_days
             FROM quotation_prices qp
             JOIN quotation_items qi ON qp.quotation_item_id = qi.id
             WHERE qp.is_selected = 1 AND qp.delivery_days IS NOT NULL
             ORDER BY qi.item_code, qp.id DESC",
        )
        .fetch_all(&pool)
        .await
        {
            for row in rows {
                if let (Ok(code), Ok(Some(days))) = (
                    row.try_get::<String, _>(0),
                    row.try_get::<Option<i32>, _>(1),
                ) {
                    lead_time_map.insert(code, days);
                }
            }
        }
    }

    let rows = if let Some(ref cat_id) = category_id {
        sqlx::query(&sql).bind(cat_id).fetch_all(&pool).await
    } else {
        sqlx::query(&sql).fetch_all(&pool).await
    }
    .map_err(|e| e.to_string())?;

    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let mut results = Vec::with_capacity(rows.len());
    for row in rows {
        let item = build_demand_result(
            row,
            target_days,
            &item_configs,
            &subcat_configs,
            &cat_parent_map,
            &monthly_movements,
            &total_reserved_map,
            &remaining_reserved_map,
            &last_supplier_invoice_map,
            &last_supplier_order_map,
            &period_by_config_key,
            &fat_map,
            &lead_time_map,
            override_period,
        )?;
        if !auto_ignored.contains_key(&item.item_code) {
            results.push(item);
        }
    }
    Ok(results)
}

#[cfg(feature = "desktop")]
#[allow(dead_code)]
mod _tauri_stubs {
    use super::*;
    use tauri::State;
    use crate::DbState;

    #[tauri::command]
    pub fn get_demands(
        _state: State<DbState>,
        _category_id: Option<String>,
        _target_days: i32,
    ) -> Result<Vec<DemandResult>, String> {
        Err("Use a API REST (/api/hub/compras/demands)".into())
    }
}
