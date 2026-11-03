//! "Seguir sequência" do Planejamento Semanal no servidor (`POST /api/producao/planejamento/sugerir-sequencia`).
//!
//! Dois pedaços:
//! - **Heurística** (funções puras, porta de `Frontend/src/modules/producao/lib/heuristicaPlanejamento.ts`): quais reatores
//!   servem ao produto, como dividir em bateladas, em qual dia cada batelada cai.
//! - **Sequência**: percorre a fila da semana (manuais por prioridade, depois automáticos por EFP) e só aceita o item cujos
//!   insumos e embalagens estão **100% cobertos**, contando o quadro da semana e o que a própria sequência já colocou
//!   (acumulado). O que falta vai para a lista de pulados, com o motivo.
//!
//! Escrita em 2 passos: sem `confirmar=true` devolve a prévia (bateladas propostas e pulados); com ele grava as ordens
//! pelo mesmo serviço de `gravar_ordens_planejamento`, consumindo a fila manual na mesma transação, e audita.
//!
//! Decisão do Edson (2026-10-27): a capacidade do reator limita só o tamanho de cada batelada, nunca o total do dia.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Extension, Json, Router,
};
use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use crate::core::acao::{corpo_acao, executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::core::catalogo::{param, Acao};
use crate::core::db::Db;
use crate::core::feriados;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::cobertura::store::{self, canon, Contexto};
use crate::modules::producao::cobertura::{Proposta, Simulador};
use crate::modules::producao::fila_auto::{self, coberto_total, faltas_do_resultado, Falta, ItemCalculado};
use crate::modules::producao::planejamento::{gravar_planejamento_em, PedidoConsumoFila, PlanejamentoItemDto};
use crate::modules::producao::processo::LIMITE_BOMBONA_QUENTE_KG;
use crate::modules::producao::{auditoria, permissao, reatores};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/planejamento/sugerir-sequencia", post(sugerir_rota))
}

/// Ações da sequência descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::gravacao(
        "sugerir_sequencia_planejamento",
        permissao::MODULO_PLANEJAMENTO,
        "Propõe e grava a sequência de um ou mais dias da semana a partir da fila (manuais por prioridade, depois automáticos por EFP). Só entra item com 100% dos insumos e embalagens cobertos, contando o quadro e o que a própria sequência já colocou; o resto vem em `pulados` com o que falta. Sem `confirmar=true` mostra só a prévia (bateladas por dia e reator); com ele grava as ordens e consome a fila manual na mesma transação. Para encher um dia por vez, passe `dias` com esse dia.",
        "POST",
        "/api/producao/planejamento/sugerir-sequencia",
        true,
        vec![
            param("week", "corpo", "texto", false, "Semana 2026-W43; padrão: semana de hoje."),
            param("dias", "corpo", "lista de datas AAAA-MM-DD", false, "Dias da semana a preencher; vazio = todos os dias úteis (segunda a sexta, sem feriado)."),
            param("limite_itens", "corpo", "inteiro", false, "No máximo quantos itens da fila entram."),
            param("motivo", "corpo", "texto", false, "Por que está sendo gravado (vai para a auditoria)."),
            param("confirmar", "corpo", "booleano", false, "true para gravar de fato; sem ele só a prévia."),
        ],
    )]
}

// ---------------------------------------------------------------------------------------------
// Heurística (funções puras)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct ReatorPlano {
    pub id: String,
    pub capacidade_kg: f64,
    pub tipo: String,
    pub ordem: i32,
    pub ativo: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PerfilProducao {
    pub codigo: String,
    /// Massa total a produzir, em kg.
    pub kg: f64,
    pub is_quente: bool,
    pub is_shampoo: bool,
    pub can_bombona: bool,
    pub exclusivo: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Cenario {
    Shampoo,
    R40,
    BombonaQuente,
    BombonaFrio,
    Reator,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Batelada {
    pub codigo: String,
    pub reator_id: String,
    pub dia: NaiveDate,
    /// Massa da batelada em kg (nunca passa da capacidade do reator).
    pub kg: f64,
    pub recipiente: String,
    /// `frio`, `quente`, `caldeira`, `agua_caldeira` ou `resistencia`.
    pub processo_termico: &'static str,
    pub cenario: Cenario,
    /// 1-based; `partes` > 1 quando o produto foi dividido por passar da maior capacidade compatível.
    pub parte: usize,
    pub partes: usize,
}

fn e_reator_shampoo(r: &ReatorPlano) -> bool {
    r.tipo == "caldeira_shampoo" || r.id == "R_1000_SHAMPOO" || r.id == "R_1000"
}
fn e_bombona(r: &ReatorPlano) -> bool {
    r.tipo == "bombona" || r.id == "BOMBONAS"
}
fn e_r40(r: &ReatorPlano) -> bool {
    r.id == "R_40"
}

/// Ordena reatores pelo menor em que a massa caiba (capacidade >= kg, do menor para o maior);
/// depois os que não comportam, do maior para o menor. Empate mantém a ordem original.
pub fn ordenar_reatores_por_caber(reatores: &[ReatorPlano], req_kg: f64) -> Vec<ReatorPlano> {
    let mut cabem: Vec<ReatorPlano> = reatores.iter().filter(|r| r.capacidade_kg >= req_kg).cloned().collect();
    cabem.sort_by(|a, b| a.capacidade_kg.partial_cmp(&b.capacidade_kg).unwrap_or(std::cmp::Ordering::Equal));
    let mut nao_cabem: Vec<ReatorPlano> = reatores.iter().filter(|r| r.capacidade_kg < req_kg).cloned().collect();
    nao_cabem.sort_by(|a, b| b.capacidade_kg.partial_cmp(&a.capacidade_kg).unwrap_or(std::cmp::Ordering::Equal));
    cabem.extend(nao_cabem);
    cabem
}

/// Dias em que o produto pode entrar: nunca em dia já tomado por um exclusivo;
/// se o produto é exclusivo, só em dia sem nenhuma ordem (existente ou proposta).
pub fn dias_permitidos(dias: &[NaiveDate], exclusivo: bool, ocupados: &HashSet<NaiveDate>, exclusivos: &HashSet<NaiveDate>) -> Vec<NaiveDate> {
    dias.iter().copied().filter(|d| !exclusivos.contains(d) && (!exclusivo || !ocupados.contains(d))).collect()
}

/// Reatores compatíveis com o tipo do produto e com o porte pedido (shampoo, quente pequeno, bombona, caldeira/resistência).
/// Ids antigos (`R_1000_SHAMPOO`, `R_40`, `BOMBONAS`) valem como reserva quando o tipo não foi configurado.
pub fn reatores_do_perfil(reatores: &[ReatorPlano], kg: f64, is_quente: bool, is_shampoo: bool, can_bombona: bool) -> (Cenario, Vec<ReatorPlano>) {
    let ativos: Vec<&ReatorPlano> = reatores.iter().filter(|r| r.ativo).collect();
    let escolher = |f: &dyn Fn(&ReatorPlano) -> bool| -> Vec<ReatorPlano> { ativos.iter().filter(|r| f(r)).map(|r| (*r).clone()).collect() };
    if is_shampoo && kg >= 450.0 {
        let c = escolher(&e_reator_shampoo);
        if !c.is_empty() {
            return (Cenario::Shampoo, c);
        }
    }
    if is_quente && kg <= 45.0 {
        let c = escolher(&e_r40);
        if !c.is_empty() {
            return (Cenario::R40, c);
        }
    }
    if can_bombona && (if is_quente { kg <= LIMITE_BOMBONA_QUENTE_KG } else { kg <= 200.0 }) {
        let c = escolher(&e_bombona);
        if !c.is_empty() {
            return (if is_quente { Cenario::BombonaQuente } else { Cenario::BombonaFrio }, c);
        }
    }
    (Cenario::Reator, escolher(&|r| !e_reator_shampoo(r) && !e_bombona(r) && !e_r40(r)))
}

/// Divide a massa em partes iguais (1 casa decimal) de no máximo `capacidade` kg cada; a soma é sempre `kg`.
pub fn dividir_em_bateladas(kg: f64, capacidade: f64) -> Vec<f64> {
    if !(kg > 0.0) || !(capacidade > 0.0) {
        return Vec::new();
    }
    let n = ((kg / capacidade - 1e-9).ceil() as usize).max(1);
    let base = ((kg / n as f64) * 10.0).floor() / 10.0;
    let mut partes = vec![base; n];
    partes[n - 1] = ((kg - base * (n - 1) as f64) * 10.0).round() / 10.0;
    // sobra do arredondamento nunca pode estourar a capacidade
    if partes[n - 1] > capacidade {
        let resto = ((partes[n - 1] - capacidade) * 10.0).round() / 10.0;
        partes[n - 1] = capacidade;
        partes[0] = ((partes[0] + resto) * 10.0).round() / 10.0;
    }
    partes
}

fn dimensionar(cenario: Cenario, reator: &ReatorPlano, b: f64) -> (f64, String) {
    let cap = reator.capacidade_kg;
    match cenario {
        Cenario::Shampoo => (cap.min(b.round().max(1.0)), format!("Reator {cap}kg")),
        Cenario::R40 => (cap.min(b.max(20.0)), "Reator 40kg".to_string()),
        Cenario::BombonaQuente | Cenario::BombonaFrio => {
            let tamanho: f64 = if b <= 60.0 {
                50.0
            } else if b <= 120.0 {
                100.0
            } else {
                200.0
            };
            (cap.min(tamanho.max(b.round())), format!("Bombona {tamanho}kg"))
        }
        // dimensiona pela necessidade, sem superdimensionar o tanque
        Cenario::Reator => (cap.min(((b * 10.0).round() / 10.0).max(1.0)), format!("Reator {cap}kg")),
    }
}

fn processo_de(cenario: Cenario, reator: &ReatorPlano, is_quente: bool) -> &'static str {
    match cenario {
        Cenario::Shampoo | Cenario::BombonaFrio => "frio",
        Cenario::R40 => "quente",
        Cenario::BombonaQuente => "agua_caldeira",
        Cenario::Reator if !is_quente => "frio",
        Cenario::Reator => {
            if reator.id == "R_100" {
                "resistencia"
            } else {
                "caldeira"
            }
        }
    }
}

/// Carga e ocupação dos dias enquanto se distribui (quadro existente + o que a sequência já colocou).
#[derive(Debug, Clone, Default)]
pub struct EstadoPlano {
    /// kg já planejados por dia, para balancear a carga.
    pub carga: HashMap<NaiveDate, f64>,
    /// Dias que já têm ordem (existente ou proposta), para produto exclusivo.
    pub dias_ocupados: HashSet<NaiveDate>,
    /// Dias tomados por um produto exclusivo (ninguém mais entra).
    pub dias_exclusivos: HashSet<NaiveDate>,
    pub dias_caldeira: BTreeSet<NaiveDate>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemLugar {
    SemQuantidade,
    SemReator,
    SemDia,
}

/// Distribui um produto em bateladas nos dias permitidos: cada batelada vai para o dia de menor carga em kg (empate: o mais
/// cedo) e para o menor reator em que ela caiba. A divisão só acontece quando a massa passa da maior capacidade compatível.
/// Só altera o `estado` quando consegue; senão devolve o motivo.
pub fn distribuir(estado: &mut EstadoPlano, perfil: &PerfilProducao, reatores: &[ReatorPlano], dias: &[NaiveDate]) -> Result<Vec<Batelada>, SemLugar> {
    if !(perfil.kg > 0.0) {
        return Err(SemLugar::SemQuantidade);
    }
    let (cenario, candidatos) = reatores_do_perfil(reatores, perfil.kg, perfil.is_quente, perfil.is_shampoo, perfil.can_bombona);
    if candidatos.is_empty() {
        return Err(SemLugar::SemReator);
    }
    let permitidos = dias_permitidos(dias, perfil.exclusivo, &estado.dias_ocupados, &estado.dias_exclusivos);
    if permitidos.is_empty() {
        return Err(SemLugar::SemDia);
    }
    let maior_cap = candidatos.iter().map(|c| c.capacidade_kg).fold(f64::MIN, f64::max);
    let partes = dividir_em_bateladas(perfil.kg, maior_cap);
    let mut ordenados = candidatos.clone();
    ordenados.sort_by_key(|r| r.ordem);
    let mut usados: BTreeSet<NaiveDate> = BTreeSet::new();
    let mut bateladas = Vec::with_capacity(partes.len());

    for (i, parte_kg) in partes.iter().enumerate() {
        // menor reator em que a batelada caiba (empate: o de menor `ordem`)
        let reator = ordenar_reatores_por_caber(&ordenados, *parte_kg).remove(0);
        let dia = permitidos
            .iter()
            .copied()
            .reduce(|melhor, d| if estado.carga.get(&d).copied().unwrap_or(0.0) < estado.carga.get(&melhor).copied().unwrap_or(0.0) { d } else { melhor })
            .expect("há dia permitido");
        let (kg, recipiente) = dimensionar(cenario, &reator, *parte_kg);
        *estado.carga.entry(dia).or_insert(0.0) += kg;
        usados.insert(dia);
        let processo_termico = processo_de(cenario, &reator, perfil.is_quente);
        if processo_termico != "frio" {
            estado.dias_caldeira.insert(dia);
        }
        bateladas.push(Batelada {
            codigo: perfil.codigo.clone(),
            reator_id: reator.id.clone(),
            dia,
            kg,
            recipiente,
            processo_termico,
            cenario,
            parte: i + 1,
            partes: partes.len(),
        });
    }
    for d in usados {
        estado.dias_ocupados.insert(d);
        if perfil.exclusivo {
            estado.dias_exclusivos.insert(d);
        }
    }
    Ok(bateladas)
}

/// Distribui os produtos (já em ordem de urgência) nos dias úteis da semana. Produto sem reator compatível, sem dia livre
/// ou sem quantidade vai em `sem_lugar`.
pub fn planejar_semana(
    perfis: &[PerfilProducao],
    reatores: &[ReatorPlano],
    dias: &[NaiveDate],
    inicial: EstadoPlano,
) -> (Vec<Batelada>, Vec<String>, BTreeSet<NaiveDate>) {
    let mut estado = inicial;
    let mut bateladas = Vec::new();
    let mut sem_lugar = Vec::new();
    for perfil in perfis {
        match distribuir(&mut estado, perfil, reatores, dias) {
            Ok(b) => bateladas.extend(b),
            Err(_) => sem_lugar.push(perfil.codigo.clone()),
        }
    }
    (bateladas, sem_lugar, estado.dias_caldeira)
}

// ---------------------------------------------------------------------------------------------
// Sequência: o que da fila entra, só com insumos 100% cobertos
// ---------------------------------------------------------------------------------------------

/// Item da fila a tentar encaixar.
#[derive(Debug, Clone)]
pub struct ItemSequencia {
    pub automatico: bool,
    pub fila_id: Option<String>,
    /// Código canônico do produto.
    pub codigo: String,
    pub descricao: String,
    pub perfil: PerfilProducao,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pulado {
    pub codigo: String,
    pub descricao: String,
    pub origem: &'static str,
    /// `ja_planejado`, `sem_quantidade`, `sem_reator_compativel`, `sem_dia`, `sem_formula` ou `falta_insumo`.
    pub motivo: &'static str,
    pub detalhe: String,
    pub falta: Vec<Falta>,
}

pub struct Aceito {
    /// Posição do item na lista recebida.
    pub indice: usize,
    pub bateladas: Vec<Batelada>,
}

pub struct PlanoSequencia {
    pub aceitos: Vec<Aceito>,
    pub pulados: Vec<Pulado>,
    /// Itens que sobraram depois de atingir o limite pedido (não foram nem tentados).
    pub nao_tentados: usize,
    pub dias_caldeira: BTreeSet<NaiveDate>,
}

fn origem_do(item: &ItemSequencia) -> &'static str {
    if item.automatico {
        "automatica"
    } else {
        "manual"
    }
}

/// Percorre os itens na ordem recebida (guloso). Cada candidato é distribuído nos dias (carga e exclusivos do que já entrou),
/// simulado junto com o quadro e as bateladas já aceitas, e só entra se todas as suas bateladas ficam 100% cobertas sem
/// tirar a cobertura do que já tinha entrado. Aceito soma ao acumulado; recusado não deixa rastro.
pub fn montar_sequencia(
    ctx: &Contexto,
    itens: &[ItemSequencia],
    reatores: &[ReatorPlano],
    dias: &[NaiveDate],
    inicial: EstadoPlano,
    limite: Option<usize>,
) -> PlanoSequencia {
    let mut estado = inicial;
    let mut sim = Simulador::novo(ctx);
    let mut aceitos: Vec<Aceito> = Vec::new();
    let mut pulados: Vec<Pulado> = Vec::new();
    let mut nao_tentados = 0;

    for (indice, item) in itens.iter().enumerate() {
        if limite.is_some_and(|l| aceitos.len() >= l) {
            nao_tentados = itens.len() - indice;
            break;
        }
        let pula = |motivo: &'static str, detalhe: String, falta: Vec<Falta>| Pulado {
            codigo: item.codigo.clone(),
            descricao: item.descricao.clone(),
            origem: origem_do(item),
            motivo,
            detalhe,
            falta,
        };
        let mut tentativa = estado.clone();
        let bateladas = match distribuir(&mut tentativa, &item.perfil, reatores, dias) {
            Ok(b) => b,
            Err(SemLugar::SemQuantidade) => {
                pulados.push(pula("sem_quantidade", "O item não tem quantidade em kg para produzir.".into(), Vec::new()));
                continue;
            }
            Err(SemLugar::SemReator) => {
                pulados.push(pula("sem_reator_compativel", format!("Nenhum reator ativo serve para {} kg deste produto.", item.perfil.kg), Vec::new()));
                continue;
            }
            Err(SemLugar::SemDia) => {
                pulados.push(pula("sem_dia", "Nenhum dia livre para este produto (exclusivo ou dias tomados por outro exclusivo).".into(), Vec::new()));
                continue;
            }
        };
        let propostas: Vec<Proposta> = bateladas
            .iter()
            .enumerate()
            .map(|(i, b)| Proposta { id: format!("seq:{indice}:{i}"), codigo: item.codigo.clone(), kg: b.kg, data: b.dia })
            .collect();
        let av = sim.avaliar(&propostas);
        let todas_cobertas = av.novas.len() == propostas.len() && av.novas.iter().all(coberto_total) && av.aceitas.iter().all(coberto_total);
        if !todas_cobertas {
            if av.novas.iter().any(|r| r.status == crate::modules::producao::cobertura::calc::StatusCobertura::SemFormula) {
                pulados.push(pula("sem_formula", "Sem fórmula cadastrada para avaliar os insumos.".into(), Vec::new()));
            } else {
                let sem_cobertura: Vec<&_> = av.novas.iter().chain(av.aceitas.iter()).filter(|r| !coberto_total(r)).collect();
                let falta = faltas_do_resultado(&sem_cobertura);
                let nomes = falta.iter().take(3).map(|f| f.descricao.clone()).collect::<Vec<_>>().join(", ");
                pulados.push(pula("falta_insumo", format!("Faltam insumos para produzir: {nomes}."), falta));
            }
            continue;
        }
        sim.aceitar(&propostas);
        estado = tentativa;
        aceitos.push(Aceito { indice, bateladas });
    }
    PlanoSequencia { aceitos, pulados, nao_tentados, dias_caldeira: estado.dias_caldeira }
}

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct SequenciaBody {
    pub week: Option<String>,
    #[serde(default)]
    pub dias: Vec<String>,
    #[serde(default, alias = "limiteItens")]
    pub limite_itens: Option<usize>,
    pub motivo: Option<String>,
    #[serde(default)]
    pub confirmar: bool,
}

/// Dias a preencher: os pedidos (da semana, dia de semana, sem feriado) ou, sem pedido, segunda a sexta sem feriado.
pub fn resolver_dias(segunda: NaiveDate, pedidos: &[String]) -> Result<Vec<NaiveDate>, ErroApi> {
    let semana: Vec<NaiveDate> = (0..5).map(|i| segunda + Duration::days(i)).collect();
    if pedidos.is_empty() {
        return Ok(semana.into_iter().filter(|d| feriados::feriado(*d).is_none()).collect());
    }
    let mut dias: BTreeSet<NaiveDate> = BTreeSet::new();
    for p in pedidos {
        let d = store::parse_data(p).ok_or_else(|| ErroApi::invalido(format!("Dia inválido: {p}. Use AAAA-MM-DD.")))?;
        if !semana.contains(&d) {
            return Err(ErroApi::invalido(format!("O dia {d} não é de segunda a sexta da semana pedida.")));
        }
        if let Some(nome) = feriados::feriado(d) {
            return Err(ErroApi::regra(format!("O dia {d} é feriado ({nome}).")));
        }
        dias.insert(d);
    }
    Ok(dias.into_iter().collect())
}

fn fmt_milhar(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

/// Tag de cor para o corte de limpeza de bicos de envase (neutro primeiro, vermelho por último).
pub fn cor_tag(descricao: &str, base: &str) -> &'static str {
    let d = format!("{descricao}  {base}").to_uppercase();
    let tem = |ts: &[&str]| ts.iter().any(|t| d.contains(t));
    if tem(&["RED", "MARSALA", "VERMELH", "COBRE", "COLOR"]) {
        "red"
    } else if tem(&["BLACK", "CARVAO", "CARVÃO", "PRETO"]) {
        "black"
    } else if tem(&["BLOND", "PLATINUM", "SILVER", "MATIZ", "VIOLET", "BLUE"]) {
        "blond"
    } else {
        "neutro"
    }
}

fn texto_da_batelada(item: &ItemCalculado, b: &Batelada) -> String {
    let base = match b.cenario {
        Cenario::Shampoo => format!("Reator Shampoo | {} kg", b.kg),
        Cenario::R40 => "Reator 40kg (Produção Quente)".to_string(),
        Cenario::BombonaQuente => "Água Quente Caldeira (Bombona)".to_string(),
        Cenario::BombonaFrio => "Mistura a Frio (Base Pronta)".to_string(),
        Cenario::Reator if !item.processo.is_quente => "Processo a Frio".to_string(),
        Cenario::Reator if b.reator_id == "R_100" => "Resistência (100kg)".to_string(),
        Cenario::Reator => "Requer Caldeira (Quente)".to_string(),
    };
    let unidades = item.processo.unit_weight_kg.filter(|w| *w > 0.0).map(|w| format!(" | ~{} un", fmt_milhar((b.kg / w).round() as i64))).unwrap_or_default();
    let partes = if b.partes > 1 { format!(" | batelada {}/{}", b.parte, b.partes) } else { String::new() };
    let usou_minimo = item.minimo_kg > 0.0 && item.minimo_kg > item.processo.req_qty_kg;
    let minimo = if usou_minimo && b.parte == 1 { format!(" | mín. {} kg", item.minimo_kg) } else { String::new() };
    format!("{base}{unidades}{partes}{minimo}")
}

/// A batelada como ordem do quadro (mesmos campos que a tela gravava ao aceitar a sugestão).
fn ordem_da_batelada(semana: &str, item: &ItemCalculado, b: &Batelada) -> PlanejamentoItemDto {
    PlanejamentoItemDto {
        id: format!("SEQ_{semana}_{}_{}_{}_{}", b.reator_id, b.dia, canon(&item.codigo), b.parte),
        week_key: semana.to_string(),
        data_planejada: b.dia.to_string(),
        reator_id: b.reator_id.clone(),
        codigo_produto: item.codigo.clone(),
        descricao: Some(item.descricao.clone()),
        quantidade_planejada: b.kg,
        unidade: Some("kg".into()),
        base_codigo: item.base_codigo.clone(),
        base_nome: item.base_nome.clone(),
        linha_envase: Some(fila_auto::linha_envase_sugerida(&item.descricao).to_string()),
        observacoes: Some(texto_da_batelada(item, b)),
        ordem_status: Some("planejado".into()),
        lote_erp: None,
        fisico_confirmado_massa: Some(false),
        fisico_confirmado_embalagem: Some(false),
        fisico_confirmado_rotulo: Some(false),
        recipiente_detalhe: Some(b.recipiente.clone()),
        cor_tag: Some(cor_tag(&item.descricao, item.base_nome.as_deref().unwrap_or("")).to_string()),
        ordem_sequencia: Some(1),
        processo_termico: Some(b.processo_termico.to_string()),
        created_at: None,
        updated_at: None,
        batch_id: None,
    }
}

fn reatores_do_plano(lista: Vec<reatores::ReatorConfigDto>) -> Vec<ReatorPlano> {
    lista.into_iter().map(|r| ReatorPlano { id: r.id, capacidade_kg: r.capacidade_kg, tipo: r.tipo, ordem: r.ordem, ativo: r.ativo }).collect()
}

/// Carga (kg) e ocupação por dia do quadro da semana, ponto de partida da distribuição.
fn estado_do_quadro(ctx: &Contexto) -> EstadoPlano {
    let mut estado = EstadoPlano::default();
    for o in ctx.entrada.ordens.iter().filter(|o| o.da_semana) {
        *estado.carga.entry(o.data).or_insert(0.0) += o.kg;
        estado.dias_ocupados.insert(o.data);
    }
    estado
}

fn perfil_do_item(item: &ItemCalculado) -> PerfilProducao {
    PerfilProducao {
        codigo: canon(&item.codigo),
        kg: item.quantidade_kg,
        is_quente: item.processo.is_quente,
        is_shampoo: item.processo.is_shampoo,
        can_bombona: item.processo.can_bombona,
        exclusivo: item.exclusivo,
    }
}

/// Serviço: propõe a sequência da semana e, com `confirmar`, grava as ordens (e consome a fila manual) numa transação só.
pub async fn sugerir_sequencia(db: &Db, corpo: &SequenciaBody, confirmar: bool, usuario: &str) -> Result<RespostaAcao<Value>, ErroApi> {
    let pool = db.pool();
    let semana = corpo
        .week
        .as_deref()
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| store::semana_de(store::hoje_brasil()));
    let (segunda, _) = store::intervalo_semana(&semana).ok_or_else(|| ErroApi::invalido(format!("Semana inválida: {semana}. Use o formato 2026-W43.")))?;
    let dias = resolver_dias(segunda, &corpo.dias)?;
    if dias.is_empty() {
        return Err(ErroApi::regra("A semana não tem dia útil livre para preencher."));
    }
    let reatores = reatores_do_plano(reatores::carregar_reatores(pool).await?);

    let fila = fila_auto::montar_fila(db, &semana).await?;
    let planejados = fila_auto::codigos_planejados(&fila.ctx);

    // Item cujo produto já tem ordem na semana não entra de novo.
    let mut itens: Vec<ItemSequencia> = Vec::new();
    let mut origem_itens: Vec<&ItemCalculado> = Vec::new();
    let mut pulados: Vec<Pulado> = Vec::new();
    for item in &fila.itens {
        let codigo = canon(&item.codigo);
        if planejados.contains(&codigo) {
            pulados.push(Pulado {
                codigo,
                descricao: item.descricao.clone(),
                origem: if item.automatico { "automatica" } else { "manual" },
                motivo: "ja_planejado",
                detalhe: "O produto já tem ordem nesta semana.".into(),
                falta: Vec::new(),
            });
            continue;
        }
        itens.push(ItemSequencia { automatico: item.automatico, fila_id: item.fila_id.clone(), codigo, descricao: item.descricao.clone(), perfil: perfil_do_item(item) });
        origem_itens.push(item);
    }

    let plano = montar_sequencia(&fila.ctx, &itens, &reatores, &dias, estado_do_quadro(&fila.ctx), corpo.limite_itens);
    pulados.extend(plano.pulados.iter().cloned());

    let mut ordens: Vec<PlanejamentoItemDto> = Vec::new();
    let mut consumos: Vec<PedidoConsumoFila> = Vec::new();
    let mut bateladas_json: Vec<Value> = Vec::new();
    let mut total_kg = 0.0;
    for a in &plano.aceitos {
        let item = origem_itens[a.indice];
        let mut kg_item = 0.0;
        for b in &a.bateladas {
            let ordem = ordem_da_batelada(&semana, item, b);
            bateladas_json.push(json!({
                "id": ordem.id,
                "produto": item.codigo,
                "descricao": item.descricao,
                "origem": if item.automatico { "automatica" } else { "manual" },
                "dia": b.dia,
                "reator": b.reator_id,
                "kg": b.kg,
                "recipiente": b.recipiente,
                "processo": b.processo_termico,
                "parte": b.parte,
                "partes": b.partes,
            }));
            kg_item += b.kg;
            ordens.push(ordem);
        }
        total_kg += kg_item;
        if let Some(id) = &item.fila_id {
            consumos.push(PedidoConsumoFila { fila_id: id.clone(), kg: kg_item });
        }
    }

    let resumo = json!({
        "itensAceitos": plano.aceitos.len(),
        "bateladas": bateladas_json.len(),
        "kgTotal": (total_kg * 10.0).round() / 10.0,
        "pulados": pulados.len(),
        "naoTentados": plano.nao_tentados,
        "diasComCaldeira": plano.dias_caldeira,
    });
    let motivo = corpo.motivo.as_deref().map(str::trim).filter(|m| !m.is_empty()).map(str::to_string);
    let usuario_tx = usuario.to_string();
    let mut ordens_tx = ordens;
    let consumos_tx = consumos.clone();
    let r = executar_em_2_passos(pool, "sugerir_sequencia_planejamento", confirmar, |tx| {
        Box::pin(async move { gravar_planejamento_em(&mut **tx, &mut ordens_tx, &consumos_tx, &usuario_tx).await })
    })
    .await?;
    let gravacao = r.resultado;
    let resultado = json!({
        "semana": semana,
        "dias": dias,
        "bateladas": bateladas_json,
        "pulados": pulados,
        "resumo": resumo,
        "motivo": motivo,
        "fila": gravacao.consumos,
        "antes": gravacao.antes,
        "depois": gravacao.depois,
    });
    if confirmar {
        let ids: Vec<&Value> = bateladas_json.iter().map(|b| &b["id"]).collect();
        auditoria::registrar(
            pool,
            usuario,
            "sugerir_sequencia_planejamento",
            &semana,
            json!({ "motivo": motivo, "dias": dias, "ordens": ids, "resumo": resumo, "pulados": pulados, "filaConsumida": gravacao.consumos }),
        )
        .await;
    }
    Ok(RespostaAcao { previa: r.previa, acao: r.acao, resultado, confirmar: r.confirmar })
}

async fn sugerir_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<Confirmar>,
    Json(corpo): Json<SequenciaBody>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao(&ctx) {
        return r;
    }
    match sugerir_sequencia(&state.db, &corpo, corpo.confirmar || q.confirmar, &ctx.display_name).await {
        Ok(r) => (StatusCode::OK, Json(corpo_acao(&r))).into_response(),
        Err(e) => e.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::producao::cobertura::calc::{BaseFonte, EntradaSimulacao, EstoqueItem, LinhaFormula};
    use crate::modules::producao::cobertura::store::Formulas;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn reat(id: &str, capacidade_kg: f64, tipo: &str, ordem: i32) -> ReatorPlano {
        ReatorPlano { id: id.into(), capacidade_kg, tipo: tipo.into(), ordem, ativo: true }
    }

    fn fabrica() -> Vec<ReatorPlano> {
        vec![
            reat("R_1000_SHAMPOO", 1000.0, "caldeira_shampoo", 1),
            reat("R_1000_MISTO", 1000.0, "caldeira", 2),
            reat("R_500", 500.0, "caldeira", 3),
            reat("R_200", 200.0, "caldeira", 4),
            reat("R_100", 100.0, "resistencia", 5),
            reat("R_40", 40.0, "quente", 6),
            reat("BOMBONAS", 200.0, "bombona", 7),
        ]
    }

    fn semana() -> Vec<NaiveDate> {
        ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"].iter().map(|s| d(s)).collect()
    }

    fn perfil(codigo: &str, kg: f64) -> PerfilProducao {
        PerfilProducao { codigo: codigo.into(), kg, is_quente: false, is_shampoo: false, can_bombona: false, exclusivo: false }
    }

    fn ids(l: &[ReatorPlano]) -> Vec<&str> {
        l.iter().map(|r| r.id.as_str()).collect()
    }

    // ---- ordenar_reatores_por_caber ----
    fn simples(l: &[(&str, f64)]) -> Vec<ReatorPlano> {
        l.iter().enumerate().map(|(i, (id, cap))| reat(id, *cap, "caldeira", i as i32)).collect()
    }

    #[test]
    fn ordenar_cabem_do_menor_ao_maior_depois_os_que_nao_cabem_do_maior_ao_menor() {
        let lista = simples(&[("a", 1000.0), ("b", 40.0), ("c", 200.0), ("d", 500.0), ("e", 100.0)]);
        assert_eq!(ids(&ordenar_reatores_por_caber(&lista, 150.0)), ["c", "d", "a", "e", "b"]);
    }

    #[test]
    fn ordenar_capacidade_igual_a_massa_conta_como_cabe() {
        let lista = simples(&[("a", 500.0), ("b", 200.0)]);
        assert_eq!(ids(&ordenar_reatores_por_caber(&lista, 200.0)), ["b", "a"]);
    }

    #[test]
    fn ordenar_empate_mantem_a_ordem_original() {
        let lista = simples(&[("x", 200.0), ("y", 200.0), ("z", 200.0)]);
        assert_eq!(ids(&ordenar_reatores_por_caber(&lista, 100.0)), ["x", "y", "z"]);
    }

    #[test]
    fn ordenar_nenhum_cabe_do_maior_ao_menor_e_lista_vazia() {
        let lista = simples(&[("a", 40.0), ("b", 200.0), ("c", 100.0)]);
        assert_eq!(ids(&ordenar_reatores_por_caber(&lista, 5000.0)), ["b", "c", "a"]);
        assert!(ordenar_reatores_por_caber(&[], 100.0).is_empty());
    }

    // ---- dias_permitidos ----
    fn tres_dias() -> Vec<NaiveDate> {
        vec![d("2026-10-26"), d("2026-10-27"), d("2026-10-28")]
    }

    #[test]
    fn dias_permitidos_produto_comum_so_evita_dia_exclusivo() {
        let ocupados: HashSet<_> = [d("2026-10-26")].into();
        let exclusivos: HashSet<_> = [d("2026-10-27")].into();
        assert_eq!(dias_permitidos(&tres_dias(), false, &ocupados, &exclusivos), vec![d("2026-10-26"), d("2026-10-28")]);
    }

    #[test]
    fn dias_permitidos_exclusivo_so_entra_em_dia_livre() {
        let ocupados: HashSet<_> = [d("2026-10-26")].into();
        let exclusivos: HashSet<_> = [d("2026-10-27")].into();
        assert_eq!(dias_permitidos(&tres_dias(), true, &ocupados, &exclusivos), vec![d("2026-10-28")]);
    }

    #[test]
    fn dias_permitidos_ninguem_entra_em_dia_exclusivo() {
        let todos: HashSet<_> = tres_dias().into_iter().collect();
        assert!(dias_permitidos(&tres_dias(), false, &HashSet::new(), &todos).is_empty());
        assert!(dias_permitidos(&tres_dias(), true, &HashSet::new(), &todos).is_empty());
    }

    // ---- planejar_semana: sem limite diário por reator, capacidade só por batelada ----
    #[test]
    fn planejar_varios_produtos_no_mesmo_reator_e_dia_sem_limite() {
        let perfis: Vec<_> = (0..12).map(|i| perfil(&format!("P{i}"), 90.0)).collect();
        let (bateladas, sem_lugar, _) = planejar_semana(&perfis, &fabrica(), &semana()[..1], EstadoPlano::default());
        assert!(sem_lugar.is_empty());
        assert_eq!(bateladas.len(), 12);
        assert!(bateladas.iter().all(|b| b.reator_id == "R_100" && b.dia == d("2026-10-26")));

        let bomb: Vec<_> = (0..9).map(|i| PerfilProducao { can_bombona: true, ..perfil(&format!("B{i}"), 40.0) }).collect();
        let (b2, _, _) = planejar_semana(&bomb, &fabrica(), &semana()[..1], EstadoPlano::default());
        assert_eq!(b2.len(), 9);
        assert!(b2.iter().all(|b| b.reator_id == "BOMBONAS"));
    }

    #[test]
    fn planejar_cada_batelada_respeita_a_capacidade() {
        let perfis = vec![perfil("A", 80.0), perfil("B", 150.0), perfil("C", 450.0), PerfilProducao { is_shampoo: true, ..perfil("D", 900.0) }];
        let f = fabrica();
        let (bateladas, _, _) = planejar_semana(&perfis, &f, &semana(), EstadoPlano::default());
        for b in &bateladas {
            let cap = f.iter().find(|r| r.id == b.reator_id).unwrap().capacidade_kg;
            assert!(b.kg <= cap, "{}: {} > {}", b.codigo, b.kg, cap);
        }
        let reator = |c: &str| bateladas.iter().find(|b| b.codigo == c).unwrap().reator_id.clone();
        assert_eq!(reator("A"), "R_100");
        assert_eq!(reator("B"), "R_200");
        assert_eq!(reator("C"), "R_500");
        assert_eq!(reator("D"), "R_1000_SHAMPOO");
    }

    #[test]
    fn planejar_divide_em_bateladas_quando_passa_da_maior_capacidade() {
        let (bateladas, _, _) = planejar_semana(&[perfil("G", 2500.0)], &fabrica(), &semana(), EstadoPlano::default());
        assert_eq!(bateladas.len(), 3);
        assert!(bateladas.iter().all(|b| b.kg <= 1000.0 && b.partes == 3));
        assert_eq!(bateladas.iter().map(|b| b.parte).collect::<Vec<_>>(), [1, 2, 3]);
        assert!((bateladas.iter().map(|b| b.kg).sum::<f64>() - 2500.0).abs() < 0.01);
    }

    #[test]
    fn planejar_o_mais_urgente_fica_com_o_dia_mais_cedo_e_a_carga_se_espalha() {
        let perfis = vec![perfil("U1", 90.0), perfil("U2", 90.0), perfil("U3", 90.0)];
        let (bateladas, _, _) = planejar_semana(&perfis, &fabrica(), &semana(), EstadoPlano::default());
        assert_eq!(bateladas.iter().map(|b| b.codigo.as_str()).collect::<Vec<_>>(), ["U1", "U2", "U3"]);
        assert_eq!(bateladas.iter().map(|b| b.dia).collect::<Vec<_>>(), [d("2026-10-26"), d("2026-10-27"), d("2026-10-28")]);
    }

    #[test]
    fn planejar_carga_existente_empurra_para_o_dia_mais_vazio_e_exclusivo_so_em_dia_sem_ordem() {
        let inicial = EstadoPlano {
            carga: [(d("2026-10-26"), 500.0), (d("2026-10-27"), 10.0)].into(),
            dias_ocupados: [d("2026-10-26"), d("2026-10-27")].into(),
            ..Default::default()
        };
        let (b, _, _) = planejar_semana(&[PerfilProducao { exclusivo: true, ..perfil("E", 90.0) }], &fabrica(), &semana(), inicial);
        assert_eq!(b[0].dia, d("2026-10-28"));
    }

    #[test]
    fn planejar_sem_reator_compativel_ou_sem_dia_vai_para_sem_lugar() {
        let so40 = vec![reat("R_40", 40.0, "quente", 1)];
        let (_, sem, _) = planejar_semana(&[perfil("X", 300.0)], &so40, &semana(), EstadoPlano::default());
        assert_eq!(sem, ["X"]);
        let (_, sem2, _) = planejar_semana(&[perfil("Y", 90.0)], &fabrica(), &[], EstadoPlano::default());
        assert_eq!(sem2, ["Y"]);
        let mut estado = EstadoPlano::default();
        assert_eq!(distribuir(&mut estado, &perfil("Z", 0.0), &fabrica(), &semana()), Err(SemLugar::SemQuantidade));
        assert_eq!(distribuir(&mut estado, &perfil("Y", 90.0), &fabrica(), &[]), Err(SemLugar::SemDia));
        assert!(estado.carga.is_empty(), "recusar não deixa rastro no estado");
    }

    #[test]
    fn dividir_em_bateladas_partes_iguais_soma_exata_e_nenhuma_passa_da_capacidade() {
        assert_eq!(dividir_em_bateladas(100.0, 100.0), vec![100.0]);
        assert_eq!(dividir_em_bateladas(250.0, 100.0), vec![83.3, 83.3, 83.4]);
        assert!(dividir_em_bateladas(0.0, 100.0).is_empty());
    }

    #[test]
    fn reatores_do_perfil_por_tipo() {
        let f = fabrica();
        let ids2 = |kg, q, s, b| ids(&reatores_do_perfil(&f, kg, q, s, b).1).into_iter().map(String::from).collect::<Vec<_>>();
        assert_eq!(ids2(600.0, false, true, false), ["R_1000_SHAMPOO"]);
        assert_eq!(ids2(30.0, true, false, true), ["R_40"]);
        assert_eq!(ids2(150.0, false, false, true), ["BOMBONAS"]);
        assert_eq!(ids2(150.0, false, false, false), ["R_1000_MISTO", "R_500", "R_200", "R_100"]);
    }

    #[test]
    fn reatores_do_perfil_bombona_quente_so_ate_150_kg_e_a_frio_ate_200() {
        let f = fabrica();
        let cand = |kg, q| ids(&reatores_do_perfil(&f, kg, q, false, true).1).into_iter().map(String::from).collect::<Vec<_>>();
        assert_eq!(cand(150.0, true), ["BOMBONAS"]);
        assert_ne!(cand(160.0, true), ["BOMBONAS"]);
        assert_eq!(cand(200.0, false), ["BOMBONAS"]);
    }

    #[test]
    fn reator_antigo_vale_como_reserva_quando_o_tipo_nao_foi_configurado() {
        let antigos = vec![reat("R_1000", 1000.0, "caldeira", 1), reat("R_40", 40.0, "reator", 2), reat("BOMBONAS", 200.0, "reator", 3)];
        assert_eq!(reatores_do_perfil(&antigos, 600.0, false, true, false).0, Cenario::Shampoo);
        assert_eq!(reatores_do_perfil(&antigos, 30.0, true, false, false).0, Cenario::R40);
        assert_eq!(reatores_do_perfil(&antigos, 100.0, false, false, true).0, Cenario::BombonaFrio);
    }

    #[test]
    fn dimensionar_bombona_arredonda_o_recipiente_e_processo_por_cenario() {
        let bomb = reat("BOMBONAS", 200.0, "bombona", 7);
        assert_eq!(dimensionar(Cenario::BombonaFrio, &bomb, 40.0), (50.0, "Bombona 50kg".to_string()));
        assert_eq!(dimensionar(Cenario::BombonaQuente, &bomb, 100.0), (100.0, "Bombona 100kg".to_string()));
        assert_eq!(processo_de(Cenario::BombonaQuente, &bomb, true), "agua_caldeira");
        assert_eq!(processo_de(Cenario::Reator, &reat("R_100", 100.0, "resistencia", 5), true), "resistencia");
        assert_eq!(processo_de(Cenario::Reator, &reat("R_200", 200.0, "caldeira", 4), false), "frio");
    }

    // ---- sequência com cobertura acumulada ----
    fn est(estoque: f64) -> EstoqueItem {
        EstoqueItem { descricao: "Insumo A".into(), unidade: Some("kg".into()), estoque, reserva: 0.0, reserva_erp: 0.0, calibrado: false }
    }

    fn contexto(estoque: f64) -> Contexto {
        let formula = |cod: &str| (cod.to_string(), vec![LinhaFormula { codigo: "MP.001".into(), descricao: "Insumo A".into(), unidade: Some("kg".into()), quantidade: 1.0 }]);
        Contexto {
            entrada: EntradaSimulacao {
                hoje: d("2026-10-20"),
                estoque: [("MP.001".to_string(), est(estoque))].into(),
                chegadas: HashMap::new(),
                manuais: HashMap::new(),
                ordens: Vec::new(),
                lotes_erp: Vec::new(),
                equivalentes: HashMap::new(),
                sem_controle: HashSet::new(),
            },
            formulas: Formulas { por_produto: [formula("P1"), formula("P2")].into(), bases: HashMap::new(), itens: HashMap::new(), trocas: Vec::new() },
            decisoes_base: HashMap::new(),
            inicio_semana: d("2026-10-26"),
            fim_semana: d("2026-11-01"),
        }
    }

    fn item(codigo: &str, kg: f64, automatico: bool) -> ItemSequencia {
        ItemSequencia { automatico, fila_id: None, codigo: codigo.into(), descricao: format!("Produto {codigo}"), perfil: perfil(codigo, kg) }
    }

    #[test]
    fn sequencia_acumulada_o_primeiro_entra_e_o_segundo_e_pulado_por_falta() {
        // 100 kg do insumo A; cada produto gasta 60 kg: só o primeiro cabe.
        let ctx = contexto(100.0);
        let itens = vec![item("P1", 60.0, false), item("P2", 60.0, true)];
        let plano = montar_sequencia(&ctx, &itens, &fabrica(), &semana(), EstadoPlano::default(), None);
        assert_eq!(plano.aceitos.len(), 1);
        assert_eq!(plano.aceitos[0].indice, 0);
        assert_eq!(plano.pulados.len(), 1);
        let p = &plano.pulados[0];
        assert_eq!((p.codigo.as_str(), p.motivo, p.origem), ("P2", "falta_insumo", "automatica"));
        assert_eq!(p.falta[0].codigo, "MP.001");
        assert!((p.falta[0].falta - 20.0).abs() < 1e-6, "faltam 20 kg depois dos 60 do primeiro");
    }

    #[test]
    fn sequencia_com_insumo_sobrando_aceita_os_dois_em_dias_diferentes() {
        let ctx = contexto(200.0);
        let itens = vec![item("P1", 60.0, false), item("P2", 60.0, true)];
        let plano = montar_sequencia(&ctx, &itens, &fabrica(), &semana(), EstadoPlano::default(), None);
        assert_eq!(plano.aceitos.len(), 2);
        assert!(plano.pulados.is_empty());
        assert_ne!(plano.aceitos[0].bateladas[0].dia, plano.aceitos[1].bateladas[0].dia, "a carga espalha pelos dias");
    }

    #[test]
    fn sequencia_conta_o_quadro_da_semana_e_respeita_o_limite_de_itens() {
        let mut ctx = contexto(100.0);
        // O quadro já tem uma ordem de P1 com 70 kg: sobram 30 kg do insumo.
        ctx.entrada.ordens.push(crate::modules::producao::cobertura::calc::OrdemEntrada {
            id: "o1".into(),
            data: d("2026-10-26"),
            sequencia: 1,
            codigo_produto: "P1".into(),
            descricao: None,
            kg: 70.0,
            lote_erp: None,
            lote_no_erp: false,
            grupo: "o1".into(),
            necessidades: ctx.formulas.necessidades_com("P1", 70.0, BaseFonte::Explodir),
            bases_usadas: Vec::new(),
            base_fonte: BaseFonte::Explodir,
            sugestao_base: None,
            da_semana: true,
        });
        let plano = montar_sequencia(&ctx, &[item("P2", 60.0, true)], &fabrica(), &semana(), estado_do_quadro(&ctx), None);
        assert!(plano.aceitos.is_empty(), "60 kg não cabem nos 30 kg que o quadro deixou");
        assert_eq!(plano.pulados[0].motivo, "falta_insumo");

        let plano = montar_sequencia(&ctx, &[item("P2", 25.0, true), item("P1", 5.0, false)], &fabrica(), &semana(), estado_do_quadro(&ctx), Some(1));
        assert_eq!(plano.aceitos.len(), 1, "limite de 1 item");
        assert_eq!(plano.nao_tentados, 1);
    }

    #[test]
    fn sequencia_pula_sem_formula_sem_reator_e_sem_quantidade() {
        let ctx = contexto(1000.0);
        let so40 = vec![reat("R_40", 40.0, "quente", 1)];
        let p = montar_sequencia(&ctx, &[item("P1", 300.0, false)], &so40, &semana(), EstadoPlano::default(), None);
        assert_eq!(p.pulados[0].motivo, "sem_reator_compativel");
        let p = montar_sequencia(&ctx, &[item("P1", 0.0, false)], &fabrica(), &semana(), EstadoPlano::default(), None);
        assert_eq!(p.pulados[0].motivo, "sem_quantidade");
        let p = montar_sequencia(&ctx, &[item("SEM", 50.0, false)], &fabrica(), &semana(), EstadoPlano::default(), None);
        assert_eq!(p.pulados[0].motivo, "sem_formula");
    }

    // ---- dias, cor e textos ----
    #[test]
    fn resolver_dias_padrao_pula_feriado_e_pedido_valida_a_semana() {
        // semana de 2026-11-02 (segunda é Finados)
        let seg = d("2026-11-02");
        let padrao = resolver_dias(seg, &[]).unwrap();
        assert_eq!(padrao, vec![d("2026-11-03"), d("2026-11-04"), d("2026-11-05"), d("2026-11-06")]);
        assert_eq!(resolver_dias(seg, &["2026-11-05".into(), "2026-11-03".into()]).unwrap(), vec![d("2026-11-03"), d("2026-11-05")]);
        assert_eq!(resolver_dias(seg, &["2026-11-02".into()]).unwrap_err().codigo, "regra_violada");
        assert_eq!(resolver_dias(seg, &["2026-11-09".into()]).unwrap_err().codigo, "invalido");
        assert_eq!(resolver_dias(seg, &["2026-11-07".into()]).unwrap_err().codigo, "invalido");
        assert_eq!(resolver_dias(seg, &["xx".into()]).unwrap_err().codigo, "invalido");
    }

    #[test]
    fn cor_e_milhar() {
        assert_eq!(cor_tag("SHAMPOO LISO", ""), "neutro");
        assert_eq!(cor_tag("MASCARA MARSALA", ""), "red");
        assert_eq!(cor_tag("SHAMPOO BLACK", ""), "black");
        assert_eq!(cor_tag("SHAMPOO MATIZADOR", ""), "blond");
        assert_eq!(fmt_milhar(1234567), "1.234.567");
        assert_eq!(fmt_milhar(950), "950");
    }
}
