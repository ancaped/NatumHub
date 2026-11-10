//! Fila de Demandas com a fila automática (`GET /api/producao/fila-demandas`).
//!
//! A tabela `producao_fila_demandas` guarda só os itens **manuais**. Os automáticos são calculados na hora: os produtos que a
//! Demanda de Produção marca como necessários (`/api/products?segment=needed`, em ordem de EFP crescente), menos o que já
//! tem item manual (o manual manda), o que já está planejado na semana e o que foi tirado da fila com motivo
//! (`fila_descartada`). Quem acaba antes vem primeiro (decisão do Edson, 2026-11-03).
//!
//! Cada item (manual ou automático) ganha a situação de insumos: simulado depois das ordens do quadro da semana
//! (`cobertura::Simulador`, um contexto só por chamada). Insumo "sem controle" nunca acusa falta.

use chrono::NaiveDate;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::core::acao::ErroApi;
use crate::core::db::Db;
use crate::models::{ProductCalculationResult, QueryParams};
use crate::modules::producao::cobertura::calc::{ResultadoOrdem, StatusCobertura, StatusInsumo};
use crate::modules::producao::cobertura::store::{self, canon, Contexto};
use crate::modules::producao::cobertura::{Proposta, Simulador};
use crate::modules::producao::fila::FilaDemandaRow;
use crate::modules::producao::processo::{tipo_de_processo, EntradaProcesso, ProcessoProduto};
use crate::modules::producao::{calculo, decisoes};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Situacao {
    /// Todos os insumos e embalagens estão cobertos (contando o que já está no quadro da semana).
    Disponivel,
    AguardandoInsumos,
}

/// Insumo que impede a cobertura de um item.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Falta {
    pub codigo: String,
    pub descricao: String,
    pub falta: f64,
    pub unidade: Option<String>,
    /// `falta`, `chega_depois`, `chega_sem_data` ou `depende_atrasado`.
    pub status: String,
}

/// Item da fila (manual ou automático) com o processo do produto e a situação de insumos.
#[derive(Debug, Clone)]
pub struct ItemCalculado {
    pub automatico: bool,
    /// Id da linha da tabela (só manual).
    pub fila_id: Option<String>,
    pub codigo: String,
    pub descricao: String,
    pub quantidade: f64,
    pub unidade: String,
    pub quantidade_kg: f64,
    pub origem_demanda: String,
    pub linha_envase: Option<String>,
    pub base_codigo: Option<String>,
    pub base_nome: Option<String>,
    pub observacoes: Option<String>,
    pub prioridade: Option<i32>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub processo: ProcessoProduto,
    pub exclusivo: bool,
    /// Lote mínimo do produto (kg); o automático nunca fica abaixo dele.
    pub minimo_kg: f64,
    pub situacao: Situacao,
    pub falta: Vec<Falta>,
    pub motivo_situacao: Option<String>,
}

impl ItemCalculado {
    pub fn para_json(&self) -> Value {
        json!({
            "id": self.fila_id,
            "chave": self.fila_id.clone().unwrap_or_else(|| self.codigo.clone()),
            "origem": if self.automatico { "automatica" } else { "manual" },
            "codigoProduto": self.codigo,
            "descricao": self.descricao,
            "quantidade": self.quantidade,
            "unidade": self.unidade,
            "quantidadeKg": if self.quantidade_kg > 0.0 { Some(self.quantidade_kg) } else { None },
            "origemDemanda": self.origem_demanda,
            "linhaEnvase": self.linha_envase,
            "baseCodigo": self.base_codigo,
            "baseNome": self.base_nome,
            "observacoes": self.observacoes,
            "prioridade": self.prioridade,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "situacao": self.situacao,
            "falta": self.falta,
            "motivoSituacao": self.motivo_situacao,
            "processo": self.processo,
        })
    }
}

/// Quantos produtos da Demanda de Produção ficaram fora dos automáticos, por motivo.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Excluidos {
    /// Já tem item manual na fila (o manual manda).
    pub com_item_manual: usize,
    /// Já tem ordem na semana pedida.
    pub ja_planejado: usize,
    /// Foi tirado da fila com motivo (`fila_descartada`).
    pub descartado: usize,
    /// Sem produção recomendada (só aparece na Demanda por estar na fila ou no quadro de outra semana).
    pub sem_recomendacao: usize,
}

/// Dos produtos necessários (código e produção recomendada, na ordem da Demanda), os que viram itens automáticos.
/// Devolve os índices escolhidos e a contagem do que ficou de fora, por motivo (conta no primeiro motivo que se aplica).
pub fn escolher_automaticos(
    necessarios: &[(String, f64)],
    manuais: &HashSet<String>,
    planejados: &HashSet<String>,
    descartados: &HashSet<String>,
) -> (Vec<usize>, Excluidos) {
    let mut escolhidos = Vec::new();
    let mut fora = Excluidos::default();
    let mut vistos: HashSet<String> = HashSet::new();
    for (i, (codigo, recomendada)) in necessarios.iter().enumerate() {
        let c = canon(codigo);
        if !vistos.insert(c.clone()) {
            continue;
        }
        if manuais.contains(&c) {
            fora.com_item_manual += 1;
        } else if planejados.contains(&c) {
            fora.ja_planejado += 1;
        } else if descartados.contains(&c) {
            fora.descartado += 1;
        } else if *recomendada <= 0.0 {
            fora.sem_recomendacao += 1;
        } else {
            escolhidos.push(i);
        }
    }
    (escolhidos, fora)
}

/// Cobertura 100%: a fórmula existe e todo insumo/embalagem (menos os "sem controle") está livre na data.
pub fn coberto_total(r: &ResultadoOrdem) -> bool {
    r.status != StatusCobertura::SemFormula && r.insumos.iter().all(|i| i.status == StatusInsumo::Ok)
}

/// O que falta (insumos que não estão livres), do mais faltante ao menos; um por código, o maior valor entre as bateladas.
pub fn faltas_do_resultado(resultados: &[&ResultadoOrdem]) -> Vec<Falta> {
    let mut v: Vec<Falta> = Vec::new();
    for r in resultados {
        for i in r.insumos.iter().filter(|i| i.status != StatusInsumo::Ok) {
            let status = serde_json::to_value(i.status).ok().and_then(|s| s.as_str().map(str::to_string)).unwrap_or_default();
            match v.iter_mut().find(|f| f.codigo == i.codigo) {
                Some(f) => {
                    if i.falta > f.falta {
                        f.falta = i.falta;
                        f.status = status;
                    }
                }
                None => v.push(Falta { codigo: i.codigo.clone(), descricao: i.descricao.clone(), falta: i.falta, unidade: i.unidade.clone(), status }),
            }
        }
    }
    v.sort_by(|a, b| b.falta.partial_cmp(&a.falta).unwrap_or(std::cmp::Ordering::Equal));
    v
}

/// Situação do item a partir do resultado da simulação.
pub fn situacao_do_resultado(r: Option<&ResultadoOrdem>) -> (Situacao, Vec<Falta>, Option<String>) {
    match r {
        None => (Situacao::Disponivel, Vec::new(), Some("Sem quantidade para avaliar os insumos.".to_string())),
        Some(r) if r.status == StatusCobertura::SemFormula => {
            (Situacao::AguardandoInsumos, Vec::new(), Some("Sem fórmula cadastrada para avaliar os insumos.".to_string()))
        }
        Some(r) if coberto_total(r) => (Situacao::Disponivel, Vec::new(), None),
        Some(r) => (Situacao::AguardandoInsumos, faltas_do_resultado(&[r]), None),
    }
}

/// Linha de envase sugerida pela descrição (a mesma regra que a tela usava).
pub fn linha_envase_sugerida(descricao: &str) -> &'static str {
    let d = descricao.to_uppercase();
    if d.contains("MASC") || d.contains("POTE") {
        "L2"
    } else if d.contains("POMADA") || d.contains("OLEO") || d.contains("SERUM") {
        "L3"
    } else {
        "L1"
    }
}

/// Dia em que os itens da fila são avaliados: depois de todas as ordens do quadro da semana.
pub fn data_de_avaliacao(ctx: &Contexto) -> NaiveDate {
    let ultima_do_quadro = ctx.entrada.ordens.iter().filter(|o| o.da_semana).map(|o| o.data).max();
    let base = ctx.entrada.hoje.max(ctx.inicio_semana);
    ultima_do_quadro.map_or(base, |u| u.max(base))
}

/// Códigos (canônicos) com ordem na semana do contexto.
pub fn codigos_planejados(ctx: &Contexto) -> HashSet<String> {
    ctx.entrada.ordens.iter().filter(|o| o.da_semana).map(|o| canon(&o.codigo_produto)).collect()
}

/// Fila completa da semana: itens na ordem de exibição (manuais por prioridade, depois automáticos por EFP) e o contexto
/// de insumos usado, para quem quiser simular mais (a sequência do planejamento).
pub struct FilaCalculada {
    pub semana: String,
    pub itens: Vec<ItemCalculado>,
    pub excluidos: Excluidos,
    pub ctx: Contexto,
}

fn entrada_do_produto<'a>(
    codigo: &'a str,
    descricao: &'a str,
    base: &'a str,
    recomendada: f64,
    p: Option<&'a ProductCalculationResult>,
) -> EntradaProcesso<'a> {
    EntradaProcesso {
        codigo,
        descricao,
        base,
        categoria_produto: p.and_then(|p| p.categoria_produto.as_deref()).unwrap_or(""),
        status_produto: p.and_then(|p| p.status_produto.as_deref()).unwrap_or(""),
        producao_recomendada: recomendada,
        estoque_ideal_manual: p.and_then(|p| p.estoque_ideal_manual).unwrap_or(0) as f64,
        lote_minimo: 0.0,
        processo_termico: p.and_then(|p| p.processo_termico.as_deref()),
        permite_bombona: p.and_then(|p| p.permite_bombona),
    }
}

fn exclusivo_do_produto(p: Option<&ProductCalculationResult>, descricao: &str) -> bool {
    p.and_then(|p| p.exclusivo_no_dia).unwrap_or_else(|| descricao.to_uppercase().contains("AOX"))
}

fn item_manual(f: &FilaDemandaRow, p: Option<&ProductCalculationResult>) -> ItemCalculado {
    let base = f.base_nome.as_deref().unwrap_or("");
    let processo = tipo_de_processo(&entrada_do_produto(&f.codigo_produto, &f.descricao, base, f.quantidade, p));
    // O kg da fila manda; sem ele, a quantidade em kg (unidade kg) ou a convertida pelo peso da descrição.
    let kg = f
        .quantidade_kg
        .filter(|k| *k > 0.0)
        .unwrap_or(if f.unidade.eq_ignore_ascii_case("kg") { f.quantidade } else { processo.req_qty_kg });
    ItemCalculado {
        automatico: false,
        fila_id: Some(f.id.clone()),
        codigo: f.codigo_produto.clone(),
        descricao: f.descricao.clone(),
        quantidade: f.quantidade,
        unidade: f.unidade.clone(),
        quantidade_kg: kg,
        origem_demanda: f.origem_demanda.clone(),
        linha_envase: f.linha_envase.clone(),
        base_codigo: f.base_codigo.clone(),
        base_nome: f.base_nome.clone(),
        observacoes: f.observacoes.clone(),
        prioridade: f.prioridade,
        created_at: f.created_at.clone(),
        updated_at: f.updated_at.clone(),
        exclusivo: exclusivo_do_produto(p, &f.descricao),
        minimo_kg: 0.0,
        processo,
        situacao: Situacao::Disponivel,
        falta: Vec::new(),
        motivo_situacao: None,
    }
}

pub(crate) fn item_automatico(p: &ProductCalculationResult) -> ItemCalculado {
    let base = p.base.as_deref().unwrap_or("");
    let processo = tipo_de_processo(&entrada_do_produto(&p.codigo, &p.descricao, base, p.producao_recomendada as f64, Some(p)));
    let minimo_kg = p.producao_minima_kg.unwrap_or(0.0).max(0.0);
    let eh_base = crate::core::regras_produto::e_base(&p.codigo, p.categoria_produto.as_deref().unwrap_or(""), p.status_produto.as_deref().unwrap_or(""));
    ItemCalculado {
        automatico: true,
        fila_id: None,
        codigo: p.codigo.clone(),
        descricao: p.descricao.clone(),
        quantidade: processo.req_units,
        unidade: if eh_base { "kg".into() } else { "un".into() },
        quantidade_kg: processo.req_qty_kg.max(minimo_kg),
        origem_demanda: "automatica".into(),
        linha_envase: Some(linha_envase_sugerida(&p.descricao).to_string()),
        base_codigo: p.base_codigo.clone().or_else(|| p.base.clone()),
        base_nome: p.base.clone(),
        observacoes: None,
        prioridade: None,
        created_at: None,
        updated_at: None,
        exclusivo: exclusivo_do_produto(Some(p), &p.descricao),
        minimo_kg,
        processo,
        situacao: Situacao::Disponivel,
        falta: Vec::new(),
        motivo_situacao: None,
    }
}

fn erro_texto(e: String) -> ErroApi {
    ErroApi::interno(e)
}

/// Os produtos "necessários" da Demanda de Produção (mesma fonte e ordem de "Tudo p/ Produzir Hoje").
pub(crate) async fn produtos_necessarios(db: &Db) -> Result<Vec<ProductCalculationResult>, ErroApi> {
    let params = QueryParams {
        segment: Some("needed".into()),
        include_all_regimes: Some(true),
        sort: Some("efp".into()),
        order: Some("asc".into()),
        page: Some(1),
        limit: Some(99_999),
        ..Default::default()
    };
    let corpo = calculo::listar_produtos(db, &params).await.map_err(erro_texto)?;
    serde_json::from_value(corpo.get("items").cloned().unwrap_or_else(|| json!([])))
        .map_err(|e| ErroApi::interno(format!("Erro ao ler a lista de produtos necessários: {e}")))
}

pub(crate) async fn itens_manuais(pool: &sqlx::PgPool) -> Result<Vec<FilaDemandaRow>, ErroApi> {
    let sql = r#"
        SELECT id, codigo_produto, descricao, quantidade::float8, unidade,
               quantidade_kg::float8, origem_demanda, linha_envase, base_codigo,
               base_nome, observacoes, prioridade, created_at::text, updated_at::text
        FROM producao_fila_demandas
        ORDER BY COALESCE(prioridade, 1) ASC, created_at ASC
    "#;
    Ok(sqlx::query_as::<_, FilaDemandaRow>(sql).fetch_all(pool).await?)
}

/// Códigos (canônicos) com ordem não cancelada na semana.
async fn planejados_da_semana(pool: &sqlx::PgPool, semana: &str) -> Result<HashSet<String>, ErroApi> {
    let codigos: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT codigo_produto FROM producao_planejamento_semanal \
         WHERE week_key = $1 AND COALESCE(ordem_status, 'planejado') <> 'cancelado'",
    )
    .bind(semana)
    .fetch_all(pool)
    .await?;
    Ok(codigos.iter().map(|c| canon(c)).collect())
}

/// Monta a fila da semana (manuais + automáticos) com a situação de insumos de cada item.
pub async fn montar_fila(db: &Db, semana: &str) -> Result<FilaCalculada, ErroApi> {
    if store::intervalo_semana(semana).is_none() {
        return Err(ErroApi::invalido(format!("Semana inválida: {semana}. Use o formato 2026-W43.")));
    }
    let pool = db.pool();
    let manuais = itens_manuais(pool).await?;
    let necessarios = produtos_necessarios(db).await?;
    let planejados = planejados_da_semana(pool, semana).await?;
    let descartados: HashSet<String> = decisoes::listar(pool, decisoes::TIPO_FILA_DESCARTADA)
        .await
        .map_err(erro_texto)?
        .into_iter()
        .map(|d| canon(&d.chave))
        .collect();

    let codigos_manuais: HashSet<String> = manuais.iter().map(|m| canon(&m.codigo_produto)).collect();
    let resumo: Vec<(String, f64)> = necessarios.iter().map(|p| (p.codigo.clone(), p.producao_recomendada as f64)).collect();
    let (escolhidos, excluidos) = escolher_automaticos(&resumo, &codigos_manuais, &planejados, &descartados);

    let por_codigo: std::collections::HashMap<String, &ProductCalculationResult> = necessarios.iter().map(|p| (canon(&p.codigo), p)).collect();
    let mut itens: Vec<ItemCalculado> = manuais.iter().map(|m| item_manual(m, por_codigo.get(&canon(&m.codigo_produto)).copied())).collect();
    itens.extend(escolhidos.iter().map(|i| item_automatico(&necessarios[*i])));

    let extras: Vec<String> = itens.iter().map(|i| canon(&i.codigo)).collect();
    let ctx = store::montar_contexto(pool, semana, &extras).await.map_err(erro_texto)?;
    let data = data_de_avaliacao(&ctx);
    let mut sim = Simulador::novo(&ctx);
    for (n, item) in itens.iter_mut().enumerate() {
        let resultado = (item.quantidade_kg > 0.0).then(|| {
            let prop = Proposta { id: format!("fila:{n}"), codigo: canon(&item.codigo), kg: item.quantidade_kg, data };
            sim.avaliar(&[prop]).novas.into_iter().next()
        });
        let (situacao, falta, motivo) = situacao_do_resultado(resultado.flatten().as_ref());
        item.situacao = situacao;
        item.falta = falta;
        item.motivo_situacao = motivo;
    }
    drop(sim);
    Ok(FilaCalculada { semana: semana.to_string(), itens, excluidos, ctx })
}

/// Corpo de `GET /api/producao/fila-demandas`.
pub async fn resposta_fila(db: &Db, semana: Option<&str>) -> Result<Value, ErroApi> {
    let semana = semana.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(|| store::semana_de(store::hoje_brasil()));
    let fila = montar_fila(db, &semana).await?;
    let manuais = fila.itens.iter().filter(|i| !i.automatico).count();
    let disponiveis = fila.itens.iter().filter(|i| i.situacao == Situacao::Disponivel).count();
    Ok(json!({
        "ok": true,
        "semana": fila.semana,
        "items": fila.itens.iter().map(ItemCalculado::para_json).collect::<Vec<_>>(),
        "contagens": {
            "manuais": manuais,
            "automaticos": fila.itens.len() - manuais,
            "disponiveis": disponiveis,
            "aguardandoInsumos": fila.itens.len() - disponiveis,
        },
        "excluidos": fila.excluidos,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::producao::cobertura::calc::InsumoOrdem;

    fn nec(c: &str, rec: f64) -> (String, f64) {
        (c.to_string(), rec)
    }

    fn conjunto(l: &[&str]) -> HashSet<String> {
        l.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn automaticos_seguem_a_ordem_da_demanda_e_o_manual_manda() {
        // Já vem em ordem de EFP crescente da Demanda de Produção.
        let necessarios = vec![nec("A", 100.0), nec("B", 50.0), nec("C", 70.0), nec("D", 30.0)];
        let (idx, fora) = escolher_automaticos(&necessarios, &conjunto(&["B"]), &conjunto(&[]), &conjunto(&[]));
        assert_eq!(idx, vec![0, 2, 3], "o B tem item manual: o manual manda, o automático não repete");
        assert_eq!(fora.com_item_manual, 1);
    }

    #[test]
    fn produto_planejado_na_semana_sai_dos_automaticos() {
        let necessarios = vec![nec("A", 100.0), nec("B", 50.0)];
        let (idx, fora) = escolher_automaticos(&necessarios, &conjunto(&[]), &conjunto(&["A"]), &conjunto(&[]));
        assert_eq!(idx, vec![1]);
        assert_eq!(fora, Excluidos { ja_planejado: 1, ..Default::default() });
    }

    #[test]
    fn produto_descartado_sai_dos_automaticos_e_a_contagem_vai_por_motivo() {
        let necessarios = vec![nec("A", 100.0), nec("B", 50.0), nec("C", 0.0), nec("D", 10.0)];
        let (idx, fora) = escolher_automaticos(&necessarios, &conjunto(&[]), &conjunto(&["B"]), &conjunto(&["A"]));
        assert_eq!(idx, vec![3]);
        assert_eq!(fora.descartado, 1);
        assert_eq!(fora.ja_planejado, 1);
        assert_eq!(fora.sem_recomendacao, 1);
        assert_eq!(fora.com_item_manual, 0);
    }

    #[test]
    fn codigo_com_espacos_nas_pontas_e_o_mesmo_produto() {
        let necessarios = vec![nec(" A.1 ", 10.0)];
        let (idx, fora) = escolher_automaticos(&necessarios, &conjunto(&[&canon("A.1")]), &conjunto(&[]), &conjunto(&[]));
        assert!(idx.is_empty());
        assert_eq!(fora.com_item_manual, 1);
    }

    fn insumo(codigo: &str, status: StatusInsumo, falta: f64) -> InsumoOrdem {
        InsumoOrdem {
            codigo: codigo.into(),
            descricao: format!("insumo {codigo}"),
            unidade: Some("kg".into()),
            necessario: 10.0,
            livre_na_data: 0.0,
            falta,
            status,
            chega_em: None,
            pedido: None,
            fornecedor: None,
            equivalentes: Vec::new(),
            estoque: 0.0,
            reserva: 0.0,
            chegadas: 0.0,
            manuais: 0.0,
            consumo_anterior: 0.0,
        }
    }

    fn resultado(status: StatusCobertura, insumos: Vec<InsumoOrdem>) -> ResultadoOrdem {
        ResultadoOrdem {
            id: "x".into(),
            produto: "P".into(),
            status,
            consome: true,
            base_fonte: Default::default(),
            bases: Vec::new(),
            motivo_sem_consumo: None,
            avisos: Vec::new(),
            insumos,
        }
    }

    #[test]
    fn situacao_so_e_disponivel_com_todos_os_insumos_cobertos() {
        let ok = resultado(StatusCobertura::Ok, vec![insumo("A", StatusInsumo::Ok, 0.0)]);
        assert_eq!(situacao_do_resultado(Some(&ok)).0, Situacao::Disponivel);

        let chega_depois = resultado(StatusCobertura::Atencao, vec![insumo("A", StatusInsumo::ChegaDepois, 5.0)]);
        let (s, falta, _) = situacao_do_resultado(Some(&chega_depois));
        assert_eq!(s, Situacao::AguardandoInsumos, "insumo que só chega depois não é 100%");
        assert_eq!(falta[0].status, "chega_depois");

        let sem_formula = resultado(StatusCobertura::SemFormula, vec![]);
        let (s, falta, motivo) = situacao_do_resultado(Some(&sem_formula));
        assert_eq!(s, Situacao::AguardandoInsumos);
        assert!(falta.is_empty() && motivo.is_some());
    }

    #[test]
    fn faltas_somam_um_por_insumo_com_o_maior_valor_e_ordenam() {
        let a = resultado(StatusCobertura::Falta, vec![insumo("A", StatusInsumo::Falta, 3.0), insumo("B", StatusInsumo::Falta, 9.0)]);
        let b = resultado(StatusCobertura::Falta, vec![insumo("A", StatusInsumo::Falta, 7.0), insumo("C", StatusInsumo::Ok, 0.0)]);
        let f = faltas_do_resultado(&[&a, &b]);
        assert_eq!(f.iter().map(|x| (x.codigo.as_str(), x.falta)).collect::<Vec<_>>(), vec![("B", 9.0), ("A", 7.0)]);
    }

    #[test]
    fn linha_de_envase_pela_descricao() {
        assert_eq!(linha_envase_sugerida("MASCARA 1KG"), "L2");
        assert_eq!(linha_envase_sugerida("POMADA 100G"), "L3");
        assert_eq!(linha_envase_sugerida("SHAMPOO 500ML"), "L1");
    }
}
