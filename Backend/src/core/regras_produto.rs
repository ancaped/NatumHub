//! Regras de produto num lugar só: linha do código, linha efetiva, produto ativo e base.
//! O front espelha as constantes em `Frontend/src/modules/geral/lib/regrasProduto.ts`.

/// Linha efetiva em SQL: ajuste manual (não vazio) > linha automática do produto.
/// Exige os aliases `p` (produtos) e `o` (overrides_produtos, LEFT JOIN).
pub const LINHA_EFETIVA_SQL: &str = "COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix)";

/// Mesma regra pronta para JOIN: traz `o` (override) e `cl` (config da linha efetiva).
/// Exige o alias `p` (produtos). Não use se a consulta já tem `o`.
pub const JOIN_LINHA_EFETIVA_SQL: &str = "LEFT JOIN overrides_produtos o ON o.codigo = p.codigo \
     LEFT JOIN config_linhas cl ON cl.linha_prefix = COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix)";

/// Status que tiram o produto da lista de ativos quando a setting
/// `ignored_product_statuses` não existe.
pub const STATUS_IGNORADOS_PADRAO: [&str; 2] = ["descontinuado", "terceirizado"];

pub fn status_ignorados_padrao() -> Vec<String> {
    STATUS_IGNORADOS_PADRAO.iter().map(|s| s.to_string()).collect()
}

/// Segmentos do código separados por ".", sem zeros à esquerda ("03.14.001" -> ["3","14","1"]).
fn segmentos(codigo: &str) -> Vec<String> {
    codigo
        .trim()
        .split('.')
        .map(|s| {
            let t = s.trim();
            let sem_zeros = t.trim_start_matches('0');
            if sem_zeros.is_empty() && !t.is_empty() { "0".to_string() } else { sem_zeros.to_string() }
        })
        .collect()
}

/// Linha automática do produto. `prefixos` = `config_linhas.linha_prefix` (sem DEFAULT).
/// O prefixo casa se for prefixo de segmentos do código (e o código tiver mais segmentos);
/// vence o prefixo com mais segmentos; sem casar, "DEFAULT".
pub fn linha_do_codigo(codigo: &str, prefixos: &[String]) -> String {
    let seg_codigo = segmentos(codigo);
    let mut melhor: Option<(usize, &String)> = None;
    for pref in prefixos {
        if pref.trim().is_empty() || pref.eq_ignore_ascii_case("DEFAULT") {
            continue;
        }
        let seg_pref = segmentos(pref);
        if seg_pref.len() >= seg_codigo.len() || seg_codigo[..seg_pref.len()] != seg_pref[..] {
            continue;
        }
        if melhor.map_or(true, |(n, _)| seg_pref.len() > n) {
            melhor = Some((seg_pref.len(), pref));
        }
    }
    melhor.map(|(_, p)| p.clone()).unwrap_or_else(|| "DEFAULT".to_string())
}

/// Carrega os prefixos cadastrados (sem DEFAULT), uma vez por sync/importação.
pub async fn carregar_prefixos_linhas<'e, E>(executor: E) -> Result<Vec<String>, sqlx::Error>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    sqlx::query_scalar::<_, String>("SELECT linha_prefix FROM config_linhas WHERE linha_prefix <> 'DEFAULT'")
        .fetch_all(executor)
        .await
}

/// Produto ativo = status efetivo fora de "status ignorados" e produto visível.
pub fn produto_ativo(status_efetivo: &str, visivel: Option<i32>, status_ignorados: &[String]) -> bool {
    !status_ignorados.iter().any(|s| s == status_efetivo) && visivel.unwrap_or(1) != 0
}

/// Base de produção: categoria `cat_base`, status `bases` ou código com segmento ".36.".
pub fn e_base(codigo: &str, categoria_produto: &str, status_produto: &str) -> bool {
    categoria_produto == "cat_base" || status_produto == "bases" || codigo.contains(".36.")
}

/// Categoria raiz (sobe por `categories.parent_id`); `pais` = id -> parent_id.
pub fn categoria_raiz(id: &str, pais: &std::collections::HashMap<String, String>) -> String {
    let mut atual = id.to_string();
    for _ in 0..16 {
        match pais.get(&atual) {
            Some(pai) if !pai.is_empty() && *pai != atual => atual = pai.clone(),
            _ => break,
        }
    }
    atual
}

/// id -> parent_id de `categories` (só as que têm pai).
pub async fn carregar_pais_categorias(pool: &sqlx::PgPool) -> Result<std::collections::HashMap<String, String>, sqlx::Error> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, parent_id FROM categories").fetch_all(pool).await?;
    Ok(rows.into_iter().filter_map(|(id, pai)| pai.map(|p| (id, p))).collect())
}

/// Dos `codigos`, os que são base de produção (categoria raiz `cat_base`, status `bases` ou código ".36.").
pub async fn codigos_de_base(pool: &sqlx::PgPool, codigos: &[String]) -> Result<std::collections::HashSet<String>, sqlx::Error> {
    let pais = carregar_pais_categorias(pool).await?;
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT p.codigo, COALESCE(o.categoria_produto, ''), COALESCE(o.status_produto, '') \
         FROM produtos p LEFT JOIN overrides_produtos o ON o.codigo = p.codigo WHERE p.codigo = ANY($1)",
    )
    .bind(codigos)
    .fetch_all(pool)
    .await?;
    let mut bases: std::collections::HashSet<String> =
        rows.into_iter().filter(|(c, cat, st)| e_base(c, &categoria_raiz(cat, &pais), st)).map(|(c, _, _)| c).collect();
    // código fora do cadastro: ainda vale o segmento ".36."
    bases.extend(codigos.iter().filter(|c| e_base(c, "", "")).cloned());
    Ok(bases)
}

/// Peso (kg) de uma unidade: base vale 1,0 (1 un = 1 kg); os demais, a medida da descrição (`None` = desconhecido).
pub fn peso_unitario_kg(descricao: &str, eh_base: bool) -> Option<f64> {
    if eh_base { Some(1.0) } else { crate::modules::producao::fila::medida_kg(descricao) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(l: &[&str]) -> Vec<String> {
        l.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn join_usa_a_mesma_expressao() {
        assert!(JOIN_LINHA_EFETIVA_SQL.contains(LINHA_EFETIVA_SQL));
    }

    #[test]
    fn linha_por_segmento() {
        let p = v(&["1", "9", "9.15", "3", "15", "14"]);
        assert_eq!(linha_do_codigo("1.12.019", &p), "1");
        assert_eq!(linha_do_codigo("9.15.001", &p), "9.15");
        assert_eq!(linha_do_codigo("9.16.001", &p), "9");
        assert_eq!(linha_do_codigo("03.14.001", &p), "3");
        assert_eq!(linha_do_codigo("15.33.002", &p), "15");
        assert_eq!(linha_do_codigo("99.1.1", &p), "DEFAULT");
        // "1" não casa com "10.x" (segmento inteiro, não texto)
        assert_eq!(linha_do_codigo("10.1.1", &v(&["1"])), "DEFAULT");
        // prefixo igual ao código inteiro não casa (precisa ter mais segmentos)
        assert_eq!(linha_do_codigo("9.15", &v(&["9.15"])), "DEFAULT");
        assert_eq!(linha_do_codigo("1.1.1", &[]), "DEFAULT");
    }

    #[test]
    fn linha_ignora_zeros_no_prefixo() {
        assert_eq!(linha_do_codigo("3.14.1", &v(&["03"])), "03");
    }

    #[test]
    fn ativo_depende_de_status_e_visivel() {
        let ign = status_ignorados_padrao();
        assert!(produto_ativo("ativo", None, &ign));
        assert!(produto_ativo("lancamento", Some(1), &ign));
        assert!(produto_ativo("saindo_de_linha", Some(1), &ign));
        assert!(!produto_ativo("terceirizado", Some(1), &ign));
        assert!(!produto_ativo("descontinuado", None, &ign));
        assert!(!produto_ativo("ativo", Some(0), &ign));
        assert!(produto_ativo("terceirizado", Some(1), &[]));
    }

    #[test]
    fn base_por_categoria_status_ou_codigo() {
        assert!(e_base("5.1.1", "cat_base", ""));
        assert!(e_base("5.1.1", "", "bases"));
        assert!(e_base("1.36.001", "", ""));
        assert!(e_base("60.36.002", "", "ativo"));
        assert!(!e_base("1.3.6", "", "ativo"));
        assert!(!e_base("1.360.1", "", "ativo"));
    }

    #[test]
    fn peso_unitario_base_vale_1kg_e_sem_medida_e_desconhecido() {
        assert_eq!(peso_unitario_kg("BASE SHAMPOO PEROLADO NH 11", true), Some(1.0));
        assert_eq!(peso_unitario_kg("SHAMPOO 500ML", false), Some(0.5));
        assert_eq!(peso_unitario_kg("KIT PRESENTE", false), None);
    }

    #[test]
    fn categoria_raiz_sobe_ate_o_topo() {
        let mut pais = std::collections::HashMap::new();
        pais.insert("sub".to_string(), "cat_base".to_string());
        assert_eq!(categoria_raiz("sub", &pais), "cat_base");
        assert_eq!(categoria_raiz("cat_base", &pais), "cat_base");
    }
}
