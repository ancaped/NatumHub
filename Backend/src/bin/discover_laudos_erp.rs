use app_lib::core::pg_db::create_pool;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = create_pool().await.map_err(|e| anyhow::anyhow!(e))?;

    // 1. Normalizar analysis_date para YYYY-MM-DD
    let updated_dates = sqlx::query(
        r#"
        UPDATE fisco_quimica_analyses
        SET analysis_date = split_part(split_part(analysis_date, ' ', 1), 'T', 1)
        WHERE analysis_date LIKE '% %' OR analysis_date LIKE '%T%'
        "#
    )
    .execute(&pool)
    .await?;

    println!("Linhas com data normalizada para YYYY-MM-DD: {}", updated_dates.rows_affected());

    // 1. Atualizar padrões que estavam como 8-12, 10-12, 90-160, etc. (exceto 1.31.003 que é 300-500)
    sqlx::query(
        "UPDATE fisco_quimica_patterns
         SET viscosity_min = viscosity_min * 1000, viscosity_max = viscosity_max * 1000
         WHERE viscosity_min < 300 AND product_code <> '1.31.003'"
    )
    .execute(&pool)
    .await?;

    // 2. Atualizar análises lançadas hoje que ficaram com 8, 10, 65, 90, 135, 140, 156 (exceto 1.31.003 que é 400)
    sqlx::query(
        "UPDATE fisco_quimica_analyses
         SET viscosity_measured = viscosity_measured * 1000
         WHERE viscosity_measured < 300 AND product_code <> '1.31.003' AND analysis_date = '2026-08-17'"
    )
    .execute(&pool)
    .await?;

    let all_patterns = sqlx::query(
        "SELECT product_code, viscosity_min, viscosity_max
         FROM fisco_quimica_patterns
         ORDER BY product_code"
    )
    .fetch_all(&pool)
    .await?;

    use sqlx::Row;
    println!("\n=== ALL PATTERNS VISCOSITY ATUALIZADOS ===");
    for p in all_patterns {
        let code: String = p.get(0);
        let v_min: f64 = p.get(1);
        let v_max: f64 = p.get(2);
        println!("Prod: {}, Visc: {} - {}", code, v_min, v_max);
    }

    let rows = sqlx::query(
        "SELECT id, product_code, batch, ph_measured, viscosity_measured, density_measured, analysis_date
         FROM fisco_quimica_analyses
         WHERE analysis_date = '2026-08-17'
         ORDER BY id DESC"
    )
    .fetch_all(&pool)
    .await?;

    println!("\n=== ANALYSES DE HOJE (2026-08-17) ATUALIZADAS ===");
    for r in rows {
        let _id: String = r.get(0);
        let prod: String = r.get(1);
        let batch: String = r.get(2);
        let ph: f64 = r.get(3);
        let visc: f64 = r.get(4);
        let dens: f64 = r.get(5);
        let dt: String = r.get(6);
        println!("Date: {}, Batch: {}, Prod: {}, pH: {}, Visc: {}, Dens: {}", dt, batch, prod, ph, visc, dens);
    }

    Ok(())
}
