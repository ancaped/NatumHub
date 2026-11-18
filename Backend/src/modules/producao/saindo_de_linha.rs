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

use crate::models::ProductCalculationResult;
use crate::modules::producao::cobertura::calc::{linha_e_embalagem, BaseFonte, LinhaFormula, Necessidade};
use crate::modules::producao::cobertura::reserva;
use crate::modules::producao::cobertura::store::{self, canon, Quantidade};

pub const SAINDO: &str = "saindo_de_linha";

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
/// canônicos saindo de linha. `livre`: estoque − reserva por item. Item compartilhado = usado por contribuinte fora de `saindo`.
pub fn calcular(usos: &[Uso], saindo: &HashSet<String>, livre: &HashMap<String, f64>) -> Levantamento {
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
pub async fn levantar(pool: &PgPool, calculados: &[ProductCalculationResult]) -> Result<Levantamento, String> {
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
    Ok(calcular(&usos, &saindo, &livre))
}

/// Troca a sugestão dos produtos saindo de linha pelas unidades que a embalagem exclusiva ainda permite.
/// Só mexe em quem a Demanda classificou como saindo de linha; o resto fica intacto.
pub fn aplicar(calculados: &mut [ProductCalculationResult], lev: &Levantamento) {
    for p in calculados.iter_mut().filter(|p| p.status == SAINDO) {
        let chave = canon(&p.codigo);
        if let Some(r) = lev.com_embalagem.get(&chave) {
            p.producao_recomendada = r.unidades;
            p.ate_acabar_embalagem = Some(r.unidades);
            p.embalagem_limitante = Some(format!("{} — {}", r.limitante.codigo, r.limitante.descricao.trim()));
        } else if lev.sem_embalagem.iter().any(|c| c == &chave) {
            p.saindo_sem_embalagem = Some(true);
        }
    }
}

/// Atalho: levanta e aplica. Falha de leitura não derruba a Demanda: mantém a sugestão antiga e avisa no log.
pub async fn aplicar_na_demanda(pool: &PgPool, calculados: &mut [ProductCalculationResult]) {
    match levantar(pool, calculados).await {
        Ok(lev) => aplicar(calculados, &lev),
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
        let r = calcular(&usos, &s(&["A"]), &livre);
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
        let r = calcular(&usos, &s(&["A", "C"]), &livre);
        assert_eq!(r.com_embalagem["A"].unidades, 0, "rótulo sem estoque");
        assert_eq!(r.sem_embalagem, vec!["C".to_string()], "frasco é de B (ativo): sem exclusiva");
    }

    #[test]
    fn dois_saindo_dividindo_o_mesmo_item_contam_o_item_nos_dois() {
        let usos = vec![uso("A", vec![n("ROT", "UN", 1.0)]), uso("C", vec![n("ROT", "UN", 1.0)])];
        let livre: HashMap<String, f64> = [("ROT".to_string(), 100.0)].into_iter().collect();
        let r = calcular(&usos, &s(&["A", "C"]), &livre);
        assert_eq!(r.com_embalagem["A"].unidades, 100);
        assert_eq!(r.com_embalagem["C"].unidades, 100);
    }
}
