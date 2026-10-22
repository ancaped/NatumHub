//! Cobertura de insumo por dia no Planejamento Semanal.
//!
//! Este arquivo é PURO (sem banco): recebe os dados já carregados e devolve o resultado, para poder ser
//! testado de ponta a ponta. A leitura do banco fica em `store.rs`.
//!
//! Regra do Edson: nada conta duas vezes. Ambiguidade vira aviso para revisão manual, nunca soma silenciosa.
//!
//! Como o ERP funciona: o lote RESERVA os insumos ao ser aberto e dá a BAIXA real ao ser fechado; só então
//! `nQtdeEstoque` cai. `nqtdeReserva` é a soma das reservas de todos os lotes abertos, sem detalhe por lote.
//! Por isso o livre é `estoque - reserva`, e só as ordens que ainda NÃO estão abertas no ERP consomem.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

pub const EPS: f64 = 1e-6;
/// Casamento forte: kg dentro de 5% (ou 1 kg) e data até 3 dias.
pub const TOL_KG_FORTE: f64 = 0.05;
pub const TOL_KG_ABS: f64 = 1.0;
pub const DIAS_FORTE: i64 = 3;
/// Casamento fraco: kg dentro de 15% e data até 7 dias.
pub const TOL_KG_FRACO: f64 = 0.15;
pub const DIAS_FRACO: i64 = 7;
/// Ordem manual OPEN mais antiga que isto ganha aviso de revisão.
pub const MANUAL_ANTIGO_DIAS: i64 = 7;
/// Recebimento por NF que cobre pelo menos esta fração do pendente conta como "já recebido".
pub const FRACAO_RECEBIDO: f64 = 0.98;

// ---------------------------------------------------------------------------------------------
// Fórmula -> necessidade de insumos
// ---------------------------------------------------------------------------------------------

/// Classificação de embalagem usada em `get_insumos_status` (mesma regra, agora compartilhada).
pub fn is_embalagem(codigo: &str, descricao: &str) -> bool {
    const PREFIXOS: [&str; 9] = [
        "9.02.", "9.04.", "9.06.", "9.09.", "9.11.", "9.29.", "9.32.", "9.30.", "9.31.",
    ];
    const PALAVRAS: [&str; 8] = [
        "FRASCO", "POTE", "TAMPA", "BISNAGA", "VALVULA", "CAIXA", "ROTULO", "RÓTULO",
    ];
    let d = descricao.to_uppercase();
    PREFIXOS.iter().any(|p| codigo.starts_with(p)) || PALAVRAS.iter().any(|k| d.contains(k))
}

#[derive(Debug, Clone)]
pub struct LinhaFormula {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub quantidade: f64,
}

/// Massa química da fórmula (exclui embalagens): base do multiplicador `kg / massa`.
pub fn massa_quimica(formula: &[LinhaFormula]) -> f64 {
    formula
        .iter()
        .filter(|l| !is_embalagem(&l.codigo, &l.descricao))
        .map(|l| l.quantidade)
        .sum()
}

/// De onde sai a base de um produto que a usa. A base é cadastrada como PRODUTO: quando o Edson abre a ordem
/// da base, é ela que baixa os insumos; o produto final só consome o restante (ex.: fragrância).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BaseFonte {
    /// Padrão: a base é explodida em matérias-primas, como o ERP reserva.
    #[default]
    Explodir,
    /// Base já pronta em estoque: o produto não consome os insumos da base.
    Estoque,
    /// Há (ou haverá) ordem da base: ela consome os insumos da base.
    OrdemBase,
}

impl BaseFonte {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "explodir" => Some(Self::Explodir),
            "estoque" => Some(Self::Estoque),
            "ordem_base" => Some(Self::OrdemBase),
            _ => None,
        }
    }
    pub fn como_texto(self) -> &'static str {
        match self {
            Self::Explodir => "explodir",
            Self::Estoque => "estoque",
            Self::OrdemBase => "ordem_base",
        }
    }
    fn rotulo(self) -> &'static str {
        match self {
            Self::Explodir => "explodir a base em matérias-primas",
            Self::Estoque => "tirar da base em estoque",
            Self::OrdemBase => "usar a ordem da base",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BaseRef {
    pub codigo: String,
    pub descricao: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Necessidade {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub quantidade: f64,
}

/// Necessidade de insumos para produzir `kg` do produto. `None` = sem fórmula utilizável.
/// Ingrediente que tem fórmula própria (base) é explodido em matérias-primas, como o ERP e o MRP fazem.
/// A fórmula da base pode estar "por unidade" (soma ~1) ou "por lote de referência" (soma = massa do lote):
/// no segundo caso normaliza pela massa, para não multiplicar por centenas.
pub fn necessidades_do_produto(
    formula: &[LinhaFormula],
    kg: f64,
    bases: &HashMap<String, Vec<LinhaFormula>>,
    fonte: BaseFonte,
) -> Option<Vec<Necessidade>> {
    let massa = massa_quimica(formula);
    if massa <= 0.0001 || kg <= 0.0 {
        return None;
    }
    let mult = kg / massa;
    // codigo -> (descricao, unidade, quantidade)
    let mut acc: BTreeMap<String, (String, Option<String>, f64)> = BTreeMap::new();
    let mut somar = |codigo: &str, desc: &str, un: &Option<String>, q: f64| {
        let e = acc
            .entry(codigo.to_string())
            .or_insert_with(|| (desc.to_string(), un.clone(), 0.0));
        e.2 += q;
    };
    for l in formula {
        let req = l.quantidade * mult;
        if req <= 0.0 {
            continue;
        }
        match bases.get(l.codigo.trim()).filter(|sub| !sub.is_empty()) {
            // Base que sai de estoque ou de uma ordem da base: não baixa os insumos dela neste produto.
            Some(_) if fonte != BaseFonte::Explodir => {}
            Some(sub) => {
                let soma: f64 = sub.iter().map(|s| s.quantidade).sum();
                let fator = if soma > 0.0 && (soma - 1.0).abs() > 0.05 { 1.0 / soma } else { 1.0 };
                for s in sub {
                    somar(&s.codigo, &s.descricao, &s.unidade, req * s.quantidade * fator);
                }
            }
            None => somar(&l.codigo, &l.descricao, &l.unidade, req),
        }
    }
    Some(
        acc.into_iter()
            .map(|(codigo, (descricao, unidade, quantidade))| Necessidade { codigo, descricao, unidade, quantidade })
            .collect(),
    )
}

/// Troca de insumo decidida pelo Edson. Não altera o ERP nem a fórmula: só a previsão de consumo.
#[derive(Debug, Clone, PartialEq)]
pub struct Troca {
    pub de: String,
    pub para: String,
    /// `None` = vale para todos os produtos; a troca de um produto específico vence a geral.
    pub produto: Option<String>,
}

/// Insumo que substitui `insumo` no `produto`, se houver troca (a do produto vence a geral).
pub fn codigo_trocado<'a>(trocas: &'a [Troca], produto: &str, insumo: &str) -> Option<&'a str> {
    let produto = produto.trim();
    trocas
        .iter()
        .find(|t| t.de == insumo && t.produto.as_deref().map(str::trim) == Some(produto))
        .or_else(|| trocas.iter().find(|t| t.de == insumo && t.produto.is_none()))
        .map(|t| t.para.as_str())
}

/// Aplica as trocas à necessidade já explodida. Uma etapa só (X->Y, sem encadear Y->Z); insumos que passam a
/// ser o mesmo código se somam. Descrição/unidade do substituto ficam vazias para o chamador preencher.
pub fn aplicar_trocas(necessidades: Vec<Necessidade>, produto: &str, trocas: &[Troca]) -> Vec<Necessidade> {
    if trocas.is_empty() {
        return necessidades;
    }
    let mut acc: BTreeMap<String, Necessidade> = BTreeMap::new();
    for n in necessidades {
        let n = match codigo_trocado(trocas, produto, &n.codigo) {
            Some(para) => Necessidade { codigo: para.to_string(), descricao: String::new(), unidade: None, quantidade: n.quantidade },
            None => n,
        };
        acc.entry(n.codigo.clone())
            .and_modify(|e| e.quantidade += n.quantidade)
            .or_insert(n);
    }
    acc.into_values().collect()
}

// ---------------------------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct EstoqueItem {
    pub descricao: String,
    pub unidade: Option<String>,
    pub estoque: f64,
    pub reserva: f64,
    pub calibrado: bool,
}

impl EstoqueItem {
    pub fn livre(&self) -> f64 {
        self.estoque - self.reserva
    }
}

/// Chegada prevista de um pedido de compra, já com o abatimento das NFs (se houver).
#[derive(Debug, Clone)]
pub struct Chegada {
    pub pedido: i32,
    pub fornecedor: String,
    pub data: Option<NaiveDate>,
    /// Quantidade efetiva (depois de abater o que já entrou por NF).
    pub quantidade: f64,
    pub quantidade_pedido: f64,
    /// NFs que parecem ter recebido este pedido (para o aviso).
    pub nfs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Manual {
    pub numero: String,
    pub data: NaiveDate,
    /// Entrada positiva, saída negativa.
    pub delta: f64,
}

#[derive(Debug, Clone)]
pub struct OrdemEntrada {
    pub id: String,
    pub data: NaiveDate,
    pub sequencia: i32,
    pub codigo_produto: String,
    pub descricao: Option<String>,
    pub kg: f64,
    pub lote_erp: Option<String>,
    /// O `lote_erp` digitado existe no ERP (aberto ou fechado).
    pub lote_no_erp: bool,
    /// Chave da batelada (mesma ordem física com até 4 SKUs).
    pub grupo: String,
    /// `None` = sem fórmula.
    pub necessidades: Option<Vec<Necessidade>>,
    /// Bases (ingredientes com fórmula própria) deste produto.
    pub bases_usadas: Vec<BaseRef>,
    /// Origem declarada da base; as necessidades já foram calculadas com ela.
    pub base_fonte: BaseFonte,
    /// Última escolha do Edson para este produto, quando difere da atual (só sugere).
    pub sugestao_base: Option<BaseFonte>,
    /// Faz parte da semana pedida (as anteriores entram só pelo consumo).
    pub da_semana: bool,
}

/// Lote aberto no ERP, ainda sem vínculo com ordem do Nexus.
#[derive(Debug, Clone)]
pub struct LoteErp {
    pub numero: String,
    pub data: NaiveDate,
    pub produtos: Vec<(String, f64)>,
    /// Reserva estimada do lote por insumo (fórmula × kg do lote, mesma explosão).
    pub reserva: HashMap<String, f64>,
}

#[derive(Debug, Clone)]
pub struct EntradaSimulacao {
    pub hoje: NaiveDate,
    pub estoque: HashMap<String, EstoqueItem>,
    pub chegadas: HashMap<String, Vec<Chegada>>,
    pub manuais: HashMap<String, Vec<Manual>>,
    pub ordens: Vec<OrdemEntrada>,
    pub lotes_erp: Vec<LoteErp>,
    /// Insumo -> equivalentes (similar_items), para sugerir o substituto de quem falta.
    pub equivalentes: HashMap<String, Vec<String>>,
    /// Insumos que o Edson marcou como "sem controle de estoque": nunca acusam falta.
    pub sem_controle: HashSet<String>,
}

// ---------------------------------------------------------------------------------------------
// Casamento ordem do Nexus x lote aberto no ERP (evita contar a reserva e a ordem juntas)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Grupo {
    pub chave: String,
    pub ordem_ids: Vec<String>,
    pub data: NaiveDate,
    pub produtos: Vec<(String, f64)>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoCasamento {
    Provavel,
    Ambiguo,
}

#[derive(Debug, Clone)]
pub struct Casamento {
    pub grupo: String,
    pub lote: String,
    pub tipo: TipoCasamento,
    pub candidatos: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Nivel {
    Fraco,
    Forte,
}

fn somar_por_produto(itens: &[(String, f64)]) -> BTreeMap<String, f64> {
    let mut m = BTreeMap::new();
    for (c, kg) in itens {
        *m.entry(c.trim().to_string()).or_insert(0.0) += *kg;
    }
    m
}

fn avaliar(g: &Grupo, l: &LoteErp) -> Option<(Nivel, f64)> {
    let gp = somar_por_produto(&g.produtos);
    let lp = somar_por_produto(&l.produtos);
    if gp.is_empty() || !gp.keys().eq(lp.keys()) {
        return None;
    }
    let dias = (g.data - l.data).num_days().abs();
    let mut forte = dias <= DIAS_FORTE;
    let mut fraco = dias <= DIAS_FRACO;
    let mut soma_rel = 0.0;
    for (cod, kg_g) in &gp {
        let kg_l = lp[cod];
        let abs = (kg_g - kg_l).abs();
        let rel = abs / kg_l.abs().max(1e-9);
        soma_rel += rel;
        if !(rel <= TOL_KG_FORTE || abs <= TOL_KG_ABS) {
            forte = false;
        }
        if rel > TOL_KG_FRACO {
            fraco = false;
        }
    }
    let score = -(soma_rel + dias as f64 * 0.01);
    if forte {
        Some((Nivel::Forte, score))
    } else if fraco {
        Some((Nivel::Fraco, score))
    } else {
        None
    }
}

/// Casa grupos de ordens do Nexus com lotes abertos no ERP. Cada lote casa com no máximo uma ordem.
/// `Provavel` = único e mútuo no nível forte. O que restar com candidato vira `Ambiguo`.
pub fn casar_lotes(grupos: &[Grupo], lotes: &[LoteErp]) -> Vec<Casamento> {
    // (grupo, lote) -> (nivel, score)
    let mut pares: Vec<(usize, usize, Nivel, f64)> = Vec::new();
    for (gi, g) in grupos.iter().enumerate() {
        for (li, l) in lotes.iter().enumerate() {
            if let Some((n, s)) = avaliar(g, l) {
                pares.push((gi, li, n, s));
            }
        }
    }
    let fortes_g = |gi: usize| pares.iter().filter(|p| p.0 == gi && p.2 == Nivel::Forte).count();
    let fortes_l = |li: usize| pares.iter().filter(|p| p.1 == li && p.2 == Nivel::Forte).count();

    let mut usados_g: HashSet<usize> = HashSet::new();
    let mut usados_l: HashSet<usize> = HashSet::new();
    let mut out: Vec<Casamento> = Vec::new();

    let candidatos_de = |gi: usize| -> Vec<String> {
        let mut v: Vec<(f64, String)> = pares
            .iter()
            .filter(|p| p.0 == gi)
            .map(|p| (p.3, lotes[p.1].numero.clone()))
            .collect();
        v.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        v.into_iter().map(|x| x.1).collect()
    };

    // 1) Prováveis: um único candidato forte dos dois lados.
    for &(gi, li, nivel, _) in &pares {
        if nivel == Nivel::Forte && fortes_g(gi) == 1 && fortes_l(li) == 1 {
            usados_g.insert(gi);
            usados_l.insert(li);
            out.push(Casamento {
                grupo: grupos[gi].chave.clone(),
                lote: lotes[li].numero.clone(),
                tipo: TipoCasamento::Provavel,
                candidatos: vec![lotes[li].numero.clone()],
            });
        }
    }

    // 2) Ambíguos: guloso por melhor pontuação, cada lote e cada grupo uma única vez.
    let mut restantes: Vec<&(usize, usize, Nivel, f64)> = pares
        .iter()
        .filter(|p| !usados_g.contains(&p.0) && !usados_l.contains(&p.1))
        .collect();
    restantes.sort_by(|a, b| {
        (b.2 == Nivel::Forte)
            .cmp(&(a.2 == Nivel::Forte))
            .then(b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal))
    });
    for &&(gi, li, _, _) in &restantes {
        if usados_g.contains(&gi) || usados_l.contains(&li) {
            continue;
        }
        usados_g.insert(gi);
        usados_l.insert(li);
        let cand = candidatos_de(gi);
        out.push(Casamento {
            grupo: grupos[gi].chave.clone(),
            lote: lotes[li].numero.clone(),
            tipo: TipoCasamento::Ambiguo,
            candidatos: cand,
        });
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Pedidos x NFs (evita contar a chegada de um pedido cuja NF já entrou no estoque)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct LinhaPedido {
    pub id: i32,
    pub pedido: i32,
    pub data_pedido: Option<NaiveDate>,
    pub pendente: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AlocacaoNf {
    pub id: i32,
    /// Quanto do pendente já entrou por NF (nunca passa do pendente).
    pub abatido: f64,
}

/// Distribui o recebimento NÃO registrado em pedido (`nf_total - registrado`) uma única vez, das linhas mais
/// antigas para as mais novas. `registrado` = soma de `n_chegou` de todas as linhas do mesmo fornecedor e
/// insumo no período (abertas e fechadas), para não abater de novo o que o ERP já registrou.
pub fn alocar_nfs(linhas: &[LinhaPedido], nf_total: f64, registrado: f64) -> Vec<AlocacaoNf> {
    let mut sobra = (nf_total - registrado).max(0.0);
    let mut ordem: Vec<&LinhaPedido> = linhas.iter().collect();
    ordem.sort_by(|a, b| {
        a.data_pedido
            .cmp(&b.data_pedido)
            .then(a.pedido.cmp(&b.pedido))
            .then(a.id.cmp(&b.id))
    });
    let mut out = Vec::new();
    for l in ordem {
        let abate = l.pendente.max(0.0).min(sobra);
        sobra -= abate;
        out.push(AlocacaoNf { id: l.id, abatido: abate });
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusCobertura {
    Ok,
    Atencao,
    Falta,
    SemFormula,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusInsumo {
    Ok,
    DependeAtrasado,
    ChegaDepois,
    ChegaSemData,
    Falta,
}

impl StatusInsumo {
    fn gravidade(self) -> u8 {
        match self {
            StatusInsumo::Ok => 0,
            StatusInsumo::DependeAtrasado | StatusInsumo::ChegaDepois | StatusInsumo::ChegaSemData => 1,
            StatusInsumo::Falta => 2,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoAviso {
    LoteErpSemVinculo,
    LoteNaoEncontrado,
    PedidoAtrasado,
    PedidoSemPrevisao,
    PedidoPossivelmenteRecebido,
    RecebimentoParcial,
    BaseTambemPlanejada,
    ManualAntigo,
    /// Informativo: a última escolha do Edson para a base deste produto.
    SugestaoBase,
    /// A ordem diz que a base vem de uma ordem da base, mas não há nenhuma.
    BaseSemOrdem,
}

impl TipoAviso {
    /// Aviso que só informa/sugere: não deixa a ordem em "atenção".
    pub fn informativo(self) -> bool {
        matches!(self, TipoAviso::SugestaoBase)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Aviso {
    pub tipo: TipoAviso,
    pub mensagem: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ordem_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lote: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub candidatos: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insumo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pedido: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fornecedor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dias: Option<i64>,
}

impl Aviso {
    fn novo(tipo: TipoAviso, mensagem: String) -> Self {
        Aviso { tipo, mensagem, ordem_id: None, lote: None, candidatos: Vec::new(), insumo: None, pedido: None, fornecedor: None, dias: None }
    }
}

/// Substituto possível de um insumo que falta, com o que ele tem livre na data da ordem.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Equivalente {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub livre: f64,
    /// O livre do substituto cobre a necessidade inteira.
    pub cobre_tudo: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InsumoOrdem {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub necessario: f64,
    pub livre_na_data: f64,
    pub falta: f64,
    pub status: StatusInsumo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chega_em: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pedido: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fornecedor: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub equivalentes: Vec<Equivalente>,
    /// De onde vem o livre: livre_na_data = estoque - reserva + chegadas + manuais - consumo_anterior.
    pub estoque: f64,
    pub reserva: f64,
    pub chegadas: f64,
    pub manuais: f64,
    pub consumo_anterior: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoOrdem {
    pub id: String,
    pub produto: String,
    pub status: StatusCobertura,
    /// A ordem entra no consumo previsto? (false = já reservada/baixada no ERP)
    pub consome: bool,
    pub base_fonte: BaseFonte,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub bases: Vec<BaseRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motivo_sem_consumo: Option<String>,
    pub avisos: Vec<Aviso>,
    pub insumos: Vec<InsumoOrdem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChegadaInfo {
    pub pedido: i32,
    pub fornecedor: String,
    pub data: Option<NaiveDate>,
    pub quantidade: f64,
    pub quantidade_pedido: f64,
    pub atrasado: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumoInsumo {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub estoque: f64,
    pub reserva: f64,
    pub livre: f64,
    pub calibrado: bool,
    pub consumo_previsto: f64,
    pub chegadas: Vec<ChegadaInfo>,
    /// Primeira data em que a necessidade não fecha só com o estoque livre (falta, chega depois, pedido atrasado ou sem data).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acaba_em: Option<NaiveDate>,
    /// Quando um pedido cobre depois dessa data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chega_em: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaidaSimulacao {
    pub ordens: Vec<ResultadoOrdem>,
    pub insumos: Vec<ResumoInsumo>,
    /// Pontos que o Edson precisa revisar à mão (sem duplicatas).
    pub avisos: Vec<Aviso>,
}

// ---------------------------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------------------------

struct Linha<'a> {
    ordem: &'a OrdemEntrada,
    consome: bool,
    motivo: Option<String>,
    /// Necessidade efetiva depois de descontar a reserva do lote candidato (caso ambíguo).
    efetivas: Vec<Necessidade>,
}

fn data_efetiva(d: NaiveDate, hoje: NaiveDate) -> NaiveDate {
    d.max(hoje)
}

fn montar_grupos(ordens: &[OrdemEntrada]) -> Vec<Grupo> {
    let mut m: BTreeMap<String, Grupo> = BTreeMap::new();
    for o in ordens.iter().filter(|o| o.lote_erp.as_deref().map(str::trim).unwrap_or("").is_empty()) {
        let g = m.entry(o.grupo.clone()).or_insert_with(|| Grupo {
            chave: o.grupo.clone(),
            ordem_ids: Vec::new(),
            data: o.data,
            produtos: Vec::new(),
        });
        g.ordem_ids.push(o.id.clone());
        g.data = g.data.min(o.data);
        g.produtos.push((o.codigo_produto.clone(), o.kg));
    }
    m.into_values().collect()
}

/// Partes do disponível na data `d`: (livre hoje, chegadas, manuais, consumo já acumulado).
fn componentes(
    codigo: &str,
    d: NaiveDate,
    com_atrasados: bool,
    e: &EntradaSimulacao,
    consumido: &HashMap<String, f64>,
) -> (f64, f64, f64, f64) {
    let livre0 = e.estoque.get(codigo).map(|s| s.livre()).unwrap_or(0.0);
    let chegadas: f64 = e
        .chegadas
        .get(codigo)
        .map(|v| {
            v.iter()
                .filter_map(|c| {
                    let dt = c.data?;
                    let atrasado = dt < e.hoje;
                    if atrasado && !com_atrasados {
                        return None;
                    }
                    if data_efetiva(dt, e.hoje) <= d {
                        Some(c.quantidade)
                    } else {
                        None
                    }
                })
                .sum()
        })
        .unwrap_or(0.0);
    let manuais: f64 = e
        .manuais
        .get(codigo)
        .map(|v| v.iter().filter(|m| data_efetiva(m.data, e.hoje) <= d).map(|m| m.delta).sum())
        .unwrap_or(0.0);
    (livre0, chegadas, manuais, consumido.get(codigo).copied().unwrap_or(0.0))
}

/// Quanto está disponível do insumo na data `d`: livre hoje + chegadas + manuais - consumo já acumulado.
fn disponivel(
    codigo: &str,
    d: NaiveDate,
    com_atrasados: bool,
    e: &EntradaSimulacao,
    consumido: &HashMap<String, f64>,
) -> f64 {
    let (livre0, chegadas, manuais, gasto) = componentes(codigo, d, com_atrasados, e, consumido);
    livre0 + chegadas + manuais - gasto
}

pub fn simular(e: &EntradaSimulacao) -> SaidaSimulacao {
    // 1) Casamento das ordens ainda sem lote com lotes abertos no ERP.
    let grupos = montar_grupos(&e.ordens);
    let casamentos = casar_lotes(&grupos, &e.lotes_erp);
    let lote_por_numero: HashMap<&str, &LoteErp> = e.lotes_erp.iter().map(|l| (l.numero.as_str(), l)).collect();
    let casamento_por_grupo: HashMap<&str, &Casamento> =
        casamentos.iter().map(|c| (c.grupo.as_str(), c)).collect();
    // reserva ainda disponível para abater, por grupo ambíguo
    let mut sobra_reserva: HashMap<String, HashMap<String, f64>> = HashMap::new();
    for c in casamentos.iter().filter(|c| c.tipo == TipoCasamento::Ambiguo) {
        if let Some(l) = lote_por_numero.get(c.lote.as_str()) {
            sobra_reserva.insert(c.grupo.clone(), l.reserva.clone());
        }
    }

    // 2) Ordem cronológica.
    let mut ordenadas: Vec<&OrdemEntrada> = e.ordens.iter().collect();
    ordenadas.sort_by(|a, b| a.data.cmp(&b.data).then(a.sequencia.cmp(&b.sequencia)).then(a.id.cmp(&b.id)));

    let mut linhas: Vec<Linha> = Vec::new();
    for o in ordenadas {
        let tem_lote = !o.lote_erp.as_deref().map(str::trim).unwrap_or("").is_empty();
        let necessidades = match &o.necessidades {
            Some(n) => n.clone(),
            None => {
                linhas.push(Linha { ordem: o, consome: false, motivo: Some("sem_formula".into()), efetivas: Vec::new() });
                continue;
            }
        };
        if tem_lote && o.lote_no_erp {
            linhas.push(Linha {
                ordem: o,
                consome: false,
                motivo: Some("lote_aberto_ou_fechado_no_erp".into()),
                efetivas: Vec::new(),
            });
            continue;
        }
        if tem_lote {
            // Lote digitado que o ERP ainda não mostra: não há reserva dele, então a ordem consome.
            linhas.push(Linha { ordem: o, consome: true, motivo: None, efetivas: necessidades });
            continue;
        }
        match casamento_por_grupo.get(o.grupo.as_str()) {
            Some(c) if c.tipo == TipoCasamento::Provavel => {
                linhas.push(Linha {
                    ordem: o,
                    consome: false,
                    motivo: Some(format!("provavel_lote_{}", c.lote)),
                    efetivas: Vec::new(),
                });
            }
            Some(c) => {
                // Ambíguo: usa a maior das duas (reserva do lote x consumo da ordem), nunca a soma.
                let mut efetivas = Vec::new();
                if let Some(resto) = sobra_reserva.get_mut(&c.grupo) {
                    for n in &necessidades {
                        let disp = resto.entry(n.codigo.clone()).or_insert(0.0);
                        let abate = n.quantidade.min(*disp).max(0.0);
                        *disp -= abate;
                        let efetiva = n.quantidade - abate;
                        if efetiva > EPS {
                            efetivas.push(Necessidade { quantidade: efetiva, ..n.clone() });
                        }
                    }
                } else {
                    efetivas = necessidades;
                }
                linhas.push(Linha { ordem: o, consome: true, motivo: None, efetivas });
            }
            None => linhas.push(Linha { ordem: o, consome: true, motivo: None, efetivas: necessidades }),
        }
    }

    // 3) Percorre as ordens consumindo o livre em ordem cronológica.
    let mut consumido: HashMap<String, f64> = HashMap::new();
    let mut resultados: Vec<ResultadoOrdem> = Vec::new();
    let mut consumo_previsto: HashMap<String, f64> = HashMap::new();
    let mut avisos_globais: Vec<Aviso> = Vec::new();
    let mut ruptura: HashMap<String, (NaiveDate, Option<NaiveDate>)> = HashMap::new();

    for l in &linhas {
        let o = l.ordem;
        let mut avisos: Vec<Aviso> = Vec::new();

        if let Some(c) = casamento_por_grupo.get(o.grupo.as_str()) {
            if o.lote_erp.as_deref().map(str::trim).unwrap_or("").is_empty() {
                let (txt, cand) = match c.tipo {
                    TipoCasamento::Provavel => (
                        format!("O lote #{} do ERP provavelmente é esta ordem. Vincule o lote para confirmar.", c.lote),
                        vec![c.lote.clone()],
                    ),
                    TipoCasamento::Ambiguo => (
                        format!(
                            "Lote do ERP sem vínculo: pode ser {}. Contei a maior entre a reserva do ERP e o consumo da ordem, nunca as duas. Vincule o lote.",
                            c.candidatos.iter().map(|x| format!("#{x}")).collect::<Vec<_>>().join(", ")
                        ),
                        c.candidatos.clone(),
                    ),
                };
                let mut a = Aviso::novo(TipoAviso::LoteErpSemVinculo, txt);
                a.ordem_id = Some(o.id.clone());
                a.lote = Some(c.lote.clone());
                a.candidatos = cand;
                avisos.push(a);
            }
        }
        if !o.lote_erp.as_deref().map(str::trim).unwrap_or("").is_empty() && !o.lote_no_erp {
            let mut a = Aviso::novo(
                TipoAviso::LoteNaoEncontrado,
                format!("O lote {} não foi encontrado no ERP. Verifique a digitação.", o.lote_erp.clone().unwrap_or_default()),
            );
            a.ordem_id = Some(o.id.clone());
            a.lote = o.lote_erp.clone();
            avisos.push(a);
        }
        for base in &o.bases_usadas {
            let ha_ordem_da_base = e.ordens.iter().any(|x| x.id != o.id && x.codigo_produto.trim() == base.codigo.trim())
                || e.lotes_erp.iter().any(|l| l.produtos.iter().any(|p| p.0.trim() == base.codigo.trim()));
            match o.base_fonte {
                BaseFonte::Explodir if ha_ordem_da_base => {
                    let mut a = Aviso::novo(
                        TipoAviso::BaseTambemPlanejada,
                        format!(
                            "A base {} ({}) também está planejada em outra ordem; a matéria-prima pode estar contada em dobro. Se a ordem da base é quem baixa os insumos, marque a origem da base.",
                            base.descricao, base.codigo
                        ),
                    );
                    a.ordem_id = Some(o.id.clone());
                    a.insumo = Some(base.codigo.clone());
                    a.candidatos = vec![BaseFonte::OrdemBase.como_texto().to_string()];
                    avisos.push(a);
                }
                BaseFonte::OrdemBase if !ha_ordem_da_base => {
                    let mut a = Aviso::novo(
                        TipoAviso::BaseSemOrdem,
                        format!(
                            "A base {} ({}) está marcada como \"ordem da base\", mas não há ordem dela planejada. Planeje a ordem da base ou mude a origem.",
                            base.descricao, base.codigo
                        ),
                    );
                    a.ordem_id = Some(o.id.clone());
                    a.insumo = Some(base.codigo.clone());
                    avisos.push(a);
                }
                _ => {}
            }
        }
        if let Some(sug) = o.sugestao_base {
            if !o.bases_usadas.is_empty() && sug != o.base_fonte {
                let mut a = Aviso::novo(
                    TipoAviso::SugestaoBase,
                    format!("Da última vez este produto foi para {}.", sug.rotulo()),
                );
                a.ordem_id = Some(o.id.clone());
                a.candidatos = vec![sug.como_texto().to_string()];
                avisos.push(a);
            }
        }

        if o.necessidades.is_none() {
            resultados.push(ResultadoOrdem {
                id: o.id.clone(),
                produto: o.codigo_produto.clone(),
                status: StatusCobertura::SemFormula,
                consome: false,
                base_fonte: o.base_fonte,
                bases: o.bases_usadas.clone(),
                motivo_sem_consumo: l.motivo.clone(),
                avisos,
                insumos: Vec::new(),
            });
            continue;
        }

        let d_eval = data_efetiva(o.data, e.hoje);
        let mut insumos: Vec<InsumoOrdem> = Vec::new();
        for n in &l.efetivas {
            if e.sem_controle.contains(&n.codigo) {
                continue;
            }
            let sem_atrasados = disponivel(&n.codigo, d_eval, false, e, &consumido);
            let com_atrasados = disponivel(&n.codigo, d_eval, true, e, &consumido);
            let mut status = StatusInsumo::Ok;
            let mut chega_em = None;
            let mut pedido = None;
            let mut fornecedor = None;
            let mut falta = 0.0;

            if com_atrasados + EPS >= n.quantidade {
                if sem_atrasados + EPS < n.quantidade {
                    status = StatusInsumo::DependeAtrasado;
                    if let Some(c) = e.chegadas.get(&n.codigo).and_then(|v| {
                        v.iter().filter(|c| c.data.map(|d| d < e.hoje).unwrap_or(false)).min_by_key(|c| c.data)
                    }) {
                        pedido = Some(c.pedido);
                        fornecedor = Some(c.fornecedor.clone());
                    }
                }
            } else {
                falta = n.quantidade - com_atrasados;
                status = StatusInsumo::Falta;
                // Há data posterior em que as chegadas cobrem?
                let mut datas: Vec<NaiveDate> = e
                    .chegadas
                    .get(&n.codigo)
                    .map(|v| v.iter().filter_map(|c| c.data).map(|d| data_efetiva(d, e.hoje)).filter(|d| *d > d_eval).collect())
                    .unwrap_or_default();
                datas.sort();
                datas.dedup();
                for d in datas {
                    if disponivel(&n.codigo, d, true, e, &consumido) + EPS >= n.quantidade {
                        status = StatusInsumo::ChegaDepois;
                        chega_em = Some(d);
                        if let Some(c) = e
                            .chegadas
                            .get(&n.codigo)
                            .and_then(|v| v.iter().filter(|c| c.data.map(|x| data_efetiva(x, e.hoje)) == Some(d)).next())
                        {
                            pedido = Some(c.pedido);
                            fornecedor = Some(c.fornecedor.clone());
                        }
                        break;
                    }
                }
                if status == StatusInsumo::Falta {
                    let sem_data: f64 = e
                        .chegadas
                        .get(&n.codigo)
                        .map(|v| v.iter().filter(|c| c.data.is_none()).map(|c| c.quantidade).sum())
                        .unwrap_or(0.0);
                    if sem_data + EPS >= falta && sem_data > 0.0 {
                        status = StatusInsumo::ChegaSemData;
                        if let Some(c) = e.chegadas.get(&n.codigo).and_then(|v| v.iter().find(|c| c.data.is_none())) {
                            pedido = Some(c.pedido);
                            fornecedor = Some(c.fornecedor.clone());
                        }
                    }
                }
            }

            let desc = e
                .estoque
                .get(&n.codigo)
                .map(|s| s.descricao.clone())
                .filter(|d| !d.is_empty())
                .unwrap_or_else(|| n.descricao.clone());
            // Quem falta ou só cobre com pedido atrasado/futuro recebe a lista de equivalentes com saldo.
            let mut equivalentes: Vec<Equivalente> = Vec::new();
            if status != StatusInsumo::Ok {
                for eq in e.equivalentes.get(&n.codigo).into_iter().flatten() {
                    if eq == &n.codigo {
                        continue;
                    }
                    let livre = disponivel(eq, d_eval, false, e, &consumido);
                    if livre > EPS {
                        let est = e.estoque.get(eq);
                        equivalentes.push(Equivalente {
                            codigo: eq.clone(),
                            descricao: est.map(|s| s.descricao.clone()).unwrap_or_default(),
                            unidade: est.and_then(|s| s.unidade.clone()),
                            livre,
                            cobre_tudo: livre + EPS >= n.quantidade,
                        });
                    }
                }
                equivalentes.sort_by(|a, b| b.livre.partial_cmp(&a.livre).unwrap_or(std::cmp::Ordering::Equal));
            }
            let (_, chegadas_ate, manuais_ate, gasto_antes) = componentes(&n.codigo, d_eval, true, e, &consumido);
            if status != StatusInsumo::Ok {
                ruptura.entry(n.codigo.clone()).or_insert((d_eval, chega_em));
            }
            insumos.push(InsumoOrdem {
                codigo: n.codigo.clone(),
                descricao: desc,
                unidade: n.unidade.clone().or_else(|| e.estoque.get(&n.codigo).and_then(|s| s.unidade.clone())),
                necessario: n.quantidade,
                livre_na_data: com_atrasados,
                falta,
                status,
                chega_em,
                pedido,
                fornecedor,
                equivalentes,
                estoque: e.estoque.get(&n.codigo).map(|s| s.estoque).unwrap_or(0.0),
                reserva: e.estoque.get(&n.codigo).map(|s| s.reserva).unwrap_or(0.0),
                chegadas: chegadas_ate,
                manuais: manuais_ate,
                consumo_anterior: gasto_antes,
            });
            *consumido.entry(n.codigo.clone()).or_insert(0.0) += n.quantidade;
            *consumo_previsto.entry(n.codigo.clone()).or_insert(0.0) += n.quantidade;
        }

        let pior = insumos.iter().map(|i| i.status.gravidade()).max().unwrap_or(0);
        let mut status = match pior {
            2 => StatusCobertura::Falta,
            1 => StatusCobertura::Atencao,
            _ => StatusCobertura::Ok,
        };
        if status == StatusCobertura::Ok && avisos.iter().any(|a| !a.tipo.informativo()) {
            status = StatusCobertura::Atencao;
        }
        resultados.push(ResultadoOrdem {
            id: o.id.clone(),
            produto: o.codigo_produto.clone(),
            status,
            consome: l.consome,
            base_fonte: o.base_fonte,
            bases: o.bases_usadas.clone(),
            motivo_sem_consumo: l.motivo.clone(),
            avisos,
            insumos,
        });
    }
    // as ordens que não consomem também precisam de resultado (status ok)
    // (já foram adicionadas no laço acima com insumos vazios e status Ok/Atencao)

    // 4) Avisos globais: pedidos e manuais dos insumos envolvidos.
    let envolvidos: HashSet<&String> = consumo_previsto.keys().collect();
    for (codigo, chegadas) in &e.chegadas {
        if !envolvidos.contains(codigo) {
            continue;
        }
        for c in chegadas {
            let (tipo, msg) = if !c.nfs.is_empty() && c.quantidade <= EPS {
                (
                    Some(TipoAviso::PedidoPossivelmenteRecebido),
                    format!("Pedido {} ({}) possivelmente já recebido pela NF {}; não contei a chegada. Verifique.", c.pedido, c.fornecedor, c.nfs.join(", ")),
                )
            } else if !c.nfs.is_empty() && c.quantidade + EPS < c.quantidade_pedido {
                (
                    Some(TipoAviso::RecebimentoParcial),
                    format!("Pedido {} ({}) com possível recebimento parcial pela NF {}; contei só o restante.", c.pedido, c.fornecedor, c.nfs.join(", ")),
                )
            } else if c.data.is_none() {
                (Some(TipoAviso::PedidoSemPrevisao), format!("Pedido {} ({}) sem data de previsão. Ajuste a previsão no ERP.", c.pedido, c.fornecedor))
            } else if c.data.map(|d| d < e.hoje).unwrap_or(false) {
                let dias = (e.hoje - c.data.unwrap()).num_days();
                (
                    Some(TipoAviso::PedidoAtrasado),
                    format!("Pedido {} ({}) com previsão vencida há {} dia(s). Verifique e ajuste a data no ERP.", c.pedido, c.fornecedor, dias),
                )
            } else {
                (None, String::new())
            };
            if let Some(t) = tipo {
                let mut a = Aviso::novo(t, msg);
                a.insumo = Some(codigo.clone());
                a.pedido = Some(c.pedido);
                a.fornecedor = Some(c.fornecedor.clone());
                if t == TipoAviso::PedidoAtrasado {
                    a.dias = c.data.map(|d| (e.hoje - d).num_days());
                }
                avisos_globais.push(a);
            }
        }
    }
    for (codigo, manuais) in &e.manuais {
        if !envolvidos.contains(codigo) {
            continue;
        }
        for m in manuais {
            let idade = (e.hoje - m.data).num_days();
            if idade > MANUAL_ANTIGO_DIAS {
                let mut a = Aviso::novo(
                    TipoAviso::ManualAntigo,
                    format!("Ordem manual {} aberta há {} dias. Verifique se já foi lançada no ERP.", m.numero, idade),
                );
                a.insumo = Some(codigo.clone());
                a.dias = Some(idade);
                avisos_globais.push(a);
            }
        }
    }
    // avisos por ordem também sobem para a lista de revisão
    for r in &resultados {
        for a in &r.avisos {
            avisos_globais.push(a.clone());
        }
    }
    let mut vistos: HashSet<(TipoAviso, Option<String>, Option<i32>, Option<String>)> = HashSet::new();
    avisos_globais.retain(|a| vistos.insert((a.tipo, a.insumo.clone(), a.pedido, a.ordem_id.clone())));

    // 5) Resumo por insumo.
    let mut resumo: Vec<ResumoInsumo> = Vec::new();
    let mut codigos: Vec<&String> = consumo_previsto.keys().collect();
    codigos.sort();
    for codigo in codigos {
        let est = e.estoque.get(codigo);
        resumo.push(ResumoInsumo {
            codigo: codigo.clone(),
            descricao: est.map(|s| s.descricao.clone()).unwrap_or_default(),
            unidade: est.and_then(|s| s.unidade.clone()),
            estoque: est.map(|s| s.estoque).unwrap_or(0.0),
            reserva: est.map(|s| s.reserva).unwrap_or(0.0),
            livre: est.map(|s| s.livre()).unwrap_or(0.0),
            calibrado: est.map(|s| s.calibrado).unwrap_or(false),
            consumo_previsto: consumo_previsto.get(codigo).copied().unwrap_or(0.0),
            acaba_em: ruptura.get(codigo).map(|r| r.0),
            chega_em: ruptura.get(codigo).and_then(|r| r.1),
            chegadas: e
                .chegadas
                .get(codigo)
                .map(|v| {
                    v.iter()
                        .map(|c| ChegadaInfo {
                            pedido: c.pedido,
                            fornecedor: c.fornecedor.clone(),
                            data: c.data,
                            quantidade: c.quantidade,
                            quantidade_pedido: c.quantidade_pedido,
                            atrasado: c.data.map(|d| d < e.hoje).unwrap_or(false),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        });
    }

    SaidaSimulacao { ordens: resultados, insumos: resumo, avisos: avisos_globais }
}

// ---------------------------------------------------------------------------------------------
// Relatório de faltas por linha (agrupa o resultado da simulação; não recalcula nada)
// ---------------------------------------------------------------------------------------------

/// Uma ordem (ou candidato da fila) já simulada, com o que o relatório precisa saber dela.
pub struct ItemFalta<'a> {
    pub produto: String,
    pub descricao: String,
    pub linha: String,
    pub kg: f64,
    pub data: Option<NaiveDate>,
    pub resultado: &'a ResultadoOrdem,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaltaInsumo {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub necessario: f64,
    pub livre_na_data: f64,
    pub falta: f64,
    pub status: StatusInsumo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chega_em: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pedido: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fornecedor: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub equivalentes: Vec<Equivalente>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaltasProduto {
    pub produto: String,
    pub descricao: String,
    pub kg: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<NaiveDate>,
    pub sem_formula: bool,
    pub embalagem: Vec<FaltaInsumo>,
    pub materia_prima: Vec<FaltaInsumo>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaltasLinha {
    pub linha: String,
    pub produtos: Vec<FaltasProduto>,
}

/// Agrupa por linha → produto → embalagem / matéria-prima. Só entram insumos que não estão OK
/// (falta, chega depois, pedido atrasado ou sem data) e produtos sem fórmula (não dá para avaliar).
pub fn agrupar_faltas(itens: Vec<ItemFalta>) -> Vec<FaltasLinha> {
    let mut por_linha: BTreeMap<String, Vec<FaltasProduto>> = BTreeMap::new();
    for it in itens {
        let r = it.resultado;
        let sem_formula = r.status == StatusCobertura::SemFormula;
        let mut embalagem = Vec::new();
        let mut materia_prima = Vec::new();
        for i in r.insumos.iter().filter(|i| i.status != StatusInsumo::Ok) {
            let f = FaltaInsumo {
                codigo: i.codigo.clone(),
                descricao: i.descricao.clone(),
                unidade: i.unidade.clone(),
                necessario: i.necessario,
                livre_na_data: i.livre_na_data,
                falta: i.falta,
                status: i.status,
                chega_em: i.chega_em,
                pedido: i.pedido,
                fornecedor: i.fornecedor.clone(),
                equivalentes: i.equivalentes.clone(),
            };
            if is_embalagem(&i.codigo, &i.descricao) {
                embalagem.push(f);
            } else {
                materia_prima.push(f);
            }
        }
        if !sem_formula && embalagem.is_empty() && materia_prima.is_empty() {
            continue;
        }
        let linha = if it.linha.trim().is_empty() { "Sem linha".to_string() } else { it.linha.trim().to_string() };
        por_linha.entry(linha).or_default().push(FaltasProduto {
            produto: it.produto,
            descricao: it.descricao,
            kg: it.kg,
            data: it.data,
            sem_formula,
            embalagem,
            materia_prima,
        });
    }
    por_linha
        .into_iter()
        .map(|(linha, mut produtos)| {
            produtos.sort_by(|a, b| a.data.cmp(&b.data).then(a.produto.cmp(&b.produto)));
            FaltasLinha { linha, produtos }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn nec(cod: &str, q: f64) -> Necessidade {
        Necessidade { codigo: cod.into(), descricao: format!("insumo {cod}"), unidade: Some("kg".into()), quantidade: q }
    }

    fn est(estoque: f64, reserva: f64) -> EstoqueItem {
        EstoqueItem { descricao: String::new(), unidade: Some("kg".into()), estoque, reserva, calibrado: false }
    }

    fn ordem(id: &str, data: &str, seq: i32, prod: &str, kg: f64, necs: Vec<Necessidade>) -> OrdemEntrada {
        OrdemEntrada {
            id: id.into(),
            data: d(data),
            sequencia: seq,
            codigo_produto: prod.into(),
            descricao: None,
            kg,
            lote_erp: None,
            lote_no_erp: false,
            grupo: id.into(),
            necessidades: Some(necs),
            bases_usadas: Vec::new(),
            base_fonte: BaseFonte::Explodir,
            sugestao_base: None,
            da_semana: true,
        }
    }

    fn base_entrada() -> EntradaSimulacao {
        EntradaSimulacao {
            hoje: d("2026-10-20"),
            estoque: HashMap::new(),
            chegadas: HashMap::new(),
            manuais: HashMap::new(),
            ordens: Vec::new(),
            lotes_erp: Vec::new(),
            equivalentes: HashMap::new(),
            sem_controle: HashSet::new(),
        }
    }

    fn res<'a>(s: &'a SaidaSimulacao, id: &str) -> &'a ResultadoOrdem {
        s.ordens.iter().find(|o| o.id == id).unwrap()
    }

    #[test]
    fn cobre_quando_ha_livre() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 20.0));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok);
        assert!((res(&s, "o1").insumos[0].livre_na_data - 80.0).abs() < 1e-9);
    }

    #[test]
    fn reserva_reduz_o_livre() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 70.0)); // livre 30
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Falta);
        assert!((res(&s, "o1").insumos[0].falta - 20.0).abs() < 1e-9);
    }

    #[test]
    fn consumo_se_acumula_entre_ordens_pela_data_e_sequencia() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 0.0));
        e.ordens.push(ordem("o2", "2026-10-21", 2, "P1", 100.0, vec![nec("A", 60.0)]));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 60.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok, "a primeira da sequência leva o estoque");
        assert_eq!(res(&s, "o2").status, StatusCobertura::Falta, "a segunda já não encontra 60");
        assert!((res(&s, "o2").insumos[0].livre_na_data - 40.0).abs() < 1e-9);
    }

    #[test]
    fn chegada_futura_cobre_e_vira_atencao_com_data() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(10.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 77, fornecedor: "Forn".into(), data: Some(d("2026-10-25")), quantidade: 100.0, quantidade_pedido: 100.0, nfs: vec![] }],
        );
        e.ordens.push(ordem("o1", "2026-10-22", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        let r = res(&s, "o1");
        assert_eq!(r.status, StatusCobertura::Atencao);
        assert_eq!(r.insumos[0].status, StatusInsumo::ChegaDepois);
        assert_eq!(r.insumos[0].chega_em, Some(d("2026-10-25")));
        assert_eq!(r.insumos[0].pedido, Some(77));
    }

    #[test]
    fn chegada_antes_da_ordem_conta() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(10.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 1, fornecedor: "F".into(), data: Some(d("2026-10-21")), quantidade: 100.0, quantidade_pedido: 100.0, nfs: vec![] }],
        );
        e.ordens.push(ordem("o1", "2026-10-23", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::Ok);
    }

    #[test]
    fn sem_cobertura_nenhuma_e_falta() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(10.0, 0.0));
        e.ordens.push(ordem("o1", "2026-10-22", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let r = simular(&e);
        assert_eq!(res(&r, "o1").status, StatusCobertura::Falta);
        assert_eq!(res(&r, "o1").insumos[0].chega_em, None);
    }

    #[test]
    fn pedido_atrasado_fica_na_conta_mas_pede_atencao_e_aviso() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(0.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 9, fornecedor: "F".into(), data: Some(d("2026-10-10")), quantidade: 100.0, quantidade_pedido: 100.0, nfs: vec![] }],
        );
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        let r = res(&s, "o1");
        assert_eq!(r.insumos[0].status, StatusInsumo::DependeAtrasado, "mantém na conta, sem decidir sozinho");
        assert_eq!(r.status, StatusCobertura::Atencao);
        assert!(s.avisos.iter().any(|a| a.tipo == TipoAviso::PedidoAtrasado && a.pedido == Some(9) && a.dias == Some(10)));
    }

    #[test]
    fn pedido_sem_data_nao_entra_na_linha_do_tempo_mas_avisa() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(0.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 5, fornecedor: "F".into(), data: None, quantidade: 100.0, quantidade_pedido: 100.0, nfs: vec![] }],
        );
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").insumos[0].status, StatusInsumo::ChegaSemData);
        assert!(s.avisos.iter().any(|a| a.tipo == TipoAviso::PedidoSemPrevisao));
    }

    #[test]
    fn manual_open_soma_e_subtrai_a_partir_da_data() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(10.0, 0.0));
        e.manuais.insert("A".into(), vec![Manual { numero: "M1".into(), data: d("2026-10-20"), delta: 100.0 }]);
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::Ok);
        e.manuais.insert("A".into(), vec![Manual { numero: "M2".into(), data: d("2026-10-20"), delta: -10.0 }]);
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::Falta);
    }

    #[test]
    fn manual_antigo_gera_aviso_mas_continua_na_conta() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(0.0, 0.0));
        e.manuais.insert("A".into(), vec![Manual { numero: "M9".into(), data: d("2026-10-01"), delta: 100.0 }]);
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok);
        assert!(s.avisos.iter().any(|a| a.tipo == TipoAviso::ManualAntigo));
    }

    #[test]
    fn ordem_com_lote_erp_nao_consome_de_novo() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 100.0)); // tudo reservado pelo lote aberto
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 100.0)]);
        o.lote_erp = Some("5001".into());
        o.lote_no_erp = true;
        e.ordens.push(o);
        let s = simular(&e);
        assert!(!res(&s, "o1").consome);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok);
        assert!(s.insumos.iter().all(|i| i.consumo_previsto <= EPS), "nada foi consumido em dobro");
    }

    #[test]
    fn lote_digitado_que_nao_existe_no_erp_consome_e_avisa() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(30.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]);
        o.lote_erp = Some("9999".into());
        o.lote_no_erp = false;
        e.ordens.push(o);
        let s = simular(&e);
        assert!(res(&s, "o1").consome);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Falta);
        assert!(res(&s, "o1").avisos.iter().any(|a| a.tipo == TipoAviso::LoteNaoEncontrado));
    }

    fn lote(num: &str, data: &str, prods: &[(&str, f64)], reserva: &[(&str, f64)]) -> LoteErp {
        LoteErp {
            numero: num.into(),
            data: d(data),
            produtos: prods.iter().map(|(c, k)| (c.to_string(), *k)).collect(),
            reserva: reserva.iter().map(|(c, q)| (c.to_string(), *q)).collect(),
        }
    }

    #[test]
    fn casamento_provavel_conta_uma_vez_so() {
        let mut e = base_entrada();
        // o ERP já reservou 50 de A para o lote 700; sem o casamento a ordem consumiria mais 50
        e.estoque.insert("A".into(), est(100.0, 50.0));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        e.lotes_erp.push(lote("700", "2026-10-21", &[("P1", 100.0)], &[("A", 50.0)]));
        let s = simular(&e);
        let r = res(&s, "o1");
        assert!(!r.consome, "casamento provável: a reserva do ERP já representa a ordem");
        assert_eq!(r.motivo_sem_consumo.as_deref(), Some("provavel_lote_700"));
        assert!(r.avisos.iter().any(|a| a.tipo == TipoAviso::LoteErpSemVinculo && a.lote.as_deref() == Some("700")));
        assert_eq!(r.status, StatusCobertura::Atencao, "vira aviso para vincular");
        assert!(s.insumos.is_empty());
    }

    #[test]
    fn casamento_ambiguo_usa_a_maior_das_duas_nunca_a_soma() {
        let mut e = base_entrada();
        // lote candidato com 100 kg (reserva 50); a ordem planeja 110 kg (consumo 55): diferença de 10% = casamento
        // fraco => ambíguo. Total contado = a maior das duas (55), não 105.
        e.estoque.insert("A".into(), est(100.0, 50.0)); // livre 50 (a reserva do lote já está fora)
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 110.0, vec![nec("A", 55.0)]));
        e.lotes_erp.push(lote("700", "2026-10-21", &[("P1", 100.0)], &[("A", 50.0)]));
        let s = simular(&e);
        let r = res(&s, "o1");
        assert!(r.consome);
        // soma efetiva = 55 - 50 = 5 (os 50 já estão na reserva) => total contado 55 = a maior das duas
        assert!((r.insumos[0].necessario - 5.0).abs() < 1e-9);
        assert_eq!(r.status, StatusCobertura::Atencao);
        assert!(r.avisos.iter().any(|a| a.tipo == TipoAviso::LoteErpSemVinculo));
    }

    #[test]
    fn casamento_ambiguo_com_reserva_maior_que_o_consumo_nao_soma_nada() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 80.0));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        e.lotes_erp.push(lote("700", "2026-10-26", &[("P1", 100.0)], &[("A", 80.0)])); // data longe -> fraco/ambíguo
        let s = simular(&e);
        let r = res(&s, "o1");
        assert!(r.insumos.is_empty() || r.insumos[0].necessario <= EPS);
    }

    #[test]
    fn lote_do_erp_nao_atende_duas_ordens() {
        let grupos = vec![
            Grupo { chave: "a".into(), ordem_ids: vec!["a".into()], data: d("2026-10-21"), produtos: vec![("P1".into(), 100.0)] },
            Grupo { chave: "b".into(), ordem_ids: vec!["b".into()], data: d("2026-10-21"), produtos: vec![("P1".into(), 100.0)] },
        ];
        let lotes = vec![lote("700", "2026-10-21", &[("P1", 100.0)], &[])];
        let c = casar_lotes(&grupos, &lotes);
        assert_eq!(c.len(), 1, "um único lote só casa com uma ordem");
        assert_eq!(c[0].tipo, TipoCasamento::Ambiguo, "empate entre duas ordens idênticas é ambíguo, não provável");
    }

    #[test]
    fn dois_lotes_candidatos_para_uma_ordem_viram_ambiguo_com_a_lista() {
        let grupos = vec![Grupo { chave: "a".into(), ordem_ids: vec!["a".into()], data: d("2026-10-21"), produtos: vec![("P1".into(), 100.0)] }];
        let lotes = vec![
            lote("700", "2026-10-21", &[("P1", 100.0)], &[]),
            lote("701", "2026-10-22", &[("P1", 101.0)], &[]),
        ];
        let c = casar_lotes(&grupos, &lotes);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].tipo, TipoCasamento::Ambiguo);
        assert_eq!(c[0].lote, "700", "fica com o de melhor pontuação");
        assert_eq!(c[0].candidatos.len(), 2);
    }

    #[test]
    fn produto_diferente_ou_quantidade_muito_diferente_nao_casa() {
        let grupos = vec![Grupo { chave: "a".into(), ordem_ids: vec![], data: d("2026-10-21"), produtos: vec![("P1".into(), 100.0)] }];
        assert!(casar_lotes(&grupos, &[lote("1", "2026-10-21", &[("P2", 100.0)], &[])]).is_empty());
        assert!(casar_lotes(&grupos, &[lote("2", "2026-10-21", &[("P1", 200.0)], &[])]).is_empty());
        assert!(casar_lotes(&grupos, &[lote("3", "2026-11-30", &[("P1", 100.0)], &[])]).is_empty());
    }

    #[test]
    fn batelada_com_varios_skus_casa_como_um_conjunto() {
        let grupos = vec![Grupo {
            chave: "b1".into(),
            ordem_ids: vec!["x".into(), "y".into()],
            data: d("2026-10-21"),
            produtos: vec![("P1".into(), 60.0), ("P2".into(), 40.0)],
        }];
        let c = casar_lotes(&grupos, &[lote("800", "2026-10-21", &[("P1", 60.0), ("P2", 40.0)], &[])]);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].tipo, TipoCasamento::Provavel);
        assert!(casar_lotes(&grupos, &[lote("801", "2026-10-21", &[("P1", 60.0)], &[])]).is_empty(), "conjunto de produtos diferente");
    }

    fn lp(id: i32, pedido: i32, dp: &str, pend: f64) -> LinhaPedido {
        LinhaPedido { id, pedido, data_pedido: Some(d(dp)), pendente: pend }
    }

    #[test]
    fn nf_cobre_o_pedido_inteiro() {
        let a = alocar_nfs(&[lp(1, 10, "2026-10-01", 100.0)], 100.0, 0.0);
        assert!((a[0].abatido - 100.0).abs() < 1e-9);
    }

    #[test]
    fn nf_parcial_abate_so_o_que_entrou() {
        let a = alocar_nfs(&[lp(1, 10, "2026-10-01", 100.0)], 40.0, 0.0);
        assert!((a[0].abatido - 40.0).abs() < 1e-9);
    }

    #[test]
    fn nf_ja_registrada_em_n_chegou_nao_abate_de_novo() {
        let a = alocar_nfs(&[lp(1, 10, "2026-10-01", 60.0)], 40.0, 40.0);
        assert_eq!(a[0].abatido, 0.0);
    }

    #[test]
    fn nf_e_distribuida_das_mais_antigas_para_as_mais_novas_sem_abater_duas_vezes() {
        let linhas = [lp(2, 20, "2026-10-10", 80.0), lp(1, 10, "2026-10-01", 50.0)];
        let a = alocar_nfs(&linhas, 100.0, 0.0);
        let get = |id| a.iter().find(|x| x.id == id).unwrap().abatido;
        assert!((get(1) - 50.0).abs() < 1e-9, "a mais antiga primeiro");
        assert!((get(2) - 50.0).abs() < 1e-9, "o resto vai para a seguinte");
        assert!((get(1) + get(2) - 100.0).abs() < 1e-9, "a NF não passa do que entrou");
    }

    #[test]
    fn pedido_possivelmente_recebido_sai_da_linha_do_tempo_e_avisa() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(20.0, 0.0)); // a NF já está no estoque
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 3, fornecedor: "F".into(), data: Some(d("2026-10-22")), quantidade: 0.0, quantidade_pedido: 100.0, nfs: vec!["1234".into()] }],
        );
        e.ordens.push(ordem("o1", "2026-10-23", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Falta, "a chegada não é contada junto com o estoque");
        assert!(s.avisos.iter().any(|a| a.tipo == TipoAviso::PedidoPossivelmenteRecebido && a.pedido == Some(3)));
    }

    #[test]
    fn recebimento_parcial_avisa_e_conta_so_o_restante() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(0.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 4, fornecedor: "F".into(), data: Some(d("2026-10-21")), quantidade: 60.0, quantidade_pedido: 100.0, nfs: vec!["77".into()] }],
        );
        e.ordens.push(ordem("o1", "2026-10-22", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok);
        assert!(s.avisos.iter().any(|a| a.tipo == TipoAviso::RecebimentoParcial));
    }

    #[test]
    fn base_tambem_planejada_gera_aviso() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(1000.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 10.0)]);
        o.bases_usadas = vec![BaseRef { codigo: "1.36.001".into(), descricao: "BASE PEROLADA".into() }];
        e.ordens.push(o);
        e.ordens.push(ordem("o2", "2026-10-21", 2, "1.36.001", 200.0, vec![nec("A", 10.0)]));
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.iter().any(|a| a.tipo == TipoAviso::BaseTambemPlanejada));
    }

    #[test]
    fn sem_formula_nao_consome_e_sinaliza() {
        let mut e = base_entrada();
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![]);
        o.necessidades = None;
        e.ordens.push(o);
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::SemFormula);
    }

    #[test]
    fn data_passada_avalia_no_dia_de_hoje() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 0.0));
        e.ordens.push(ordem("o1", "2026-10-10", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::Ok);
    }

    // ---- fórmula ----

    fn lf(cod: &str, desc: &str, q: f64) -> LinhaFormula {
        LinhaFormula { codigo: cod.into(), descricao: desc.into(), unidade: Some("kg".into()), quantidade: q }
    }

    #[test]
    fn necessidade_escala_pela_massa_quimica_e_ignora_embalagem_no_denominador() {
        let f = vec![lf("1", "AGUA", 80.0), lf("2", "ATIVO", 20.0), lf("9.02.1", "FRASCO 300ML", 500.0)];
        let n = necessidades_do_produto(&f, 200.0, &HashMap::new(), BaseFonte::Explodir).unwrap();
        let g = |c: &str| n.iter().find(|x| x.codigo == c).unwrap().quantidade;
        assert!((g("1") - 160.0).abs() < 1e-9);
        assert!((g("2") - 40.0).abs() < 1e-9);
        assert!((g("9.02.1") - 1000.0).abs() < 1e-9, "a embalagem usa o mesmo multiplicador (2x)");
    }

    #[test]
    fn sem_massa_quimica_nao_tem_formula() {
        let f = vec![lf("9.02.1", "FRASCO", 500.0)];
        assert!(necessidades_do_produto(&f, 100.0, &HashMap::new(), BaseFonte::Explodir).is_none());
        assert!(necessidades_do_produto(&[], 100.0, &HashMap::new(), BaseFonte::Explodir).is_none());
    }

    #[test]
    fn base_e_explodida_em_materias_primas_por_unidade() {
        let f = vec![lf("B", "BASE X", 50.0), lf("2", "ATIVO", 50.0)];
        let mut bases = HashMap::new();
        bases.insert("B".to_string(), vec![lf("10", "AGUA", 0.7), lf("11", "TENSO", 0.3)]); // soma 1 = por unidade
        let n = necessidades_do_produto(&f, 100.0, &bases, BaseFonte::Explodir).unwrap();
        let g = |c: &str| n.iter().find(|x| x.codigo == c).map(|x| x.quantidade).unwrap_or(0.0);
        assert!((g("10") - 35.0).abs() < 1e-9);
        assert!((g("11") - 15.0).abs() < 1e-9);
        assert!((g("2") - 50.0).abs() < 1e-9);
        assert_eq!(g("B"), 0.0, "a base não aparece como insumo");
    }

    #[test]
    fn base_com_formula_de_lote_de_referencia_e_normalizada() {
        let f = vec![lf("B", "BASE X", 100.0)];
        let mut bases = HashMap::new();
        bases.insert("B".to_string(), vec![lf("10", "AGUA", 70.0), lf("11", "TENSO", 30.0)]); // soma 100 = lote
        let n = necessidades_do_produto(&f, 100.0, &bases, BaseFonte::Explodir).unwrap();
        let g = |c: &str| n.iter().find(|x| x.codigo == c).unwrap().quantidade;
        assert!((g("10") - 70.0).abs() < 1e-9, "100 kg de base => 70 kg de água, não 7000");
        assert!((g("11") - 30.0).abs() < 1e-9);
    }

    #[test]
    fn insumo_repetido_na_formula_e_na_base_se_acumula() {
        let f = vec![lf("B", "BASE", 50.0), lf("10", "AGUA", 50.0)];
        let mut bases = HashMap::new();
        bases.insert("B".to_string(), vec![lf("10", "AGUA", 1.0)]);
        let n = necessidades_do_produto(&f, 100.0, &bases, BaseFonte::Explodir).unwrap();
        assert_eq!(n.len(), 1);
        assert!((n[0].quantidade - 100.0).abs() < 1e-9);
    }

    // ---- origem da base (base_fonte) ----

    fn base_perolada() -> Vec<BaseRef> {
        vec![BaseRef { codigo: "B".into(), descricao: "BASE PEROLADA".into() }]
    }

    #[test]
    fn base_de_estoque_ou_de_ordem_nao_baixa_os_insumos_da_base() {
        let f = vec![lf("B", "BASE PEROLADA", 80.0), lf("F", "FRAGRANCIA", 20.0)];
        let mut bases = HashMap::new();
        bases.insert("B".to_string(), vec![lf("10", "AGUA", 0.7), lf("11", "TENSO", 0.3)]);
        for fonte in [BaseFonte::Estoque, BaseFonte::OrdemBase] {
            let n = necessidades_do_produto(&f, 100.0, &bases, fonte).unwrap();
            assert_eq!(n.len(), 1, "só a fragrância sobra");
            assert_eq!(n[0].codigo, "F");
            assert!((n[0].quantidade - 20.0).abs() < 1e-9, "a massa da base continua no denominador");
        }
    }

    #[test]
    fn base_fonte_reconhece_os_valores_do_banco() {
        assert_eq!(BaseFonte::parse("estoque"), Some(BaseFonte::Estoque));
        assert_eq!(BaseFonte::parse(" ordem_base "), Some(BaseFonte::OrdemBase));
        assert_eq!(BaseFonte::parse("explodir"), Some(BaseFonte::Explodir));
        assert_eq!(BaseFonte::parse("outra"), None);
        assert_eq!(BaseFonte::OrdemBase.como_texto(), "ordem_base");
    }

    #[test]
    fn ordem_base_sem_ordem_da_base_avisa() {
        let mut e = base_entrada();
        e.estoque.insert("F".into(), est(100.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("F", 20.0)]);
        o.bases_usadas = base_perolada();
        o.base_fonte = BaseFonte::OrdemBase;
        e.ordens.push(o);
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.iter().any(|a| a.tipo == TipoAviso::BaseSemOrdem));
        assert_eq!(res(&s, "o1").status, StatusCobertura::Atencao);
    }

    #[test]
    fn ordem_base_com_ordem_da_base_planejada_nao_avisa() {
        let mut e = base_entrada();
        e.estoque.insert("F".into(), est(100.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("F", 20.0)]);
        o.bases_usadas = base_perolada();
        o.base_fonte = BaseFonte::OrdemBase;
        e.ordens.push(o);
        e.ordens.push(ordem("o2", "2026-10-20", 1, "B", 80.0, vec![nec("F", 1.0)]));
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.iter().all(|a| a.tipo != TipoAviso::BaseSemOrdem));
        assert_eq!(res(&s, "o1").status, StatusCobertura::Ok);
    }

    #[test]
    fn ordem_base_aceita_lote_da_base_aberto_no_erp() {
        let mut e = base_entrada();
        e.estoque.insert("F".into(), est(100.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("F", 20.0)]);
        o.bases_usadas = base_perolada();
        o.base_fonte = BaseFonte::OrdemBase;
        e.ordens.push(o);
        e.lotes_erp.push(LoteErp { numero: "900".into(), data: d("2026-10-20"), produtos: vec![("B".into(), 80.0)], reserva: HashMap::new() });
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.iter().all(|a| a.tipo != TipoAviso::BaseSemOrdem));
    }

    #[test]
    fn base_planejada_em_outra_ordem_sugere_marcar_ordem_da_base() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(1000.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 10.0)]);
        o.bases_usadas = base_perolada();
        e.ordens.push(o);
        e.ordens.push(ordem("o2", "2026-10-21", 2, "B", 80.0, vec![nec("A", 10.0)]));
        let s = simular(&e);
        let a = res(&s, "o1").avisos.iter().find(|a| a.tipo == TipoAviso::BaseTambemPlanejada).unwrap();
        assert_eq!(a.candidatos, vec!["ordem_base".to_string()]);
    }

    #[test]
    fn marcada_como_estoque_nao_avisa_de_base_em_dobro() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(1000.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 10.0)]);
        o.bases_usadas = base_perolada();
        o.base_fonte = BaseFonte::Estoque;
        e.ordens.push(o);
        e.ordens.push(ordem("o2", "2026-10-21", 2, "B", 80.0, vec![nec("A", 10.0)]));
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.is_empty());
    }

    #[test]
    fn sugestao_da_ultima_escolha_informa_sem_pedir_atencao() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(1000.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 10.0)]);
        o.bases_usadas = base_perolada();
        o.sugestao_base = Some(BaseFonte::Estoque);
        e.ordens.push(o);
        let s = simular(&e);
        let r = res(&s, "o1");
        let a = r.avisos.iter().find(|a| a.tipo == TipoAviso::SugestaoBase).unwrap();
        assert_eq!(a.candidatos, vec!["estoque".to_string()]);
        assert_eq!(r.status, StatusCobertura::Ok, "sugestão é informativa");
    }

    #[test]
    fn sugestao_igual_a_escolha_atual_some() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(1000.0, 0.0));
        let mut o = ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 10.0)]);
        o.bases_usadas = base_perolada();
        o.base_fonte = BaseFonte::Estoque;
        o.sugestao_base = Some(BaseFonte::Estoque);
        e.ordens.push(o);
        let s = simular(&e);
        assert!(res(&s, "o1").avisos.is_empty());
    }

    // ---- trocas de insumo e equivalentes ----

    fn troca(de: &str, para: &str, produto: Option<&str>) -> Troca {
        Troca { de: de.into(), para: para.into(), produto: produto.map(String::from) }
    }

    #[test]
    fn troca_geral_vale_para_qualquer_produto() {
        let n = aplicar_trocas(vec![nec("245", 2.0), nec("X", 1.0)], "P1", &[troca("245", "242", None)]);
        let cods: Vec<&str> = n.iter().map(|x| x.codigo.as_str()).collect();
        assert_eq!(cods, vec!["242", "X"]);
        assert!((n[0].quantidade - 2.0).abs() < 1e-9);
        assert!(n[0].descricao.is_empty(), "o chamador preenche a descrição do substituto");
    }

    #[test]
    fn troca_de_um_produto_nao_vale_para_outro_e_vence_a_geral() {
        let trocas = [troca("245", "242", Some("P1")), troca("245", "300", None)];
        let p1 = aplicar_trocas(vec![nec("245", 2.0)], "P1", &trocas);
        assert_eq!(p1[0].codigo, "242", "a troca do produto vence a geral");
        let p2 = aplicar_trocas(vec![nec("245", 2.0)], "P2", &trocas);
        assert_eq!(p2[0].codigo, "300");
        let so_produto = aplicar_trocas(vec![nec("245", 2.0)], "P2", &[troca("245", "242", Some("P1"))]);
        assert_eq!(so_produto[0].codigo, "245", "sem troca geral, outro produto fica como está");
    }

    #[test]
    fn troca_soma_quando_o_substituto_ja_esta_na_formula() {
        let n = aplicar_trocas(vec![nec("242", 1.0), nec("245", 2.0)], "P1", &[troca("245", "242", None)]);
        assert_eq!(n.len(), 1);
        assert!((n[0].quantidade - 3.0).abs() < 1e-9);
    }

    #[test]
    fn troca_nao_encadeia() {
        let n = aplicar_trocas(vec![nec("A", 1.0)], "P1", &[troca("A", "B", None), troca("B", "C", None)]);
        assert_eq!(n[0].codigo, "B", "A->B e B->C não viram A->C");
    }

    #[test]
    fn sem_trocas_nada_muda() {
        let n = aplicar_trocas(vec![nec("A", 1.0)], "P1", &[]);
        assert_eq!(n[0].codigo, "A");
    }

    #[test]
    fn insumo_que_falta_lista_equivalente_com_saldo() {
        let mut e = base_entrada();
        e.estoque.insert("245".into(), est(1.0, 0.0));
        e.estoque.insert("242".into(), est(1.0, 0.0));
        e.estoque.insert("999".into(), est(0.0, 0.0));
        e.equivalentes.insert("245".into(), vec!["242".into(), "999".into()]);
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("245", 2.0)]));
        let s = simular(&e);
        let i = &res(&s, "o1").insumos[0];
        assert_eq!(i.status, StatusInsumo::Falta);
        assert_eq!(i.equivalentes.len(), 1, "o equivalente sem saldo não entra");
        assert_eq!(i.equivalentes[0].codigo, "242");
        assert!(!i.equivalentes[0].cobre_tudo, "tem 1 de 2");
        assert!((i.equivalentes[0].livre - 1.0).abs() < 1e-9);
    }

    #[test]
    fn equivalente_que_cobre_tudo_e_marcado() {
        let mut e = base_entrada();
        e.estoque.insert("245".into(), est(0.0, 0.0));
        e.estoque.insert("242".into(), est(10.0, 0.0));
        e.equivalentes.insert("245".into(), vec!["242".into()]);
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("245", 2.0)]));
        let s = simular(&e);
        assert!(res(&s, "o1").insumos[0].equivalentes[0].cobre_tudo);
    }

    #[test]
    fn insumo_ok_nao_lista_equivalentes() {
        let mut e = base_entrada();
        e.estoque.insert("245".into(), est(10.0, 0.0));
        e.estoque.insert("242".into(), est(10.0, 0.0));
        e.equivalentes.insert("245".into(), vec!["242".into()]);
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("245", 2.0)]));
        assert!(res(&simular(&e), "o1").insumos[0].equivalentes.is_empty());
    }

    #[test]
    fn equivalente_ja_consumido_por_ordem_anterior_nao_aparece_cheio() {
        let mut e = base_entrada();
        e.estoque.insert("245".into(), est(0.0, 0.0));
        e.estoque.insert("242".into(), est(10.0, 0.0));
        e.equivalentes.insert("245".into(), vec!["242".into()]);
        e.ordens.push(ordem("o0", "2026-10-21", 1, "P0", 100.0, vec![nec("242", 9.0)]));
        e.ordens.push(ordem("o1", "2026-10-21", 2, "P1", 100.0, vec![nec("245", 2.0)]));
        let s = simular(&e);
        let eq = &res(&s, "o1").insumos[0].equivalentes[0];
        assert!((eq.livre - 1.0).abs() < 1e-9, "o 242 já foi consumido pela ordem anterior");
        assert!(!eq.cobre_tudo);
    }

    // ---- relatório de faltas por linha ----

    fn insumo_ord(cod: &str, desc: &str, status: StatusInsumo, falta: f64) -> InsumoOrdem {
        InsumoOrdem {
            codigo: cod.into(),
            descricao: desc.into(),
            unidade: Some("kg".into()),
            necessario: 10.0,
            livre_na_data: 10.0 - falta,
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

    fn res_ord(id: &str, status: StatusCobertura, insumos: Vec<InsumoOrdem>) -> ResultadoOrdem {
        ResultadoOrdem {
            id: id.into(),
            produto: String::new(),
            status,
            consome: true,
            base_fonte: BaseFonte::Explodir,
            bases: Vec::new(),
            motivo_sem_consumo: None,
            avisos: Vec::new(),
            insumos,
        }
    }

    fn item<'a>(p: &str, linha: &str, data: &str, r: &'a ResultadoOrdem) -> ItemFalta<'a> {
        ItemFalta { produto: p.into(), descricao: format!("desc {p}"), linha: linha.into(), kg: 100.0, data: Some(d(data)), resultado: r }
    }

    #[test]
    fn faltas_agrupam_por_linha_e_separam_embalagem_de_materia_prima() {
        let r1 = res_ord(
            "o1",
            StatusCobertura::Falta,
            vec![
                insumo_ord("9.02.001", "FRASCO 300ML", StatusInsumo::Falta, 50.0),
                insumo_ord("9.15.010", "LAURIL", StatusInsumo::ChegaDepois, 3.0),
                insumo_ord("9.15.011", "AGUA", StatusInsumo::Ok, 0.0),
            ],
        );
        let r2 = res_ord("o2", StatusCobertura::Ok, vec![insumo_ord("9.15.011", "AGUA", StatusInsumo::Ok, 0.0)]);
        let r3 = res_ord("o3", StatusCobertura::Falta, vec![insumo_ord("9.15.020", "ATIVO", StatusInsumo::Falta, 2.0)]);
        let g = agrupar_faltas(vec![item("P1", "Natum", "2026-10-21", &r1), item("P2", "Natum", "2026-10-21", &r2), item("P3", "Hair", "2026-10-22", &r3)]);
        assert_eq!(g.iter().map(|l| l.linha.as_str()).collect::<Vec<_>>(), vec!["Hair", "Natum"], "linhas em ordem alfabética");
        let natum = &g[1];
        assert_eq!(natum.produtos.len(), 1, "P2 está OK e não entra");
        assert_eq!(natum.produtos[0].embalagem.len(), 1);
        assert_eq!(natum.produtos[0].embalagem[0].codigo, "9.02.001");
        assert_eq!(natum.produtos[0].materia_prima.len(), 1, "a água OK não entra");
        assert_eq!(natum.produtos[0].materia_prima[0].status, StatusInsumo::ChegaDepois);
    }

    #[test]
    fn produto_sem_formula_aparece_para_nao_sumir() {
        let r = res_ord("o1", StatusCobertura::SemFormula, Vec::new());
        let g = agrupar_faltas(vec![item("P1", "Natum", "2026-10-21", &r)]);
        assert!(g[0].produtos[0].sem_formula);
    }

    #[test]
    fn linha_vazia_vira_sem_linha_e_ordena_por_data_e_produto() {
        let r = res_ord("o", StatusCobertura::Falta, vec![insumo_ord("9.15.1", "X", StatusInsumo::Falta, 1.0)]);
        let g = agrupar_faltas(vec![item("B", "", "2026-10-22", &r), item("A", " ", "2026-10-22", &r), item("Z", "", "2026-10-21", &r)]);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].linha, "Sem linha");
        let ordem: Vec<&str> = g[0].produtos.iter().map(|p| p.produto.as_str()).collect();
        assert_eq!(ordem, vec!["Z", "A", "B"]);
    }

    // ---- insumo sem controle de estoque (marcado só pelo Edson) ----

    #[test]
    fn insumo_sem_controle_nao_acusa_falta_nem_entra_no_consumo() {
        let mut e = base_entrada();
        e.estoque.insert("AGUA".into(), est(-14256.0, 13824.0)); // negativo no ERP
        e.estoque.insert("ATIVO".into(), est(0.0, 0.0));
        e.sem_controle.insert("AGUA".into());
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("AGUA", 85.0), nec("ATIVO", 2.0)]));
        let s = simular(&e);
        let r = res(&s, "o1");
        assert!(r.insumos.iter().all(|i| i.codigo != "AGUA"), "a água marcada some da avaliação");
        assert_eq!(r.insumos.len(), 1);
        assert_eq!(r.insumos[0].codigo, "ATIVO", "os demais continuam controlados");
        assert_eq!(r.status, StatusCobertura::Falta);
        assert!(s.insumos.iter().all(|i| i.codigo != "AGUA"));
    }

    #[test]
    fn sem_marcacao_o_estoque_negativo_continua_acusando_falta() {
        let mut e = base_entrada();
        e.estoque.insert("AGUA".into(), est(-14256.0, 13824.0));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("AGUA", 85.0)]));
        assert_eq!(res(&simular(&e), "o1").status, StatusCobertura::Falta, "nada é marcado sozinho");
    }

    #[test]
    fn acaba_em_e_a_primeira_data_em_que_o_livre_nao_cobre() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 0.0));
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 60.0)]));
        e.ordens.push(ordem("o2", "2026-10-23", 1, "P1", 100.0, vec![nec("A", 60.0)]));
        e.ordens.push(ordem("o3", "2026-10-26", 1, "P1", 100.0, vec![nec("A", 60.0)]));
        let s = simular(&e);
        let a = s.insumos.iter().find(|i| i.codigo == "A").unwrap();
        assert_eq!(a.acaba_em, Some(d("2026-10-23")), "o2 já não encontra 60 (sobram 40)");
        assert_eq!(a.chega_em, None);
    }

    #[test]
    fn acaba_em_guarda_quando_o_pedido_chega() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(50.0, 0.0));
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 7, fornecedor: "F".into(), data: Some(d("2026-10-25")), quantidade: 100.0, quantidade_pedido: 100.0, nfs: Vec::new() }],
        );
        e.ordens.push(ordem("o1", "2026-10-22", 1, "P1", 100.0, vec![nec("A", 80.0)]));
        let s = simular(&e);
        let a = s.insumos.iter().find(|i| i.codigo == "A").unwrap();
        assert_eq!(a.acaba_em, Some(d("2026-10-22")));
        assert_eq!(a.chega_em, Some(d("2026-10-25")));
    }

    #[test]
    fn insumo_coberto_nao_tem_acaba_em() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(500.0, 0.0));
        e.ordens.push(ordem("o1", "2026-10-22", 1, "P1", 100.0, vec![nec("A", 80.0)]));
        assert_eq!(simular(&e).insumos[0].acaba_em, None);
    }

    #[test]
    fn insumo_explica_de_onde_vem_o_livre() {
        let mut e = base_entrada();
        e.estoque.insert("A".into(), est(100.0, 30.0)); // livre hoje 70
        e.chegadas.insert(
            "A".into(),
            vec![Chegada { pedido: 1, fornecedor: "F".into(), data: Some(d("2026-10-22")), quantidade: 20.0, quantidade_pedido: 20.0, nfs: Vec::new() }],
        );
        e.ordens.push(ordem("o1", "2026-10-21", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        e.ordens.push(ordem("o2", "2026-10-23", 1, "P1", 100.0, vec![nec("A", 50.0)]));
        let s = simular(&e);
        let i2 = &res(&s, "o2").insumos[0];
        assert_eq!((i2.estoque, i2.reserva, i2.chegadas, i2.consumo_anterior), (100.0, 30.0, 20.0, 50.0));
        let conta = i2.estoque - i2.reserva + i2.chegadas + i2.manuais - i2.consumo_anterior;
        assert!((conta - i2.livre_na_data).abs() < 1e-9, "a conta explicada bate com o livre mostrado");
        assert!((i2.livre_na_data - 40.0).abs() < 1e-9);
    }
}
