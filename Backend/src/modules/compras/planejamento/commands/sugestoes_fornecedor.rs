//! Sugestões de unificação de fornecedores: cadastros que parecem ser a mesma empresa (mesma raiz de CNPJ ou nome
//! equivalente). Só lê; quem unifica é `unify_suppliers_query` (grava `suppliers.parent_id`). O código do ERP de cada
//! cadastro continua valendo em pedidos e notas.

use serde::Serialize;
use sqlx::{PgPool, Row};

#[derive(Debug, Clone)]
pub struct Cadastro {
    pub id: String,
    pub name: String,
    pub cnpj: Option<String>,
    pub parent_id: Option<String>,
    pub pedidos: i64,
    pub notas: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MembroSugestao {
    pub id: String,
    pub name: String,
    pub cnpj: Option<String>,
    pub parent_id: Option<String>,
    pub pedidos: i64,
    pub notas: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GrupoSugestao {
    /// "CNPJ" (mesma raiz de 8 dígitos) ou "Nome" (nome equivalente, sem CNPJ que confirme).
    pub criterio: String,
    pub principal_id: String,
    pub membros: Vec<MembroSugestao>,
}

const IGNORADAS: &[&str] = &[
    "LTDA", "EIRELI", "ME", "EPP", "SA", "S", "A", "CIA", "FILIAL", "MATRIZ", "FL", "DE", "DA", "DO", "DAS", "DOS", "E", "EM",
    "COM", "COMERCIO", "IND", "INDUSTRIA", "ID",
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

fn raiz_cnpj(cnpj: &Option<String>) -> Option<String> {
    let d: String = cnpj.as_deref()?.chars().filter(|c| c.is_ascii_digit()).collect();
    (d.len() == 14).then(|| d[..8].to_string())
}

/// Palavras do nome sem sufixo societário, UF, "filial" e número de "(ID: 123)".
fn palavras(nome: &str) -> Vec<String> {
    let corte = nome.to_uppercase();
    let corte = corte.split("(ID").next().unwrap_or("").to_string();
    corte
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty() && !IGNORADAS.contains(t) && !t.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
        .collect()
}

fn nomes_equivalentes(a: &[String], b: &[String]) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    let (curto, longo) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    if longo[..curto.len()] != curto[..] {
        return false;
    }
    if curto.len() == longo.len() {
        return curto.join("").len() >= 6;
    }
    curto.len() >= 2
}

struct Uniao(Vec<usize>);
impl Uniao {
    fn raiz(&mut self, x: usize) -> usize {
        if self.0[x] != x {
            let r = self.raiz(self.0[x]);
            self.0[x] = r;
        }
        self.0[x]
    }
    fn unir(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.raiz(a), self.raiz(b));
        if ra != rb {
            self.0[rb] = ra;
        }
    }
}

pub fn sugerir(cadastros: &[Cadastro]) -> Vec<GrupoSugestao> {
    let n = cadastros.len();
    let mut uniao = Uniao((0..n).collect());
    let mut por_id = std::collections::HashMap::new();
    for (i, c) in cadastros.iter().enumerate() {
        por_id.insert(c.id.as_str(), i);
    }
    let raizes: Vec<Option<String>> = cadastros.iter().map(|c| raiz_cnpj(&c.cnpj)).collect();
    let nomes: Vec<Vec<String>> = cadastros.iter().map(|c| palavras(&c.name)).collect();
    let mut por_cnpj = vec![false; n];
    for i in 0..n {
        if let Some(p) = cadastros[i].parent_id.as_deref().and_then(|p| por_id.get(p)) {
            uniao.unir(i, *p);
        }
        for j in (i + 1)..n {
            let cnpj_igual = raizes[i].is_some() && raizes[i] == raizes[j];
            if cnpj_igual {
                uniao.unir(i, j);
                por_cnpj[i] = true;
                por_cnpj[j] = true;
            } else if raizes[i].is_some() && raizes[j].is_some() {
                // os dois têm CNPJ e as raízes diferem: empresas diferentes, mesmo com nome parecido
            } else if nomes_equivalentes(&nomes[i], &nomes[j]) {
                uniao.unir(i, j);
            }
        }
    }
    let mut grupos: std::collections::BTreeMap<usize, Vec<usize>> = Default::default();
    for i in 0..n {
        let r = uniao.raiz(i);
        grupos.entry(r).or_default().push(i);
    }
    let mut out = Vec::new();
    for (_, membros) in grupos {
        if membros.len() < 2 || membros.iter().all(|&i| cadastros[i].pedidos + cadastros[i].notas == 0) {
            continue;
        }
        // já unificado por inteiro: todos apontam para o mesmo principal
        let principais: std::collections::BTreeSet<&str> = membros
            .iter()
            .map(|&i| cadastros[i].parent_id.as_deref().unwrap_or(cadastros[i].id.as_str()))
            .collect();
        if principais.len() < 2 {
            continue;
        }
        let com_filhos = |i: usize| cadastros.iter().filter(|c| c.parent_id.as_deref() == Some(cadastros[i].id.as_str())).count();
        let principal = *membros
            .iter()
            .max_by_key(|&&i| (com_filhos(i), cadastros[i].pedidos + cadastros[i].notas, std::cmp::Reverse(cadastros[i].id.len()), std::cmp::Reverse(cadastros[i].id.clone())))
            .unwrap();
        let criterio = if membros.iter().any(|&i| por_cnpj[i]) { "CNPJ" } else { "Nome" };
        let mut ms: Vec<MembroSugestao> = membros
            .iter()
            .map(|&i| MembroSugestao {
                id: cadastros[i].id.clone(),
                name: cadastros[i].name.clone(),
                cnpj: cadastros[i].cnpj.clone(),
                parent_id: cadastros[i].parent_id.clone(),
                pedidos: cadastros[i].pedidos,
                notas: cadastros[i].notas,
            })
            .collect();
        ms.sort_by(|a, b| (b.pedidos + b.notas).cmp(&(a.pedidos + a.notas)).then(a.name.cmp(&b.name)));
        out.push(GrupoSugestao { criterio: criterio.to_string(), principal_id: cadastros[principal].id.clone(), membros: ms });
    }
    out.sort_by(|a, b| {
        let peso = |g: &GrupoSugestao| g.membros.iter().map(|m| m.pedidos + m.notas).sum::<i64>();
        (a.criterio != "CNPJ").cmp(&(b.criterio != "CNPJ")).then(peso(b).cmp(&peso(a)))
    });
    out
}

pub async fn sugestoes_unificacao_query(pool: PgPool) -> Result<Vec<GrupoSugestao>, String> {
    let rows = sqlx::query(
        "SELECT s.id, s.name, s.cnpj, s.parent_id,
                COALESCE(p.n, 0) AS pedidos, COALESCE(i.n, 0) AS notas
         FROM suppliers s
         LEFT JOIN (SELECT n_cod_fornec::text AS id, COUNT(*) AS n FROM purchase_orders GROUP BY 1) p ON p.id = s.id
         LEFT JOIN (SELECT supplier_id AS id, COUNT(DISTINCT invoice_number) AS n FROM invoices GROUP BY 1) i ON i.id = s.id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    let cadastros: Vec<Cadastro> = rows
        .iter()
        .map(|r| Cadastro {
            id: r.get("id"),
            name: r.get::<Option<String>, _>("name").unwrap_or_default(),
            cnpj: r.get("cnpj"),
            parent_id: r.get("parent_id"),
            pedidos: r.get("pedidos"),
            notas: r.get("notas"),
        })
        .collect();
    Ok(sugerir(&cadastros))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(id: &str, name: &str, cnpj: Option<&str>, parent: Option<&str>, uso: i64) -> Cadastro {
        Cadastro { id: id.into(), name: name.into(), cnpj: cnpj.map(Into::into), parent_id: parent.map(Into::into), pedidos: uso, notas: 0 }
    }

    #[test]
    fn mesma_raiz_de_cnpj_vira_grupo_e_o_mais_usado_e_o_principal() {
        let g = sugerir(&[
            c("877", "D.P.V.  PRODUTOS QUIMICOS LTDA", Some("53.235.180/0001-57"), None, 40),
            c("1070", "D.P.V PRODUTOS QUIMICOS LTDA", Some("53.235.180/0006-61"), None, 5),
            c("9", "OUTRA EMPRESA", Some("11.111.111/0001-11"), None, 7),
        ]);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].criterio, "CNPJ");
        assert_eq!(g[0].principal_id, "877");
        assert_eq!(g[0].membros.len(), 2);
    }

    #[test]
    fn nome_equivalente_sem_cnpj_junta_filial_e_id_no_nome() {
        let g = sugerir(&[
            c("99", "MASTER PUMPS", None, None, 10),
            c("271", "MASTER PUMPS (ID: 271)", None, None, 2),
            c("38", "M CASSAB", None, None, 3),
            c("1029", "M CASSAB COMERCIO E INDUSTRIA LTDA - JARINU SP", None, None, 1),
        ]);
        assert_eq!(g.len(), 2);
        assert!(g.iter().all(|x| x.criterio == "Nome"));
    }

    #[test]
    fn cnpj_diferente_nao_junta_por_nome_parecido_e_nome_generico_nao_junta() {
        let g = sugerir(&[
            c("1", "ALPHA QUIMICA LTDA", Some("11.111.111/0001-11"), None, 5),
            c("2", "ALPHA QUIMICA LTDA FILIAL", Some("22.222.222/0001-22"), None, 5),
            c("3", "LUVAS - ROCHA DISTR DE MATRIZES", None, None, 5),
            c("4", "LUVAS - NRB COMERCIO DESCARTAVEIS", None, None, 5),
        ]);
        assert!(g.is_empty());
    }

    #[test]
    fn grupo_ja_unificado_nao_e_sugerido_e_novo_cadastro_entra_no_grupo_existente() {
        let ja = [c("969", "BEPACK", None, None, 9), c("379", "BEPACK INDUSTRIA", None, Some("969"), 4)];
        assert!(sugerir(&ja).is_empty());
        let g = sugerir(&[
            c("969", "BEPACK", Some("39.237.959/0001-80"), None, 9),
            c("379", "BEPACK INDUSTRIA", Some("18.754.827/0001-56"), Some("969"), 4),
            c("5", "BEPACK", Some("39.237.959/0002-61"), None, 1),
        ]);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].principal_id, "969");
    }

    #[test]
    fn grupo_sem_uso_em_pedido_ou_nota_e_ignorado() {
        assert!(sugerir(&[c("1", "ZETA PLAST", None, None, 0), c("2", "ZETA PLAST (ID: 2)", None, None, 0)]).is_empty());
    }
}
