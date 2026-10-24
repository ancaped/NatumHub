//! Foto diária do estoque por item. Gravada no fim do sync do ERP; serve para saber o estoque
//! em uma data passada (início de período na movimentação de insumos).

use chrono::NaiveDate;
use sqlx::PgPool;

/// Grava (upsert) a foto de hoje: insumos pelo `stock_qty` mais recente de `stock_snapshots`,
/// mais os produtos de `estoque_atual` que não são insumos. Vale a última foto do dia.
pub async fn gravar_foto_do_dia(pool: &PgPool) -> Result<u64, sqlx::Error> {
    let r = sqlx::query(
        "WITH hoje AS (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS dia),
         insumos AS (
            SELECT DISTINCT ON (TRIM(item_code)) TRIM(item_code) AS codigo, stock_qty::float8 AS estoque
            FROM stock_snapshots
            WHERE item_code IS NOT NULL AND stock_qty IS NOT NULL
            ORDER BY TRIM(item_code), snapshot_date DESC, id DESC
         ),
         produtos AS (
            SELECT DISTINCT ON (TRIM(codigo)) TRIM(codigo) AS codigo, estoque::float8 AS estoque
            FROM estoque_atual
            WHERE codigo IS NOT NULL AND estoque IS NOT NULL
              AND TRIM(codigo) NOT IN (SELECT codigo FROM insumos)
            ORDER BY TRIM(codigo)
         ),
         todos AS (
            SELECT codigo, estoque, 'insumo' AS origem FROM insumos
            UNION ALL
            SELECT codigo, estoque, 'produto' AS origem FROM produtos
         )
         INSERT INTO estoque_diario (codigo, dia, estoque, origem)
         SELECT t.codigo, h.dia, t.estoque, t.origem FROM todos t, hoje h WHERE t.codigo <> ''
         ON CONFLICT (codigo, dia) DO UPDATE SET
            estoque = EXCLUDED.estoque, origem = EXCLUDED.origem, gravado_em = NOW()",
    )
    .execute(pool)
    .await?;
    Ok(r.rows_affected())
}

/// Estoque da foto mais recente com `dia <= dia` para o código.
pub async fn estoque_em(pool: &PgPool, codigo: &str, dia: NaiveDate) -> Result<Option<f64>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT estoque FROM estoque_diario WHERE codigo = TRIM($1) AND dia <= $2 ORDER BY dia DESC LIMIT 1",
    )
    .bind(codigo)
    .bind(dia)
    .fetch_optional(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn foto_do_dia_e_consulta_por_data() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = |p: PgPool| async move {
            sqlx::query("DELETE FROM estoque_diario WHERE codigo = 'TESTE.H2'").execute(&p).await.unwrap();
        };
        limpar(pool.clone()).await;

        let r1 = gravar_foto_do_dia(&pool).await;
        let r2 = gravar_foto_do_dia(&pool).await;

        let d = |dia: u32| NaiveDate::from_ymd_opt(2026, 1, dia).unwrap();
        for (dia, est) in [(10, 5.0), (12, 7.5)] {
            sqlx::query("INSERT INTO estoque_diario (codigo, dia, estoque, origem) VALUES ('TESTE.H2', $1, $2, 'insumo')")
                .bind(d(dia)).bind(est).execute(&pool).await.unwrap();
        }
        let antes = estoque_em(&pool, "TESTE.H2", d(9)).await;
        let em10 = estoque_em(&pool, "TESTE.H2", d(10)).await;
        let em11 = estoque_em(&pool, "TESTE.H2", d(11)).await;
        let em13 = estoque_em(&pool, " TESTE.H2 ", d(13)).await;
        limpar(pool.clone()).await;

        r1.unwrap();
        r2.unwrap();
        assert_eq!(antes.unwrap(), None);
        assert_eq!(em10.unwrap(), Some(5.0));
        assert_eq!(em11.unwrap(), Some(5.0));
        assert_eq!(em13.unwrap(), Some(7.5));
    }
}
