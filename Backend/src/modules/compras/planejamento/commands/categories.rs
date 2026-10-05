use sqlx::{PgPool, Row};

use crate::modules::compras::planejamento::models::*;

pub async fn get_categories_query(pool: PgPool) -> Result<Vec<Category>, String> {
    let rows = sqlx::query("SELECT id, name, parent_id FROM categories ORDER BY name")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| Category {
            id: row.get(0),
            name: row.get(1),
            parent_id: row.get(2),
        })
        .collect())
}

pub async fn save_category_query(pool: PgPool, category: &Category) -> Result<(), String> {
    let id = category.id.trim();
    if id.is_empty() {
        return Err("ID da categoria não pode ser vazio".into());
    }
    let name = category.name.trim();
    if name.is_empty() {
        return Err("Nome da categoria não pode ser vazio".into());
    }
    let parent_id = category
        .parent_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    sqlx::query(
        "INSERT INTO categories (id, name, parent_id) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id",
    )
    .bind(id)
    .bind(name)
    .bind(parent_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_category_query(pool: PgPool, id: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE items
         SET category_id = CASE
             WHEN code LIKE '9.15.%' THEN 'cat_mp'
             WHEN code LIKE '08.%' THEN 'cat_mat'
             ELSE 'cat_emb'
         END,
         manual_category = 0
         WHERE category_id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE overrides_produtos
         SET categoria_produto = NULL
         WHERE categoria_produto = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM categories WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

