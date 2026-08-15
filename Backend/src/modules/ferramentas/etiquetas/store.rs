use sqlx::PgPool;
use uuid::Uuid;

use super::models::{CreateLabelTemplatePayload, LabelTemplate, UpdateLabelTemplatePayload};

pub async fn ensure_table(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS hub_label_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL DEFAULT 'custom',
            width_mm FLOAT8 NOT NULL DEFAULT 100.0,
            height_mm FLOAT8 NOT NULL DEFAULT 50.0,
            orientation TEXT NOT NULL DEFAULT 'landscape',
            elements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_default BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hub_label_templates_category ON hub_label_templates(category);
        CREATE INDEX IF NOT EXISTS idx_hub_label_templates_is_default ON hub_label_templates(is_default);
        "#,
    )
    .execute(pool)
    .await?;

    // In case columns existed as NUMERIC, safely convert to FLOAT8
    let _ = sqlx::query("ALTER TABLE hub_label_templates ALTER COLUMN width_mm TYPE FLOAT8 USING width_mm::float8;").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE hub_label_templates ALTER COLUMN height_mm TYPE FLOAT8 USING height_mm::float8;").execute(pool).await;

    Ok(())
}

pub async fn list_templates(pool: &PgPool) -> Result<Vec<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let rows = sqlx::query_as::<_, LabelTemplate>(
        r#"
        SELECT 
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            created_at,
            updated_at
        FROM hub_label_templates
        ORDER BY is_default DESC, name ASC, created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_template(pool: &PgPool, id: Uuid) -> Result<Option<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        SELECT 
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            created_at,
            updated_at
        FROM hub_label_templates
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn create_template(
    pool: &PgPool,
    payload: CreateLabelTemplatePayload,
) -> Result<LabelTemplate, sqlx::Error> {
    ensure_table(pool).await?;

    let category = payload.category.unwrap_or_else(|| "custom".to_string());
    let width_mm = payload.width_mm.unwrap_or(100.0);
    let height_mm = payload.height_mm.unwrap_or(50.0);
    let orientation = payload.orientation.unwrap_or_else(|| "landscape".to_string());
    let is_default = payload.is_default.unwrap_or(false);

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        INSERT INTO hub_label_templates (
            name,
            description,
            category,
            width_mm,
            height_mm,
            orientation,
            elements_json,
            is_default
        )
        VALUES ($1, $2, $3, $4::float8, $5::float8, $6, $7, $8)
        RETURNING 
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            created_at,
            updated_at
        "#,
    )
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&category)
    .bind(width_mm)
    .bind(height_mm)
    .bind(&orientation)
    .bind(&payload.elements_json)
    .bind(is_default)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn update_template(
    pool: &PgPool,
    id: Uuid,
    payload: UpdateLabelTemplatePayload,
) -> Result<Option<LabelTemplate>, sqlx::Error> {
    ensure_table(pool).await?;

    let current = match get_template(pool, id).await? {
        Some(t) => t,
        None => return Ok(None),
    };

    let name = payload.name.unwrap_or(current.name);
    let description = payload.description.or(current.description);
    let category = payload.category.unwrap_or(current.category);
    let width_mm = payload.width_mm.unwrap_or(current.width_mm);
    let height_mm = payload.height_mm.unwrap_or(current.height_mm);
    let orientation = payload.orientation.unwrap_or(current.orientation);
    let elements_json = payload.elements_json.unwrap_or(current.elements_json);
    let is_default = payload.is_default.unwrap_or(current.is_default);

    let row = sqlx::query_as::<_, LabelTemplate>(
        r#"
        UPDATE hub_label_templates
        SET
            name = $2,
            description = $3,
            category = $4,
            width_mm = $5::float8,
            height_mm = $6::float8,
            orientation = $7,
            elements_json = $8,
            is_default = $9,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
            id,
            name,
            description,
            category,
            width_mm::float8 as width_mm,
            height_mm::float8 as height_mm,
            orientation,
            elements_json,
            is_default,
            created_at,
            updated_at
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .bind(category)
    .bind(width_mm)
    .bind(height_mm)
    .bind(orientation)
    .bind(elements_json)
    .bind(is_default)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn delete_template(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    ensure_table(pool).await?;

    let res = sqlx::query(
        r#"
        DELETE FROM hub_label_templates
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;

    Ok(res.rows_affected() > 0)
}
