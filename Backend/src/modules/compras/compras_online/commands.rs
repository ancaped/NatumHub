use sqlx::{PgPool, Row};

use super::models::{OnlineOrder, OnlineStore};

pub async fn get_online_orders_query(pool: PgPool) -> Result<Vec<OnlineOrder>, String> {
    let rows = sqlx::query(
        "SELECT id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, created_at, is_return, return_deadline, return_status, return_notes FROM online_orders ORDER BY purchase_date DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| OnlineOrder {
            id: row.get(0),
            description: row.get(1),
            item_code: row.get(2),
            store_name: row.get(3),
            purchase_url: row.get(4),
            purchase_date: row.get(5),
            unit_price: row.get(6),
            quantity: row.get(7),
            shipping_cost: row.get(8),
            total_price: row.get(9),
            payment_method: row.get(10),
            tracking_code: row.get(11),
            tracking_url: row.get(12),
            status: row.get(13),
            estimated_delivery: row.get(14),
            receipt_path: row.get(15),
            notes: row.get(16),
            created_at: row.get(17),
            is_return: Some(row.get::<Option<i32>, _>(18).unwrap_or(0) != 0),
            return_deadline: row.get(19),
            return_status: row.get(20),
            return_notes: row.get(21),
        })
        .collect())
}

pub async fn save_online_order_query(pool: PgPool, order: &OnlineOrder) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO online_orders (id, description, item_code, store_name, purchase_url, purchase_date, unit_price, quantity, shipping_cost, total_price, payment_method, tracking_code, tracking_url, status, estimated_delivery, receipt_path, notes, is_return, return_deadline, return_status, return_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT(id) DO UPDATE SET
            description = EXCLUDED.description,
            item_code = EXCLUDED.item_code,
            store_name = EXCLUDED.store_name,
            purchase_url = EXCLUDED.purchase_url,
            purchase_date = EXCLUDED.purchase_date,
            unit_price = EXCLUDED.unit_price,
            quantity = EXCLUDED.quantity,
            shipping_cost = EXCLUDED.shipping_cost,
            total_price = EXCLUDED.total_price,
            payment_method = EXCLUDED.payment_method,
            tracking_code = EXCLUDED.tracking_code,
            tracking_url = EXCLUDED.tracking_url,
            status = EXCLUDED.status,
            estimated_delivery = EXCLUDED.estimated_delivery,
            receipt_path = EXCLUDED.receipt_path,
            notes = EXCLUDED.notes,
            is_return = EXCLUDED.is_return,
            return_deadline = EXCLUDED.return_deadline,
            return_status = EXCLUDED.return_status,
            return_notes = EXCLUDED.return_notes",
    )
    .bind(&order.id)
    .bind(&order.description)
    .bind(&order.item_code)
    .bind(&order.store_name)
    .bind(&order.purchase_url)
    .bind(&order.purchase_date)
    .bind(order.unit_price)
    .bind(order.quantity)
    .bind(order.shipping_cost)
    .bind(order.total_price)
    .bind(&order.payment_method)
    .bind(&order.tracking_code)
    .bind(&order.tracking_url)
    .bind(&order.status)
    .bind(&order.estimated_delivery)
    .bind(&order.receipt_path)
    .bind(&order.notes)
    .bind(order.is_return.unwrap_or(false) as i32)
    .bind(&order.return_deadline)
    .bind(&order.return_status)
    .bind(&order.return_notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_online_order_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM online_orders WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_online_stores_query(pool: PgPool) -> Result<Vec<OnlineStore>, String> {
    let rows = sqlx::query(
        "SELECT id, name, url, notes, created_at FROM online_stores ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| OnlineStore {
            id: row.get(0),
            name: row.get(1),
            url: row.get(2),
            notes: row.get(3),
            created_at: row.get(4),
        })
        .collect())
}

pub async fn save_online_store_query(pool: PgPool, store: &OnlineStore) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO online_stores (id, name, url, notes) VALUES ($1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, notes = EXCLUDED.notes",
    )
    .bind(&store.id)
    .bind(&store.name)
    .bind(&store.url)
    .bind(&store.notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_online_store_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM online_stores WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
