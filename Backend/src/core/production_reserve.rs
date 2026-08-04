//! Reserva de insumos por lotes de produção abertos (lotes_baixas + saídas − pesagem).
//! Também expõe soma de Unidades em lotes abertos (Prod na tela de Produção).

use sqlx::{PgPool, Row};
use std::collections::HashMap;

/// Status de lote ainda em produção (não encerrado/cancelado).
const OPEN_LOTE_STATUS_SQL: &str = r#"
    details NOT LIKE '%Status: EA%'
    AND details NOT LIKE '%Status: CF%'
    AND details NOT LIKE '%Status: FP%'
    AND details NOT LIKE '%Status: CA%'
    AND details NOT LIKE '%Status: FI%'
"#;

fn parse_unidades_from_details(details: &str) -> f64 {
    for part in details.split('|') {
        let part = part.trim();
        if part.starts_with("Unidades:") {
            return part
                .trim_start_matches("Unidades:")
                .trim()
                .replace(',', ".")
                .parse::<f64>()
                .unwrap_or(0.0);
        }
    }
    0.0
}

/// Soma `Unidades` (fallback `nQtde`) por produto em lotes abertos — fonte Hub para coluna Prod.
pub async fn fetch_open_production_units_map(pool: &PgPool) -> HashMap<String, f64> {
    let mut out: HashMap<String, f64> = HashMap::new();
    let sql = format!(
        "SELECT item_code, quantity, details
         FROM stock_movements
         WHERE item_type = 'produto' AND movement_type = 'entrada'
           AND COALESCE(document_number, '') <> ''
           AND details IS NOT NULL
           AND {OPEN_LOTE_STATUS_SQL}"
    );
    let Ok(rows) = sqlx::query(&sql).fetch_all(pool).await else {
        return out;
    };
    for row in rows {
        let Ok(item_code) = row.try_get::<String, _>(0) else {
            continue;
        };
        let qty_kg = row.try_get::<f64, _>(1).unwrap_or(0.0);
        let details = row
            .try_get::<Option<String>, _>(2)
            .ok()
            .flatten()
            .unwrap_or_default();
        let unidades = parse_unidades_from_details(&details);
        let units = if unidades > 0.0 { unidades } else { qty_kg };
        if units <= 0.0 {
            continue;
        }
        let norm = item_code
            .strip_prefix('0')
            .unwrap_or(&item_code)
            .to_string();
        *out.entry(norm.clone()).or_insert(0.0) += units;
        if norm != item_code {
            *out.entry(item_code).or_insert(0.0) += units;
        }
    }
    out
}

#[derive(Debug, Default, Clone)]
pub struct ProductionReserveMaps {
    /// Soma da formulação (fallback teórico) por insumo.
    pub total_by_ingredient: HashMap<String, f64>,
    /// Reserva efetiva: nqtderef dos lotes abertos, menos saídas, zero se pesado.
    pub remaining_by_ingredient: HashMap<String, f64>,
}

struct FormEntry {
    ingredient_code: String,
    quantity: f64,
    percentage: f64,
    unit: String,
}

/// SUM(nqtderef) por (nlote, creferencia) — tolera duplicatas do sync.
pub async fn fetch_lotes_baixas_sums(
    pool: &PgPool,
    lote_ids: &[i64],
) -> HashMap<(i64, String), f64> {
    if lote_ids.is_empty() {
        return HashMap::new();
    }
    let mut out = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT nlote, creferencia, COALESCE(SUM(nqtderef), 0.0)
         FROM lotes_baixas
         WHERE nlote = ANY($1)
         GROUP BY nlote, creferencia",
    )
    .bind(lote_ids)
    .fetch_all(pool)
    .await
    {
        for row in rows {
            let n_lote = crate::core::pg_row::pg_i64(&row, 0);
            if let (Ok(c_ref), Ok(sum)) = (
                row.try_get::<String, _>(1),
                row.try_get::<f64, _>(2),
            ) {
                out.insert((n_lote, c_ref), sum);
            }
        }
    }
    out
}

/// Quantidade esperada de insumo em um lote: SUM(nqtderef) quando existir; senão fallback da formulação.
pub async fn insumo_qty_needed_for_lote(
    pool: &PgPool,
    lote_number: &str,
    ingredient_code: &str,
    fallback_qty: f64,
) -> f64 {
    let lote_int = match lote_number.parse::<i64>() {
        Ok(v) => v,
        Err(_) => return fallback_qty,
    };
    let sum: Option<f64> = sqlx::query_scalar(
        "SELECT COALESCE(SUM(nqtderef), 0.0) FROM lotes_baixas WHERE nlote = $1 AND creferencia = $2",
    )
    .bind(lote_int)
    .bind(ingredient_code)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    match sum {
        Some(v) if v > 0.0 => v,
        _ => fallback_qty,
    }
}

pub async fn compute_production_reserve_maps(pool: &PgPool) -> ProductionReserveMaps {
    let mut open_lotes = Vec::new();
    let open_sql = format!(
        "SELECT document_number, item_code, quantity, details
         FROM stock_movements
         WHERE item_type = 'produto' AND movement_type = 'entrada'
           AND COALESCE(document_number, '') <> ''
           AND details IS NOT NULL
           AND {OPEN_LOTE_STATUS_SQL}"
    );
    if let Ok(rows) = sqlx::query(&open_sql).fetch_all(pool).await {
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
                if doc_num.is_empty() {
                    continue;
                }
                let mut d_pesado = String::new();
                for part in details.split('|') {
                    let part = part.trim();
                    if part.starts_with("dPesado:") {
                        d_pesado = part.trim_start_matches("dPesado:").trim().to_string();
                    }
                }
                let unidades = parse_unidades_from_details(&details);
                // qty = nQtde (kg/bulk); unidades = nUnidades (peças acabadas)
                open_lotes.push((doc_num, item_code, qty, unidades, d_pesado));
            }
        }
    }

    let mut formulations_map: HashMap<String, Vec<FormEntry>> = HashMap::new();
    let mut formulation_bulk_sums: HashMap<String, f64> = HashMap::new();
    let mut formulation_total_sums: HashMap<String, f64> = HashMap::new();

    if let Ok(rows) = sqlx::query(
        "SELECT f.product_code, f.ingredient_code, f.quantity, COALESCE(f.percentage, 0.0), COALESCE(i.unit, 'UN')
         FROM formulations f
         LEFT JOIN items i ON f.ingredient_code = i.code",
    )
    .fetch_all(pool)
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

    let mut exits_map: HashMap<(String, String), f64> = HashMap::new();
    let open_docs: Vec<String> = open_lotes.iter().map(|(d, _, _, _, _)| d.clone()).collect();
    if !open_docs.is_empty() {
        if let Ok(rows) = sqlx::query(
            "SELECT document_number, item_code, SUM(quantity)
             FROM stock_movements
             WHERE item_type = 'insumo' AND movement_type = 'saida'
               AND document_number = ANY($1)
             GROUP BY document_number, item_code",
        )
        .bind(&open_docs)
        .fetch_all(pool)
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

    let lote_ids: Vec<i64> = open_lotes
        .iter()
        .filter_map(|(doc_num, _, _, _, _)| doc_num.parse::<i64>().ok())
        .collect();
    let lotes_baixas_sums = fetch_lotes_baixas_sums(pool, &lote_ids).await;

    let mut total_by_ingredient: HashMap<String, f64> = HashMap::new();
    let mut remaining_by_ingredient: HashMap<String, f64> = HashMap::new();

    for (lote_number, product_code, quantity_kg, unidades, d_pesado) in open_lotes {
        let norm_prod = product_code
            .strip_prefix('0')
            .unwrap_or(&product_code)
            .to_string();
        let Some(ingredients) = formulations_map.get(&norm_prod) else {
            continue;
        };
        let bulk_sum = formulation_bulk_sums.get(&norm_prod).copied().unwrap_or(0.0);
        let total_sum = formulation_total_sums.get(&norm_prod).copied().unwrap_or(0.0);
        let lote_int = lote_number.parse::<i64>().unwrap_or(-1);

        // Agrega linhas duplicadas do mesmo insumo (ex.: água 2x na fórmula) — senão reserva dobra.
        let mut by_code: HashMap<String, FormEntry> = HashMap::new();
        for ing in ingredients {
            let e = by_code
                .entry(ing.ingredient_code.clone())
                .or_insert_with(|| FormEntry {
                    ingredient_code: ing.ingredient_code.clone(),
                    quantity: 0.0,
                    percentage: 0.0,
                    unit: ing.unit.clone(),
                });
            e.quantity += ing.quantity;
            e.percentage += ing.percentage;
            if e.unit.is_empty() {
                e.unit = ing.unit.clone();
            }
        }

        // Uma saída por (lote, insumo) — aplicar só uma vez por código.
        let mut exits_applied: HashMap<String, bool> = HashMap::new();

        for (_, ing) in by_code {
            let fallback_expected = fallback_qty_needed(
                &ing,
                quantity_kg,
                unidades,
                bulk_sum,
                total_sum,
            );

            let expected = if lote_int != -1 {
                lotes_baixas_sums
                    .get(&(lote_int, ing.ingredient_code.clone()))
                    .copied()
                    .filter(|v| *v > 0.0)
                    .unwrap_or(fallback_expected)
            } else {
                fallback_expected
            };

            let exited_qty = if exits_applied
                .insert(ing.ingredient_code.clone(), true)
                .is_none()
            {
                exits_map
                    .get(&(lote_number.clone(), ing.ingredient_code.clone()))
                    .copied()
                    .unwrap_or(0.0)
            } else {
                0.0
            };
            let mut remaining = (expected - exited_qty).max(0.0);

            if !d_pesado.is_empty() {
                remaining = 0.0;
            }

            if fallback_expected > 0.0 {
                *total_by_ingredient
                    .entry(ing.ingredient_code.clone())
                    .or_insert(0.0) += fallback_expected;
            }
            if remaining > 0.0 {
                *remaining_by_ingredient
                    .entry(ing.ingredient_code.clone())
                    .or_insert(0.0) += remaining;
            }
        }
    }

    ProductionReserveMaps {
        total_by_ingredient,
        remaining_by_ingredient,
    }
}

/// Fallback sem lotes_baixas: %/KG usam nQtde (bulk); UN usam nUnidades (peças).
fn fallback_qty_needed(
    ing: &FormEntry,
    quantity_kg: f64,
    unidades: f64,
    bulk_sum: f64,
    total_sum: f64,
) -> f64 {
    if ing.unit == "UN" {
        let units = if unidades > 0.0 { unidades } else { quantity_kg };
        return (units * ing.quantity).max(0.0);
    }
    if ing.percentage > 0.0 {
        return (quantity_kg * (ing.percentage / 100.0)).max(0.0);
    }
    let factor = formulation_factor(ing, bulk_sum, total_sum);
    (quantity_kg * factor).max(0.0)
}

fn formulation_factor(ing: &FormEntry, bulk_sum: f64, total_sum: f64) -> f64 {
    if ing.percentage > 0.0 {
        ing.percentage / 100.0
    } else if ing.unit == "UN" {
        ing.quantity
    } else if bulk_sum > 0.0 {
        ing.quantity / bulk_sum
    } else if total_sum > 0.0 {
        ing.quantity / total_sum
    } else {
        0.0
    }
}
