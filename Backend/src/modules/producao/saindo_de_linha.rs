//! Saindo de linha: produzir até zerar a embalagem exclusiva (decisão do Edson, 2026-11-18, etapa SL1).
//!
//! Produto com situação "saindo de linha" continua sendo produzido enquanto sobrar a **embalagem exclusiva** dele:
//! item de embalagem da formulação que nenhum produto ativo usa (rótulo, frasco específico). As unidades que ainda dá
//! para produzir são o mínimo, entre esses itens, de `livre ÷ quantidade por unidade`, com `livre = estoque − reserva`
//! dos lotes abertos (a mesma reserva calculada da Cobertura). Embalagem exclusiva zerada = nada mais a produzir.
//! Embalagem compartilhada com produto ativo não conta. Produto sem embalagem exclusiva fica como estava (a venda
//! decide) e é marcado para o Edson decidir.
//!
//! Serviço puro + leitura: `calcular` não toca em banco (testável); `levantar` carrega fórmulas e estoque pelo motor
//! da Cobertura (base explodida, kit pela composição); `aplicar` troca a sugestão dos saindo de linha na Demanda.
//! O Compras reusa `levantar` / `Levantamento::embalagem_exclusiva` para não comprar a embalagem exclusiva (etapa SL2).

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use serde::Serialize;
use sqlx::PgPool;

use crate::core::db::Db;
use crate::models::ProductCalculationResult;
use crate::modules::producao::cobertura::calc::{linha_e_embalagem, BaseFonte, LinhaFormula, Necessidade};
use crate::modules::producao::cobertura::reserva;
use crate::modules::producao::cobertura::store::{self, canon, Quantidade};

pub const SAINDO: &str = "saindo_de_linha";

/// Teto da sugestão do saindo de linha, em meses de venda (decisão do Edson, 2026-11-18).
pub const TETO_MESES: f64 = 6.0;

/// Item de embalagem exclusiva de um produto saindo de linha.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEmbalagem {
    pub codigo: String,
    pub descricao: String,
    /// Quantidade do item por unidade do produto.
    pub por_unidade: f64,
    /// Estoque menos a reserva dos lotes abertos (nunca negativo).
    pub livre: f64,
    /// Unidades do produto que esse item ainda permite (arredondado para baixo).
    pub unidades: i64,
}

/// Quanto ainda dá para produzir de um produto saindo de linha com a embalagem exclusiva que sobrou.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestanteSaindo {
    pub produto: String,
    /// Mínimo das unidades dos itens exclusivos.
    pub unidades: i64,
    /// Item que limita (o de menos unidades).
    pub limitante: ItemEmbalagem,
    pub itens: Vec<ItemEmbalagem>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Levantamento {
    /// Produto saindo de linha com embalagem exclusiva (chave = código canônico).
    pub com_embalagem: BTreeMap<String, RestanteSaindo>,
    /// Produto saindo de linha sem embalagem exclusiva (sem fórmula, sem embalagem ou tudo compartilhado): segue como antes.
    pub sem_embalagem: Vec<String>,
}

impl Levantamento {
    /// Códigos de insumo que são embalagem exclusiva de algum produto saindo de linha (para o Compras não comprar).
    pub fn embalagem_exclusiva(&self) -> BTreeSet<String> {
        self.com_embalagem.values().flat_map(|r| r.itens.iter().map(|i| i.codigo.clone())).collect()
    }
}

/// Uso de insumo de um produto por unidade: `contribuinte` é quem consome (num kit, o componente ou o próprio kit).
pub struct Uso {
    pub contribuinte: String,
    pub necessidades: Vec<Necessidade>,
}

fn e_embalagem(n: &Necessidade) -> bool {
    linha_e_embalagem(&LinhaFormula {
        codigo: n.codigo.clone(),
        descricao: n.descricao.clone(),
        unidade: n.unidade.clone(),
        quantidade: n.quantidade,
    })
}

/// Núcleo puro. `usos`: consumo por unidade de todo produto que importa (saindo de linha e ativos). `saindo`: códigos
/// canônicos saindo de linha. `livre`: estoque − reserva por item. Item compartilhado com produto ativo = não é exclusivo.
/// Item exclusivo de mais de um saindo de linha: o saldo livre é repartido na proporção da venda mensal (`vendas`);
/// sem venda em nenhum deles, em partes iguais.
pub fn calcular(usos: &[Uso], saindo: &HashSet<String>, livre: &HashMap<String, f64>, vendas: &HashMap<String, f64>) -> Levantamento {
    let mut usado_por_ativo: HashSet<&str> = HashSet::new();
    for u in usos {
        if saindo.contains(&u.contribuinte) {
            continue;
        }
        usado_por_ativo.extend(u.necessidades.iter().filter(|n| e_embalagem(n)).map(|n| n.codigo.as_str()));
    }
    let mut itens_por_produto: BTreeMap<&str, BTreeMap<&str, ItemEmbalagem>> = BTreeMap::new();
    for u in usos.iter().filter(|u| saindo.contains(&u.contribuinte)) {
        for n in u.necessidades.iter().filter(|n| e_embalagem(n) && n.quantidade > 0.0) {
            if usado_por_ativo.contains(n.codigo.as_str()) {
                continue;
            }
            let l = livre.get(&n.codigo).copied().unwrap_or(0.0).max(0.0);
            let e = itens_por_produto.entry(u.contribuinte.as_str()).or_default().entry(n.codigo.as_str()).or_insert_with(|| ItemEmbalagem {
                codigo: n.codigo.clone(),
                descricao: n.descricao.clone(),
                por_unidade: 0.0,
                livre: l,
                unidades: 0,
            });
            e.por_unidade += n.quantidade;
        }
    }
    // Divisão do saldo de cada item entre os saindo de linha que o usam.
    let mut donos: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (p, m) in &itens_por_produto {
        for c in m.keys() {
            donos.entry(*c).or_default().push(*p);
        }
    }
    let venda = |p: &str| vendas.get(p).copied().unwrap_or(0.0).max(0.0);
    for (p, m) in itens_por_produto.iter_mut() {
        for (c, item) in m.iter_mut() {
            let d = &donos[c];
            let soma: f64 = d.iter().map(|x| venda(x)).sum();
            let parte = if d.len() == 1 {
                1.0
            } else if soma > 0.0 {
                venda(p) / soma
            } else {
                1.0 / d.len() as f64
            };
            item.livre *= parte;
        }
    }
    let mut out = Levantamento::default();
    for p in saindo {
        match itens_por_produto.remove(p.as_str()) {
            None => out.sem_embalagem.push(p.clone()),
            Some(m) => {
                let mut itens: Vec<ItemEmbalagem> = m.into_values().collect();
                for i in &mut itens {
                    i.unidades = (i.livre / i.por_unidade + 1e-9).floor() as i64;
                }
                let limitante = itens.iter().min_by_key(|i| i.unidades).cloned().expect("lista não vazia");
                out.com_embalagem.insert(p.clone(), RestanteSaindo { produto: p.clone(), unidades: limitante.unidades, limitante, itens });
            }
        }
    }
    out.sem_embalagem.sort();
    out
}

/// Lê fórmulas e estoque (motor da Cobertura) e calcula o levantamento dos produtos saindo de linha da Demanda.
/// Sem nenhum saindo de linha não lê nada. Produto fora da Demanda ativa (descontinuado, terceirizado, linha inativa)
/// não conta como usuário da embalagem.
pub async fn levantar(pool: &PgPool, calculados: &[ProductCalculationResult], vendas: &HashMap<String, f64>) -> Result<Levantamento, String> {
    let saindo: HashSet<String> = calculados
        .iter()
        .filter(|p| p.status_produto.as_deref() == Some(SAINDO) && p.visivel != Some(0))
        .map(|p| canon(&p.codigo))
        .collect();
    if saindo.is_empty() {
        return Ok(Levantamento::default());
    }
    let ativos = |p: &&ProductCalculationResult| {
        p.visivel != Some(0) && !matches!(p.status_produto.as_deref(), Some("descontinuado") | Some("terceirizado"))
    };
    let produtos: Vec<String> = calculados.iter().filter(ativos).map(|p| canon(&p.codigo)).collect();
    let formulas = store::carregar_formulas_previstas(pool, &produtos).await?;

    let vazio = HashSet::new();
    let mut usos: Vec<Uso> = Vec::new();
    for p in &produtos {
        let Some(contribs) = formulas.necessidades_previstas(p, Quantidade::Unidades(1.0), BaseFonte::Explodir, &vazio) else { continue };
        usos.extend(contribs.into_iter().map(|c| Uso { contribuinte: c.produto, necessidades: c.necessidades }));
    }

    // Só os itens que são embalagem exclusiva candidata precisam de estoque.
    let candidatos: Vec<String> = {
        let s: BTreeSet<&String> = usos
            .iter()
            .filter(|u| saindo.contains(&u.contribuinte))
            .flat_map(|u| u.necessidades.iter().filter(|n| e_embalagem(n)).map(|n| &n.codigo))
            .collect();
        s.into_iter().cloned().collect()
    };
    let estoque = store::carregar_estoque(pool, &candidatos, &formulas).await?;
    let reservas = reserva::calculada_por_insumo(pool).await?;
    let livre: HashMap<String, f64> = estoque
        .iter()
        .map(|(c, e)| (c.clone(), (e.estoque - reservas.get(c).copied().unwrap_or(0.0)).max(0.0)))
        .collect();
    Ok(calcular(&usos, &saindo, &livre, vendas))
}

/// Venda mensal de cada produto saindo de linha: a média da Demanda (`media_vendas`) mais a dos kits pais × quantidade
/// no kit, como a Saúde do Estoque soma a via kit. Chave = código canônico.
pub fn vendas_mensais(
    calculados: &[ProductCalculationResult],
    kits: &HashMap<String, Vec<(String, f64, Option<f64>, Option<i32>)>>,
) -> HashMap<String, f64> {
    use crate::handlers::imports::clean_product_code as limpo;
    let media: HashMap<String, f64> = calculados.iter().map(|p| (limpo(&p.codigo), p.media_vendas)).collect();
    let mut via_kit: HashMap<String, f64> = HashMap::new();
    for (kit, comps) in kits {
        let m_kit = media.get(&limpo(kit)).copied().unwrap_or(0.0);
        for (comp, q, _, _) in comps {
            *via_kit.entry(limpo(comp)).or_insert(0.0) += m_kit * q;
        }
    }
    calculados
        .iter()
        .filter(|p| p.status == SAINDO)
        .map(|p| {
            let v = p.media_vendas.max(0.0) + via_kit.get(&limpo(&p.codigo)).copied().unwrap_or(0.0);
            (canon(&p.codigo), v)
        })
        .collect()
}

/// Sugestão do saindo de linha = mínimo entre as unidades que a embalagem exclusiva permite e o teto de
/// `TETO_MESES` de venda; sem venda, 0. Só mexe em quem a Demanda classificou como saindo de linha.
pub fn aplicar(calculados: &mut [ProductCalculationResult], lev: &Levantamento, vendas: &HashMap<String, f64>) {
    for p in calculados.iter_mut().filter(|p| p.status == SAINDO) {
        let chave = canon(&p.codigo);
        if let Some(r) = lev.com_embalagem.get(&chave) {
            let teto = (vendas.get(&chave).copied().unwrap_or(0.0) * TETO_MESES + 1e-9).floor().max(0.0) as i64;
            p.producao_recomendada = r.unidades.min(teto);
            p.ate_acabar_embalagem = Some(r.unidades);
            p.saindo_teto_meses = Some(teto);
            p.saindo_limite = Some(if teto < r.unidades { "teto" } else { "embalagem" }.to_string());
            p.embalagem_limitante = Some(format!("{} — {}", r.limitante.codigo, r.limitante.descricao.trim()));
        } else if lev.sem_embalagem.iter().any(|c| c == &chave) {
            p.saindo_sem_embalagem = Some(true);
        }
    }
}

/// Atalho: levanta e aplica. Falha de leitura não derruba a Demanda: mantém a sugestão antiga e avisa no log.
pub async fn aplicar_na_demanda(db: &Db, calculados: &mut [ProductCalculationResult]) {
    let kits = db.get_kit_composition().await.unwrap_or_default();
    let vendas = vendas_mensais(calculados, &kits);
    match levantar(db.pool(), calculados, &vendas).await {
        Ok(lev) => aplicar(calculados, &lev, &vendas),
        Err(e) => eprintln!("[saindo de linha] embalagem exclusiva não calculada: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(codigo: &str, un: &str, q: f64) -> Necessidade {
        Necessidade { codigo: codigo.into(), descricao: format!("item {codigo}"), unidade: Some(un.into()), quantidade: q }
    }
    fn uso(c: &str, v: Vec<Necessidade>) -> Uso {
        Uso { contribuinte: c.into(), necessidades: v }
    }
    fn s(v: &[&str]) -> HashSet<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn minimo_entre_itens_exclusivos_e_compartilhada_nao_conta() {
        let usos = vec![
            // saindo A: rótulo próprio, frasco compartilhado, massa (kg não é embalagem)
            uso("A", vec![n("ROT-A", "UN", 1.0), n("FRASCO", "UN", 1.0), n("9.15.1", "KG", 0.3), n("CX-A", "UN", 0.5)]),
            // ativo B usa o mesmo frasco
            uso("B", vec![n("FRASCO", "UN", 1.0), n("ROT-B", "UN", 1.0)]),
        ];
        let livre: HashMap<String, f64> = [("ROT-A", 500.0), ("FRASCO", 99999.0), ("CX-A", 120.0)].iter().map(|(k, v)| (k.to_string(), *v)).collect();
        let r = calcular(&usos, &s(&["A"]), &livre, &HashMap::new());
        let a = &r.com_embalagem["A"];
        assert_eq!(a.itens.len(), 2, "frasco compartilhado e massa fora");
        assert_eq!(a.unidades, 240, "caixa 120 ÷ 0,5 = 240 limita (rótulo dá 500)");
        assert_eq!(a.limitante.codigo, "CX-A");
        assert!(r.sem_embalagem.is_empty());
        assert_eq!(r.embalagem_exclusiva(), ["CX-A".to_string(), "ROT-A".to_string()].into_iter().collect());
    }

    #[test]
    fn embalagem_zerada_ou_sem_estoque_da_zero_e_sem_exclusiva_marca_o_caso() {
        let usos = vec![
            uso("A", vec![n("ROT-A", "UN", 1.0)]),
            uso("C", vec![n("FRASCO", "UN", 1.0)]),
            uso("B", vec![n("FRASCO", "UN", 1.0)]),
        ];
        let livre: HashMap<String, f64> = HashMap::new();
        let r = calcular(&usos, &s(&["A", "C"]), &livre, &HashMap::new());
        assert_eq!(r.com_embalagem["A"].unidades, 0, "rótulo sem estoque");
        assert_eq!(r.sem_embalagem, vec!["C".to_string()], "frasco é de B (ativo): sem exclusiva");
    }

    #[test]
    fn dois_saindo_dividindo_o_mesmo_item_repartem_pela_venda_e_sem_venda_em_partes_iguais() {
        let usos = vec![uso("A", vec![n("ROT", "UN", 1.0)]), uso("C", vec![n("ROT", "UN", 1.0)])];
        let livre: HashMap<String, f64> = [("ROT".to_string(), 100.0)].into_iter().collect();
        let vendas: HashMap<String, f64> = [("A".to_string(), 30.0), ("C".to_string(), 10.0)].into_iter().collect();
        let r = calcular(&usos, &s(&["A", "C"]), &livre, &vendas);
        assert_eq!(r.com_embalagem["A"].unidades, 75);
        assert_eq!(r.com_embalagem["C"].unidades, 25);
        let r = calcular(&usos, &s(&["A", "C"]), &livre, &HashMap::new());
        assert_eq!(r.com_embalagem["A"].unidades, 50);
        assert_eq!(r.com_embalagem["C"].unidades, 50);
    }
}
