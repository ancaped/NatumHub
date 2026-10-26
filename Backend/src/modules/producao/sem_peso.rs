//! Produtos ativos cuja descrição não traz medida ("500ML", "1KG"...): o peso por unidade é desconhecido, então
//! conversões unidade <-> kg não são feitas para eles. A lista serve de aviso para corrigir a descrição no ERP.

use axum::{extract::State, response::IntoResponse, routing::get, Json, Router};
use serde::Serialize;
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::Acao;
use crate::core::regras_produto::{carregar_pais_categorias, categoria_raiz, e_base, produto_ativo, status_ignorados_padrao, LINHA_EFETIVA_SQL};
use crate::handlers::AppState;
use crate::modules::producao::fila::medida_kg;
use crate::modules::producao::permissao;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/produtos-sem-peso", get(listar))
}

pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "listar_produtos_sem_peso",
        permissao::MODULO_PLANEJAMENTO,
        "Produtos ativos cuja descrição não tem medida (peso por unidade desconhecido): código, descrição e linha.",
        "/api/producao/produtos-sem-peso",
        vec![],
    )]
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoSemPeso {
    pub codigo: String,
    pub descricao: String,
    pub linha: String,
}

/// Filtra os produtos (código, descrição, linha) sem medida válida na descrição.
pub fn sem_medida(produtos: Vec<(String, String, String)>) -> Vec<ProdutoSemPeso> {
    produtos
        .into_iter()
        .filter(|(_, descricao, _)| medida_kg(descricao).is_none())
        .map(|(codigo, descricao, linha)| ProdutoSemPeso { codigo, descricao, linha })
        .collect()
}

pub async fn listar(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, ErroApi> {
    let pool = state.db.pool();
    let ignorados = crate::modules::compras::planejamento::commands::get_ignored_product_statuses_query(pool.clone())
        .await
        .unwrap_or_else(|_| status_ignorados_padrao());
    let sql = format!(
        r#"
        SELECT p.codigo, COALESCE(p.descricao, '') AS descricao, {linha} AS linha,
               COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') AS status, o.visivel,
               COALESCE(o.categoria_produto, '') AS categoria
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        INNER JOIN config_linhas cl ON {linha} = cl.linha_prefix
        WHERE COALESCE(cl.visivel, 1) = 1
        ORDER BY {linha}, p.codigo
        "#,
        linha = LINHA_EFETIVA_SQL
    );
    let rows = sqlx::query(&sql).fetch_all(pool).await?;
    let pais = carregar_pais_categorias(pool).await?;
    let ativos: Vec<(String, String, String)> = rows
        .into_iter()
        .filter(|r| produto_ativo(&r.get::<String, _>("status"), r.get::<Option<i32>, _>("visivel"), &ignorados))
        // base é medida em kg (1 un = 1 kg): não entra na lista
        .filter(|r| !e_base(&r.get::<String, _>("codigo"), &categoria_raiz(&r.get::<String, _>("categoria"), &pais), &r.get::<String, _>("status")))
        .map(|r| (r.get("codigo"), r.get("descricao"), r.get("linha")))
        .collect();
    let itens = sem_medida(ativos);
    Ok(Json(json!({ "total": itens.len(), "itens": itens })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_lista_quem_nao_tem_medida() {
        let r = sem_medida(vec![
            ("1".into(), "SHAMPOO 500ML".into(), "L1".into()),
            ("2".into(), "KIT PRESENTE".into(), "L1".into()),
            ("3".into(), "GEL 0ML".into(), "L2".into()),
        ]);
        let codigos: Vec<&str> = r.iter().map(|p| p.codigo.as_str()).collect();
        assert_eq!(codigos, vec!["2", "3"]);
    }
}
