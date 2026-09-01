use sqlx::PgPool;
use uuid::Uuid;

use super::models::{
    CatalogProductInfo, CreateLabelTemplatePayload, CreatePrintHistoryPayload, LabelPrintHistoryRecord,
    LabelTemplate, UpdateLabelTemplatePayload,
};

pub async fn ensure_table(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(
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

        CREATE TABLE IF NOT EXISTS hub_label_print_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID,
            template_name TEXT NOT NULL,
            product_code TEXT,
            product_name TEXT,
            lot_number TEXT,
            operator_id TEXT,
            operator_name TEXT,
            copies INT NOT NULL DEFAULT 1,
            printer_name TEXT,
            printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_printed_at ON hub_label_print_history(printed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_product_code ON hub_label_print_history(product_code);
        CREATE INDEX IF NOT EXISTS idx_hub_label_print_history_operator_id ON hub_label_print_history(operator_id);
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::raw_sql("ALTER TABLE hub_label_templates ALTER COLUMN width_mm TYPE FLOAT8 USING width_mm::float8;").execute(pool).await;
    let _ = sqlx::raw_sql("ALTER TABLE hub_label_templates ALTER COLUMN height_mm TYPE FLOAT8 USING height_mm::float8;").execute(pool).await;

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

    let width_mm = payload.width_mm.unwrap_or(100.0);
    let height_mm = payload.height_mm.unwrap_or(50.0);
    let orientation = payload.orientation.unwrap_or_else(|| "landscape".to_string());
    let category = payload.category.unwrap_or_else(|| "custom".to_string());
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
    .bind(payload.name)
    .bind(payload.description)
    .bind(category)
    .bind(width_mm)
    .bind(height_mm)
    .bind(orientation)
    .bind(payload.elements_json)
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

pub async fn list_print_history(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<LabelPrintHistoryRecord>, sqlx::Error> {
    ensure_table(pool).await?;

    let rows = sqlx::query_as::<_, LabelPrintHistoryRecord>(
        r#"
        SELECT 
            id,
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        FROM hub_label_print_history
        ORDER BY printed_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn create_print_history(
    pool: &PgPool,
    operator_id: Option<String>,
    operator_name: Option<String>,
    payload: CreatePrintHistoryPayload,
) -> Result<LabelPrintHistoryRecord, sqlx::Error> {
    ensure_table(pool).await?;

    let copies = payload.copies.unwrap_or(1);

    let row = sqlx::query_as::<_, LabelPrintHistoryRecord>(
        r#"
        INSERT INTO hub_label_print_history (
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING
            id,
            template_id,
            template_name,
            product_code,
            product_name,
            lot_number,
            operator_id,
            operator_name,
            copies,
            printer_name,
            printed_at
        "#,
    )
    .bind(payload.template_id)
    .bind(payload.template_name)
    .bind(payload.product_code)
    .bind(payload.product_name)
    .bind(payload.lot_number)
    .bind(operator_id)
    .bind(operator_name)
    .bind(copies)
    .bind(payload.printer_name)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

pub async fn list_catalog_products(pool: &PgPool) -> Result<Vec<CatalogProductInfo>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>)>(
        r#"
        SELECT 
            p.codigo,
            p.descricao,
            p.linha_prefix,
            p.codigo_barras,
            o.categoria_produto
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        ORDER BY p.descricao ASC
        LIMIT 500
        "#,
    )
    .fetch_all(pool)
    .await?;

    let list = rows
        .into_iter()
        .map(|(codigo, descricao, linha, codigo_barras, categoria)| {
            // Gerar DUN-14 derivado se EAN existir (prefixo 1 + 12 digitos + checksum)
            let box_barcode = codigo_barras.as_ref().map(|ean| {
                if ean.len() == 13 {
                    format!("1{}", &ean[0..12])
                } else {
                    format!("DUN-{}", codigo)
                }
            });

            CatalogProductInfo {
                codigo,
                descricao,
                codigo_barras,
                codigo_barras_caixa: box_barcode,
                quantidade_caixa: Some(12),
                linha,
                categoria,
            }
        })
        .collect();

    Ok(list)
}

pub async fn list_production_lots(pool: &PgPool) -> Result<Vec<super::models::ProductionLotItem>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (i32, String, Option<String>, Option<String>, i32, Option<String>, Option<String>)>(
        r#"
        SELECT 
            h.id,
            h.codigo,
            p.descricao,
            COALESCE(h.lote_erp, 'LOTE-' || h.id::text) as lote,
            h.quantidade,
            h.data_producao,
            p.codigo_barras
        FROM historico_producao h
        LEFT JOIN produtos p ON p.codigo = h.codigo
        ORDER BY h.id DESC
        LIMIT 60
        "#,
    )
    .fetch_all(pool)
    .await?;

    let list = rows
        .into_iter()
        .map(|(id, codigo, descricao, lote, quantidade, data_producao, codigo_barras)| {
            let dun = codigo_barras.as_ref().map(|ean| {
                if ean.len() == 13 {
                    format!("1{}", &ean[0..12])
                } else {
                    format!("DUN-{}", codigo)
                }
            });

            super::models::ProductionLotItem {
                id,
                descricao: descricao.unwrap_or_else(|| codigo.clone()),
                codigo,
                lote: lote.unwrap_or_else(|| format!("LOTE-{}", id)),
                quantidade,
                data_producao,
                codigo_barras,
                codigo_barras_caixa: dun,
            }
        })
        .collect();

    Ok(list)
}
