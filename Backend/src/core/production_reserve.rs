//! Reserva de insumos por lotes de produção abertos (lotes_baixas + saídas − pesagem).

use sqlx::{PgPool, Row};
use std::collections::HashMap;

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
    .fetch_all(pool)
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
                open_lotes.push((doc_num, item_code, qty, d_pesado));
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
        .filter_map(|(doc_num, _, _, _)| doc_num.parse::<i64>().ok())
        .collect();
    let lotes_baixas_sums = fetch_lotes_baixas_sums(pool, &lote_ids).await;

    let mut total_by_ingredient: HashMap<String, f64> = HashMap::new();
    let mut remaining_by_ingredient: HashMap<String, f64> = HashMap::new();

    for (lote_number, product_code, quantity, d_pesado) in open_lotes {
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

        for ing in ingredients {
            let factor = formulation_factor(ing, bulk_sum, total_sum);
            let fallback_expected = quantity * factor;

            let expected = if lote_int != -1 {
                lotes_baixas_sums
                    .get(&(lote_int, ing.ingredient_code.clone()))
                    .copied()
                    .filter(|v| *v > 0.0)
                    .unwrap_or(fallback_expected)
            } else {
                fallback_expected
            };

            let exited_qty = exits_map
                .get(&(lote_number.clone(), ing.ingredient_code.clone()))
                .copied()
                .unwrap_or(0.0);
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

fn formulation_factor(ing: &FormEntry, bulk_sum: f64, total_sum: f64) -> f64 {
    if ing.percentage > 0.0 {
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
    }
}
