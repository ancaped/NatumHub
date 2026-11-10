//! Produtos da simulação de um lote de compra: para cada item do lote, quais produtos da sugestão automática de
//! produção (Produzir Urgente / Abrir Ordem) puxam o consumo simulado do insumo, e o mesmo visto por produto.
//! A simulação é recalculada agora (o lote só guarda o total simulado de cada item no dia em que foi gerado).

use std::collections::BTreeMap;

use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use super::collect_sim_producao_contributions;
use crate::core::acao::ErroApi;
use crate::modules::producao::cobertura::store::canon;

fn arred(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

pub async fn simulacao_do_lote(pool: &PgPool, batch_id: &str) -> Result<Value, ErroApi> {
    let lote = sqlx::query("SELECT id, lote_numero, modulo, COALESCE(titulo, '') AS titulo, created_at::text AS criado FROM purchase_request_batches WHERE id = $1")
        .bind(batch_id)
        .fetch_optional(pool)
        .await?;
    let Some(lote) = lote else {
        return Err(ErroApi::nao_encontrado("Lote não encontrado.").com_detalhes(json!({ "id": batch_id })));
    };
    let itens = sqlx::query(
        "SELECT item_code, item_description, COALESCE(unit, '') AS unit, quantity_requested::float8 AS qtd, COALESCE(sim_producao_at_time, 0)::float8 AS sim
         FROM purchase_request_items WHERE batch_id = $1 ORDER BY item_code",
    )
    .bind(batch_id)
    .fetch_all(pool)
    .await?;

    let contribuicoes = collect_sim_producao_contributions(pool).await;
    let mut por_insumo: BTreeMap<String, Vec<&super::SimProducaoContribution>> = BTreeMap::new();
    for c in &contribuicoes {
        por_insumo.entry(canon(&c.ingredient_code)).or_default().push(c);
    }

    // por insumo + acumulado por produto
    struct Prod {
        codigo: String,
        descricao: String,
        status_label: String,
        producao: f64,
        insumos: Vec<Value>,
    }
    let mut produtos: BTreeMap<String, Prod> = BTreeMap::new();
    let mut itens_json: Vec<Value> = Vec::new();
    let mut com_simulacao = 0usize;
    for it in &itens {
        let codigo: String = it.get("item_code");
        let desc: String = it.get::<Option<String>, _>("item_description").unwrap_or_default();
        let unidade: String = it.get("unit");
        let guardada: f64 = it.get("sim");
        let mut prods_do_item: BTreeMap<String, (String, String, f64, f64, Option<String>)> = BTreeMap::new();
        let mut agora = 0.0;
        for c in por_insumo.get(&canon(&codigo)).into_iter().flatten() {
            agora += c.insumo_qty;
            let e = prods_do_item
                .entry(c.product_code.clone())
                .or_insert((c.product_desc.clone(), c.status_label.clone(), 0.0, 0.0, c.trocado_de.clone()));
            e.2 += c.insumo_qty;
            e.3 = e.3.max(c.production_qty);
        }
        if !prods_do_item.is_empty() {
            com_simulacao += 1;
        }
        let mut lista: Vec<Value> = Vec::new();
        for (pc, (pd, st, qtd, prod_qtd, troc)) in &prods_do_item {
            lista.push(json!({ "codigo": pc, "descricao": pd, "situacao": st, "producaoQtd": arred(*prod_qtd), "insumoQtd": arred(*qtd), "trocadoDe": troc }));
            let p = produtos.entry(canon(pc)).or_insert_with(|| Prod { codigo: pc.clone(), descricao: pd.clone(), status_label: st.clone(), producao: 0.0, insumos: vec![] });
            p.producao = p.producao.max(*prod_qtd);
            p.insumos.push(json!({ "codigo": codigo, "descricao": desc, "unidade": unidade, "qtd": arred(*qtd), "trocadoDe": troc }));
        }
        lista.sort_by(|a, b| b["insumoQtd"].as_f64().partial_cmp(&a["insumoQtd"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
        itens_json.push(json!({
            "codigo": codigo, "descricao": desc, "unidade": unidade, "quantidadeSolicitada": arred(it.get::<f64, _>("qtd")),
            "simulacaoGuardada": arred(guardada), "simulacaoAgora": arred(agora), "produtos": lista,
        }));
    }
    let mut produtos_json: Vec<Value> = produtos
        .into_values()
        .map(|p| json!({ "codigo": p.codigo, "descricao": p.descricao, "situacao": p.status_label, "producaoQtd": arred(p.producao), "insumos": p.insumos }))
        .collect();
    produtos_json.sort_by(|a, b| {
        let (na, nb) = (a["insumos"].as_array().map_or(0, |v| v.len()), b["insumos"].as_array().map_or(0, |v| v.len()));
        nb.cmp(&na).then(a["descricao"].as_str().cmp(&b["descricao"].as_str()))
    });
    Ok(json!({
        "lote": { "id": lote.get::<String, _>("id"), "numero": lote.get::<String, _>("lote_numero"), "modulo": lote.get::<String, _>("modulo"), "titulo": lote.get::<String, _>("titulo"), "criadoEm": lote.get::<String, _>("criado") },
        "aviso": "Simulação recalculada agora (Produzir Urgente e Abrir Ordem). O lote guardou o total simulado de cada item no dia em que foi gerado; se os números diferem, a produção planejada mudou desde então.",
        "totais": { "itens": itens.len(), "itensComSimulacao": com_simulacao, "produtos": produtos_json.len() },
        "itens": itens_json,
        "produtos": produtos_json,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Banco de teste, numa transação desfeita: lote inexistente dá 404; lote com um item sem simulação devolve a
    /// estrutura completa (item com `produtos` vazio e totais coerentes).
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn lote_sem_simulacao_devolve_itens_com_produtos_vazios() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        assert_eq!(simulacao_do_lote(&pool, "zz-nao-existe").await.unwrap_err().codigo, "nao_encontrado");
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("INSERT INTO purchase_request_batches (id, lote_numero, modulo, titulo, created_at, updated_at) VALUES ('zz-lote-sim', 'LOTE #ZZ', 'materia_prima', 'teste', NOW(), NOW())")
            .execute(&mut *tx).await.unwrap();
        sqlx::query("INSERT INTO purchase_request_items (id, batch_id, item_code, item_description, unit, quantity_requested, sim_producao_at_time) VALUES ('zz-it-sim', 'zz-lote-sim', '9.99.ZZSIM', 'ZZ item', 'KG', 10, 5)")
            .execute(&mut *tx).await.unwrap();
        tx.commit().await.unwrap();
        let r = simulacao_do_lote(&pool, "zz-lote-sim").await;
        sqlx::query("DELETE FROM purchase_request_items WHERE batch_id = 'zz-lote-sim'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM purchase_request_batches WHERE id = 'zz-lote-sim'").execute(&pool).await.unwrap();
        let r = r.unwrap();
        assert_eq!(r["lote"]["numero"], "LOTE #ZZ");
        assert_eq!(r["totais"]["itens"], 1);
        assert_eq!(r["itens"][0]["simulacaoGuardada"].as_f64(), Some(5.0));
        assert_eq!(r["itens"][0]["produtos"].as_array().map(|v| v.len()), Some(0));
        assert_eq!(r["totais"]["itensComSimulacao"], 0);
    }
}
