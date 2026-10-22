//! Cobertura das próximas 4 semanas para Compras: ordens planejadas (semana atual e as 3 seguintes) mais a fila de
//! demandas, simuladas juntas com a MESMA regra da cobertura (calibração > snapshot, reserva do ERP, chegadas,
//! trocas, origem da base, insumo sem controle). Não há cálculo próprio: só muda a janela de datas.
//!
//! Itens da fila ainda não têm dia: entram no fim da semana atual, depois das ordens planejadas.

use chrono::{Duration, NaiveDate};
use serde::Serialize;
use sqlx::{PgPool, Row};
use std::collections::{HashMap, HashSet};

use super::calc::{simular, InsumoOrdem, OrdemEntrada, SaidaSimulacao};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseAberta {
    pub ordem_id: String,
    pub produto: String,
    pub descricao: String,
    pub kg: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<NaiveDate>,
    /// "ordem" (planejamento) ou "fila".
    pub origem: &'static str,
    pub consome: bool,
    pub insumos: Vec<InsumoOrdem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasesAbertas {
    pub gerado_em: String,
    pub semanas: i64,
    pub bases: Vec<BaseAberta>,
}

/// Produtos entre `codigos` que são ingrediente de alguma fórmula (ou seja, são bases).
async fn quais_sao_bases(pool: &PgPool, codigos: &[String]) -> Result<HashSet<String>, String> {
    if codigos.is_empty() {
        return Ok(HashSet::new());
    }
    let rows = sqlx::query(
        "SELECT DISTINCT TRIM(REPLACE(ingredient_code, '\"', '')) AS c FROM formulations \
         WHERE TRIM(REPLACE(ingredient_code, '\"', '')) = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao identificar as bases: {e}"))?;
    Ok(rows.into_iter().filter_map(|r| r.get::<Option<String>, _>("c")).collect())
}

/// Ordens (planejamento e fila) cujo produto é uma base, com o que cada uma consome de matéria-prima.
pub async fn bases_abertas(pool: &PgPool) -> Result<BasesAbertas, String> {
    let h = calcular(pool).await?;
    let codigos: Vec<String> = h.ctx.entrada.ordens.iter().map(|o| o.codigo_produto.clone()).collect::<HashSet<_>>().into_iter().collect();
    let bases = quais_sao_bases(pool, &codigos).await?;
    let resultados: HashMap<&str, &super::calc::ResultadoOrdem> = h.saida.ordens.iter().map(|r| (r.id.as_str(), r)).collect();
    let mut out: Vec<BaseAberta> = Vec::new();
    for o in h.ctx.entrada.ordens.iter().filter(|o| bases.contains(&o.codigo_produto)) {
        let Some(r) = resultados.get(o.id.as_str()) else { continue };
        let fila = h.fila_ids.contains(&o.id);
        out.push(BaseAberta {
            ordem_id: o.id.clone(),
            produto: o.codigo_produto.clone(),
            descricao: o.descricao.clone().unwrap_or_default(),
            kg: o.kg,
            data: if fila { None } else { Some(o.data) },
            origem: if fila { "fila" } else { "ordem" },
            consome: r.consome,
            insumos: r.insumos.clone(),
        });
    }
    out.sort_by(|a, b| a.data.cmp(&b.data).then(a.produto.cmp(&b.produto)));
    Ok(BasesAbertas { gerado_em: chrono::Utc::now().to_rfc3339(), semanas: SEMANAS_HORIZONTE, bases: out })
}
