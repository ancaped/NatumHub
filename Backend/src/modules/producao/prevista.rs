//! Produção prevista: a lista única do que vai ser produzido nas próximas 4 semanas, em três camadas, e o consumo de
//! insumo que ela gera (motor da Cobertura). Só leitura.
//!
//! Camadas (um produto com ordem em qualquer semana do horizonte não entra de novo como automático):
//! 1. `ordem`: ordens do quadro sem lote no ERP, planejadas ou aprovadas (aprovada = firme), com dia e kg;
//! 2. `fila_manual`: itens manuais da Fila de Demandas, sem dia;
//! 3. `fila_automatica`: a sugestão da Demanda para o que não está em 1 nem 2 (mesma regra de `fila_auto`).
//!
//! Quantidade: ordem em kg; fila manual com o kg gravado ou convertido (`fila::kg_de_quantidade`); fila automática em
//! unidades (produto acabado e kit) ou kg (base). Item sem como converter vem com `aviso`, nunca some em silêncio.

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use chrono::{Duration, NaiveDate};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::core::catalogo::Acao;
use crate::core::db::Db;
use crate::handlers::AppState;
use crate::modules::producao::cobertura::calc::BaseFonte;
use crate::modules::producao::cobertura::horizonte::SEMANAS_HORIZONTE;
use crate::modules::producao::cobertura::store::{self, canon, Contribuicao, Formulas, Quantidade};
use crate::modules::producao::fila_auto::{self, Excluidos};
use crate::modules::producao::{calculo, decisoes, fila};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Camada {
    Ordem,
    FilaManual,
    FilaAutomatica,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPrevisto {
    pub camada: Camada,
    /// Ordem aprovada (firme). Planejada e fila: `false`.
    pub firme: bool,
    pub codigo: String,
    pub descricao: String,
    pub quantidade: f64,
    /// `kg` ou `un`.
    pub unidade: String,
    pub kg: Option<f64>,
    pub dia: Option<NaiveDate>,
    /// Id da ordem ou do item manual da fila.
    pub origem_id: Option<String>,
    pub base_fonte: BaseFonte,
    pub aviso: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProducaoPrevista {
    pub de: NaiveDate,
    pub ate: NaiveDate,
    pub itens: Vec<ItemPrevisto>,
    pub avisos: Vec<String>,
    pub excluidos_automaticos: Excluidos,
}

fn erro_texto(e: String) -> ErroApi {
    ErroApi::interno(e)
}

fn e_kg(unidade: &str) -> bool {
    unidade.trim().eq_ignore_ascii_case("kg")
}

/// Ordens do quadro no período que ainda não têm lote no ERP (não canceladas).
async fn ordens_do_periodo(pool: &PgPool, de: NaiveDate, ate: NaiveDate) -> Result<(Vec<ItemPrevisto>, HashSet<String>), ErroApi> {
    let rows = sqlx::query(
        r#"
        SELECT id, data_planejada, codigo_produto, COALESCE(descricao, '') AS descricao,
               COALESCE(quantidade_planejada, 0)::float8 AS kg,
               COALESCE(ordem_status, 'planejado') AS status,
               NULLIF(TRIM(COALESCE(lote_erp, '')), '') AS lote_erp,
               COALESCE(NULLIF(TRIM(base_fonte), ''), 'explodir') AS base_fonte
        FROM producao_planejamento_semanal
        WHERE (ordem_status IS NULL OR ordem_status <> 'cancelado')
          AND data_planejada >= $1 AND data_planejada <= $2
        ORDER BY data_planejada, COALESCE(ordem_sequencia, 1)
        "#,
    )
    .bind(de)
    .bind(ate)
    .fetch_all(pool)
    .await?;
    let mut itens = Vec::new();
    let mut com_ordem: HashSet<String> = HashSet::new();
    for r in rows {
        let codigo = canon(&r.get::<Option<String>, _>("codigo_produto").unwrap_or_default());
        // Qualquer ordem no horizonte (mesmo com lote) tira o produto da camada automática.
        com_ordem.insert(codigo.clone());
        if r.get::<Option<String>, _>("lote_erp").is_some() {
            continue;
        }
        let kg: f64 = r.get("kg");
        let status: String = r.get("status");
        itens.push(ItemPrevisto {
            camada: Camada::Ordem,
            firme: status == "aprovado",
            codigo,
            descricao: r.get("descricao"),
            quantidade: kg,
            unidade: "kg".into(),
            kg: Some(kg),
            dia: r.get::<Option<NaiveDate>, _>("data_planejada"),
            origem_id: Some(r.get("id")),
            base_fonte: BaseFonte::parse(&r.get::<String, _>("base_fonte")).unwrap_or_default(),
            aviso: (kg <= 0.0).then(|| "Ordem sem kg planejado.".to_string()),
        });
    }
    Ok((itens, com_ordem))
}

/// A produção prevista de hoje até o fim da 4ª semana (a semana atual conta inteira, como no horizonte do Compras).
pub async fn listar(db: &Db) -> Result<ProducaoPrevista, ErroApi> {
    let pool = db.pool();
    let semana = store::semana_de(store::hoje_brasil());
    let (de, dom) = store::intervalo_semana(&semana).ok_or_else(|| ErroApi::interno("Semana atual inválida."))?;
    let ate = dom + Duration::days((SEMANAS_HORIZONTE - 1) * 7);

    let (mut itens, com_ordem) = ordens_do_periodo(pool, de, ate).await?;
    let mut avisos: Vec<String> = Vec::new();

    // fila manual
    let manuais = fila_auto::itens_manuais(pool).await?;
    for m in &manuais {
        let kg = fila::kg_de_quantidade(Some(m.quantidade_kg.unwrap_or(0.0)), m.quantidade, &m.unidade, &m.descricao);
        let aviso = kg.is_none().then(|| "Sem kg e sem peso da unidade na descrição: não entra no consumo.".to_string());
        if let Some(a) = &aviso {
            avisos.push(format!("{} — {}: {a}", m.codigo_produto, m.descricao));
        }
        itens.push(ItemPrevisto {
            camada: Camada::FilaManual,
            firme: false,
            codigo: canon(&m.codigo_produto),
            descricao: m.descricao.clone(),
            quantidade: m.quantidade,
            unidade: m.unidade.clone(),
            kg,
            dia: None,
            origem_id: Some(m.id.clone()),
            base_fonte: BaseFonte::default(),
            aviso,
        });
    }

    // fila automática: sugestão da Demanda menos manual, ordem no horizonte e descartado
    let necessarios = fila_auto::produtos_necessarios(db).await?;
    let descartados: HashSet<String> = decisoes::listar(pool, decisoes::TIPO_FILA_DESCARTADA)
        .await
        .map_err(erro_texto)?
        .into_iter()
        .map(|d| canon(&d.chave))
        .collect();
    let codigos_manuais: HashSet<String> = manuais.iter().map(|m| canon(&m.codigo_produto)).collect();
    let resumo: Vec<(String, f64)> = necessarios.iter().map(|p| (p.codigo.clone(), p.producao_recomendada as f64)).collect();
    let (escolhidos, excluidos) = fila_auto::escolher_automaticos(&resumo, &codigos_manuais, &com_ordem, &descartados);
    for i in escolhidos {
        let it = fila_auto::item_automatico(&necessarios[i], None);
        itens.push(ItemPrevisto {
            camada: Camada::FilaAutomatica,
            firme: false,
            codigo: canon(&it.codigo),
            descricao: it.descricao,
            quantidade: it.quantidade,
            unidade: it.unidade,
            kg: Some(it.quantidade_kg),
            dia: None,
            origem_id: None,
            base_fonte: BaseFonte::default(),
            aviso: None,
        });
    }
    Ok(ProducaoPrevista { de, ate, itens, avisos, excluidos_automaticos: excluidos })
}

// ---------------------------------------------------------------------------------------------
// Consumo de insumo
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinhaConsumo {
    pub insumo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub quantidade: f64,
    pub camada: Camada,
    /// Produto que consome (num kit, o componente).
    pub produto: String,
    /// Produto do item previsto de onde veio.
    pub item: String,
    pub dia: Option<NaiveDate>,
}

/// Quantidade que o motor recebe de um item: unidade `kg` -> kg normalizado pela massa; senão unidades.
fn quantidade_do_item(i: &ItemPrevisto) -> Option<Quantidade> {
    if e_kg(&i.unidade) {
        i.kg.filter(|k| *k > 0.0).map(Quantidade::Kg)
    } else {
        (i.quantidade > 0.0).then_some(Quantidade::Unidades(i.quantidade))
    }
}

/// Consumo de insumo dos itens previstos, pelo motor da Cobertura. Item sem fórmula entra nos avisos.
pub async fn consumo(pool: &PgPool, itens: &[ItemPrevisto]) -> Result<(Vec<LinhaConsumo>, Vec<String>), String> {
    let codigos: Vec<String> = itens.iter().map(|i| i.codigo.clone()).collect();
    let formulas = store::carregar_formulas_previstas(pool, &codigos).await?;
    let produzidos: HashSet<String> = codigos.iter().map(|c| canon(c)).collect();
    let mut linhas = Vec::new();
    let mut avisos = Vec::new();
    for i in itens {
        let Some(q) = quantidade_do_item(i) else { continue };
        let contribuicoes = formulas.necessidades_previstas(&i.codigo, q, i.base_fonte, &produzidos);
        let Some(contribuicoes) = contribuicoes else {
            avisos.push(format!("{} — {}: sem fórmula utilizável; fora do consumo.", i.codigo, i.descricao));
            continue;
        };
        for Contribuicao { produto, necessidades } in contribuicoes {
            for n in necessidades {
                linhas.push(LinhaConsumo {
                    insumo: n.codigo,
                    descricao: n.descricao,
                    unidade: n.unidade,
                    quantidade: n.quantidade,
                    camada: i.camada,
                    produto: produto.clone(),
                    item: i.codigo.clone(),
                    dia: i.dia,
                });
            }
        }
    }
    Ok((linhas, avisos))
}

// ---------------------------------------------------------------------------------------------
// Comparação com o cálculo atual do Compras (conjunto: a sugestão automática)
// ---------------------------------------------------------------------------------------------

/// Produto da sugestão automática do Compras: crítico, ordem ou saindo de linha com produção recomendada > 0.
/// Mesmo filtro de `collect_sim_producao_contributions` (Compras); sai daqui quando o Compras passar a usar o motor (A2).
pub struct SugestaoProduto {
    pub codigo: String,
    pub descricao: String,
    pub unidades: f64,
    pub e_base: bool,
}

pub async fn sugestao_automatica(db: &Db) -> Result<Vec<SugestaoProduto>, ErroApi> {
    let (products, stocks, fat_map, configs, overrides, _) = calculo::fetch_calculation_data(db)
        .await
        .map_err(|e| ErroApi::interno(format!("Erro ao ler os dados da Demanda: {e}")))?;
    let mut computed =
        crate::modules::producao::gerenciamento::calculations::calculate_products(&products, &stocks, &fat_map, &configs, &overrides);
    let kits = db.get_kit_composition().await.unwrap_or_default();
    calculo::post_process_kit_only_production(&mut computed, &kits);
    Ok(computed
        .iter()
        .filter(|p| p.producao_recomendada > 0 && matches!(p.status.as_str(), "critico" | "ordem" | "saindo_de_linha"))
        .map(|p| SugestaoProduto {
            codigo: p.codigo.trim().to_string(),
            descricao: p.descricao.clone(),
            unidades: p.producao_recomendada as f64,
            e_base: crate::core::regras_produto::e_base(
                &p.codigo,
                p.categoria_produto.as_deref().unwrap_or(""),
                p.status_produto.as_deref().unwrap_or(""),
            ),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiferencaProduto {
    pub produto: String,
    pub compras: f64,
    pub motor: f64,
    pub causa: &'static str,
    pub explicacao: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiferencaInsumo {
    pub insumo: String,
    pub descricao: String,
    pub compras: f64,
    pub motor: f64,
    pub diferenca: f64,
    pub produtos: Vec<DiferencaProduto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumoCausa {
    pub causa: &'static str,
    pub explicacao: &'static str,
    pub insumos: usize,
    pub produtos: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparacaoCompras {
    pub produtos_na_sugestao: usize,
    /// Dos produtos da sugestão, quantos são kits com composição e quantos são bases (kg): as duas regras onde o motor
    /// e o Compras podem divergir.
    pub kits_na_sugestao: usize,
    pub bases_na_sugestao: usize,
    pub insumos_comparados: usize,
    pub insumos_iguais: usize,
    pub insumos_com_diferenca: usize,
    pub sem_explicacao: usize,
    pub causas: Vec<ResumoCausa>,
    pub diferencas: Vec<DiferencaInsumo>,
    pub avisos: Vec<String>,
}

/// Quantidade por (produto contribuinte, insumo).
type PorProdutoInsumo = BTreeMap<(String, String), f64>;

const TEXTO_CAUSAS: [(&str, &str); 7] = [
    (
        "base_por_lote_de_referencia",
        "A fórmula da base está 'por lote de referência' (as linhas somam a massa do lote, não 1). O motor da Cobertura normaliza pela soma; o Compras multiplica sem normalizar e superestima o insumo na proporção da soma.",
    ),
    (
        "base_na_sugestao_normalizada_pela_massa",
        "O produto da sugestão é uma base em kg. O motor normaliza a fórmula pela massa química; o Compras usa as linhas como estão. Só diferem quando as linhas da base não somam 1.",
    ),
    (
        "formula_so_no_compras",
        "O Compras achou fórmula para o produto; o motor, não (a busca por código difere: o Compras também tenta o código sem pontos). Precisa alinhar o código ou o cadastro da fórmula.",
    ),
    (
        "formula_so_no_motor",
        "O motor achou fórmula para o produto; o Compras, não (o motor também tenta o código com zero à esquerda).",
    ),
    (
        "kit_componente_ja_produzido",
        "Regra do kit: o componente fabricado que já está na sugestão só conta por si. O Compras compara o código sem pontos; o motor compara o código canônico.",
    ),
    (
        "kit_item_direto",
        "Regra do kit: item direto (caixa, embalagem) que já está na fórmula de um componente não conta de novo. O Compras compara com e sem pontos; o motor, só o código canônico.",
    ),
    (
        "sem_explicacao",
        "Diferença ainda sem causa identificada: investigar produto a produto.",
    ),
];

fn explicacao_da_causa(causa: &str) -> &'static str {
    TEXTO_CAUSAS.iter().find(|(c, _)| *c == causa).map(|(_, t)| *t).unwrap_or("")
}

fn rotulo_causa(causa: &str) -> &'static str {
    TEXTO_CAUSAS.iter().find(|(c, _)| *c == causa).map(|(c, _)| *c).unwrap_or("sem_explicacao")
}

fn quase_igual(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-6_f64.max(a.abs().max(b.abs()) * 1e-4)
}

/// Soma das linhas de uma base cuja fórmula não está "por unidade" (fora de 1 ± 5%), se houver.
fn soma_de_base_fora_de_um(formulas: &Formulas, produto: &str, insumo: &str) -> Option<f64> {
    let linhas = formulas.por_produto.get(&canon(produto))?;
    linhas
        .iter()
        .filter_map(|l| formulas.bases.get(l.codigo.trim()))
        .map(|sub| sub.iter().map(|s| s.quantidade).sum::<f64>())
        .find(|soma| *soma > 0.0 && (soma - 1.0).abs() > 0.05)
        .filter(|_| {
            // só vale se o insumo realmente sai de uma base
            linhas.iter().filter_map(|l| formulas.bases.get(l.codigo.trim())).any(|sub| sub.iter().any(|s| canon(&s.codigo) == insumo))
        })
}

/// Classifica a diferença de um (produto, insumo) entre o Compras (`a`) e o motor (`b`).
fn classificar(formulas: &Formulas, sugestao: &HashMap<String, &SugestaoProduto>, produto: &str, insumo: &str, a: f64, b: f64) -> &'static str {
    let tem_formula = formulas.por_produto.contains_key(&canon(produto));
    if b == 0.0 {
        return if !tem_formula && !formulas.kits.contains_key(&canon(produto)) { "formula_so_no_compras" } else { "kit_item_direto" };
    }
    if a == 0.0 {
        return if tem_formula && formulas.kits.values().flatten().any(|(c, _)| canon(c) == canon(produto)) {
            "kit_componente_ja_produzido"
        } else {
            "formula_so_no_motor"
        };
    }
    let razao = b / a;
    if let Some(soma) = soma_de_base_fora_de_um(formulas, produto, insumo) {
        if (razao - 1.0 / soma).abs() <= 0.01 / soma {
            return "base_por_lote_de_referencia";
        }
    }
    if sugestao.get(&canon(produto)).map_or(false, |s| s.e_base) {
        if let Some(f) = formulas.por_produto.get(&canon(produto)) {
            let massa = crate::modules::producao::cobertura::calc::massa_quimica(f);
            if massa > 0.0001 && (razao - 1.0 / massa).abs() <= 0.01 / massa {
                return "base_na_sugestao_normalizada_pela_massa";
            }
        }
    }
    "sem_explicacao"
}

/// Consumo da sugestão automática pelo `demands.rs` (Compras) e pelo motor da Cobertura, por insumo, com as diferenças
/// explicadas por produto. Só leitura. O motor roda com a base explodida (como o Compras) para isolar as causas.
pub async fn comparar_com_compras(db: &Db) -> Result<ComparacaoCompras, ErroApi> {
    let pool = db.pool();
    let sugestao = sugestao_automatica(db).await?;
    let compras = crate::modules::compras::planejamento::commands::collect_sim_producao_contributions(pool).await;

    let mut lado_compras: PorProdutoInsumo = BTreeMap::new();
    for c in &compras {
        *lado_compras.entry((canon(&c.product_code), canon(&c.ingredient_code))).or_default() += c.insumo_qty;
    }

    let codigos: Vec<String> = sugestao.iter().map(|s| s.codigo.clone()).collect();
    let formulas = store::carregar_formulas_previstas(pool, &codigos).await.map_err(erro_texto)?;
    let produzidos: HashSet<String> = codigos.iter().map(|c| canon(c)).collect();
    let mut lado_motor: PorProdutoInsumo = BTreeMap::new();
    let mut descricoes: HashMap<String, String> = HashMap::new();
    let mut avisos = Vec::new();
    for s in &sugestao {
        let q = if s.e_base { Quantidade::Kg(s.unidades) } else { Quantidade::Unidades(s.unidades) };
        match formulas.necessidades_previstas(&s.codigo, q, BaseFonte::Explodir, &produzidos) {
            Some(cs) => {
                for c in cs {
                    for n in c.necessidades {
                        descricoes.entry(n.codigo.clone()).or_insert(n.descricao.clone());
                        *lado_motor.entry((c.produto.clone(), n.codigo)).or_default() += n.quantidade;
                    }
                }
            }
            None => avisos.push(format!("{} — {}: sem fórmula utilizável no motor.", s.codigo, s.descricao)),
        }
    }

    let por_codigo: HashMap<String, &SugestaoProduto> = sugestao.iter().map(|s| (canon(&s.codigo), s)).collect();
    let chaves: HashSet<&(String, String)> = lado_compras.keys().chain(lado_motor.keys()).collect();
    let mut por_insumo: BTreeMap<String, (f64, f64, Vec<DiferencaProduto>)> = BTreeMap::new();
    for k in chaves {
        let a = lado_compras.get(k).copied().unwrap_or(0.0);
        let b = lado_motor.get(k).copied().unwrap_or(0.0);
        let e = por_insumo.entry(k.1.clone()).or_default();
        e.0 += a;
        e.1 += b;
        if !quase_igual(a, b) {
            let causa = classificar(&formulas, &por_codigo, &k.0, &k.1, a, b);
            e.2.push(DiferencaProduto { produto: k.0.clone(), compras: a, motor: b, causa, explicacao: explicacao_da_causa(causa).to_string() });
        }
    }

    let insumos_comparados = por_insumo.len();
    let mut diferencas: Vec<DiferencaInsumo> = por_insumo
        .into_iter()
        .filter(|(_, (a, b, prods))| !quase_igual(*a, *b) || !prods.is_empty())
        .map(|(insumo, (a, b, produtos))| DiferencaInsumo {
            descricao: descricoes.get(&insumo).cloned().unwrap_or_default(),
            insumo,
            compras: a,
            motor: b,
            diferenca: b - a,
            produtos,
        })
        .collect();
    diferencas.sort_by(|x, y| y.diferenca.abs().partial_cmp(&x.diferenca.abs()).unwrap_or(std::cmp::Ordering::Equal));

    let mut resumo: BTreeMap<&'static str, (HashSet<String>, HashSet<String>)> = BTreeMap::new();
    for d in &diferencas {
        for p in &d.produtos {
            let e = resumo.entry(rotulo_causa(p.causa)).or_default();
            e.0.insert(d.insumo.clone());
            e.1.insert(p.produto.clone());
        }
    }
    let sem_explicacao = resumo.get("sem_explicacao").map_or(0, |e| e.0.len());
    let causas = resumo
        .into_iter()
        .map(|(causa, (insumos, produtos))| ResumoCausa { causa, explicacao: explicacao_da_causa(causa), insumos: insumos.len(), produtos: produtos.len() })
        .collect();

    Ok(ComparacaoCompras {
        produtos_na_sugestao: sugestao.len(),
        kits_na_sugestao: sugestao.iter().filter(|s| formulas.kits.contains_key(&canon(&s.codigo))).count(),
        bases_na_sugestao: sugestao.iter().filter(|s| s.e_base).count(),
        insumos_comparados,
        insumos_iguais: insumos_comparados - diferencas.len(),
        insumos_com_diferenca: diferencas.len(),
        sem_explicacao,
        causas,
        diferencas,
        avisos,
    })
}

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/prevista", get(get_prevista))
        .route("/api/producao/prevista/comparar-compras", get(get_comparar_compras))
}

pub fn acoes() -> Vec<Acao> {
    const M: &str = crate::modules::producao::permissao::MODULO_PLANEJAMENTO;
    vec![
        Acao::leitura(
            "listar_producao_prevista",
            M,
            "O que vai ser produzido da semana atual até a 4ª semana, em três camadas: `ordem` (planejada ou aprovada/firme, sem lote no ERP, com dia e kg), `fila_manual` e `fila_automatica` (sugestão da Demanda para o que não tem ordem no horizonte). Item sem como converter para kg vem com `aviso`. Devolve também o consumo de insumo por camada (`consumo`).",
            "/api/producao/prevista",
            vec![],
        ),
        Acao::leitura(
            "comparar_consumo_com_compras",
            M,
            "Compara, por insumo, o consumo da sugestão automática calculado pelo MRP do Compras e pelo motor da Cobertura, listando as diferenças com a causa por produto.",
            "/api/producao/prevista/comparar-compras",
            vec![],
        ),
    ]
}

async fn get_prevista(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let r: Result<Value, ErroApi> = async {
        let p = listar(&state.db).await?;
        let (consumo_linhas, avisos_consumo) = consumo(state.db.pool(), &p.itens).await.map_err(erro_texto)?;
        let mut por_insumo: BTreeMap<(String, &'static str), f64> = BTreeMap::new();
        let mut desc: HashMap<String, (String, Option<String>)> = HashMap::new();
        for l in &consumo_linhas {
            let camada = match l.camada {
                Camada::Ordem => "ordem",
                Camada::FilaManual => "fila_manual",
                Camada::FilaAutomatica => "fila_automatica",
            };
            *por_insumo.entry((l.insumo.clone(), camada)).or_default() += l.quantidade;
            desc.entry(l.insumo.clone()).or_insert((l.descricao.clone(), l.unidade.clone()));
        }
        let consumo_json: Vec<Value> = por_insumo
            .iter()
            .map(|((insumo, camada), q)| {
                let (d, u) = desc.get(insumo).cloned().unwrap_or_default();
                json!({ "insumo": insumo, "descricao": d, "unidade": u, "camada": camada, "quantidade": q })
            })
            .collect();
        let mut avisos = p.avisos.clone();
        avisos.extend(avisos_consumo);
        Ok(json!({ "ok": true, "de": p.de, "ate": p.ate, "itens": p.itens, "consumo": consumo_json, "avisos": avisos, "excluidosAutomaticos": p.excluidos_automaticos }))
    }
    .await;
    match r {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_comparar_compras(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match comparar_com_compras(&state.db).await {
        Ok(c) => (StatusCode::OK, Json(c)).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::producao::cobertura::calc::LinhaFormula;

    fn l(c: &str, q: f64) -> LinhaFormula {
        LinhaFormula { codigo: c.into(), descricao: String::new(), unidade: None, quantidade: q }
    }

    fn qtd(n: &[crate::modules::producao::cobertura::calc::Necessidade], c: &str) -> f64 {
        n.iter().find(|x| x.codigo == c).map_or(0.0, |x| x.quantidade)
    }

    fn formulas() -> Formulas {
        let mut f = Formulas { por_produto: HashMap::new(), bases: HashMap::new(), itens: HashMap::new(), trocas: Vec::new(), kits: HashMap::new() };
        // base "por lote de referência": soma 1000
        f.bases.insert("BASE".into(), vec![l("MP1", 600.0), l("MP2", 400.0)]);
        // shampoo: 0,3 kg de base + 1 frasco por unidade
        f.por_produto.insert("SH".into(), vec![l("BASE", 0.3), l("9.02.001", 1.0)]);
        // condicionador: mesma base + frasco + caixa
        f.por_produto.insert("CO".into(), vec![l("BASE", 0.3), l("9.02.001", 1.0), l("9.04.009", 1.0)]);
        // base em kg "por unidade" (soma 1)
        f.por_produto.insert("B2".into(), vec![l("MP1", 0.5), l("MP3", 0.5)]);
        f
    }

    #[test]
    fn produto_acabado_usa_a_formula_por_unidade_e_normaliza_a_base_por_lote() {
        let f = formulas();
        let n = f.necessidades_previstas("SH", Quantidade::Unidades(1000.0), BaseFonte::Explodir, &HashSet::new()).unwrap();
        assert_eq!(n.len(), 1);
        // 1000 un × 0,3 kg de base = 300 kg; a base soma 1000 -> MP1 = 300 × 0,6 = 180 (o Compras multiplicaria sem
        // dividir pela soma e pediria 1000× mais: é a causa `base_por_lote_de_referencia`).
        assert!((qtd(&n[0].necessidades, "MP1") - 180.0).abs() < 1e-9);
        assert!((qtd(&n[0].necessidades, "MP2") - 120.0).abs() < 1e-9);
        assert!((qtd(&n[0].necessidades, "9.02.001") - 1000.0).abs() < 1e-9);
    }

    #[test]
    fn quantidade_em_kg_e_a_mesma_do_motor_da_cobertura() {
        let f = formulas();
        let a = f.necessidades_previstas("B2", Quantidade::Kg(200.0), BaseFonte::Explodir, &HashSet::new()).unwrap();
        let b = f.necessidades_com("B2", 200.0, BaseFonte::Explodir).unwrap();
        assert_eq!(a[0].necessidades, b);
        assert!((qtd(&b, "MP1") - 100.0).abs() < 1e-9);
    }

    #[test]
    fn kit_explode_componentes_e_item_direto_sem_duplicar() {
        let mut f = formulas();
        // kit = 1 SH + 1 CO + 1 caixa de presente (item direto) + 1 caixa 9.04.009 (já está na fórmula do CO)
        f.kits.insert(
            "KIT".into(),
            vec![("SH".into(), 1.0), ("CO".into(), 1.0), ("9.04.077".into(), 1.0), ("9.04.009".into(), 1.0)],
        );
        let r = f.necessidades_previstas("KIT", Quantidade::Unidades(10.0), BaseFonte::Explodir, &HashSet::new()).unwrap();
        let produtos: Vec<&str> = r.iter().map(|c| c.produto.as_str()).collect();
        assert_eq!(produtos, vec!["SH", "CO", "KIT"], "SH, CO e só a caixa de presente (a outra já está no CO)");
        assert!((qtd(&r[0].necessidades, "MP1") - 1.8).abs() < 1e-9);
        assert!((qtd(&r[2].necessidades, "9.04.077") - 10.0).abs() < 1e-9);
        assert_eq!(qtd(&r[2].necessidades, "9.04.009"), 0.0);
    }

    #[test]
    fn componente_fabricado_que_ja_esta_na_producao_nao_conta_pelo_kit() {
        let mut f = formulas();
        f.kits.insert("KIT".into(), vec![("SH".into(), 2.0), ("9.04.077".into(), 1.0)]);
        let produzidos: HashSet<String> = ["SH".to_string()].into();
        let r = f.necessidades_previstas("KIT", Quantidade::Unidades(10.0), BaseFonte::Explodir, &produzidos).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].produto, "KIT");
    }

    #[test]
    fn kit_em_kg_e_produto_sem_formula_devolvem_none_para_o_chamador_avisar() {
        let mut f = formulas();
        f.kits.insert("KIT".into(), vec![("SH".into(), 1.0)]);
        assert!(f.necessidades_previstas("KIT", Quantidade::Kg(5.0), BaseFonte::Explodir, &HashSet::new()).is_none());
        assert!(f.necessidades_previstas("NAOEXISTE", Quantidade::Unidades(5.0), BaseFonte::Explodir, &HashSet::new()).is_none());
    }

    /// A Cobertura do Planejamento continua devolvendo os mesmos números: `necessidades_com` (kg, normalizado pela
    /// massa, base explodida) não mudou com a chegada das unidades e dos kits.
    #[test]
    fn necessidades_com_da_cobertura_nao_mudou() {
        let f = formulas();
        // SH em kg: massa química = 0,3 (frasco é embalagem); 150 kg -> mult 500 -> 150 kg de base e 500 frascos
        let n = f.necessidades_com("SH", 150.0, BaseFonte::Explodir).unwrap();
        assert!((qtd(&n, "MP1") - 90.0).abs() < 1e-9);
        assert!((qtd(&n, "MP2") - 60.0).abs() < 1e-9);
        assert!((qtd(&n, "9.02.001") - 500.0).abs() < 1e-9);
        // base vinda de estoque: só o que não é da base
        let n = f.necessidades_com("SH", 150.0, BaseFonte::Estoque).unwrap();
        assert_eq!(qtd(&n, "MP1"), 0.0);
        assert!((qtd(&n, "9.02.001") - 500.0).abs() < 1e-9);
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    /// Com `PREVISTA_SAIDA=/caminho`, grava a lista e a comparação em JSON.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn prevista_e_comparacao_rodam_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let db = Db::new(PgPool::connect(&url).await.unwrap());
        let p = listar(&db).await.map_err(|e| format!("{e:?}")).unwrap();
        let (linhas, avisos) = consumo(db.pool(), &p.itens).await.unwrap();
        let c = comparar_com_compras(&db).await.map_err(|e| format!("{e:?}")).unwrap();
        println!("itens={} consumo={} avisos_consumo={} diferencas={} sem_explicacao={}", p.itens.len(), linhas.len(), avisos.len(), c.insumos_com_diferenca, c.sem_explicacao);
        if let Ok(caminho) = std::env::var("PREVISTA_SAIDA") {
            std::fs::write(caminho, serde_json::to_string_pretty(&json!({ "prevista": p, "avisosConsumo": avisos, "comparacao": c })).unwrap()).unwrap();
        }
    }
}
