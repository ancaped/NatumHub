use sqlx::{PgPool, Row};

use crate::modules::compras::planejamento::models::CustomPurchaseConfigRow;

pub async fn get_custom_purchase_configs_query(pool: PgPool) -> Result<Vec<CustomPurchaseConfigRow>, String> {
    let rows = sqlx::query(
        "SELECT level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor,
                CASE
                    WHEN level = 'subcategoria' THEN (SELECT name FROM categories WHERE id = target_id)
                    WHEN level = 'item' THEN COALESCE((SELECT description FROM items WHERE code = target_id), (SELECT descricao FROM produtos WHERE codigo = target_id))
                    ELSE 'Configuração Geral'
                END as target_name,
                periodo_media
         FROM compras_config_personalizado",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| CustomPurchaseConfigRow {
            level: row.get(0),
            target_id: row.get(1),
            dias_start: row.get(2),
            dias_target: row.get(3),
            use_lead_time: row.get(4),
            safety_days: row.get(5),
            objetivo_tipo: row.get(6),
            objetivo_valor: row.get(7),
            target_name: row.get(8),
            periodo_media: row.get(9),
        })
        .collect())
}

pub async fn save_custom_purchase_config_query(pool: PgPool, row: &CustomPurchaseConfigRow) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO compras_config_personalizado
         (level, target_id, dias_start, dias_target, use_lead_time, safety_days, objetivo_tipo, objetivo_valor, periodo_media)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (level, target_id) DO UPDATE SET
            dias_start = EXCLUDED.dias_start,
            dias_target = EXCLUDED.dias_target,
            use_lead_time = EXCLUDED.use_lead_time,
            safety_days = EXCLUDED.safety_days,
            objetivo_tipo = EXCLUDED.objetivo_tipo,
            objetivo_valor = EXCLUDED.objetivo_valor,
            periodo_media = EXCLUDED.periodo_media",
    )
    .bind(&row.level)
    .bind(&row.target_id)
    .bind(row.dias_start)
    .bind(row.dias_target)
    .bind(row.use_lead_time)
    .bind(row.safety_days)
    .bind(&row.objetivo_tipo)
    .bind(row.objetivo_valor)
    .bind(row.periodo_media)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_custom_purchase_config_query(
    pool: PgPool,
    level: &str,
    target_id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM compras_config_personalizado WHERE level = $1 AND target_id = $2")
        .bind(level)
        .bind(target_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(feature = "desktop")]
#[allow(dead_code)]
mod _tauri_stubs {
    use super::*;
    use tauri::State;
    use crate::DbState;

    #[tauri::command]
    pub fn get_custom_purchase_configs(_state: State<DbState>) -> Result<Vec<CustomPurchaseConfigRow>, String> {
        Err("Use a API REST (/api/hub/compras/custom-configs)".into())
    }

    #[tauri::command]
    pub fn save_custom_purchase_config(_state: State<DbState>, _row: CustomPurchaseConfigRow) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/custom-configs)".into())
    }

    #[tauri::command]
    pub fn delete_custom_purchase_config(
        _state: State<DbState>,
        _level: String,
        _target_id: String,
    ) -> Result<(), String> {
        Err("Use a API REST (/api/hub/compras/custom-configs)".into())
    }
}
