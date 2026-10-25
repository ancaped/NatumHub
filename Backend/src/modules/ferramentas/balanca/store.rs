//! Leitura e gravação da carga da balança (matérias-primas 9.15.% e códigos rápidos).

use sqlx::{PgPool, Row};
use std::collections::HashMap;

use super::mgv::produto_suspenso;
use super::NovoCodigo;

#[derive(Debug, Clone)]
pub struct ItemInsumo {
    pub codigo: String,
    pub descricao: String,
    pub unidade: String,
    pub categoria: Option<String>,
    pub ignorado: bool,
    /// Um por produto que usa a matéria-prima: o produto/linha está suspenso ou terceirizado?
    pub produtos_suspensos: Vec<bool>,
}

pub async fn carregar_itens(pool: &PgPool) -> Result<Vec<ItemInsumo>, String> {
    let rows = sqlx::query(
        r#"
        SELECT i.code, COALESCE(i.description, '') AS description, COALESCE(i.unit, '') AS unit,
               COALESCE(i.is_ignored, 0)::int AS ignorado, c.name AS categoria
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.code LIKE '9.15.%'
        ORDER BY i.code
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler as matérias-primas: {e}"))?;

    let usos = sqlx::query(&format!(
        r#"
        SELECT f.ingredient_code AS insumo,
               COALESCE(o.status_produto, 'ativo') AS status_produto,
               COALESCE(cl.visivel, 1)::int AS linha_visivel
        FROM formulations f
        JOIN produtos p ON f.product_code = p.codigo
        {}
        WHERE f.ingredient_code LIKE '9.15.%'
        "#,
        crate::core::regras_produto::JOIN_LINHA_EFETIVA_SQL
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler o uso das matérias-primas: {e}"))?;
    let mut suspensos: HashMap<String, Vec<bool>> = HashMap::new();
    for r in usos {
        suspensos
            .entry(r.get::<String, _>("insumo"))
            .or_default()
            .push(produto_suspenso(&r.get::<String, _>("status_produto"), r.get::<i32, _>("linha_visivel")));
    }

    Ok(rows
        .into_iter()
        .map(|r| {
            let codigo: String = r.get("code");
            ItemInsumo {
                produtos_suspensos: suspensos.remove(&codigo).unwrap_or_default(),
                codigo,
                descricao: r.get("description"),
                unidade: r.get("unit"),
                categoria: r.get::<Option<String>, _>("categoria"),
                ignorado: r.get::<i32, _>("ignorado") == 1,
            }
        })
        .collect())
}

pub async fn carregar_codigos(pool: &PgPool) -> Result<HashMap<String, i32>, String> {
    let rows = sqlx::query("SELECT codigo_erp, codigo_rapido FROM balanca_codigos")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler os códigos da balança: {e}"))?;
    Ok(rows.into_iter().map(|r| (r.get::<String, _>("codigo_erp"), r.get::<i32, _>("codigo_rapido"))).collect())
}

/// Grava os códigos novos numa transação; o UNIQUE barra o mesmo número para dois itens (corrida entre cliques).
pub async fn gravar_codigos(pool: &PgPool, novos: &[NovoCodigo]) -> Result<usize, String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a gravação: {e}"))?;
    for n in novos {
        sqlx::query("INSERT INTO balanca_codigos (codigo_erp, codigo_rapido) VALUES ($1, $2)")
            .bind(&n.codigo_erp)
            .bind(n.codigo_rapido)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Não gravei o código {} para {}: {e}. Atualize a tela e tente de novo.", n.codigo_rapido, n.codigo_erp))?;
    }
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a gravação: {e}"))?;
    Ok(novos.len())
}
