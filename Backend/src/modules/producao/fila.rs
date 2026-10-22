//! Retirar item da Fila de Demandas (Banco de Demandas), lembrando o motivo.
//!
//! Escrita em 2 passos: sem `confirmar` só devolve a prévia; com ele apaga a(s) linha(s) e grava a decisão
//! `fila_descartada` na mesma transação. Toda retirada vai para `producao_auditoria`.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, decisoes};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/fila-demandas/:id/retirar", post(retirar_rota))
}

#[derive(Debug, Clone)]
pub struct ItemFila {
    pub id: String,
    pub codigo: String,
    pub descricao: String,
    pub quantidade_kg: Option<f64>,
}

/// Tag `[batch:XYZ]` gravada em `observacoes` quando o item veio de uma batelada.
pub fn batch_da_observacao(obs: &str) -> Option<String> {
    let ini = obs.to_lowercase().find("[batch:")?;
    let resto = &obs[ini + 7..];
    let fim = resto.find(']')?;
    let tag = resto[..fim].trim();
    (!tag.is_empty()).then(|| tag.to_string())
}

/// Item pedido e, com `grupo`, os demais da mesma batelada. `None` se o id não existe.
pub async fn alvos(pool: &PgPool, id: &str, grupo: bool) -> Result<Option<(Vec<ItemFila>, Option<String>)>, String> {
    let linha = sqlx::query(
        "SELECT id, codigo_produto, descricao, quantidade_kg::float8 AS kg, COALESCE(observacoes, '') AS obs \
         FROM producao_fila_demandas WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Erro ao ler a fila: {e}"))?;
    let Some(l) = linha else { return Ok(None) };
    let batch = batch_da_observacao(&l.get::<String, _>("obs"));
    let mut itens = vec![ItemFila {
        id: l.get("id"),
        codigo: l.get("codigo_produto"),
        descricao: l.get("descricao"),
        quantidade_kg: l.get("kg"),
    }];
    if let (true, Some(b)) = (grupo, batch.as_ref()) {
        let outros = sqlx::query(
            "SELECT id, codigo_produto, descricao, quantidade_kg::float8 AS kg FROM producao_fila_demandas \
             WHERE id <> $1 AND observacoes ILIKE $2 ORDER BY codigo_produto",
        )
        .bind(id)
        .bind(format!("%[batch:{b}]%"))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler a batelada: {e}"))?;
        for o in outros {
            itens.push(ItemFila {
                id: o.get("id"),
                codigo: o.get("codigo_produto"),
                descricao: o.get("descricao"),
                quantidade_kg: o.get("kg"),
            });
        }
    }
    Ok(Some((itens, batch)))
}

/// Apaga as linhas e lembra o motivo de cada produto, tudo numa transação.
pub async fn retirar(pool: &PgPool, itens: &[ItemFila], motivo: &str, usuario: &str) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| format!("Erro ao iniciar a retirada: {e}"))?;
    for it in itens {
        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = $1")
            .bind(&it.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao retirar da fila: {e}"))?;
        sqlx::query(
            r#"
            INSERT INTO producao_decisoes (tipo, chave, valor, vezes, atualizado_por, atualizado_em)
            VALUES ($1, $2, $3, 1, $4, NOW())
            ON CONFLICT (tipo, chave) DO UPDATE SET
                valor = EXCLUDED.valor,
                vezes = CASE WHEN producao_decisoes.valor = EXCLUDED.valor THEN producao_decisoes.vezes + 1 ELSE 1 END,
                atualizado_por = EXCLUDED.atualizado_por,
                atualizado_em = NOW()
            "#,
        )
        .bind(decisoes::TIPO_FILA_DESCARTADA)
        .bind(&it.codigo)
        .bind(motivo)
        .bind(usuario)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao lembrar o motivo: {e}"))?;
    }
    tx.commit().await.map_err(|e| format!("Erro ao confirmar a retirada: {e}"))
}

fn itens_json(itens: &[ItemFila]) -> Vec<Value> {
    itens
        .iter()
        .map(|i| json!({ "id": i.id, "codigo": i.codigo, "descricao": i.descricao, "quantidadeKg": i.quantidade_kg }))
        .collect()
}

#[derive(Debug, Deserialize)]
struct RetirarBody {
    #[serde(default)]
    motivo: String,
    /// Tira também os outros SKUs da mesma batelada.
    #[serde(default)]
    grupo: bool,
    #[serde(default)]
    confirmar: bool,
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

async fn retirar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(b): Json<RetirarBody>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let motivo = b.motivo.trim();
    if !decisoes::valor_valido(decisoes::TIPO_FILA_DESCARTADA, motivo) {
        return erro(StatusCode::BAD_REQUEST, "Informe o motivo de tirar o item da fila.");
    }
    let (itens, batch) = match alvos(pool, &id, b.grupo).await {
        Ok(Some(x)) => x,
        Ok(None) => return erro(StatusCode::NOT_FOUND, "Item da fila não encontrado."),
        Err(e) => return erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if !b.confirmar {
        return (
            StatusCode::OK,
            Json(json!({
                "previa": true, "acao": "retirar_da_fila", "motivo": motivo, "batch": batch,
                "itens": itens_json(&itens), "confirmar": "repita com confirmar=true para retirar"
            })),
        )
            .into_response();
    }
    match retirar(pool, &itens, motivo, &ctx.display_name).await {
        Ok(()) => {
            auditoria::registrar(
                pool,
                &ctx.display_name,
                "retirar_da_fila",
                &id,
                json!({ "motivo": motivo, "batch": batch, "itens": itens_json(&itens) }),
            )
            .await;
            (StatusCode::OK, Json(json!({ "ok": true, "retirados": itens.len() }))).into_response()
        }
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_a_tag_de_batelada() {
        assert_eq!(batch_da_observacao("x [batch:abc-1] y").as_deref(), Some("abc-1"));
        assert_eq!(batch_da_observacao("[BATCH: G7 ]").as_deref(), Some("G7"));
        assert_eq!(batch_da_observacao("sem tag"), None);
        assert_eq!(batch_da_observacao("[batch:]"), None);
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn retirar_apaga_a_batelada_e_lembra_o_motivo() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        for (id, cod, obs) in [("tf-1", "TF.001", "[batch:TFG]"), ("tf-2", "TF.002", "[batch:TFG]"), ("tf-3", "TF.003", "")] {
            sqlx::query(
                "INSERT INTO producao_fila_demandas (id, codigo_produto, descricao, quantidade, origem_demanda, observacoes) \
                 VALUES ($1, $2, 'teste', 1, 'teste', $3) ON CONFLICT (id) DO NOTHING",
            )
            .bind(id)
            .bind(cod)
            .bind(obs)
            .execute(&pool)
            .await
            .unwrap();
        }
        let (so_um, _) = alvos(&pool, "tf-1", false).await.unwrap().unwrap();
        assert_eq!(so_um.len(), 1, "sem grupo, só o item");
        let (grupo, batch) = alvos(&pool, "tf-1", true).await.unwrap().unwrap();
        assert_eq!((grupo.len(), batch.as_deref()), (2, Some("TFG")), "com grupo, a batelada toda");
        assert!(alvos(&pool, "nao-existe", false).await.unwrap().is_none());

        retirar(&pool, &grupo, "sem_demanda", "teste").await.unwrap();
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM producao_fila_demandas WHERE id LIKE 'tf-%'")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(ids, vec!["tf-3".to_string()]);
        assert_eq!(decisoes::atual(&pool, decisoes::TIPO_FILA_DESCARTADA, "TF.002").await.unwrap().unwrap().0, "sem_demanda");

        sqlx::query("DELETE FROM producao_fila_demandas WHERE id = 'tf-3'").execute(&pool).await.unwrap();
        for c in ["TF.001", "TF.002"] {
            decisoes::remover(&pool, decisoes::TIPO_FILA_DESCARTADA, c).await.unwrap();
        }
    }
}
