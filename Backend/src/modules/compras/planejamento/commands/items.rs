use sqlx::{PgPool, Row};

use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::get_auto_ignored_ingredients_query;

fn map_item_row(row: sqlx::postgres::PgRow, auto_ignored: &std::collections::HashMap<String, String>) -> Item {
    let code: String = row.get(0);
    let is_manually_ignored = row.get::<i32, _>(7) != 0;
    let is_auto_ignored = auto_ignored.contains_key(&code);
    let ignored_reason = auto_ignored.get(&code).cloned();
    Item {
        code: code.clone(),
        description: row.get(1),
        unit: row.get(2),
        category_id: row.get(3),
        line: row.get(4),
        type_code: row.get(5),
        notes: row.get(6),
        is_ignored: is_manually_ignored || is_auto_ignored,
        is_auto_ignored: Some(is_auto_ignored),
        ignored_reason,
    }
}

pub async fn get_items_query(pool: PgPool, category_id: Option<String>) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let rows = if let Some(ref cat_id) = category_id {
        sqlx::query(
            "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored FROM items WHERE category_id = $1 ORDER BY description",
        )
        .bind(cat_id)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query(
            "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored FROM items ORDER BY description",
        )
        .fetch_all(&pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| map_item_row(row, &auto_ignored))
        .collect())
}

pub async fn get_similar_items_query(pool: PgPool, code: &str) -> Result<Vec<Item>, String> {
    let auto_ignored = get_auto_ignored_ingredients_query(pool.clone()).await?;

    let rows = sqlx::query(
        "SELECT code, description, unit, category_id, line, \"type\", notes, is_ignored
         FROM items
         WHERE code IN (
             SELECT item_code_b FROM similar_items WHERE item_code_a = $1
             UNION
             SELECT item_code_a FROM similar_items WHERE item_code_b = $1
         )
         ORDER BY description",
    )
    .bind(code)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| map_item_row(row, &auto_ignored))
        .collect())
}

pub async fn add_similar_item_query(pool: PgPool, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b {
        (code_a, code_b)
    } else {
        (code_b, code_a)
    };
    sqlx::query(
        "INSERT INTO similar_items (item_code_a, item_code_b) VALUES ($1, $2)
         ON CONFLICT (item_code_a, item_code_b) DO NOTHING",
    )
    .bind(first)
    .bind(second)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn remove_similar_item_query(pool: PgPool, code_a: &str, code_b: &str) -> Result<(), String> {
    let (first, second) = if code_a < code_b {
        (code_a, code_b)
    } else {
        (code_b, code_a)
    };
    sqlx::query("DELETE FROM similar_items WHERE item_code_a = $1 AND item_code_b = $2")
        .bind(first)
        .bind(second)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn update_item_details_query(
    pool: PgPool,
    code: &str,
    notes: Option<String>,
    is_ignored: bool,
) -> Result<(), String> {
    let is_product: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
        .bind(code)
        .fetch_one(&pool)
        .await
        .unwrap_or(false);

    if is_product {
        sqlx::query(
            "INSERT INTO overrides_produtos (codigo, observacao, visivel)
             VALUES ($1, $2, $3)
             ON CONFLICT(codigo) DO UPDATE SET
                observacao = EXCLUDED.observacao,
                visivel = EXCLUDED.visivel",
        )
        .bind(code)
        .bind(&notes)
        .bind(if is_ignored { 0 } else { 1 })
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE items SET notes = $2, is_ignored = $3, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(code)
        .bind(&notes)
        .bind(if is_ignored { 1 } else { 0 })
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn update_items_category_query(
    pool: PgPool,
    codes: &[String],
    category_id: Option<String>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for code in codes {
        let is_product: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM produtos WHERE codigo = $1)")
            .bind(code)
            .fetch_one(&mut *tx)
            .await
            .unwrap_or(false);

        if is_product {
            sqlx::query(
                "INSERT INTO overrides_produtos (codigo, categoria_produto)
                 VALUES ($1, $2)
                 ON CONFLICT(codigo) DO UPDATE SET categoria_produto = EXCLUDED.categoria_produto",
            )
            .bind(code)
            .bind(&category_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            let target_cat = match &category_id {
                Some(cat) => Some(cat.clone()),
                None => {
                    let default_cat = if code.starts_with("9.15.") {
                        "cat_mp"
                    } else if code.starts_with("08.") {
                        "cat_mat"
                    } else {
                        "cat_emb"
                    };
                    Some(default_cat.to_string())
                }
            };
            sqlx::query(
                "UPDATE items SET category_id = $2, manual_category = 1, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
            )
            .bind(code)
            .bind(&target_cat)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn import_item_observations_query(
    pool: PgPool,
    observations: &[ObsInput],
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for obs in observations {
        sqlx::query(
            "UPDATE items SET notes = $2, is_ignored = 1, updated_at = CURRENT_TIMESTAMP::TEXT WHERE code = $1",
        )
        .bind(&obs.code)
        .bind(&obs.notes)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "desktop")]
#[allow(dead_code)]
mod _tauri_stubs {
    use super::*;
    use tauri::State;
    use crate::DbState;

    #[tauri::command]
    pub fn get_items(_state: State<DbState>, _category_id: Option<String>) -> Result<Vec<Item>, String> {
        Err("Use a API REST (/api/hub/compras/items)".into())
    }

    #[tauri::command]
    pub fn get_similar_items(_state: State<DbState>, _code: String) -> Result<Vec<Item>, String> {
        Err("Use a API REST (/api/hub/compras/items/similar)".into())
    }

    #[tauri::command]
    pub fn add_similar_item(_state: State<DbState>, _code_a: String, _code_b: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/items/similar)".into())
    }

    #[tauri::command]
    pub fn remove_similar_item(_state: State<DbState>, _code_a: String, _code_b: String) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/items/similar)".into())
    }

    #[tauri::command]
    pub fn update_item_details(
        _state: State<DbState>,
        _code: String,
        _notes: Option<String>,
        _is_ignored: bool,
    ) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/items/details)".into())
    }

    #[tauri::command]
    pub fn update_items_category(
        _state: State<DbState>,
        _codes: Vec<String>,
        _category_id: Option<String>,
    ) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/items/category)".into())
    }

    #[tauri::command]
    pub fn import_item_observations(_state: State<DbState>, _observations: Vec<ObsInput>) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/items/observations)".into())
    }
}
