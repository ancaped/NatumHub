//! Relatório "Faltas de Insumos por Linha": serviço que reaproveita a simulação de cobertura (sem recalcular nada)
//! e agrupa o resultado por linha → produto → embalagem / matéria-prima.
//!
//! Dois universos, sempre separados: as ordens da semana (consumo acumulado por data e sequência) e a fila de
//! demandas (cada item avaliado sozinho, como se fosse a última ordem do dia).

use chrono::NaiveDate;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;

use super::calc::{agrupar_faltas, simular, FaltasLinha, ItemFalta, ResultadoOrdem};
use super::store;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatorioFaltas {
    pub semana: String,
    pub hoje: NaiveDate,
    pub gerado_em: String,
    /// Ordens planejadas da semana.
    pub ordens: Vec<FaltasLinha>,
    /// Itens da fila de demandas, cada um avaliado sozinho.
    pub fila: Vec<FaltasLinha>,
    /// Itens da fila sem massa em kg: não dá para avaliar.
    pub fila_sem_kg: Vec<String>,
}

pub async fn gerar(pool: &PgPool, semana: &str) -> Result<RelatorioFaltas, String> {
    let fila = store::carregar_fila(pool).await?;
    let extras: Vec<String> = fila.iter().map(|f| f.codigo.clone()).collect();
    let ctx = store::montar_contexto(pool, semana, &extras).await?;

    // ordens da semana, simuladas juntas (o consumo se acumula)
    let saida = simular(&ctx.entrada);
    let resultados: HashMap<&str, &ResultadoOrdem> = saida.ordens.iter().map(|r| (r.id.as_str(), r)).collect();

    let mut codigos: Vec<String> = ctx.entrada.ordens.iter().filter(|o| o.da_semana).map(|o| o.codigo_produto.clone()).collect();
    codigos.extend(extras);
    codigos.sort();
    codigos.dedup();
    let meta = store::carregar_meta_produtos(pool, &codigos).await?;
    let meta_de = |codigo: &str| meta.get(codigo).cloned().unwrap_or_default();

    let mut itens_ordens: Vec<ItemFalta> = Vec::new();
    for o in ctx.entrada.ordens.iter().filter(|o| o.da_semana) {
        let Some(r) = resultados.get(o.id.as_str()) else { continue };
        let (descricao, linha) = meta_de(&o.codigo_produto);
        itens_ordens.push(ItemFalta {
            produto: o.codigo_produto.clone(),
            descricao: o.descricao.clone().filter(|d| !d.is_empty()).unwrap_or(descricao),
            linha,
            kg: o.kg,
            data: Some(o.data),
            resultado: r,
        });
    }

    // fila: cada item sozinho
    let hoje = ctx.entrada.hoje;
    let data_fila = hoje.max(ctx.inicio_semana);
    let mut resultados_fila: Vec<(usize, ResultadoOrdem)> = Vec::new();
    let mut sem_kg: Vec<String> = Vec::new();
    for (i, f) in fila.iter().enumerate() {
        match f.kg {
            Some(kg) => {
                if let Some(r) = super::simular_candidato(&ctx, i, &f.codigo, kg, data_fila) {
                    resultados_fila.push((i, r));
                }
            }
            None => sem_kg.push(format!("{} — {}", f.codigo, f.descricao)),
        }
    }
    let itens_fila: Vec<ItemFalta> = resultados_fila
        .iter()
        .map(|(i, r)| {
            let f = &fila[*i];
            let (descricao, linha) = meta_de(&f.codigo);
            ItemFalta {
                produto: f.codigo.clone(),
                descricao: if f.descricao.is_empty() { descricao } else { f.descricao.clone() },
                linha,
                kg: f.kg.unwrap_or(0.0),
                data: None,
                resultado: r,
            }
        })
        .collect();

    Ok(RelatorioFaltas {
        semana: semana.to_string(),
        hoje,
        gerado_em: chrono::Utc::now().to_rfc3339(),
        ordens: agrupar_faltas(itens_ordens),
        fila: agrupar_faltas(itens_fila),
        fila_sem_kg: sem_kg,
    })
}
