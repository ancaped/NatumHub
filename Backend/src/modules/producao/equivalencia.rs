//! Agrupamento de insumos equivalentes para conferir lotes (pesagem e envase).
//!
//! Um insumo e seus equivalentes (`similar_items`, relação nos dois sentidos) e as trocas decididas
//! (`producao_trocas_insumo`) contam como um só: o esperado e o real são somados por grupo e a tolerância
//! de 10% vale para o grupo. Quem foi usado no lugar de um planejado (esperado 0, mas no mesmo grupo) não
//! é desvio por si só.

use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use crate::modules::producao::cobertura::store::carregar_todos_equivalentes;
use crate::modules::producao::trocas;

/// Tolerância (%) por grupo.
pub const TOLERANCIA_PCT: f64 = 10.0;

/// Equivalentes carregados uma vez para a lista inteira de lotes.
pub struct Equivalencias {
    /// `similar_items` + trocas gerais, nos dois sentidos.
    pub base: HashMap<String, Vec<String>>,
    /// Trocas de um produto específico: (produto, de, para).
    pub por_produto: Vec<(String, String, String)>,
}

impl Equivalencias {
    pub async fn carregar(pool: &PgPool) -> Self {
        let mut base = carregar_todos_equivalentes(pool).await.unwrap_or_default();
        let mut por_produto = Vec::new();
        for t in trocas::carregar(pool).await.unwrap_or_default() {
            match t.produto {
                Some(p) => por_produto.push((p, t.de, t.para)),
                None => {
                    base.entry(t.de.clone()).or_default().push(t.para.clone());
                    base.entry(t.para).or_default().push(t.de);
                }
            }
        }
        Self { base, por_produto }
    }

    /// Pares extras (trocas específicas) que valem para o produto.
    pub fn extras_do_produto(&self, produto: &str) -> Vec<(String, String)> {
        let produto = produto.trim();
        self.por_produto
            .iter()
            .filter(|(p, _, _)| p.trim() == produto)
            .map(|(_, de, para)| (de.clone(), para.clone()))
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Grupo {
    /// Códigos do grupo, ordenados.
    pub codigos: Vec<String>,
    pub esperado: f64,
    pub real: f64,
}

impl Grupo {
    /// Desvio do grupo: esperado e o real falta ou sai da tolerância. Sem esperado não há desvio.
    pub fn com_desvio(&self) -> bool {
        if self.esperado <= 0.0 {
            return false;
        }
        let real = if self.real < 0.0001 { 0.0 } else { self.real };
        real == 0.0 || ((real - self.esperado) / self.esperado * 100.0).abs() > TOLERANCIA_PCT
    }
}

/// Agrupa por equivalência os códigos presentes em `esperado` ou `real`: dois códigos ficam no mesmo
/// grupo se forem equivalentes (direto ou por cadeia de códigos presentes). `extras` são pares
/// equivalentes adicionais (trocas do produto).
pub fn agrupar_por_equivalencia(
    esperado: &HashMap<String, f64>,
    real: &HashMap<String, f64>,
    equivalentes: &HashMap<String, Vec<String>>,
    extras: &[(String, String)],
) -> Vec<Grupo> {
    let mut codigos: Vec<&String> = esperado.keys().chain(real.keys()).collect::<HashSet<_>>().into_iter().collect();
    codigos.sort();
    let idx: HashMap<&str, usize> = codigos.iter().enumerate().map(|(i, c)| (c.as_str(), i)).collect();
    let mut pai: Vec<usize> = (0..codigos.len()).collect();
    fn raiz(pai: &mut [usize], mut i: usize) -> usize {
        while pai[i] != i {
            pai[i] = pai[pai[i]];
            i = pai[i];
        }
        i
    }
    let mut unir = |pai: &mut Vec<usize>, a: &str, b: &str| {
        if let (Some(&ia), Some(&ib)) = (idx.get(a), idx.get(b)) {
            let (ra, rb) = (raiz(pai, ia), raiz(pai, ib));
            if ra != rb {
                pai[ra.max(rb)] = ra.min(rb);
            }
        }
    };
    for c in &codigos {
        if let Some(vs) = equivalentes.get(c.as_str()) {
            for v in vs {
                unir(&mut pai, c, v);
            }
        }
    }
    for (a, b) in extras {
        unir(&mut pai, a, b);
    }
    let mut grupos: HashMap<usize, Grupo> = HashMap::new();
    for (i, c) in codigos.iter().enumerate() {
        let r = raiz(&mut pai, i);
        let g = grupos.entry(r).or_insert_with(|| Grupo { codigos: vec![], esperado: 0.0, real: 0.0 });
        g.codigos.push((*c).clone());
        g.esperado += esperado.get(c.as_str()).copied().unwrap_or(0.0);
        g.real += real.get(c.as_str()).copied().unwrap_or(0.0);
    }
    let mut v: Vec<Grupo> = grupos.into_values().collect();
    v.sort_by(|a, b| a.codigos.cmp(&b.codigos));
    v
}

/// Algum grupo com desvio? (`ignorar_falta`: grupos cujo real é zero e todos os esperados estão aqui, ex. insumos que vão na base.)
pub fn algum_desvio(grupos: &[Grupo], ignorar_falta: impl Fn(&Grupo) -> bool) -> bool {
    grupos.iter().any(|g| g.com_desvio() && !(g.real < 0.0001 && ignorar_falta(g)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(v: &[(&str, f64)]) -> HashMap<String, f64> {
        v.iter().map(|(c, q)| (c.to_string(), *q)).collect()
    }
    fn eq(pares: &[(&str, &str)]) -> HashMap<String, Vec<String>> {
        let mut h: HashMap<String, Vec<String>> = HashMap::new();
        for (a, b) in pares {
            h.entry(a.to_string()).or_default().push(b.to_string());
            h.entry(b.to_string()).or_default().push(a.to_string());
        }
        h
    }

    #[test]
    fn lote_15731_troca_parcial_por_equivalente_nao_e_desvio() {
        let esperado = m(&[("9.15.022", 2.5), ("9.15.001", 997.5)]);
        let real = m(&[("9.15.022", 1.2), ("9.15.342", 1.3), ("9.15.001", 997.5)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &eq(&[("9.15.022", "9.15.342")]), &[]);
        assert_eq!(g.len(), 2);
        assert!(!algum_desvio(&g, |_| false));
        let grupo = g.iter().find(|x| x.codigos.len() == 2).unwrap();
        assert_eq!(grupo.codigos, vec!["9.15.022", "9.15.342"]);
        assert!((grupo.real - 2.5).abs() < 1e-9);
    }

    #[test]
    fn sem_equivalencia_continua_desvio() {
        let esperado = m(&[("9.15.022", 2.5)]);
        let real = m(&[("9.15.022", 1.2), ("9.15.342", 1.3)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &HashMap::new(), &[]);
        assert!(algum_desvio(&g, |_| false));
    }

    #[test]
    fn desvio_real_do_grupo_continua_desvio() {
        let esperado = m(&[("9.15.009", 7.497)]);
        let real = m(&[("9.15.009", 5.248), ("9.15.329", 1.0)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &eq(&[("9.15.009", "9.15.329")]), &[]);
        assert!(algum_desvio(&g, |_| false));
    }

    #[test]
    fn lote_15720_soma_igual_no_grupo_nao_e_desvio() {
        let esperado = m(&[("9.15.009", 7.497)]);
        let real = m(&[("9.15.009", 5.248), ("9.15.329", 2.249)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &eq(&[("9.15.009", "9.15.329")]), &[]);
        assert!(!algum_desvio(&g, |_| false));
    }

    #[test]
    fn troca_do_produto_agrupa_e_falta_na_base_e_ignorada() {
        let esperado = m(&[("A", 10.0), ("B", 5.0)]);
        let real = m(&[("C", 10.0)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &HashMap::new(), &[("A".into(), "C".into())]);
        assert!(algum_desvio(&g, |_| false)); // B falta
        assert!(!algum_desvio(&g, |gr| gr.codigos == vec!["B".to_string()]));
    }

    #[test]
    fn embalagem_trocada_por_outro_frasco() {
        let esperado = m(&[("FR1", 111.0)]);
        let real = m(&[("FR1", 51.0), ("FR2", 60.0)]);
        let g = agrupar_por_equivalencia(&esperado, &real, &eq(&[("FR1", "FR2")]), &[]);
        assert!(!algum_desvio(&g, |_| false));
    }
}
