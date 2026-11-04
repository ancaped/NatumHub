use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::core::acao::{executar_em_2_passos, ErroApi, RespostaAcao};
use crate::modules::compras::planejamento::models::*;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_COMPRAS_CATEGORIAS;

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

    gravar_categoria(&pool, id, name, parent_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn gravar_categoria<'e>(
    exec: impl sqlx::PgExecutor<'e>,
    id: &str,
    name: &str,
    parent_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO categories (id, name, parent_id) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id",
    )
    .bind(id)
    .bind(name)
    .bind(parent_id)
    .execute(exec)
    .await?;
    Ok(())
}

/// Serviço (2 passos): cria ou renomeia/move uma subcategoria. Reutilizável por agentes.
pub async fn salvar_categoria_compras(
    pool: &PgPool,
    ctx: &AuthContext,
    id: Option<&str>,
    name: &str,
    parent_id: &str,
    confirmar: bool,
) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = name.trim().to_string();
    if nome.is_empty() {
        return Err(ErroApi::invalido("Informe name (nome da categoria)."));
    }
    let mae = parent_id.trim().to_string();
    if mae.is_empty() {
        return Err(ErroApi::invalido("Informe parentId (use listar_categorias_compras)."));
    }
    let id_informado = id.map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let (nome_tx, mae_tx, id_tx) = (nome.clone(), mae.clone(), id_informado.clone());
    let resposta = executar_em_2_passos(pool, "salvar_categoria_compras", confirmar, move |tx| {
        Box::pin(async move {
            // a checagem de ciclo só vale se a árvore não mudar até o commit
            sqlx::query("LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE").execute(&mut **tx).await?;
            let mae_existe: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)")
                .bind(&mae_tx)
                .fetch_one(&mut **tx)
                .await?;
            if !mae_existe {
                return Err(ErroApi::invalido(format!("Categoria-mãe '{mae_tx}' não existe (use listar_categorias_compras).")));
            }
            let mut antes: Option<(String, Option<String>)> = None;
            if let Some(id) = id_tx.as_deref() {
                antes = sqlx::query_as("SELECT name, parent_id FROM categories WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&mut **tx)
                    .await?;
                if let Some((_, None)) = antes {
                    return Err(ErroApi::invalido(format!("A categoria '{id}' é raiz; categorias raiz não se alteram.")));
                }
                let em_ciclo: bool = id == mae_tx
                    || sqlx::query_scalar(
                        "WITH RECURSIVE sobe AS (
                             SELECT id, parent_id, 0 AS n FROM categories WHERE id = $1
                             UNION ALL
                             SELECT c.id, c.parent_id, s.n + 1 FROM categories c JOIN sobe s ON c.id = s.parent_id WHERE s.n < 20
                         ) SELECT EXISTS (SELECT 1 FROM sobe WHERE id = $2)",
                    )
                    .bind(&mae_tx)
                    .bind(id)
                    .fetch_one(&mut **tx)
                    .await?;
                if em_ciclo {
                    return Err(ErroApi::invalido(format!("A categoria '{id}' não pode ficar dentro de '{mae_tx}' (criaria um ciclo).")));
                }
            }
            let criada = antes.is_none();
            let mudou = match &antes {
                None => true,
                Some((n, p)) => *n != nome_tx || p.as_deref() != Some(mae_tx.as_str()),
            };
            // o id gerado só existe ao confirmar: na prévia vai nulo
            let id_real: Option<String> = match (&id_tx, confirmar) {
                (Some(i), _) => Some(i.clone()),
                (None, true) => Some(format!("cat_{}", Uuid::new_v4().simple())),
                (None, false) => None,
            };
            if mudou {
                if let Some(i) = id_real.as_deref() {
                    gravar_categoria(&mut **tx, i, &nome_tx, Some(&mae_tx)).await?;
                }
            }
            Ok(json!({
                "id": id_real,
                "criada": criada,
                "antes": antes.as_ref().map(|(n, p)| json!({ "name": n, "parentId": p })),
                "depois": { "name": nome_tx, "parentId": mae_tx },
                "mudou": mudou,
            }))
        })
    })
    .await?;
    if confirmar && resposta.resultado["mudou"] == json!(true) {
        let r = &resposta.resultado;
        let id_real = r["id"].as_str().unwrap_or_default();
        let verbo = if r["criada"] == json!(true) { "criada" } else { "salva" };
        let resumo = format!("Categoria {id_real} {verbo}: {nome}");
        let antes = if r["antes"].is_null() { None } else { Some(r["antes"].clone()) };
        let depois = json!({ "name": nome, "parentId": mae, "origem": ctx.origem.as_str() });
        audit::record_domain(pool, Some(ctx), MODULE_COMPRAS_CATEGORIAS, "salvar_categoria_compras", "category", id_real, &resumo, antes, Some(depois)).await;
    }
    Ok(resposta)
}

pub async fn delete_category_query(pool: PgPool, id: &str) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

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
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE overrides_produtos
         SET categoria_produto = NULL
         WHERE categoria_produto = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM categories WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::geral::auth::models::{OperatorRole, Origem};

    fn ctx_agente() -> AuthContext {
        AuthContext {
            operator_id: "a1".into(),
            display_name: "Teste".into(),
            role: OperatorRole::Operador,
            modules: vec!["compras_categorias".into()],
            permissions: vec![("compras_categorias".into(), "edit".into())].into_iter().collect(),
            origem: Origem::Agente,
        }
    }

    async fn limpar(pool: &PgPool) {
        // filhos antes da mãe
        for sql in [
            "DELETE FROM categories WHERE parent_id LIKE 'zz_cat_%' AND id NOT LIKE 'zz_cat_%'",
            "DELETE FROM categories WHERE id IN ('zz_cat_b', 'zz_cat_a', 'zz_cat_n', 'zz_cat_novo')",
            "DELETE FROM categories WHERE id = 'zz_cat_raiz'",
            "DELETE FROM categories WHERE id = 'zz_cat_raiz2'",
        ] {
            sqlx::query(sql).execute(pool).await.unwrap();
        }
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn salvar_categoria_compras_2_passos_e_recusas() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        limpar(&pool).await;
        let ag = ctx_agente();
        sqlx::query("INSERT INTO categories (id, name, parent_id) VALUES ('zz_cat_raiz', 'ZZ raiz', NULL)").execute(&pool).await.unwrap();
        let existe = |id: &'static str| {
            let pool = pool.clone();
            async move { sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)").bind(id).fetch_one(&pool).await.unwrap() }
        };
        let codigo = |e: ErroApi| e.codigo;

        // validações fora da transação
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, None, "  ", "zz_cat_raiz", false).await.unwrap_err()), "invalido");
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, None, "X", " ", false).await.unwrap_err()), "invalido");
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, None, "X", "zz_cat_nao_existe", false).await.unwrap_err()), "invalido");

        // prévia sem id: não grava e devolve id nulo
        let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories").fetch_one(&pool).await.unwrap();
        let p = salvar_categoria_compras(&pool, &ag, None, "ZZ nova", "zz_cat_raiz", false).await.unwrap();
        assert!(p.previa);
        assert!(p.resultado["id"].is_null());
        assert_eq!(p.resultado["criada"], json!(true));
        assert_eq!(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM categories").fetch_one(&pool).await.unwrap(), before);

        // confirmar sem id: gera cat_..., cria com a mãe e audita
        let r = salvar_categoria_compras(&pool, &ag, None, "ZZ nova", "zz_cat_raiz", true).await.unwrap();
        let gerado = r.resultado["id"].as_str().unwrap().to_string();
        assert!(gerado.starts_with("cat_"));
        let (n, par): (String, Option<String>) = sqlx::query_as("SELECT name, parent_id FROM categories WHERE id = $1").bind(&gerado).fetch_one(&pool).await.unwrap();
        assert_eq!((n.as_str(), par.as_deref()), ("ZZ nova", Some("zz_cat_raiz")));
        let aud: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_audit_events WHERE action = 'salvar_categoria_compras' AND entity_id = $1").bind(&gerado).fetch_one(&pool).await.unwrap();
        assert_eq!(aud, 1);
        sqlx::query("DELETE FROM categories WHERE id = $1").bind(&gerado).execute(&pool).await.unwrap();

        // id informado e inexistente cria; renomear; repetir igual não muda
        let c = salvar_categoria_compras(&pool, &ag, Some("zz_cat_a"), "ZZ a", "zz_cat_raiz", true).await.unwrap();
        assert_eq!(c.resultado["id"], json!("zz_cat_a"));
        assert_eq!(c.resultado["criada"], json!(true));
        let rn = salvar_categoria_compras(&pool, &ag, Some("zz_cat_a"), "ZZ a2", "zz_cat_raiz", true).await.unwrap();
        assert_eq!(rn.resultado["mudou"], json!(true));
        assert_eq!(rn.resultado["antes"], json!({ "name": "ZZ a", "parentId": "zz_cat_raiz" }));
        assert_eq!(rn.resultado["depois"], json!({ "name": "ZZ a2", "parentId": "zz_cat_raiz" }));
        let igual = salvar_categoria_compras(&pool, &ag, Some("zz_cat_a"), "ZZ a2", "zz_cat_raiz", true).await.unwrap();
        assert_eq!(igual.resultado["mudou"], json!(false));

        // raiz não se altera
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, Some("zz_cat_raiz"), "Outro", "zz_cat_a", false).await.unwrap_err()), "invalido");

        // ciclos: id == parentId e mover a para baixo de b (raiz > a > b)
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, Some("zz_cat_a"), "ZZ a2", "zz_cat_a", false).await.unwrap_err()), "invalido");
        salvar_categoria_compras(&pool, &ag, Some("zz_cat_b"), "ZZ b", "zz_cat_a", true).await.unwrap();
        assert_eq!(codigo(salvar_categoria_compras(&pool, &ag, Some("zz_cat_a"), "ZZ a2", "zz_cat_b", false).await.unwrap_err()), "invalido");

        // rota antiga continua aceitando raiz (parent_id None)
        save_category_query(pool.clone(), &Category { id: "zz_cat_raiz2".into(), name: "ZZ raiz 2".into(), parent_id: None }).await.unwrap();
        assert!(existe("zz_cat_raiz2").await);

        limpar(&pool).await;
        sqlx::query("DELETE FROM hub_audit_events WHERE action = 'salvar_categoria_compras' AND entity_id LIKE 'zz_cat_%'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM hub_audit_events WHERE action = 'salvar_categoria_compras' AND summary LIKE '% ZZ nova'").execute(&pool).await.unwrap();
    }
}
