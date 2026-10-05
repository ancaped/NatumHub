use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::modules::compras::planejamento::models::*;

fn resolve_root_category(
    cat_id: &str,
    parent_map: &std::collections::HashMap<String, String>,
) -> String {
    let mut current = cat_id.to_string();
    let mut visited = std::collections::HashSet::new();
    visited.insert(current.clone());
    while let Some(parent) = parent_map.get(&current) {
        if visited.contains(parent) {
            break;
        }
        current = parent.clone();
        visited.insert(current.clone());
    }
    current
}

async fn load_category_parent_map(pool: PgPool) -> Result<std::collections::HashMap<String, String>, String> {
    let rows = sqlx::query("SELECT id, parent_id FROM categories")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let id: String = row.get(0);
        if let Some(parent_id) = row.get::<Option<String>, _>(1) {
            map.insert(id, parent_id);
        }
    }
    Ok(map)
}

fn quotation_type_from_root(root_cat: Option<&str>) -> Option<String> {
    match root_cat {
        Some("cat_mp") => Some("materia_prima".to_string()),
        Some("cat_emb") => Some("embalagens".to_string()),
        Some("cat_coloracao") => Some("coloracao".to_string()),
        Some("cat_apoio") => Some("apoio".to_string()),
        _ => Some("materia_prima".to_string()),
    }
}

pub async fn create_quotation_query(
    pool: PgPool,
    title: &str,
    item_codes: &[String],
    recommended_qtys: &[f64],
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let quotation_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO quotations (id, title) VALUES ($1, $2)")
        .bind(&quotation_id)
        .bind(title)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for i in 0..item_codes.len() {
        let q_item_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO quotation_items (id, quotation_id, item_code, recommended_qty) VALUES ($1, $2, $3, $4)",
        )
        .bind(&q_item_id)
        .bind(&quotation_id)
        .bind(&item_codes[i])
        .bind(recommended_qtys[i])
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(quotation_id)
}

pub async fn get_quotations_query(
    pool: PgPool,
    status: Option<String>,
) -> Result<Vec<Quotation>, String> {
    let category_parent_map = load_category_parent_map(pool.clone()).await?;

    let rows = if let Some(ref st) = status {
        sqlx::query(
            "SELECT
                q.id, q.title, q.status, q.target_days, q.notes,
                q.director_demand_notes, q.director_final_notes,
                q.created_at, q.demand_approved_at, q.final_approved_at, q.ordered_at,
                (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count,
                (
                    SELECT SUM(qp.unit_price * COALESCE(qi.final_qty, COALESCE(qi.approved_qty, qi.recommended_qty)))
                    FROM quotation_items qi
                    JOIN quotation_prices qp ON qp.quotation_item_id = qi.id AND qp.is_selected = 1
                    WHERE qi.quotation_id = q.id
                ) as total_value,
                (
                    SELECT i.category_id
                    FROM quotation_items qi
                    LEFT JOIN items i ON qi.item_code = i.code
                    WHERE qi.quotation_id = q.id
                    LIMIT 1
                ) as first_item_cat_id
            FROM quotations q
            WHERE q.status = $1
            ORDER BY q.created_at DESC",
        )
        .bind(st)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query(
            "SELECT
                q.id, q.title, q.status, q.target_days, q.notes,
                q.director_demand_notes, q.director_final_notes,
                q.created_at, q.demand_approved_at, q.final_approved_at, q.ordered_at,
                (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count,
                (
                    SELECT SUM(qp.unit_price * COALESCE(qi.final_qty, COALESCE(qi.approved_qty, qi.recommended_qty)))
                    FROM quotation_items qi
                    JOIN quotation_prices qp ON qp.quotation_item_id = qi.id AND qp.is_selected = 1
                    WHERE qi.quotation_id = q.id
                ) as total_value,
                (
                    SELECT i.category_id
                    FROM quotation_items qi
                    LEFT JOIN items i ON qi.item_code = i.code
                    WHERE qi.quotation_id = q.id
                    LIMIT 1
                ) as first_item_cat_id
            FROM quotations q
            ORDER BY q.created_at DESC",
        )
        .fetch_all(&pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let first_item_cat_id: Option<String> = row.get(13);
            let root_cat = first_item_cat_id
                .as_deref()
                .map(|cid| resolve_root_category(cid, &category_parent_map));
            Quotation {
                id: row.get(0),
                title: row.get(1),
                status: row.get(2),
                target_days: row.get(3),
                notes: row.get(4),
                director_demand_notes: row.get(5),
                director_final_notes: row.get(6),
                created_at: row.get(7),
                demand_approved_at: row.get(8),
                final_approved_at: row.get(9),
                ordered_at: row.get(10),
                item_count: Some(crate::core::pg_row::pg_i32(&row, 11)),
                total_value: row.get(12),
                quotation_type: quotation_type_from_root(root_cat.as_deref()),
            }
        })
        .collect())
}

pub async fn get_quotation_detail_query(pool: PgPool, id: &str) -> Result<serde_json::Value, String> {
    let category_parent_map = load_category_parent_map(pool.clone()).await?;

    let q_row = sqlx::query(
        "SELECT id, title, status, target_days, notes, director_demand_notes, director_final_notes,
         created_at, demand_approved_at, final_approved_at, ordered_at,
         (
             SELECT i.category_id
             FROM quotation_items qi
             LEFT JOIN items i ON qi.item_code = i.code
             WHERE qi.quotation_id = quotations.id
             LIMIT 1
         ) as first_item_cat_id
         FROM quotations WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let first_item_cat_id: Option<String> = q_row.get(11);
    let root_cat = first_item_cat_id
        .as_deref()
        .map(|cid| resolve_root_category(cid, &category_parent_map));

    let q = Quotation {
        id: q_row.get(0),
        title: q_row.get(1),
        status: q_row.get(2),
        target_days: q_row.get(3),
        notes: q_row.get(4),
        director_demand_notes: q_row.get(5),
        director_final_notes: q_row.get(6),
        created_at: q_row.get(7),
        demand_approved_at: q_row.get(8),
        final_approved_at: q_row.get(9),
        ordered_at: q_row.get(10),
        item_count: None,
        total_value: None,
        quotation_type: quotation_type_from_root(root_cat.as_deref()),
    };

    let item_rows = sqlx::query(
        "SELECT qi.id, qi.quotation_id, qi.item_code, i.description, i.unit,
               qi.recommended_qty, qi.approved_qty, qi.final_qty, qi.notes
        FROM quotation_items qi
        JOIN items i ON i.code = qi.item_code
        WHERE qi.quotation_id = $1",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in item_rows {
        let item_id: String = row.get(0);
        let mut item = QuotationItemDetail {
            id: item_id.clone(),
            quotation_id: row.get(1),
            item_code: row.get(2),
            description: row.get(3),
            unit: row.get(4),
            recommended_qty: row.get(5),
            approved_qty: row.get(6),
            final_qty: row.get(7),
            notes: row.get(8),
            prices: Vec::new(),
        };

        let price_rows = sqlx::query(
            "SELECT qp.id, qp.quotation_item_id, qp.supplier_id, s.name,
                   qp.unit_price, qp.delivery_days, qp.min_qty, qp.payment_terms, qp.notes, qp.is_selected
            FROM quotation_prices qp
            JOIN suppliers s ON s.id = qp.supplier_id
            WHERE qp.quotation_item_id = $1",
        )
        .bind(&item_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        for p_row in price_rows {
            item.prices.push(QuotationPrice {
                id: p_row.get(0),
                quotation_item_id: p_row.get(1),
                supplier_id: p_row.get(2),
                supplier_name: p_row.get(3),
                unit_price: p_row.get(4),
                delivery_days: p_row.get(5),
                min_qty: p_row.get(6),
                payment_terms: p_row.get(7),
                notes: p_row.get(8),
                is_selected: p_row.get::<i32, _>(9) != 0,
            });
        }
        items.push(item);
    }

    Ok(serde_json::json!({ "quotation": q, "items": items }))
}

pub async fn update_quotation_status_query(
    pool: PgPool,
    id: &str,
    status: &str,
    notes: Option<String>,
) -> Result<(), String> {
    match status {
        "quoting" => {
            if let Some(n) = notes {
                sqlx::query(
                    "UPDATE quotations SET status = $2, director_demand_notes = $3, demand_approved_at = CURRENT_TIMESTAMP::TEXT WHERE id = $1",
                )
                .bind(id)
                .bind(status)
                .bind(n)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            } else {
                sqlx::query(
                    "UPDATE quotations SET status = $2, demand_approved_at = CURRENT_TIMESTAMP::TEXT WHERE id = $1",
                )
                .bind(id)
                .bind(status)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
        "approved" => {
            if let Some(n) = notes {
                sqlx::query(
                    "UPDATE quotations SET status = $2, director_final_notes = $3, final_approved_at = CURRENT_TIMESTAMP::TEXT WHERE id = $1",
                )
                .bind(id)
                .bind(status)
                .bind(n)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            } else {
                sqlx::query(
                    "UPDATE quotations SET status = $2, final_approved_at = CURRENT_TIMESTAMP::TEXT WHERE id = $1",
                )
                .bind(id)
                .bind(status)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
        "renegotiate" => {
            if let Some(n) = notes {
                sqlx::query(
                    "UPDATE quotations SET status = 'quoting', director_final_notes = $2 WHERE id = $1",
                )
                .bind(id)
                .bind(n)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            } else {
                sqlx::query("UPDATE quotations SET status = 'quoting' WHERE id = $1")
                    .bind(id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        "ordered" => {
            sqlx::query(
                "UPDATE quotations SET status = $2, ordered_at = CURRENT_TIMESTAMP::TEXT WHERE id = $1",
            )
            .bind(id)
            .bind(status)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        _ => {
            sqlx::query("UPDATE quotations SET status = $2 WHERE id = $1")
                .bind(id)
                .bind(status)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn add_quotation_price_query(pool: PgPool, price: &QuotationPriceInput) -> Result<(), String> {
    let price_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO quotation_prices (id, quotation_item_id, supplier_id, unit_price, delivery_days, min_qty, payment_terms, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(&price_id)
    .bind(&price.quotation_item_id)
    .bind(&price.supplier_id)
    .bind(price.unit_price)
    .bind(price.delivery_days)
    .bind(price.min_qty)
    .bind(&price.payment_terms)
    .bind(&price.notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn select_supplier_query(
    pool: PgPool,
    quotation_item_id: &str,
    price_id: &str,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE quotation_prices SET is_selected = 0 WHERE quotation_item_id = $1")
        .bind(quotation_item_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE quotation_prices SET is_selected = 1 WHERE id = $1")
        .bind(price_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_quotation_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM quotations WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_quotation_item_qty_query(
    pool: PgPool,
    id: &str,
    field: &str,
    qty: f64,
) -> Result<(), String> {
    let query = match field {
        "approved" => "UPDATE quotation_items SET approved_qty = $2 WHERE id = $1",
        "final" => "UPDATE quotation_items SET final_qty = $2 WHERE id = $1",
        _ => return Err("Invalid field".to_string()),
    };
    sqlx::query(query)
        .bind(id)
        .bind(qty)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
