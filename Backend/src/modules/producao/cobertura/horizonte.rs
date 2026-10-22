//! Cobertura das próximas 4 semanas para Compras: ordens planejadas (semana atual e as 3 seguintes) mais a fila de
//! demandas, simuladas juntas com a MESMA regra da cobertura (calibração > snapshot, reserva do ERP, chegadas,
//! trocas, origem da base, insumo sem controle). Não há cálculo próprio: só muda a janela de datas.
//!
//! Itens da fila ainda não têm dia: entram no fim da semana atual, depois das ordens planejadas.

use chrono::{Duration, NaiveDate};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use super::calc::{simular, OrdemEntrada, SaidaSimulacao};
use super::store::{self, Contexto};

pub const SEMANAS_HORIZONTE: i64 = 4;

pub struct Horizonte {
    pub ctx: Contexto,
    pub saida: SaidaSimulacao,
    /// ids das ordens vindas da fila (prefixo `fila:`).
    pub fila_ids: HashSet<String>,
}

#[derive(Debug, Clone)]
pub struct AcabaEm {
    pub data: NaiveDate,
    pub chega_em: Option<NaiveDate>,
}

/// Monta o contexto até o fim da 4ª semana, soma a fila e simula tudo.
pub async fn calcular(pool: &PgPool) -> Result<Horizonte, String> {
    let semana = store::semana_de(store::hoje_brasil());
    let fila = store::carregar_fila(pool).await?;
    let extras: Vec<String> = fila.iter().map(|f| f.codigo.clone()).collect();
    let mut ctx = store::montar_contexto_ate(pool, &semana, &extras, (SEMANAS_HORIZONTE - 1) * 7).await?;

    let data_fila = store::hoje_brasil().max(ctx.inicio_semana).max(ctx.fim_semana - Duration::days(2));
    let mut fila_ids = HashSet::new();
    for (i, f) in fila.iter().enumerate() {
        let Some(kg) = f.kg else { continue };
        let id = format!("fila:{i}");
        let fonte = ctx.decisoes_base.get(&f.codigo).copied().unwrap_or_default();
        ctx.entrada.ordens.push(OrdemEntrada {
            id: id.clone(),
            data: data_fila,
            sequencia: i32::MAX - 1,
            codigo_produto: f.codigo.clone(),
            descricao: Some(f.descricao.clone()),
            kg,
            lote_erp: None,
            lote_no_erp: false,
            grupo: id.clone(),
            necessidades: ctx.formulas.necessidades_com(&f.codigo, kg, fonte),
            bases_usadas: ctx.formulas.bases_usadas(&f.codigo),
            base_fonte: fonte,
            sugestao_base: None,
            da_semana: false,
        });
        fila_ids.insert(id);
    }
    let saida = simular(&ctx.entrada);
    Ok(Horizonte { ctx, saida, fila_ids })
}

/// Insumo (código canônico) -> primeira data em que não fecha nas próximas 4 semanas.
pub async fn acaba_em(pool: &PgPool) -> Result<HashMap<String, AcabaEm>, String> {
    let h = calcular(pool).await?;
    Ok(h.saida
        .insumos
        .iter()
        .filter_map(|i| i.acaba_em.map(|d| (store::canon(&i.codigo), AcabaEm { data: d, chega_em: i.chega_em })))
        .collect())
}
